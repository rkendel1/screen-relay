#!/bin/sh
# Opens the fixture full screen on the running Screen Relay desktop. A test harness step: the app itself never launches programs.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
browser=${LAB_BROWSER:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}
profile=${TMPDIR:-/tmp}/screen-relay-lab-browser
flags="--kiosk --no-first-run --no-default-browser-check --disable-translate --password-store=basic --user-data-dir=$profile"
if [ "$(id -u)" = 0 ]; then flags="$flags --no-sandbox"; fi
exec screen-relay run --json -- "$browser" $flags "file://$here/index.html"
