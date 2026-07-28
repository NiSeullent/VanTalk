#!/usr/bin/env bash
# Build Van톡 Tauri desktop packages inside Ubuntu with full deps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
IMG="ubuntu:24.04"
OUT="${ROOT}/dist-out"
BUNDLES="${TAURI_BUNDLES:-deb,rpm}"
mkdir -p "$OUT"

docker run --rm \
  -v "$ROOT:/app" \
  -v "$OUT:/out" \
  -w /app \
  -e CARGO_HOME=/app/.cargo-docker \
  -e RUSTUP_HOME=/app/.rustup-docker \
  -e TAURI_BUNDLES="$BUNDLES" \
  "$IMG" bash -lc '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export CARGO_HOME=/app/.cargo-docker
export RUSTUP_HOME=/app/.rustup-docker
mkdir -p "$CARGO_HOME" "$RUSTUP_HOME"

apt-get update -qq
apt-get install -y -qq curl ca-certificates build-essential pkg-config \
  libwebkit2gtk-4.1-dev librsvg2-dev patchelf libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev \
  file rpm

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

if [ ! -x "$CARGO_HOME/bin/rustup" ] && [ ! -x "$HOME/.cargo/bin/rustup" ]; then
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi
# Prefer remapped cargo home
if [ -f "$CARGO_HOME/env" ]; then
  # shellcheck disable=SC1090
  . "$CARGO_HOME/env"
elif [ -f "$HOME/.cargo/env" ]; then
  . "$HOME/.cargo/env"
fi
export PATH="$CARGO_HOME/bin:$HOME/.cargo/bin:$PATH"
rustup default stable
rustc -V
cargo -V

cd /app
npm ci || npm install
BUNDLES="${TAURI_BUNDLES:-deb,rpm}"
npx tauri build --bundles "$BUNDLES"

mkdir -p /out
cp -av src-tauri/target/release/bundle/deb/*.deb /out/ 2>/dev/null || true
cp -av src-tauri/target/release/bundle/rpm/*.rpm /out/ 2>/dev/null || true
for f in /out/*.deb; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  ver="$(echo "$base" | sed -n "s/.*_\([0-9.]*\)_amd64\.deb/\1/p")"
  if [ -n "$ver" ]; then
    cp -av "$f" "/out/VanTalk-${ver}-linux-amd64.deb"
  fi
done
for f in /out/*.rpm; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  ver="$(echo "$base" | sed -n "s/.*-\([0-9.]*\)-1\.x86_64\.rpm/\1/p")"
  if [ -n "$ver" ]; then
    cp -av "$f" "/out/VanTalk-${ver}-linux-x86_64.rpm"
  fi
done
ls -lah /out
'
echo "Artifacts in $OUT"
ls -lah "$OUT"
