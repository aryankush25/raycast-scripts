#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Choose Default Browser
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🌐
# @raycast.packageName Browser
# @raycast.description List all installed browsers and set one as default

browsers_raw=$(defaultbrowser 2>/dev/null)

if [ -z "$browsers_raw" ]; then
  echo "❌ 'defaultbrowser' not found. Install it: brew install defaultbrowser"
  exit 1
fi

current=$(echo "$browsers_raw" | grep '^\*' | awk '{print $2}')
options=$(echo "$browsers_raw" | awk '{print $NF}' | awk '{printf "\"%s\",", $0}' | sed 's/,$//')

chosen=$(osascript 2>/dev/null <<APPLESCRIPT
set options to {$options}
set chosen to choose from list options with title "Default Browser" with prompt "Current: $current — Select a new default:" default items {"$current"}
if chosen is false then error number -128
item 1 of chosen
APPLESCRIPT
)

[ $? -ne 0 ] || [ -z "$chosen" ] && exit 0

if [ "$chosen" = "$current" ]; then
  echo "ℹ️  $chosen is already the default browser"
  exit 0
fi

defaultbrowser "$chosen"
osascript -e 'tell application "System Events" to tell process "CoreServicesUIAgent" to click button 1 of window 1' 2>/dev/null
echo "✅ Default browser set to $chosen"
