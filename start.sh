#!/usr/bin/env bash
# Starts the Gift Jar overlay on Linux/macOS and opens the dashboard.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Cần Node.js 22 trở lên: https://nodejs.org" >&2
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "Cảnh báo: Node.js hiện tại $(node -v), nên dùng bản 22 trở lên." >&2
fi
[ -d node_modules ] || npm install --omit=dev --no-audit --no-fund

export TIKTOK_USERNAME="${TIKTOK_USERNAME-ennieiuoiw}"
URL="http://127.0.0.1:${PORT:-8787}/"
(sleep 2; xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || true) &
exec node server/src/index.js
