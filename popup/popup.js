// QueueTube - Popup Script

document.addEventListener("DOMContentLoaded", init);

let state = { queue: [], currentIndex: -1, autoPlay: true };

async function init() {
  state = await sendMessage({ action: "getState" });
  renderUI();
  setupEventListeners();
}

// Listen for state changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "stateChanged") {
    state = message.state;
    renderUI();
  }
});

function setupEventListeners() {

  // Controls
  document.getElementById("prevBtn").addEventListener("click", () => sendMessage({ action: "playPrevious" }));
  document.getElementById("nextBtn").addEventListener("click", () => sendMessage({ action: "playNext" }));

  // Auto-play toggle / Play button
  document.getElementById("autoPlayToggle").addEventListener("click", () => {
    const isIdle = state.currentIndex < 0 || state.currentIndex >= state.queue.length;
    if (isIdle && state.queue.length > 0) {
      // Play first video in queue
      sendMessage({ action: "playVideo", id: state.queue[0].id });
    } else {
      sendMessage({ action: "toggleAutoPlay" });
    }
  });

  // Clear queue
  document.getElementById("clearQueueBtn").addEventListener("click", () => {
    if (state.queue.length === 0) return;
    if (confirm("Clear the entire queue?")) {
      sendMessage({ action: "clearQueue" });
    }
  });
}

async function addCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
    showToast("Not a YouTube video page", "error");
    return;
  }

  const response = await sendMessage({
    action: "addToQueue",
    url: tab.url,
    title: tab.title ? tab.title.replace(" - YouTube", "").trim() : "",
    thumbnail: "",
  });

  if (response.success) {
    showToast("Added to queue", "success");
  } else {
    showToast(response.error || "Failed to add", "error");
  }
}

function renderUI() {
  renderHeader();
  renderNowPlaying();
  renderQueue();
}

function renderHeader() {
  // Badge count
  const badge = document.getElementById("queueCount");
  badge.textContent = state.queue.length;
  badge.classList.toggle("empty", state.queue.length === 0);

  const btn = document.getElementById("autoPlayToggle");
  const isIdle = state.currentIndex < 0 || state.currentIndex >= state.queue.length;

  if (isIdle && state.queue.length > 0) {
    // Show Play button when queue has items but nothing is playing
    btn.classList.remove("active");
    btn.classList.add("play-mode");
    btn.title = "Play Queue";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span>Play</span>
    `;
  } else {
    // Show Auto-play toggle when playing
    btn.classList.remove("play-mode");
    btn.classList.toggle("active", state.autoPlay);
    btn.title = state.autoPlay ? "Auto-Play: ON" : "Auto-Play: OFF";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
      <span>Auto</span>
    `;
  }
}

function renderNowPlaying() {
  const container = document.getElementById("nowPlaying");
  if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) {
    container.classList.add("hidden");
    return;
  }

  const current = state.queue[state.currentIndex];
  container.classList.remove("hidden");
  document.getElementById("nowPlayingThumb").src = current.thumbnail;
  document.getElementById("nowPlayingTitle").textContent = current.title;
}

function renderQueue() {
  const list = document.getElementById("queueList");

  if (state.queue.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
            <path d="M3 4h14v2H3V4zm0 4h14v2H3V8zm0 4h10v2H3v-2zm14 0v6l5-3-5-3z"/>
          </svg>
        </div>
        <p>Your queue is empty</p>
        <p class="hint">Click "Add current tab" or browse YouTube and use the queue button on any video</p>
      </div>
    `;
    return;
  }

  list.innerHTML = "";
  state.queue.forEach((item, index) => {
    const el = createQueueItem(item, index);
    list.appendChild(el);
  });

  // Scroll playing item into view
  const playingEl = list.querySelector(".queue-item.playing");
  if (playingEl) {
    playingEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function createQueueItem(item, index) {
  const isPlaying = index === state.currentIndex;

  const el = document.createElement("div");
  el.className = `queue-item${isPlaying ? " playing" : ""}`;
  el.draggable = true;
  el.dataset.index = index;
  el.dataset.id = item.id;

  el.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    </div>
    <span class="queue-item-index">${isPlaying ? "▶" : index + 1}</span>
    <img class="queue-item-thumb" src="${escapeAttr(item.thumbnail)}" alt="" loading="lazy">
    <div class="queue-item-info">
      <div class="queue-item-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div>
    </div>
    <div class="queue-item-actions">
      <button class="queue-item-btn remove" title="Remove">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
      </button>
    </div>
  `;

  // Single click to play
  el.addEventListener("click", (e) => {
    if (e.target.closest(".queue-item-btn") || e.target.closest(".drag-handle")) return;
    sendMessage({ action: "playVideo", id: item.id });
  });

  // Remove
  el.querySelector(".remove").addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "removeFromQueue", id: item.id });
  });

  // Drag & drop
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((d) => d.classList.remove("drag-over"));
  });

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drag-over");
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    const toIndex = index;
    if (fromIndex !== toIndex) {
      sendMessage({ action: "reorderQueue", fromIndex, toIndex });
    }
  });

  return el;
}

// Helpers
function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

function showToast(text, type = "") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
