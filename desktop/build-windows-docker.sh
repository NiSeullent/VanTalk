#!/usr/bin/env bash
# Cross-compile Van톡 Windows NSIS installer via cargo-xwin (Linux Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
IMG="ubuntu:24.04"
OUT="${ROOT}/dist-out"
mkdir -p "$OUT"

docker run --rm \
  -v "$ROOT:/app" \
  -v "$OUT:/out" \
  -w /app \
  -e CARGO_HOME=/app/.cargo-docker \
  -e RUSTUP_HOME=/app/.rustup-docker \
  -e XWIN_CACHE_DIR=/app/.xwin-cache \
  "$IMG" bash -lc '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export CARGO_HOME=/app/.cargo-docker
export RUSTUP_HOME=/app/.rustup-docker
export XWIN_CACHE_DIR=/app/.xwin-cache
mkdir -p "$CARGO_HOME" "$RUSTUP_HOME" "$XWIN_CACHE_DIR"

apt-get update -qq
apt-get install -y -qq curl ca-certificates build-essential pkg-config \
  libssl-dev clang llvm lld nsis wine64 wine64-tools file

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi
if [ -f "$CARGO_HOME/env" ]; then
  # shellcheck disable=SC1090
  . "$CARGO_HOME/env"
fi
export PATH="$CARGO_HOME/bin:$PATH"
rustup default stable
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin --locked || cargo install cargo-xwin

cd /app
npm ci || npm install
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis

mkdir -p /out
find src-tauri/target/x86_64-pc-windows-msvc/release/bundle -type f \( -name "*.exe" -o -name "*.msi" \) \
  -exec cp -av {} /out/ \;
# Friendly release name
for f in /out/*setup*.exe /out/*.exe; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in
    VanTalk-*-win-x64.exe) continue ;;
  esac
  cp -av "$f" /out/VanTalk-2026.7.29-win-x64.exe || true
  break
done
ls -lah /out
'
echo "Artifacts in $OUT"
ls -lah "$OUT"
