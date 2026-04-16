// QueueTube - Content Script

(function () {
  "use strict";

  let watchButtonInjected = false;

  // =============================================
  // MutationObserver: inject buttons on DOM changes
  // =============================================
  const observer = new MutationObserver(() => {
    injectThumbnailButtons();
    if (isVideoPage() && !watchButtonInjected) {
      injectWatchPageButton();
    }
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
    watchButtonInjected = false;
    tryInject();
  });

  function tryInject() {
    setTimeout(() => {
      injectThumbnailButtons();
      if (isVideoPage()) {
        injectWatchPageButton();
      }
    }, 800);
    // Re-inject for lazy-loaded grid items
    setTimeout(() => injectThumbnailButtons(), 2000);
    setTimeout(() => injectThumbnailButtons(), 4000);
  }

  function isVideoPage() {
    return window.location.pathname === "/watch";
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
      ytd-reel-item-renderer,
      ytd-playlist-panel-video-renderer,
      ytd-grid-movie-renderer
    `);

    renderers.forEach((renderer) => processRenderer(renderer));

    // Strategy 2: New YouTube lockup view model (home page grid)
    const lockups = document.querySelectorAll("yt-lockup-view-model");
    lockups.forEach((lockup) => processRenderer(lockup));
  }

  function processRenderer(renderer) {
    // Skip if already has our button injected
    if (renderer.querySelector(".ytq-thumb-btn") || renderer.querySelector(".ytq-inline-btn")) return;

    // Find video link - broad selectors for old and new YT structures
    const linkEl =
      renderer.querySelector("a#thumbnail") ||
      renderer.querySelector("a.ytd-thumbnail") ||
      renderer.querySelector("a#video-title-link") ||
      renderer.querySelector("a#video-title") ||
      renderer.querySelector('a[href*="/watch"]') ||
      renderer.querySelector('a[href*="/shorts/"]');
    if (!linkEl) return;

    const href = linkEl.href || linkEl.getAttribute("href");
    if (!href || (!href.includes("/watch") && !href.includes("/shorts/"))) return;

    const videoUrl = new URL(href, window.location.origin).href;

    // Get title - try many selectors including new lockup structure
    const titleEl =
      renderer.querySelector("#video-title") ||
      renderer.querySelector("yt-formatted-string#video-title") ||
      renderer.querySelector("h3 a") ||
      renderer.querySelector("#video-title-link") ||
      renderer.querySelector("span#video-title") ||
      renderer.querySelector("h3 yt-formatted-string") ||
      renderer.querySelector("a[aria-label]");
    let videoTitle = "";
    if (titleEl) {
      videoTitle = titleEl.textContent.trim() || titleEl.getAttribute("aria-label") || titleEl.getAttribute("title") || "";
    }
    // Fallback: try aria-label on the link itself
    if (!videoTitle && linkEl) {
      videoTitle = linkEl.getAttribute("aria-label") || linkEl.getAttribute("title") || "";
    }

    // === 1) Overlay button on thumbnail ===
    const thumbnail =
      renderer.querySelector("ytd-thumbnail") ||
      renderer.querySelector("#thumbnail") ||
      renderer.querySelector("a#thumbnail");

    // For new lockup structure, find the first link with an img as thumbnail
    const thumbTarget = thumbnail || linkEl.querySelector("img")?.closest("a") || linkEl;

    if (thumbTarget && !thumbTarget.querySelector(".ytq-thumb-btn")) {
      const thumbContainer = thumbTarget.closest("ytd-thumbnail") || thumbTarget;
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
      renderer.querySelector("#menu");

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
  // Watch page button (below video player)
  // =============================================
  function injectWatchPageButton() {
    if (watchButtonInjected) return;

    const actionsRow =
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("ytd-menu-renderer #top-level-buttons-computed");

    if (!actionsRow) return;

    if (document.getElementById("ytq-add-to-queue-btn")) {
      watchButtonInjected = true;
      return;
    }

    const btn = document.createElement("button");
    btn.id = "ytq-add-to-queue-btn";
    btn.className = "ytq-queue-btn";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M3 4h14v2H3V4zm0 4h14v2H3V8zm0 4h10v2H3v-2zm14 0v6l5-3-5-3z"/>
      </svg>
      <span>Add to Queue</span>
    `;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const info = getWatchPageVideoInfo();
      const response = await chrome.runtime.sendMessage({
        action: "addToQueue",
        ...info,
      });

      if (response.success) {
        btn.classList.add("ytq-added");
        btn.querySelector("span").textContent = "Added ✓";
        setTimeout(() => {
          btn.classList.remove("ytq-added");
          btn.querySelector("span").textContent = "Add to Queue";
        }, 2000);
      } else {
        btn.classList.add("ytq-error");
        btn.querySelector("span").textContent = response.error || "Error";
        setTimeout(() => {
          btn.classList.remove("ytq-error");
          btn.querySelector("span").textContent = "Add to Queue";
        }, 2000);
      }
    });

    actionsRow.appendChild(btn);
    watchButtonInjected = true;
  }

  function getWatchPageVideoInfo() {
    const url = window.location.href;
    const titleEl =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.title yt-formatted-string") ||
      document.querySelector("#title h1");
    const title = titleEl ? titleEl.textContent.trim() : document.title;

    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get("v");
    const thumbnail = videoId
      ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
      : "";

    return { url, title, thumbnail };
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
