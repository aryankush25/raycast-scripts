#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Browser
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🔀
# @raycast.packageName Browser

current=$(defaultbrowser | grep '^\*' | awk '{print $2}')

if [ "$current" = "firefox" ]; then
  defaultbrowser vivaldi
  osascript -e 'tell application "System Events" to tell process "CoreServicesUIAgent" to click button 1 of window 1'
  echo "🔴 Switched to Vivaldi"
else
  defaultbrowser firefox
  osascript -e 'tell application "System Events" to tell process "CoreServicesUIAgent" to click button 1 of window 1'
  echo "🦊 Switched to Firefox"
fi
