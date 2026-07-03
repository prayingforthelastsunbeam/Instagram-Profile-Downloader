# 📸 Instagram Profile Downloader

A powerful, headless Instagram profile media downloader that downloads **all posts, reels, images, and videos** from any Instagram profile and packages them into a convenient ZIP file. Fully automated and runs entirely in your terminal!

## ✨ Features

- 🚀 **Fully Automated** - No manual browser interaction required
- 🍪 **Cookie-Based Authentication** - Bypass login walls and access all content
- 📦 **ZIP File Output** - All media organized in one file
- 🎯 **High-Quality Media** - Automatically filters out low-resolution images
- 🔒 **Read-Only & Safe** - Never modifies your Instagram account
- 💻 **Headless Operation** - Runs completely in terminal
- 🎨 **Clean Output** - Beautiful emoji-based progress indicators
- 📊 **Detailed Progress** - Real-time download statistics

### Supported Media Types

✅ Posts (single images)  
✅ Carousel posts (multiple images)  
✅ Reels (videos)  
✅ Videos  
✅ High-resolution images (from srcset)

## 📋 Prerequisites

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **Instagram Account** - To generate cookies for authentication
- **Modern Browser** - Chrome/Edge for cookie extraction (one-time setup)

## 🚀 Installation

### 1. Clone or Download this Project

```bash
cd C:\Users\YourName\Desktop
git clone <your-repo-url>
cd ig
```

Or simply create a folder and copy all files into it.

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `puppeteer` - Browser automation
- `jszip` - ZIP file creation
- `axios` & `cheerio` - HTTP requests (optional)

### 3. Extract Your Instagram Cookies

**Important:** You need to extract cookies from your Instagram account to bypass login walls and access all posts.

#### Method 1: Using Browser Extension (Recommended)

1. **Install a Cookie Extension:**
   - Chrome: [EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg)
   - Firefox: [Cookie-Editor](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)

2. **Login to Instagram:**
   - Open your browser and go to [instagram.com](https://www.instagram.com)
   - Login with your credentials

3. **Export Cookies:**
   - Click the cookie extension icon
   - Click "Export" or "Export as JSON"
   - Save the file as `cookie.json` in your project folder

#### Method 2: Using Browser DevTools (Manual)

1. **Login to Instagram** in your browser
2. Open **DevTools** (F12 or Right-click → Inspect)
3. Go to **Application** tab → **Cookies** → `https://www.instagram.com`
4. Manually copy these important cookies:
   - `sessionid`
   - `csrftoken`
   - `ds_user_id`
   - `datr`
5. Create a `cookie.json` file with this format:

```json
[
  {
    "domain": ".instagram.com",
    "name": "sessionid",
    "value": "YOUR_SESSION_ID_HERE",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "no_restriction"
  },
  {
    "domain": ".instagram.com",
    "name": "csrftoken",
    "value": "YOUR_CSRF_TOKEN_HERE",
    "path": "/",
    "secure": true,
    "sameSite": "no_restriction"
  }
]
```

### 4. Verify Cookie File

Make sure your `cookie.json` file is in the project root:

```
ig/
├── cookie.json      ← Your cookies here
├── index.js
├── package.json
└── README.md
```

## 🎯 Usage

### Basic Usage

1. **Run the Script:**

```bash
node index.js
```

2. **Enter Instagram Profile URL when prompted:**

```
🔗 Enter Instagram profile URL: https://www.instagram.com/username/
```

3. **Wait for Download to Complete:**

The script will:
- ✅ Load your cookies (authentication)
- ✅ Scroll through all posts
- ✅ Extract media from each post
- ✅ Download high-quality files
- ✅ Create a ZIP file: `username.zip`

### Example Output

```
🚀 Starting media download for your_username...
✅ Loaded 11 cookies from cookie.json
🍪 Injecting cookies for authentication...
✅ Cookies injected successfully!
🧭 Loading profile: https://www.instagram.com/your_username/
✅ Successfully authenticated with cookies!
🔄 Scrolling to load all posts...
📜 Scrolled 1 time(s).
📜 Scrolled 2 time(s).
📜 Scrolled 3 time(s).
🛑 Reached end of posts.
🔍 Extracting post URLs...
✅ Found 19 posts.

📦 Extracting media from 19 posts...

[1/19] Processing post...
📸 Visiting post: https://www.instagram.com/your_username/reel/DPjs4qqEmM6/
  ✅ Found 14 media items in post
[2/19] Processing post...
📸 Visiting post: https://www.instagram.com/your_username/p/DPRU1t9kvCF/
  ✅ Found 8 media items in post

... (continues for all posts)

🔧 Filtered 45 low-resolution images
✅ Found a total of 127 high-quality media files.

⬇️  [1/127] Downloading: https://...
⬇️  [2/127] Downloading: https://...
... (continues for all media)

📦 Creating ZIP archive...
✅ Backup saved to your_username.zip
🏁 Download completed!
```

## 📁 Output Structure

After successful download, you'll get:

```
username.zip
├── username_001.jpg
├── username_002.jpg
├── username_003.mp4
├── username_004.jpg
└── ... (all media files)
```

Files are named sequentially: `username_001.jpg`, `username_002.mp4`, etc.

## ⚙️ Configuration

### Adjust Scrolling Behavior

In `index.js`, modify the `scrollToLoadPosts` function:

```javascript
await scrollToLoadPosts(page, 20); // Max 20 scrolls (default)
```

Increase the number for profiles with many posts (100+):

```javascript
await scrollToLoadPosts(page, 50); // For large profiles
```

### Filter Settings

Low-resolution patterns filtered by default:
- Thumbnails (150x150, 320x320)
- Profile pictures
- Avatar images
- Small preview images (s150x150, p240x240)

To modify filters, edit the `filterHighResUrls` function in `index.js`.

## 🔒 Security & Privacy

### Is This Safe?

**YES!** This tool is completely safe:

✅ **Read-Only Access** - Only downloads media, never posts or modifies anything  
✅ **No Account Actions** - Doesn't like, comment, follow, or unfollow  
✅ **Local Execution** - All processing happens on your computer  
✅ **Cookie Security** - Cookies stay on your machine, never uploaded anywhere  

### Will Instagram Detect This?

- The script uses a **headless browser** with realistic user agents
- Includes **random delays** between requests to avoid rate limiting
- Uses **cookie authentication** like a normal browser session
- **Best Practice:** Don't download hundreds of profiles in a short time

### Cookie Expiration

Instagram cookies typically last 30-90 days. If downloads stop working:
1. Re-export your cookies from the browser
2. Replace the old `cookie.json` file
3. Run the script again

## 🛠️ Troubleshooting

### "Protocol error: Invalid parameters sameSite"

**Fixed!** The script now automatically converts cookie formats. If you still see this:
- Make sure you're using the latest version of the script
- The `loadCookies` function normalizes all sameSite values

### "No posts found"

Possible causes:
1. **Private Profile** - You must follow the account first (while logged in with your cookies)
2. **Expired Cookies** - Re-export fresh cookies from Instagram
3. **Invalid URL** - Make sure URL is: `https://www.instagram.com/username/`

### "Failed to download" errors

- **Network issues** - Check your internet connection
- **Rate limiting** - Wait a few minutes and try again
- **Media deleted** - Some posts may have been removed

### Browser Closes Too Quickly

The script runs in headless mode (no browser window). To debug:

Change in `index.js`:
```javascript
headless: true, // Change to false to see the browser
```

## 📝 File Structure

```
ig/
├── cookie.json           # Your Instagram cookies (required)
├── index.js             # Main script
├── package.json         # Dependencies
├── package-lock.json    # Dependency versions
├── README.md            # This file
└── node_modules/        # Installed packages
```

## 🔄 How It Works

1. **Authentication:**
   - Loads cookies from `cookie.json`
   - Normalizes cookie format for Puppeteer
   - Injects cookies into browser session

2. **Profile Loading:**
   - Launches headless Chrome browser
   - Navigates to Instagram profile
   - Verifies authentication status

3. **Post Discovery:**
   - Scrolls page to load all posts
   - Extracts all post/reel URLs
   - Removes duplicates

4. **Media Extraction:**
   - Visits each post individually
   - Extracts all image and video URLs
   - Prioritizes high-resolution versions (srcset)

5. **Filtering:**
   - Removes low-resolution thumbnails
   - Filters out profile pictures
   - Keeps only high-quality media

6. **Download & Packaging:**
   - Downloads each media file
   - Names files sequentially
   - Creates ZIP archive
   - Saves as `username.zip`

## 🤝 Contributing

Found a bug or want to add features? Contributions are welcome!

## ⚠️ Disclaimer

This tool is for **personal use only**. Please respect Instagram's Terms of Service and copyright laws:

- Only download content you have permission to download
- Don't redistribute downloaded content without permission
- Use responsibly and ethically

**This tool does NOT:**
- Violate Instagram's API
- Store or share your cookies
- Modify your Instagram account
- Download from accounts you don't have access to

## 📄 License

MIT License - Use freely for personal projects!

## 🙋 FAQ

**Q: Can I download stories and highlights?**  
A: Currently, the script focuses on posts and reels. Story/highlight support may be added in future updates.

**Q: Does this work for private profiles?**  
A: Yes! If you follow the private account (using the account whose cookies you exported), you can download their content.

**Q: How many profiles can I download?**  
A: Unlimited! But be respectful - don't spam requests or Instagram may temporarily limit your account.

**Q: Will this work on Mac/Linux?**  
A: Yes! Node.js and Puppeteer work cross-platform. Just adjust file paths if needed.

**Q: Can I run this on a server?**  
A: Yes! Make sure the server has Chrome/Chromium installed for Puppeteer.

**Q: What if the username has special characters?**  
A: The script handles all valid Instagram usernames including dots, underscores, and numbers (e.g., `user.name_123`).

---

**Made with ❤️ for easy Instagram backups**

*Last updated: October 19, 2025*


<!-- npx puppeteer browsers install chrome -->