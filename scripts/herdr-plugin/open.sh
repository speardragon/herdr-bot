#!/bin/sh
# herdr plugin action "Open herdr-bot": starts the app built by `herdr plugin install`, detached so
# the action returns right away. A second launch only focuses the window that is already open.
set -eu

root="${HERDR_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
electron="$root/node_modules/.bin/electron"

if [ ! -x "$electron" ] || [ ! -f "$root/desktop/dist/desktop/src/main.js" ]; then
  echo "herdr-bot is not built yet. Reinstall the plugin: herdr plugin install speardragon/herdr-bot" >&2
  exit 1
fi

# herdr gives plugin actions the socket and pane of the invoking session. herdr-bot runs its bots in
# its own session, so none of that may leak into the app (HERDR_BIN_PATH is kept: it is the binary).
unset HERDR_SOCKET_PATH HERDR_ENV HERDR_WORKSPACE_ID HERDR_TAB_ID HERDR_PANE_ID \
  HERDR_PLUGIN_ID HERDR_PLUGIN_ROOT HERDR_PLUGIN_CONFIG_DIR HERDR_PLUGIN_STATE_DIR \
  HERDR_PLUGIN_CONTEXT_JSON HERDR_PLUGIN_ACTION_ID

cd "$root/desktop"
nohup "$electron" . >/dev/null 2>&1 &
