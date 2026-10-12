#!/bin/sh
# herdr plugin action "Open herdr-bot": opens the installed app if there is one, otherwise the app built
# by `herdr plugin install`. A second launch only focuses the window that is already open.
#
# The app is started through `open`, so launchd owns it: a background child of this script could be
# cleaned up together with the action, and it would also need `node` on herdr's PATH.
set -eu

root="${HERDR_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

for app in "/Applications/herdr-bot.app" "$HOME/Applications/herdr-bot.app"; do
  if [ -d "$app" ]; then
    exec open -a "$app"
  fi
done

electron_app="$root/node_modules/electron/dist/Electron.app"
if [ ! -d "$electron_app" ] || [ ! -f "$root/desktop/dist/desktop/src/main.js" ]; then
  echo "herdr-bot is not built yet. Reinstall the plugin: herdr plugin install speardragon/herdr-bot" >&2
  exit 1
fi

# -n starts a fresh Electron even if another Electron app is running; herdr-bot's own single-instance
# lock then hands off to an already-open herdr-bot window.
exec open -n -a "$electron_app" --args "$root/desktop"
