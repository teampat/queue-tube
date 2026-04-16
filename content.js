// QueueTube - Content Script

(function () {
  "use strict";

  let injectScheduled = false;

  // =============================================
  // Debounced injection: batch rapid DOM mutations
  // =============================================
  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;
    requestAnimationFrame(() => {
      injectScheduled = false;
      injectThumbnailButtons();
    });
  }

  // =============================================
  // MutationObserver: inject buttons on DOM changes
  // =============================================
  const observer = new MutationObserver(() => {
    scheduleInject();
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      tryInject();
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
        tryInject();
      });
    }
  }

  startObserver();

  // YouTube SPA navigation
  window.addEventListener("yt-navigate-finish", () => {
    tryInject();
  });

  function tryInject() {
    // Staggered retries to catch progressively rendered content
    const delays = [300, 800, 1500, 2500, 4000, 6000];
    delays.forEach((delay) => {
      setTimeout(() => {
        injectThumbnailButtons();
      }, delay);
    });
  }

  // =============================================
  // Queue button icons
  // =============================================
  const ICON_QUEUE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 4h14v2H3V4zm0 4h14v2H3V8zm0 4h10v2H3v-2zm14 0v6l5-3-5-3z"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;

  // =============================================
  // Inject "+ Queue" buttons on every video across all pages
  // =============================================
  function injectThumbnailButtons() {
    // Strategy 1: Traditional YouTube renderer elements
    const renderers = document.querySelectorAll(`
      ytd-video-renderer,
      ytd-rich-item-renderer,
      ytd-rich-grid-media,
      ytd-compact-video-renderer,
      ytd-grid-video-renderer,
      ytd-playlist-video-renderer,
      ytd-playlist-panel-video-renderer,
      ytd-grid-movie-renderer,
      ytd-rich-grid-row,
      ytd-shelf-renderer ytd-video-renderer,
      ytm-media-item
    `);

    renderers.forEach((renderer) => processRenderer(renderer));

    // Strategy 2: New YouTube lockup view model (home page grid)
    const lockups = document.querySelectorAll("yt-lockup-view-model, ytd-lockup-view-model");
    lockups.forEach((lockup) => processRenderer(lockup));

    // Strategy 3: Fallback - find any video link containers not yet processed
    document.querySelectorAll('a[href*="/watch"]').forEach((link) => {
      // Walk up to find the nearest meaningful container
      const container =
        link.closest("ytd-video-renderer") ||
        link.closest("ytd-rich-item-renderer") ||
        link.closest("ytd-compact-video-renderer") ||
        link.closest("ytd-grid-video-renderer") ||
        link.closest("ytd-playlist-video-renderer") ||
        link.closest("ytd-rich-grid-media") ||
        link.closest("yt-lockup-view-model") ||
        link.closest("ytd-lockup-view-model") ||
        link.closest("ytd-playlist-panel-video-renderer");
      if (container && !container.querySelector(".ytq-thumb-btn") && !container.querySelector(".ytq-inline-btn")) {
        processRenderer(container);
      }
    });
  }

  function processRenderer(renderer) {
    // Skip Shorts
    if (renderer.matches("ytd-reel-item-renderer") || renderer.closest("ytd-reel-shelf-renderer")) return;

    // Skip if already has our button injected
    if (renderer.querySelector(".ytq-thumb-btn") || renderer.querySelector(".ytq-inline-btn")) return;

    // Find video link - broad selectors for old and new YT structures
    const linkEl =
      renderer.querySelector("a#thumbnail") ||
      renderer.querySelector("a.ytd-thumbnail") ||
      renderer.querySelector("a#video-title-link") ||
      renderer.querySelector("a#video-title") ||
      renderer.querySelector('a[href*="/watch"]') ||
      renderer.querySelector("a.yt-simple-endpoint[href]") ||
      renderer.querySelector("a[href]");
    if (!linkEl) return;

    const href = linkEl.href || linkEl.getAttribute("href") || "";
    if (!href || !href.includes("/watch")) return;

    const videoUrl = new URL(href, window.location.origin).href;

    // Get title - try many selectors including new lockup structure
    const titleEl =
      renderer.querySelector("#video-title") ||
      renderer.querySelector("yt-formatted-string#video-title") ||
      renderer.querySelector("h3 a") ||
      renderer.querySelector("#video-title-link") ||
      renderer.querySelector("span#video-title") ||
      renderer.querySelector("h3 yt-formatted-string") ||
      renderer.querySelector("a[aria-label]") ||
      renderer.querySelector("[aria-label]") ||
      renderer.querySelector("yt-formatted-string.ytd-channel-name") ||
      renderer.querySelector("yt-lockup-metadata-view-model h3");
    let videoTitle = "";
    if (titleEl) {
      videoTitle = titleEl.textContent.trim() || titleEl.getAttribute("aria-label") || titleEl.getAttribute("title") || "";
    }
    // Fallback: try aria-label on the link itself
    if (!videoTitle && linkEl) {
      videoTitle = linkEl.getAttribute("aria-label") || linkEl.getAttribute("title") || "";
    }
    // Fallback: try any aria-label in the renderer
    if (!videoTitle) {
      const ariaEl = renderer.querySelector("[aria-label]");
      if (ariaEl) videoTitle = ariaEl.getAttribute("aria-label") || "";
    }

    // === 1) Overlay button on thumbnail ===
    const thumbnail =
      renderer.querySelector("ytd-thumbnail") ||
      renderer.querySelector("#thumbnail") ||
      renderer.querySelector("a#thumbnail") ||
      renderer.querySelector("yt-thumbnail-view-model") ||
      renderer.querySelector(".ytd-thumbnail");

    // For new lockup structure, find the first link with an img as thumbnail
    const thumbTarget = thumbnail || linkEl.querySelector("img")?.closest("a") || linkEl;

    if (thumbTarget && !thumbTarget.querySelector(".ytq-thumb-btn")) {
      const thumbContainer = thumbTarget.closest("ytd-thumbnail") || thumbTarget.closest("yt-thumbnail-view-model") || thumbTarget;
      const currentPos = getComputedStyle(thumbContainer).position;
      if (currentPos === "static") {
        thumbContainer.style.position = "relative";
      }

      const thumbBtn = document.createElement("button");
      thumbBtn.className = "ytq-thumb-btn";
      thumbBtn.title = "Add to QueueTube";
      thumbBtn.innerHTML = ICON_QUEUE;

      thumbBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        addVideoToQueue(thumbBtn, videoUrl, videoTitle);
      });

      thumbContainer.appendChild(thumbBtn);
    }

    // === 2) Inline text button next to video metadata ===
    const metaArea =
      renderer.querySelector("#meta") ||
      renderer.querySelector("#details") ||
      renderer.querySelector("yt-lockup-metadata-view-model") ||
      renderer.querySelector("#metadata-line") ||
      renderer.querySelector("ytd-video-meta-block") ||
      renderer.querySelector(".metadata") ||
      renderer.querySelector("#menu") ||
      renderer.querySelector("#dismissible #details") ||
      renderer.querySelector("#dismissible #meta") ||
      renderer.querySelector("div#metadata") ||
      renderer.querySelector("#content");

    if (metaArea && !metaArea.querySelector(".ytq-inline-btn")) {
      const inlineBtn = document.createElement("button");
      inlineBtn.className = "ytq-inline-btn";
      inlineBtn.title = "Add to QueueTube";
      inlineBtn.innerHTML = `${ICON_QUEUE}<span>Add to Queue</span>`;

      inlineBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        addVideoToQueue(inlineBtn, videoUrl, videoTitle);
      });

      metaArea.appendChild(inlineBtn);
    }
  }

  // Shared add-to-queue logic
  async function addVideoToQueue(btn, videoUrl, videoTitle) {
    const urlObj = new URL(videoUrl);
    const videoId = urlObj.searchParams.get("v") || urlObj.pathname.replace("/shorts/", "");
    const thumbUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "";

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        action: "addToQueue",
        url: videoUrl,
        title: videoTitle,
        thumbnail: thumbUrl,
      });
    } catch (e) {
      // Extension context invalidated — reload the page to reconnect
      window.location.reload();
      return;
    }

    const spanEl = btn.querySelector("span");

    if (response.success) {
      btn.classList.add("ytq-added");
      if (spanEl) spanEl.textContent = "Added ✓";
      else btn.innerHTML = ICON_CHECK;
      setTimeout(() => {
        btn.classList.remove("ytq-added");
        if (spanEl) { spanEl.textContent = "Add to Queue"; btn.innerHTML = `${ICON_QUEUE}<span>Add to Queue</span>`; }
        else btn.innerHTML = ICON_QUEUE;
      }, 2000);
    } else {
      btn.classList.add("ytq-error");
      if (spanEl) spanEl.textContent = response.error || "Error";
      setTimeout(() => {
        btn.classList.remove("ytq-error");
        if (spanEl) { spanEl.textContent = "Add to Queue"; btn.innerHTML = `${ICON_QUEUE}<span>Add to Queue</span>`; }
        else btn.innerHTML = ICON_QUEUE;
      }, 2000);
    }
  }

  // =============================================
  // Video end detection for auto-play next
  // =============================================
  function setupVideoEndDetection() {
    const checkVideo = () => {
      const video = document.querySelector("video.html5-main-video");
      if (!video) return;

      video.addEventListener("ended", async () => {
        await chrome.runtime.sendMessage({ action: "videoEnded" });
      });
    };

    const interval = setInterval(() => {
      const video = document.querySelector("video.html5-main-video");
      if (video) {
        clearInterval(interval);
        checkVideo();
      }
    }, 1000);
  }

  window.addEventListener("yt-navigate-finish", setupVideoEndDetection);
  setupVideoEndDetection();

  // Listen for state changes from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "stateChanged") {
      // Could show a mini overlay, but keeping it simple
    }
  });
})();
