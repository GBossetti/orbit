# Orbit

A browser extension to save, restore, and manage named tab sessions.

Works on any Chromium-based browser: **Chrome, Brave, Edge, Opera**.

---

## The problem

Too many tabs open at once across unrelated contexts — work, research, personal projects. Switching between them means losing track of what was open and why.

## What it does

- **Save** your current tabs as a named session (e.g. "Job Search", "Vacation 2026")
- **Restore** a session — choose to close your current tabs or keep them open alongside
- **Update** a session — overwrite its saved tabs with what you currently have open
- **Rename** and **delete** sessions
- **Export** all sessions to a JSON file for backup
- **Import** sessions from a backup file (safe merge — no duplicates)
- **Search** sessions by name
- **Active session indicator** — sessions whose tabs are all currently open are highlighted in the list

All data is stored locally in browser storage. No server, no cloud, no account required.

---

## Install

1. Open the browser's extension management page (usually accessible via the browser menu)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. The Orbit icon will appear in your toolbar

---

## How it works

### Saving a session
Click **+ New**, enter a name, and confirm. Orbit captures all tabs in the current window, filtering out internal browser pages (new tab pages, settings, extensions). The session is stored immediately in local browser storage.

### Restoring a session
Open the session menu (`⋯`) and click **Restore**. You can choose to:
- **Close current tabs** — replaces your current window with the session's tabs
- **Keep current tabs open** — opens the session's tabs on top of what you already have

### Updating a session
If you have closed tabs you no longer need or opened new ones you want to keep, use **Update** from the session menu. It replaces the session's saved tabs with whatever you currently have open, keeping the session's name and creation date intact.

### Active session indicator
When a session's saved tabs are all currently open in your window, that session is highlighted with an accent border and a `●` marker in the list. This helps you quickly identify which session you are working in.

### Export and Import
Use **Export All** to download a `.json` backup of all your sessions. Use **Import** to restore or merge sessions from a backup file — existing sessions are never overwritten during import.

### URL filtering
Orbit only saves and restores regular web pages. Internal browser pages (`chrome://`, `about:`, extension pages, `data:` URLs, etc.) are silently skipped at both save and restore time.

---

## Project structure

```
orbit/
├── manifest.json   # Extension manifest (Manifest V3)
├── background.js   # Service worker — storage and tab operations
├── popup.html      # Extension popup UI
├── popup.css       # Styles
├── popup.js        # UI logic and message passing
└── icons/          # Extension icons (16px, 48px, 128px)
```
