# Raycast Scripts — Browser Utilities

A collection of [Raycast](https://raycast.com) script commands for managing browsers on macOS.

## Scripts

### 🌐 Choose Default Browser (`choose-browser.sh`)
Lists all browsers installed on your system and lets you pick one to set as the default. Uses `defaultbrowser` to detect installed browsers and shows a native macOS picker.

### 🔀 Toggle Browser (`toggle-browser.sh`)
Toggles the default browser between Firefox and Vivaldi with a single keystroke. Auto-dismisses the system confirmation dialog.

### 🔖 Sync Bookmarks (`sync-bookmarks.js`)
Copies bookmarks between browsers (Vivaldi, Chrome, Brave, Firefox). Supports multiple profiles and two sync modes:
- **Merge** — adds new bookmarks without removing existing ones (safe)
- **Replace** — overwrites the destination bookmarks entirely

Firefox is supported as a source only (reading via `sqlite3`). Writing to Firefox is not supported due to SQLite locking.

## Requirements

- [Raycast](https://raycast.com)
- [`defaultbrowser`](https://github.com/kerma/defaultbrowser) — `brew install defaultbrowser`
- `sqlite3` (for Sync Bookmarks with Firefox as source) — `brew install sqlite3`

## Installation

1. Clone or download this repo.
2. In Raycast, open **Extensions → Script Commands → Add Script Directory** and point it at this folder.
3. The scripts will appear in Raycast search immediately.
