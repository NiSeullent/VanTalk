#!/usr/bin/env bash
# Remove VanTalk start-menu + desktop shortcuts (keeps install dir unless --purge)
set -euo pipefail

APP_ID="vantalk"
DESKTOP_NAME="VanTalk.desktop"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
INSTALL_DIR="${VANTALK_HOME:-$HOME/.local/share/VanTalk}"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps"

DESKTOP_DIR="${XDG_DESKTOP_DIR:-}"
if [[ -z "$DESKTOP_DIR" ]] && [[ -f "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs" ]]; then
  # shellcheck disable=SC1090
  . "${XDG_CONFIG_HOME:-$HOME/.config}/user-dirs.dirs"
  DESKTOP_DIR="${XDG_DESKTOP_DIR:-}"
fi
DESKTOP_DIR="${DESKTOP_DIR:-$HOME/Desktop}"
DESKTOP_DIR="${DESKTOP_DIR/#\$HOME/$HOME}"

rm -f "$APPS_DIR/${APP_ID}.desktop"
rm -f "$DESKTOP_DIR/$DESKTOP_NAME"
rm -f "$ICONS_DIR/vantalk.svg"

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "Removed shortcuts and $INSTALL_DIR"
else
  echo "Removed shortcuts (app files kept in $INSTALL_DIR; use --purge to delete)"
fi

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" 2>/dev/null || true
