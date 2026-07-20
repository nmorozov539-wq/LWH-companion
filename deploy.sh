#!/bin/bash
# Deploys extension files (extensions folder) and preset files (Downloads,
# for ST's file-picker-based Preset import) to their ST-visible locations.

EXT_DEST="/storage/emulated/0/Documents/default-user/extensions/LWH-companion"
DOWNLOAD_DEST="/storage/emulated/0/Download"

mkdir -p "$EXT_DEST"
cp -r ~/LWH-companion/extension/. "$EXT_DEST/"
echo "✅ Extension deployed to $EXT_DEST"

mkdir -p "$DOWNLOAD_DEST"
cp ~/LWH-companion/preset/*.json "$DOWNLOAD_DEST/" 2>/dev/null
echo "✅ Preset JSON files copied to $DOWNLOAD_DEST"
echo "   Import via SillyTavern: Chat Completion settings → Preset → Import"
