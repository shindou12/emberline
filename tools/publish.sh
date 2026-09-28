#!/bin/sh
# Copy the game into the GitHub Pages repo (root + lab/) and stamp the build
# version so installed PWAs notice the update. Usage: tools/publish.sh [pages-repo]
set -e
SRC=$(cd "$(dirname "$0")/.." && pwd)
DST=${1:-/home/user/emberline}
VER=$(git -C "$SRC" rev-parse --short HEAD)-$(date +%s)
for D in "$DST" "$DST/lab"; do
  mkdir -p "$D"
  cp -r "$SRC/index.html" "$SRC/js" "$SRC/tools" "$SRC/icons" "$SRC/sw.js" "$SRC/manifest.webmanifest" "$D/"
  sed -i "s#<meta name=\"el-version\" content=\"[^\"]*\">#<meta name=\"el-version\" content=\"$VER\">#" "$D/index.html"
  printf '{"v":"%s"}\n' "$VER" > "$D/version.json"
done
sed -i 's#<script src="js/main.js"></script>#<script>window.EL_LAB = 1;</script>\n<script src="js/main.js"></script>#' "$DST/lab/index.html"
sed -i 's#"name": "EMBERLINE"#"name": "EMBERLINE LAB"#; s#"short_name": "EMBERLINE"#"short_name": "EL LAB"#' "$DST/lab/manifest.webmanifest"
echo "published $VER"
