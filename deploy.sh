#!/bin/bash
# Copies the extension folder to ST's extensions directory.
# Run this after every git pull on the ST device.

DEST="/storage/emulated/0/Documents/default-user/extensions/LWH-companion"

mkdir -p "$DEST"
cp -r ~/LWH-companion/extension/. "$DEST/"
echo "✅ Deployed to $DEST"
