// QueueTube - Background Service Worker

const DEFAULT_STATE = {
  queue: [],
  currentIndex: -1,
  autoPlay: true,
  playingTabId: null,
};

// Initialize state on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("queueState", (result) => {
    if (!result.queueState) {
      chrome.storage.local.set({ queueState: DEFAULT_STATE });
    }
  });
});

// Helper: get current state
function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get("queueState", (result) => {
      resolve(result.queueState || DEFAULT_STATE);
    });
  });
}

// Helper: save state
function saveState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ queueState: state }, resolve);
  });
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Extract video ID from YouTube URL
function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    }
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1);
    }
  } catch {
    // ignore
  }
  return null;
}

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // keep channel open for async response
});

async function handleMessage(message, sender) {
  const state = await getState();

  switch (message.action) {
    case "getState":
      return state;

    case "addToQueue": {
      const { url, title, thumbnail } = message;
      const videoId = extractVideoId(url);
      if (!videoId) return { success: false, error: "Invalid YouTube URL" };

      // Prevent duplicates
      if (state.queue.some((item) => item.videoId === videoId)) {
        return { success: false, error: "Video already in queue" };
      }

      // Fetch title from oEmbed if not provided
      let videoTitle = title;
      if (!videoTitle) {
        try {
          const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (resp.ok) {
            const data = await resp.json();
            videoTitle = data.title || "";
          }
        } catch (e) { /* ignore */ }
      }

      state.queue.push({
        id: generateId(),
        videoId,
        title: videoTitle || "Unknown Title",
        thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        addedAt: Date.now(),
      });

      await saveState(state);
      notifyStateChanged(state);

      // Open popup after adding to queue
      try {
        await chrome.action.openPopup();
      } catch (e) {
        chrome.windows.create({
          url: chrome.runtime.getURL("popup/popup.html"),
          type: "popup",
          width: 460,
          height: 700,
          focused: true,
        });
      }

      return { success: true };
    }

    case "removeFromQueue": {
      const idx = state.queue.findIndex((item) => item.id === message.id);
      if (idx === -1) return { success: false };

      state.queue.splice(idx, 1);

      // Adjust currentIndex
      if (idx < state.currentIndex) {
        state.currentIndex--;
      } else if (idx === state.currentIndex) {
        state.currentIndex = Math.min(state.currentIndex, state.queue.length - 1);
      }

      if (state.queue.length === 0) state.currentIndex = -1;

      await saveState(state);
      notifyStateChanged(state);
      return { success: true };
    }

    case "clearQueue": {
      state.queue = [];
      state.currentIndex = -1;
      await saveState(state);
      notifyStateChanged(state);
      return { success: true };
    }

    case "reorderQueue": {
      const { fromIndex, toIndex } = message;
      if (
        fromIndex < 0 || fromIndex >= state.queue.length ||
        toIndex < 0 || toIndex >= state.queue.length
      ) {
        return { success: false };
      }

      const [moved] = state.queue.splice(fromIndex, 1);
      state.queue.splice(toIndex, 0, moved);

      // Adjust currentIndex
      if (state.currentIndex === fromIndex) {
        state.currentIndex = toIndex;
      } else if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
        state.currentIndex--;
      } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
        state.currentIndex++;
      }

      await saveState(state);
      notifyStateChanged(state);
      return { success: true };
    }

    case "playVideo": {
      const playIdx = state.queue.findIndex((item) => item.id === message.id);
      if (playIdx === -1) return { success: false };

      state.currentIndex = playIdx;
      await saveState(state);

      const video = state.queue[playIdx];
      await navigateToVideo(video.url, state);
      notifyStateChanged(state);
      return { success: true };
    }

    case "playNext": {
      if (state.currentIndex < state.queue.length - 1) {
        state.currentIndex++;
        await saveState(state);
        const video = state.queue[state.currentIndex];
        await navigateToVideo(video.url, state);
        notifyStateChanged(state);
        return { success: true };
      }
      return { success: false, error: "No next video" };
    }

    case "playPrevious": {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        await saveState(state);
        const video = state.queue[state.currentIndex];
        await navigateToVideo(video.url, state);
        notifyStateChanged(state);
        return { success: true };
      }
      return { success: false, error: "No previous video" };
    }

    case "videoEnded": {
      // Remove the finished video from queue
      const finishedIdx = state.currentIndex;
      if (finishedIdx >= 0 && finishedIdx < state.queue.length) {
        state.queue.splice(finishedIdx, 1);
      }

      // Play next (now at the same index since we removed one)
      if (state.autoPlay && state.queue.length > 0) {
        // If we were at the end, wrap to 0 or stop
        state.currentIndex = Math.min(finishedIdx, state.queue.length - 1);
        if (finishedIdx < state.queue.length + 1) {
          // There's still a video at this position
          const nextIdx = Math.min(finishedIdx, state.queue.length - 1);
          state.currentIndex = nextIdx;
          await saveState(state);
          const video = state.queue[nextIdx];
          await navigateToVideo(video.url, state);
          notifyStateChanged(state);
          return { success: true, autoPlayed: true };
        }
      }

      // No autoplay or no more videos
      state.currentIndex = state.queue.length > 0 ? -1 : -1;
      await saveState(state);
      notifyStateChanged(state);
      return { success: true, autoPlayed: false };
    }

    case "toggleAutoPlay":
      // Auto-play is always on; ignore toggle requests
      return { success: true, autoPlay: true };

    case "getCurrentVideoInfo": {
      // Content script asking for info about current page
      return state;
    }

    default:
      return { success: false, error: "Unknown action" };
  }
}

// Navigate to a YouTube video URL — reuse the tab that's playing queue content
async function navigateToVideo(url, state) {
  // Try to reuse the tab where queue video is already playing
  if (state && state.playingTabId) {
    try {
      const tab = await chrome.tabs.get(state.playingTabId);
      if (tab) {
        await chrome.tabs.update(tab.id, { url, active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch (e) {
      // Tab no longer exists, fall through
    }
  }

  // Fallback: use active tab and remember it
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    if (state) {
      state.playingTabId = activeTab.id;
      await saveState(state);
    }
    await chrome.tabs.update(activeTab.id, { url });
  } else {
    const newTab = await chrome.tabs.create({ url });
    if (state) {
      state.playingTabId = newTab.id;
      await saveState(state);
    }
  }
}

// Notify all interested parties that state changed
function notifyStateChanged(state) {
  chrome.runtime.sendMessage({ action: "stateChanged", state }).catch(() => {});
  chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: "stateChanged", state }).catch(() => {});
    });
  });
}
