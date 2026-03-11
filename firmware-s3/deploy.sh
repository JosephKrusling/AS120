#!/usr/bin/env bash
set -euo pipefail

# Build firmware and deploy via HTTP OTA
# Usage: ./deploy.sh [ip_address]

IP="${1:-192.168.1.139}"
IDF_PATH="${IDF_PATH:-/Users/jmk/esp/esp-idf}"

source "$IDF_PATH/export.sh" > /dev/null 2>&1

echo "Building firmware..."
idf.py build || exit 1

BIN="build/as120-s3.bin"
SIZE=$(stat -f%z "$BIN" 2>/dev/null || stat -c%s "$BIN")
echo "Uploading firmware ($SIZE bytes) to $IP..."

curl -f --progress-bar \
  -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$BIN" \
  --max-time 120 \
  "http://$IP/api/ota/firmware"

echo ""
echo "Done! Device is rebooting with new firmware."
