#!/usr/bin/env bash
set -euo pipefail

# Build SPIFFS image and upload to AS120 over HTTP
# Usage: ./deploy.sh [ip_address]
#   Default IP: 192.168.3.139

IP="${1:-192.168.1.139}"
FIRMWARE_DIR="$(dirname "$0")/../firmware-s3"
IDF_PATH="${IDF_PATH:-/Users/jmk/esp/esp-idf}"

# Copy build output to SPIFFS dir
rm -f "$FIRMWARE_DIR/spiffs/assets/"*.gz
cp dist/assets/*.gz "$FIRMWARE_DIR/spiffs/assets/"
cp dist/index.html "$FIRMWARE_DIR/spiffs/"

# Generate SPIFFS image
echo "Generating SPIFFS image..."
python3 "$IDF_PATH/components/spiffs/spiffsgen.py" 0x30000 "$FIRMWARE_DIR/spiffs" /tmp/as120-spiffs.bin

SIZE=$(stat -f%z /tmp/as120-spiffs.bin 2>/dev/null || stat -c%s /tmp/as120-spiffs.bin)
echo "Uploading SPIFFS image ($SIZE bytes) to $IP..."

# Upload via HTTP
curl -f --progress-bar \
  -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/as120-spiffs.bin \
  "http://$IP/api/ota/spiffs"

echo ""
echo "Done! Device is rebooting."
