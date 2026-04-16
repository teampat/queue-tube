# QueueTube — Chrome Extension

Add YouTube videos to a personal queue and play them in order — directly in your browser, no account needed.

## Features

- **Add to Queue** — "Add to Queue" button appears on every video across YouTube (home, search, channel, sidebar, shorts)
- **Auto Play** — automatically plays the next video in the queue when the current one ends
- **Auto Remove** — finished videos are removed from the queue automatically
- **Drag & Drop** — reorder queue items by dragging
- **Tab Tracking** — queue playback always continues in the same tab
- **Popup UI** — manage your queue from the extension popup with Now Playing strip, prev/next controls, and badge count

## Installation

> Not yet on the Chrome Web Store — load it manually:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `queue-tube` folder

## Project Structure

```
├── manifest.json          # Chrome Extension MV3 config
├── background.js          # Service worker — queue state & navigation
├── content.js             # Content script — injects buttons on YouTube pages
├── content.css            # Styles for injected buttons
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── generate-icons.js      # Icon generation script (Node.js)
```

## Usage

1. Browse YouTube — every video will show an **Add to Queue** button
2. Click it to add the video — the popup opens automatically
3. Click a video title in the popup to start playing
4. Use ◀ ▶ buttons to skip to the previous or next video
5. Drag to reorder, click ✕ to remove individual items
6. Toggle **Auto** to enable/disable auto-play
7. Click **Clear** to empty the entire queue

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist queue state across sessions |
| `tabs` | Navigate the playing tab to the next video |
| `activeTab` | Read the current tab to determine the playback tab |

## Privacy

All data is stored locally in your browser using `chrome.storage.local`. No data is sent to any external server.

