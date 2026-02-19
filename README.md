# Orbit

A browser extension to save and restore named tab sessions.

## The problem

Too many tabs open at once across unrelated contexts. Switching between them means losing track of what was open.

## What it does

- **Save** your current tabs as a named session (e.g. "Job Search", "Vacations 2026")
- **Restore** a session — choose to close your current tabs or keep them open
- **Rename** and **delete** sessions
- **Export** all sessions to a JSON file for backup
- **Import** sessions from a backup (safe merge — no duplicates)
- **Search** sessions by name

All data is stored locally in `chrome.storage.local`. No server, no cloud, no account.

## Install

1. Open `[web-browser]://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder

## Backup your sessions

Use **Export All** regularly to download a `.json` backup to your disk. If anything goes wrong, **Import** will restore your sessions from that file.

## Browser compatibility

Works on any Chromium-based browser: Chrome, Brave, Edge, Opera.

## Project structure

```
orbit/
├── manifest.json   # Extension manifest (Manifest V3)
├── background.js   # Service worker — storage and tab operations
├── popup.html      # Extension popup UI
├── popup.css       # Styles
├── popup.js        # UI logic and message passing
└── icons/          # Extension icons
```
# orbit
