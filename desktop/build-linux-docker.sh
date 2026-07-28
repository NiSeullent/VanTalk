#!/usr/bin/env bash
# Build Van톡 Tauri desktop packages inside Ubuntu with full deps.
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
  "$IMG" bash -lc '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates build-essential pkg-config \
  libwebkit2gtk-4.1-dev librsvg2-dev patchelf libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev \
  file rpm

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
export PATH="/app/.cargo-docker/bin:$PATH"

cd /app
npm ci || npm install

# deb first
npx tauri build --bundles deb

# Break hardlinks before rpm — Tauri patches the binary in-place and
# hardlinked payloads can end up empty in the RPM.
BIN=src-tauri/target/release/vantalk-desktop
if [ -f "$BIN" ]; then
  cp -f --remove-destination "$BIN" "$BIN.tmp" && mv -f "$BIN.tmp" "$BIN"
fi
npx tauri build --bundles rpm

mkdir -p /out
cp -av src-tauri/target/release/bundle/deb/*.deb /out/ 2>/dev/null || true
cp -av src-tauri/target/release/bundle/rpm/*.rpm /out/ 2>/dev/null || true
# ASCII release names
shopt -s nullglob
for f in /out/*.deb; do cp -f "$f" /out/VanTalk-2026.7.29-linux-amd64.deb; done
for f in /out/*.rpm; do cp -f "$f" /out/VanTalk-2026.7.29-linux-x86_64.rpm; done
chown -R 1000:1000 /out || true
ls -lah /out
'
echo "Artifacts in $OUT"
ls -lah "$OUT"
