// background.js — Service worker for Orbit
// Handles all chrome.storage.local reads/writes and tab operations.
// The popup communicates with this file via chrome.runtime.sendMessage.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // keep message channel open for async response
});

async function handleMessage(message) {
  switch (message.action) {
    case "getSessions":
      return getSessions();
    case "saveSession":
      return saveSession(message.name);
    case "restoreSession":
      return restoreSession(message.sessionId, message.closeCurrentTabs);
    case "deleteSession":
      return deleteSession(message.sessionId);
    case "renameSession":
      return renameSession(message.sessionId, message.newName);
    case "exportSessions":
      return exportSessions();
    case "importSessions":
      return importSessions(message.data);
    case "updateSession":
      return updateSession(message.sessionId);
    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

// --- URL validation ---

function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  const blocked = ["chrome://", "chrome-extension://", "about:", "edge://", "brave://", "javascript:", "data:"];
  return !blocked.some((prefix) => url.startsWith(prefix));
}

// --- Storage helpers ---

async function readSessions() {
  const result = await chrome.storage.local.get("sessions");
  return result.sessions ?? {};
}

async function writeSessions(sessions) {
  await chrome.storage.local.set({ sessions });
}

// --- Handlers ---

async function getSessions() {
  const sessions = await readSessions();
  const { activeSessionId } = await chrome.storage.local.get("activeSessionId");
  return { success: true, sessions, activeSessionId: activeSessionId ?? null };
}

async function saveSession(name) {
  if (!name || !name.trim()) {
    throw new Error("Session name cannot be empty.");
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const filteredTabs = tabs
    .filter((tab) => isSafeUrl(tab.url))
    .map((tab) => ({ url: tab.url, title: tab.title || tab.url }));

  if (filteredTabs.length === 0) {
    throw new Error("No saveable tabs found in the current window.");
  }

  const sessions = await readSessions();
  const id = crypto.randomUUID();
  sessions[id] = {
    id,
    name: name.trim(),
    createdAt: Date.now(),
    tabs: filteredTabs,
  };

  await writeSessions(sessions);
  return { success: true, session: sessions[id] };
}

async function restoreSession(sessionId, closeCurrentTabs) {
  const sessions = await readSessions();
  const session = sessions[sessionId];
  if (!session) {
    throw new Error("Session not found.");
  }

  const safeTabs = session.tabs.filter((tab) => isSafeUrl(tab.url));
  if (safeTabs.length === 0) {
    throw new Error("No restorable tabs in this session.");
  }

  if (closeCurrentTabs) {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const tabsToClose = currentTabs.map((tab) => tab.id);

    // Open the first session tab to anchor the window, then close old tabs,
    // then open the rest — so old and new sessions never fully coexist.
    await chrome.tabs.create({ url: safeTabs[0].url, active: true });
    await chrome.tabs.remove(tabsToClose);

    if (safeTabs.length > 1) {
      await Promise.all(
        safeTabs.slice(1).map((tab) => chrome.tabs.create({ url: tab.url, active: false }))
      );
    }
  } else {
    await Promise.all(
      safeTabs.map((tab) => chrome.tabs.create({ url: tab.url, active: false }))
    );
  }

  await chrome.storage.local.set({ activeSessionId: sessionId });

  const skipped = session.tabs.length - safeTabs.length;
  return { success: true, skipped };
}

async function updateSession(sessionId) {
  const sessions = await readSessions();
  if (!sessions[sessionId]) {
    throw new Error("Session not found.");
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const filteredTabs = tabs
    .filter((tab) => isSafeUrl(tab.url))
    .map((tab) => ({ url: tab.url, title: tab.title || tab.url }));

  if (filteredTabs.length === 0) {
    throw new Error("No saveable tabs found in the current window.");
  }

  sessions[sessionId].tabs = filteredTabs;
  await writeSessions(sessions);
  return { success: true, session: sessions[sessionId] };
}

async function deleteSession(sessionId) {
  const sessions = await readSessions();
  if (!sessions[sessionId]) {
    throw new Error("Session not found.");
  }
  delete sessions[sessionId];
  await writeSessions(sessions);
  const { activeSessionId } = await chrome.storage.local.get("activeSessionId");
  if (activeSessionId === sessionId) {
    await chrome.storage.local.remove("activeSessionId");
  }
  return { success: true };
}

async function renameSession(sessionId, newName) {
  if (!newName || !newName.trim()) {
    throw new Error("Session name cannot be empty.");
  }
  const sessions = await readSessions();
  if (!sessions[sessionId]) {
    throw new Error("Session not found.");
  }
  sessions[sessionId].name = newName.trim();
  await writeSessions(sessions);
  return { success: true };
}

async function exportSessions() {
  const sessions = await readSessions();
  return { success: true, sessions };
}

async function importSessions(data) {
  if (!data || typeof data !== "object" || typeof data.sessions !== "object") {
    throw new Error("Invalid import file format.");
  }

  const existing = await readSessions();
  let imported = 0;

  for (const [id, session] of Object.entries(data.sessions)) {
    if (existing[id]) continue;
    if (
      typeof session.id !== "string" ||
      typeof session.name !== "string" ||
      typeof session.createdAt !== "number" ||
      !Array.isArray(session.tabs)
    ) continue;

    const safeTabs = session.tabs.filter((tab) => typeof tab.url === "string" && isSafeUrl(tab.url));
    existing[id] = { ...session, tabs: safeTabs };
    imported++;
  }

  await writeSessions(existing);
  return { success: true, imported };
}
