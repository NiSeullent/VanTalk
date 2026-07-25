#!/usr/bin/env bash
# Install VanTalk launchers for Zorin OS / GNOME / Ubuntu:
#   - Start menu / app grid: ~/.local/share/applications/vantalk.desktop
#   - Desktop shortcut:     ~/Desktop/VanTalk.desktop
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ID="vantalk"
DESKTOP_NAME="VanTalk.desktop"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps"
INSTALL_DIR="${VANTALK_HOME:-$HOME/.local/share/VanTalk}"

# Prefer packaged layout next to this script; else install from dist/linux
SRC="$SCRIPT_DIR"
if [[ ! -f "$SRC/vantalk.jar" || ! -f "$SRC/VanTalk" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  if [[ -f "$ROOT/dist/linux/vantalk.jar" ]]; then
    SRC="$ROOT/dist/linux"
  else
    echo "vantalk.jar / VanTalk launcher not found." >&2
    echo "Run from dist/linux after: ./gradlew packageLinux" >&2
    exit 1
  fi
fi

mkdir -p "$INSTALL_DIR" "$APPS_DIR" "$ICONS_DIR"

echo "Installing app files → $INSTALL_DIR"
install -m 755 "$SRC/VanTalk" "$INSTALL_DIR/VanTalk"
install -m 644 "$SRC/vantalk.jar" "$INSTALL_DIR/vantalk.jar"
if [[ -f "$SRC/vantalk.svg" ]]; then
  install -m 644 "$SRC/vantalk.svg" "$INSTALL_DIR/vantalk.svg"
  install -m 644 "$SRC/vantalk.svg" "$ICONS_DIR/vantalk.svg"
elif [[ -f "$SCRIPT_DIR/vantalk.svg" ]]; then
  install -m 644 "$SCRIPT_DIR/vantalk.svg" "$INSTALL_DIR/vantalk.svg"
  install -m 644 "$SCRIPT_DIR/vantalk.svg" "$ICONS_DIR/vantalk.svg"
fi

ICON_PATH="$INSTALL_DIR/vantalk.svg"
[[ -f "$ICONS_DIR/vantalk.svg" ]] && ICON_PATH="$ICONS_DIR/vantalk.svg"

EXEC_LINE="$INSTALL_DIR/VanTalk"
# Escape spaces for desktop Exec if any
if [[ "$EXEC_LINE" == *" "* ]]; then
  EXEC_LINE="\"$EXEC_LINE\""
fi

render_desktop() {
  local dest="$1"
  local template="$SCRIPT_DIR/VanTalk.desktop.in"
  [[ -f "$template" ]] || template="$SRC/VanTalk.desktop.in"
  if [[ ! -f "$template" ]]; then
    cat > "$dest" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=VanTalk
Name[ko]=Van톡
Comment=VanTalk desktop
Exec=$INSTALL_DIR/VanTalk
Path=$INSTALL_DIR
Icon=$ICON_PATH
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupNotify=true
EOF
  else
    sed -e "s|@EXEC@|$INSTALL_DIR/VanTalk|g" \
        -e "s|@PATH@|$INSTALL_DIR|g" \
        -e "s|@ICON@|$ICON_PATH|g" \
        "$template" > "$dest"
  fi
  chmod 755 "$dest"
}

# Start menu / Zorin app grid / Super-key search
MENU_FILE="$APPS_DIR/${APP_ID}.desktop"
echo "Start menu entry → $MENU_FILE"
render_desktop "$MENU_FILE"

# Desktop shortcut (Zorin / GNOME)
DESKTOP_DIR="${XDG_DESKTOP_DIR:-}"
if [[ -z "$DESKTOP_DIR" ]] && [[ -f "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs" ]]; then
  # shellcheck disable=SC1090
  . "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs"
  DESKTOP_DIR="${XDG_DESKTOP_DIR:-}"
fi
DESKTOP_DIR="${DESKTOP_DIR:-$HOME/Desktop}"
# Expand $HOME if user-dirs left it literal
DESKTOP_DIR="${DESKTOP_DIR/#\$HOME/$HOME}"

if [[ -d "$DESKTOP_DIR" ]]; then
  DESK_FILE="$DESKTOP_DIR/$DESKTOP_NAME"
  echo "Desktop shortcut → $DESK_FILE"
  render_desktop "$DESK_FILE"
  # Mark trusted so GNOME/Zorin allows launching from Desktop
  if command -v gio >/dev/null 2>&1; then
    gio set "$DESK_FILE" metadata::trusted true 2>/dev/null || true
  fi
  chmod +x "$DESK_FILE"
else
  echo "Desktop folder not found ($DESKTOP_DIR); skipped desktop shortcut." >&2
fi

# Refresh menus
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
fi

echo
echo "Done (Zorin OS / GNOME)."
echo "  • Start menu / Super 키: \"VanTalk\" 또는 \"Van톡\" 검색"
echo "  • 바탕화면: VanTalk 아이콘"
echo "  • 실행 파일: $INSTALL_DIR/VanTalk"
echo
echo "Remove shortcuts later:"
echo "  rm -f \"$MENU_FILE\" \"$DESKTOP_DIR/$DESKTOP_NAME\""
echo "  rm -rf \"$INSTALL_DIR\""
