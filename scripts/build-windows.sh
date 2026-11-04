#!/usr/bin/env bash
# Builds dist/GiftJar-Windows.zip: app + portable Node.js + double-click launcher.
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_VERSION="${NODE_VERSION:-v22.23.4}"
NODE_ZIP="node-$NODE_VERSION-win-x64.zip"
CACHE=".cache"
STAGE="dist/GiftJar"
mkdir -p "$CACHE"

if [ ! -f "$CACHE/$NODE_ZIP" ]; then
  curl -fL "https://nodejs.org/dist/$NODE_VERSION/$NODE_ZIP" -o "$CACHE/$NODE_ZIP"
fi
expected=$(curl -fsS "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | grep " $NODE_ZIP\$" | cut -d' ' -f1)
echo "$expected  $CACHE/$NODE_ZIP" | sha256sum -c -

rm -rf dist && mkdir -p "$STAGE"
cp -r server overlay package.json package-lock.json "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund)

unzip -q "$CACHE/$NODE_ZIP" -d "$CACHE/node-extract"
mkdir -p "$STAGE/node"
cp "$CACHE/node-extract/node-$NODE_VERSION-win-x64/node.exe" "$STAGE/node/"
cp "$CACHE/node-extract/node-$NODE_VERSION-win-x64/LICENSE" "$STAGE/node/"
rm -rf "$CACHE/node-extract"

cp scripts/windows/HUONG-DAN.txt "$STAGE/"
# .bat files need CRLF line endings
sed 's/$/\r/' scripts/windows/start.bat > "$STAGE/start.bat"

(cd dist && zip -qr GiftJar-Windows.zip GiftJar)
ls -lh dist/GiftJar-Windows.zip
