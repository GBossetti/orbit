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
    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
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
  return { success: true, sessions };
}

async function saveSession(name) {
  if (!name || !name.trim()) {
    throw new Error("Session name cannot be empty.");
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const filteredTabs = tabs
    .filter((tab) => tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://") && !tab.url.startsWith("about:") && !tab.url.startsWith("edge://") && !tab.url.startsWith("brave://"))
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

  if (closeCurrentTabs) {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const tabIds = currentTabs.map((tab) => tab.id);
    if (tabIds.length > 0) {
      await chrome.tabs.remove(tabIds);
    }
  }

  for (const tab of session.tabs) {
    await chrome.tabs.create({ url: tab.url });
  }

  return { success: true };
}

async function deleteSession(sessionId) {
  const sessions = await readSessions();
  if (!sessions[sessionId]) {
    throw new Error("Session not found.");
  }
  delete sessions[sessionId];
  await writeSessions(sessions);
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
    if (!existing[id]) {
      existing[id] = session;
      imported++;
    }
  }

  await writeSessions(existing);
  return { success: true, imported };
}
