#!/usr/bin/env bash
# Builds dist/GiftJar-Windows.zip: app + portable Node.js + double-click launcher.
# Also builds dist/GiftJar-update.zip (the app without Node.js) and its checksum, which the
# launcher downloads from GitHub Releases. BUILD_NUMBER numbers the build (0 for a local build).
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_VERSION="${NODE_VERSION:-v22.23.4}"
NODE_ZIP="node-$NODE_VERSION-win-x64.zip"
CACHE=".cache"
STAGE="dist/GiftJar"
BUILD_NUMBER="${BUILD_NUMBER:-0}"
BUILD_COMMIT="${BUILD_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
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

cp scripts/windows/HUONG-DAN.txt scripts/windows/launcher.mjs "$STAGE/"
printf '{ "build": %s, "commit": "%s", "node": "%s" }\n' "$BUILD_NUMBER" "$BUILD_COMMIT" "$NODE_VERSION" > "$STAGE/version.json"
# .bat files need CRLF line endings
sed 's/$/\r/' scripts/windows/start.bat > "$STAGE/start.bat"

# Git Bash ships without zip; fall back to the tar.exe built into Windows 10+.
make_zip() { # make_zip <folder to run in> <zip path relative to it> <files...>
  local dir="$1" out="$2"; shift 2
  if command -v zip >/dev/null 2>&1; then
    (cd "$dir" && zip -qr "$out" "$@")
  else
    (cd "$dir" && "$(cygpath -u "$SYSTEMROOT")/System32/tar.exe" -a -cf "$out" "$@")
  fi
}
make_zip dist GiftJar-Windows.zip GiftJar
# Keep this list in step with PARTS in scripts/windows/launcher.mjs.
make_zip "$STAGE" ../GiftJar-update.zip overlay server node_modules package.json package-lock.json launcher.mjs HUONG-DAN.txt version.json
(cd dist && sha256sum GiftJar-update.zip | cut -d' ' -f1 > GiftJar-update.zip.sha256)
ls -lh dist/GiftJar-Windows.zip dist/GiftJar-update.zip
