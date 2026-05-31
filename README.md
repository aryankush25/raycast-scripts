# Raycast Scripts — Browser Utilities

A collection of [Raycast](https://raycast.com) script commands for managing browsers on macOS.

## Scripts

### 🌐 Choose Default Browser (`choose-browser/`)
A full Raycast Extension with a native multi-step UI. Shows all installed browsers in a searchable list (current default is highlighted), then navigates to a detail/confirmation view before applying the change. Uses `defaultbrowser` to detect installed browsers and set the default.

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

### Script Commands (`toggle-browser.sh`, `sync-bookmarks.js`)
1. In Raycast, open **Extensions → Script Commands → Add Script Directory** and point it at this repo root.
2. The scripts will appear in Raycast search immediately.

### Choose Default Browser Extension (`choose-browser/`)
1. `cd choose-browser && npm install`
2. Run `npm run dev` to load the extension in Raycast for development.
3. Add an `extension-icon.png` (512×512) to `choose-browser/assets/` before running `npm run build`.
