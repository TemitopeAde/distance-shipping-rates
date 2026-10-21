#!/bin/zsh
# Renders every listing image with headless Chrome.
#   images:  1200x900 CSS px at 2x  -> 2400x1800 PNG (4:3)
#   banner:  540x360 JPG (+ @2x)
set -e
cd "${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out
shot() { # file width height scale out
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --force-device-scale-factor=$4 --window-size=$2,$3 --virtual-time-budget=8000 \
    --screenshot="$PWD/$5" "file://$PWD/src/$1" >/dev/null 2>&1
  echo "rendered $5"
}
for f in 1-main 2-overview 3-pricing-rules 4-rate-simulator 5-zones-locations 6-checkout; do
  [[ -f src/$f.html ]] && shot $f.html 1200 900 2 out/$f.png
done
if [[ -f src/banner.html ]]; then
  shot banner.html 540 360 1 out/banner.png
  shot banner.html 540 360 2 out/banner@2x.png
  sips -s format jpeg -s formatOptions 92 out/banner.png --out out/banner.jpg >/dev/null
  sips -s format jpeg -s formatOptions 92 out/banner@2x.png --out out/banner@2x.jpg >/dev/null
  rm out/banner.png out/banner@2x.png
fi
