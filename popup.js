// popup.js — UI logic for Orbit
// Runs while the popup is open. Communicates with background.js via sendMessage.

// ── State ──
let allSessions = {}; // cached from storage, keyed by id
let activeDropdown = null; // currently open dropdown element
let currentActiveSessionId = null; // ID of the last restored session
let currentUrlSet = new Set(); // current tab URLs, refreshed on load

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  loadAndRender();
  attachStaticListeners();
});

function attachStaticListeners() {
  // Header
  document.getElementById("btn-new").addEventListener("click", showSaveModal);

  // Search
  document.getElementById("search").addEventListener("input", () => {
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
  });

  // Footer
  document.getElementById("btn-export").addEventListener("click", exportSessions);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", onImportFileSelected);

  // Modal cancel buttons (all modals share the .modal-cancel class)
  document.querySelectorAll(".modal-cancel").forEach((btn) => {
    btn.addEventListener("click", hideAllModals);
  });

  // Close modal when clicking the overlay backdrop
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideAllModals();
    });
  });

  // Save modal confirm
  document.getElementById("save-confirm").addEventListener("click", doSaveSession);
  document.getElementById("save-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSaveSession();
  });

  // Rename modal confirm
  document.getElementById("rename-confirm").addEventListener("click", doRenameSession);
  document.getElementById("rename-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doRenameSession();
  });

  // Restore modal confirm
  document.getElementById("restore-confirm").addEventListener("click", doRestoreSession);

  // Update modal confirm
  document.getElementById("update-confirm").addEventListener("click", doUpdateSession);

  // Unsaved banner Update button
  document.getElementById("unsaved-update").addEventListener("click", () => {
    const session = allSessions[currentActiveSessionId];
    if (session) showUpdateModal(session);
  });

  // Close any open dropdown when clicking elsewhere
  document.addEventListener("click", (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target)) {
      closeDropdown();
    }
  });
}

// ── Load & Render ──

async function loadAndRender() {
  const [res, currentTabs] = await Promise.all([
    sendMessage({ action: "getSessions" }),
    chrome.tabs.query({ currentWindow: true }),
  ]);
  if (res.success) {
    allSessions = res.sessions;
    currentUrlSet = new Set(currentTabs.map((t) => t.url));
    currentActiveSessionId = res.activeSessionId;
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
  }
}

function renderSessions(sessions, currentUrls = new Set(), activeSessionId = null) {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const list = document.getElementById("session-list");
  list.innerHTML = "";

  // Show/hide unsaved-changes banner
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const isModified = activeSession && !(
    activeSession.tabs.length === currentUrls.size &&
    activeSession.tabs.every((tab) => currentUrls.has(tab.url))
  );
  const banner = document.getElementById("unsaved-banner");
  if (isModified) {
    const tabCount = currentUrls.size;
    document.getElementById("unsaved-text").textContent =
      `"${activeSession.name}" has unsaved changes · ${tabCount} tab${tabCount !== 1 ? "s" : ""} open`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  const entries = Object.values(sessions)
    .filter((s) => !query || s.name.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    if (query) {
      empty.innerHTML = `<strong>No results</strong>No sessions match "<em>${escapeHtml(query)}</em>"`;
    } else {
      empty.innerHTML = `<strong>No sessions yet</strong>Click <strong>+ New</strong> to save your current tabs as a session.`;
    }
    list.appendChild(empty);
    return;
  }

  for (const session of entries) {
    list.appendChild(buildSessionCard(session, currentUrls, activeSessionId));
  }
}

function buildSessionCard(session, currentUrls = new Set(), activeSessionId = null) {
  const card = document.createElement("div");
  card.dataset.id = session.id;

  const isTracked = session.id === activeSessionId;
  const tabsMatch = session.tabs.length > 0 &&
    session.tabs.length === currentUrls.size &&
    session.tabs.every((tab) => currentUrls.has(tab.url));

  const isClean    = isTracked && tabsMatch;   // restored, no changes
  const isModified = isTracked && !tabsMatch;  // restored, tabs changed
  const isExact    = !isTracked && tabsMatch;  // exact match, not explicitly restored

  let cardClass = "session-card";
  let dotClass = "active-dot";
  if (isClean || isExact) {
    cardClass += " session-card--active";
  } else if (isModified) {
    cardClass += " session-card--modified";
    dotClass += " active-dot--modified";
  }
  card.className = cardClass;

  const tabWord = session.tabs.length === 1 ? "tab" : "tabs";
  const date = formatDate(session.createdAt);
  const showDot = isClean || isExact || isModified;
  const activeDot = showDot
    ? `<span class="${dotClass}" title="This session is currently open">●</span> `
    : "";

  card.innerHTML = `
    <div class="session-info">
      <div class="session-name" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</div>
      <div class="session-meta">${activeDot}${session.tabs.length} ${tabWord} · ${date}</div>
    </div>
    <button class="session-menu-btn" title="Options" aria-label="Options for ${escapeHtml(session.name)}">⋯</button>
  `;

  card.querySelector(".session-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(session, e.currentTarget);
  });

  return card;
}

// ── Dropdown menu ──

function toggleDropdown(session, anchorEl) {
  if (activeDropdown) {
    const isSame = activeDropdown.dataset.sessionId === session.id;
    closeDropdown();
    if (isSame) return; // clicking same button closes it
  }

  const menu = document.createElement("div");
  menu.className = "dropdown";
  menu.dataset.sessionId = session.id;

  const items = [
    { label: "Restore", action: () => showRestoreModal(session) },
    { label: "Update", action: () => showUpdateModal(session) },
    { label: "Rename", action: () => showRenameModal(session) },
    { label: "Delete", action: () => doDeleteSession(session), danger: true },
  ];

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = "dropdown-item" + (item.danger ? " danger" : "");
    btn.textContent = item.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown();
      item.action();
    });
    menu.appendChild(btn);
  }

  // Position the menu: prefer below the anchor, flip upward if it would be clipped
  const rect = anchorEl.getBoundingClientRect();
  menu.style.right = document.body.clientWidth - rect.right + "px";

  document.body.appendChild(menu);
  activeDropdown = menu;

  const menuHeight = menu.offsetHeight;
  const spaceBelow = document.documentElement.clientHeight - rect.bottom - 4;
  if (spaceBelow >= menuHeight) {
    menu.style.top = rect.bottom + 4 + "px";
  } else {
    menu.style.top = rect.top - menuHeight - 4 + "px";
  }
}

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

// ── Save session ──

function showSaveModal() {
  hideAllModals();
  const input = document.getElementById("save-name");
  input.value = "";
  showError("save-error", "");
  showModal("modal-save");
  input.focus();
}

async function doSaveSession() {
  const name = document.getElementById("save-name").value.trim();
  if (!name) {
    showError("save-error", "Please enter a session name.");
    return;
  }

  const res = await sendMessage({ action: "saveSession", name });
  if (res.success) {
    hideAllModals();
    allSessions = { ...allSessions, [res.session.id]: res.session };
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
    showToast(`Saved "${res.session.name}"`);
  } else {
    showError("save-error", res.error || "Could not save session.");
  }
}

// ── Rename session ──

let pendingRenameId = null;

function showRenameModal(session) {
  hideAllModals();
  pendingRenameId = session.id;
  const input = document.getElementById("rename-name");
  input.value = session.name;
  showError("rename-error", "");
  showModal("modal-rename");
  input.focus();
  input.select();
}

async function doRenameSession() {
  const newName = document.getElementById("rename-name").value.trim();
  if (!newName) {
    showError("rename-error", "Please enter a session name.");
    return;
  }

  const res = await sendMessage({ action: "renameSession", sessionId: pendingRenameId, newName });
  if (res.success) {
    hideAllModals();
    allSessions[pendingRenameId].name = newName;
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
    showToast("Session renamed");
  } else {
    showError("rename-error", res.error || "Could not rename session.");
  }
}

// ── Restore session ──

let pendingRestoreSession = null;

function showRestoreModal(session) {
  hideAllModals();
  pendingRestoreSession = session;
  document.getElementById("restore-title").textContent = `Restore "${session.name}"`;
  // Reset to default option
  document.querySelector('input[name="restore-mode"][value="close"]').checked = true;
  showModal("modal-restore");
}

async function doRestoreSession() {
  const mode = document.querySelector('input[name="restore-mode"]:checked').value;
  const closeCurrentTabs = mode === "close";

  const res = await sendMessage({
    action: "restoreSession",
    sessionId: pendingRestoreSession.id,
    closeCurrentTabs,
  });

  if (res.success) {
    hideAllModals();
    // Close the popup after restoring
    window.close();
  } else {
    showToast(res.error || "Could not restore session.");
  }
}

// ── Update session ──

let pendingUpdateSession = null;

function showUpdateModal(session) {
  hideAllModals();
  pendingUpdateSession = session;
  const tabWord = session.tabs.length === 1 ? "tab" : "tabs";
  document.getElementById("update-title").textContent = `Update "${session.name}"`;
  document.getElementById("update-sub").textContent =
    `Replace the ${session.tabs.length} saved ${tabWord} with your current open tabs?`;
  showModal("modal-update");
}

async function doUpdateSession() {
  const res = await sendMessage({ action: "updateSession", sessionId: pendingUpdateSession.id });
  if (res.success) {
    hideAllModals();
    allSessions[res.session.id] = res.session;
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
    const tabWord = res.session.tabs.length === 1 ? "tab" : "tabs";
    showToast(`"${res.session.name}" updated (${res.session.tabs.length} ${tabWord})`);
  } else {
    showToast(res.error || "Could not update session.");
  }
}

// ── Delete session ──

async function doDeleteSession(session) {
  const res = await sendMessage({ action: "deleteSession", sessionId: session.id });
  if (res.success) {
    delete allSessions[session.id];
    if (currentActiveSessionId === session.id) currentActiveSessionId = null;
    renderSessions(allSessions, currentUrlSet, currentActiveSessionId);
    showToast(`Deleted "${session.name}"`);
  } else {
    showToast(res.error || "Could not delete session.");
  }
}

// ── Export ──

async function exportSessions() {
  const res = await sendMessage({ action: "exportSessions" });
  if (!res.success) {
    showToast("Export failed.");
    return;
  }

  const payload = { sessions: res.sessions };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbit-sessions-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Sessions exported");
}

// ── Import ──

function onImportFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Reset so the same file can be re-selected later
  e.target.value = "";

  const reader = new FileReader();
  reader.onload = async (evt) => {
    let parsed;
    try {
      parsed = JSON.parse(evt.target.result);
    } catch {
      showToast("Invalid JSON file.");
      return;
    }

    if (!parsed || typeof parsed.sessions !== "object") {
      showToast("File doesn't look like an Orbit export.");
      return;
    }

    const res = await sendMessage({ action: "importSessions", data: parsed });
    if (res.success) {
      const msg = res.imported === 0
        ? "No new sessions to import"
        : `Imported ${res.imported} session${res.imported !== 1 ? "s" : ""}`;
      showToast(msg);
      await loadAndRender();
    } else {
      showToast(res.error || "Import failed.");
    }
  };
  reader.readAsText(file);
}

// ── Modal helpers ──

function showModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hideAllModals() {
  document.querySelectorAll(".modal-overlay").forEach((el) => el.classList.add("hidden"));
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

// ── Toast ──

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden", "fade-out");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 2200);
}

// ── Utilities ──

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
