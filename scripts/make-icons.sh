#!/usr/bin/env bash
# Regenerates every icon from assets/app-icon.svg (Linux/Windows) and assets/app-icon-macos.svg (Apple grid).
# Needs ImageMagick 7 (magick) with an SVG delegate, and python3.
set -euo pipefail
cd "$(dirname "$0")/.."
r() { magick -background none -density 400 "$1" -resize "$2x$2" -define png:color-type=6 "$3"; }
r assets/app-icon.svg 512 icons/icon.png
r assets/app-icon.svg 128 icons/128x128.png
r assets/app-icon.svg 32 icons/32x32.png
magick -background none -density 400 assets/app-icon.svg -define icon:auto-resize=256,64,48,32,16 icons/icon.ico

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for s in 16 32 64 128 256 512 1024; do r assets/app-icon-macos.svg "$s" "$tmp/$s.png"; done
# ICNS = "icns" + total length, then (OSType, length, PNG) chunks
python3 - "$tmp" icons/icon.icns <<'PY'
import struct, sys
d, out = sys.argv[1], sys.argv[2]
types = [("icp4", 16), ("icp5", 32), ("ic11", 32), ("icp6", 64), ("ic12", 64), ("ic07", 128),
         ("ic08", 256), ("ic13", 256), ("ic09", 512), ("ic14", 512), ("ic10", 1024)]
chunks = b"".join(t.encode() + struct.pack(">I", 8 + len(p)) + p for t, p in ((t, open(f"{d}/{s}.png", "rb").read()) for t, s in types))
open(out, "wb").write(b"icns" + struct.pack(">I", 8 + len(chunks)) + chunks)
PY
echo "icons regenerated"
