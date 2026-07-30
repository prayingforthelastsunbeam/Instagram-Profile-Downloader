# 📸 Social Media Profile & Media Downloader

An advanced, automated **Instagram & Facebook profile media downloader** available as both an **Interactive Web Dashboard** and **Command-Line Interface (CLI)**.

It intercepts GraphQL/API responses directly from headless browser sessions to extract high-resolution photos, carousels, reels, and videos, packaging them into convenient ZIP archives.

---

## ✨ Features

- 🌐 **Web Dashboard & REST API** – Modern web interface with real-time progress streaming (Server-Sent Events) and instant media preview gallery.
- 💻 **Terminal CLI Tools** – Standalone command-line scrapers for Instagram and Facebook.
- 🦁 **Smart Multi-Browser Auto-Detection** – Out-of-the-box support for **Brave Browser**, **Google Chrome**, **Microsoft Edge**, and bundled **Puppeteer Chromium**.
- 📡 **Advanced Network Interception** – Intercepts native GraphQL & REST API responses for 100% extraction accuracy and maximum resolution.
- 🍪 **Cookie Authentication** – Easily bypass login walls for private profiles and full-profile pagination using `cookie.json` and `fb_cookie.json`.
- 🎠 **Full Carousel & Reel Extraction** – Captures nested multi-slide posts, reels, and videos automatically.
- 📦 **Automated ZIP Bundling** – Automatically compresses media into organized ZIP archives with sequential file naming.
- 🔒 **Read-Only & Secure** – Runs locally without liking, commenting, or making account modifications.

---

## 📸 Supported Platforms & Media Types

| Platform | Posts | Carousels | Reels / Videos | Private Accounts (with cookies) |
| :--- | :---: | :---: | :---: | :---: |
| **Instagram** | ✅ | ✅ | ✅ | ✅ |
| **Facebook** | ✅ | ✅ | ✅ | ✅ |

---

## 🛠️ Browser Compatibility

The downloader automatically detects installed Chromium browsers on Windows, macOS, and Linux:

- 🦁 **Brave Browser** (`brave.exe`)
- 🌐 **Google Chrome** (`chrome.exe`)
- 🔷 **Microsoft Edge** (`msedge.exe`)
- 📦 **Puppeteer Bundled Chromium** (Fallback)

> **Custom Path Support:** You can set a custom browser path using the environment variable `BROWSER_PATH`:
> ```bash
> process.env.BROWSER_PATH="C:\\Path\\To\\browser.exe" node index.js
> ```

---

## 📋 Prerequisites

- **Node.js** (v16 or higher) – [Download Node.js](https://nodejs.org/)
- **Brave, Chrome, or Edge** installed on your system.

---

## 🚀 Installation & Setup

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/prayingforthelastsunbeam/Instagram-Profile-Downloader.git
   cd Instagram-Profile-Downloader
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Set Up Authentication Cookies (Recommended):**

   Export cookies from your browser using an extension like **Cookie-Editor** or **EditThisCookie**:

   - **For Instagram:** Save exported JSON cookies as `cookie.json` in the root directory.
   - **For Facebook:** Save exported JSON cookies as `fb_cookie.json` in the root directory.

---

## 🎯 How to Use

### Method 1: Web Dashboard (Recommended)

1. Start the web server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
3. Enter the Instagram profile URL, paste your cookie JSON if prompted, and click **Start Download**. Watch the real-time progress and download the ZIP file directly when completed!

---

### Method 2: Instagram Downloader (CLI)

1. Run the Instagram CLI downloader:
   ```bash
   npm run instagram
   # or
   node index.js
   ```
2. Paste the target profile URL:
   ```
   🔗 Enter Instagram profile URL: https://www.instagram.com/target_username/
   ```
3. The script will automatically load cookies, detect your browser, scroll the profile, download high-res media, and produce `target_username.zip`.

---

### Method 3: Facebook Downloader (CLI)

1. Run the Facebook CLI downloader:
   ```bash
   npm run facebook
   # or
   node facebook.js
   ```
2. Paste the target Facebook page/profile URL when prompted.

---

## 📁 Project Architecture

```
Instagram-Profile-Downloader/
├── browserHelper.js      # Smart auto-detector for Brave, Chrome, Edge
├── index.js              # Instagram CLI profile downloader
├── facebook.js           # Facebook CLI profile downloader
├── scraper.js            # Core scraping & network interception engine
├── server.js            # Express web server & SSE API endpoints
├── public/               # Web application UI assets
│   ├── index.html        # Dashboard interface
│   ├── app.js            # Dashboard logic & SSE event receiver
│   └── style.css         # Modern dark-mode styling
├── cookie.json           # Instagram authentication cookies (optional)
├── fb_cookie.json        # Facebook authentication cookies (optional)
├── package.json          # Node.js configuration & npm scripts
└── README.md             # Project documentation
```

---

## ⚙️ Configuration & Customization

### Adjusting Scroll Limit & Timeout
To customize scrolling attempts or network timeouts for extra-large profiles, modify the scroll loop parameters in `index.js` or `scraper.js`:

```javascript
// Change scroll attempt thresholds or delay times in scroll loop
while (scrollAttempts < 5) { ... }
```

### Filtering Low-Resolution Thumbnails
`scraper.js` and `index.js` automatically filter out low-res thumbnails (`150x150`, profile avatars, previews). You can modify patterns in `filterHighResUrls`:

```javascript
const lowResPatterns = [ /thumb/i, /avatar/i, /150x150/i, /320x320/i ];
```

---

## 🔒 Privacy & Safety

- **100% Local Execution:** All network traffic and downloaded media remain entirely on your local machine.
- **Non-Intrusive Scraping:** Operates in read-only mode without making likes, comments, or account mutations.
- **Isolated Sessions:** Browsing automation runs in separate headless browser instances without altering your existing browser profiles or open tabs.

---

## 🛠️ Troubleshooting

- **Browser Executable Not Found:**
  - Make sure Brave, Chrome, or Edge is installed.
  - Or set `BROWSER_PATH` environment variable pointing to your browser executable.
- **Private Profile / No Media Found:**
  - Verify that `cookie.json` is updated with active session cookies from an account following the target private profile.
- **Rate Limit Warnings:**
  - Add small delays between consecutive downloads if processing multiple profiles back-to-back.

---

## 📄 License

Distributed under the **MIT License**. Free for personal and educational use.