const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');
const readline = require('readline');

// Ask user for input (URL)
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

// Load cookies from JSON file
function loadCookies(cookieFile = 'cookie.json') {
  try {
    if (fs.existsSync(cookieFile)) {
      const cookieData = fs.readFileSync(cookieFile, 'utf8');
      const cookies = JSON.parse(cookieData);
      
      const normalizedCookies = cookies.map(cookie => {
        const normalized = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          expires: cookie.expirationDate || -1,
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false
        };
        
        if (cookie.sameSite) {
          const sameSite = cookie.sameSite.toLowerCase();
          if (sameSite === 'no_restriction') normalized.sameSite = 'None';
          else if (sameSite === 'lax') normalized.sameSite = 'Lax';
          else if (sameSite === 'strict') normalized.sameSite = 'Strict';
          else normalized.sameSite = 'Lax'; 
        }
        return normalized;
      });
      
      console.log(`✅ Loaded ${normalizedCookies.length} cookies from ${cookieFile}`);
      return normalizedCookies;
    } else {
      console.log(`⚠️  Cookie file ${cookieFile} not found. Running without authentication.`);
    }
  } catch (err) {
    console.log(`⚠️  Could not load cookies: ${err.message}`);
  }
  return null;
}

// Filter out low-resolution images and unwanted URLs
function filterHighResUrls(urls) {
  const lowResPatterns = [
    /p\d+x\d+/i,      // e.g. p240x240
    /thumb/i,
    /small/i,
    /lowres/i,
    /thumbnail/i,
    /s\d+x\d+/i,      // e.g. s150x150
    /avatar/i,
    /profile_pic/i,
    /150x150/i,
    /320x320/i
  ];
  return urls.filter(url => !lowResPatterns.some(pattern => pattern.test(url)));
}

// Recursively find all media URLs in a JSON object
function extractUrlsFromJson(obj, urlsArray) {
  if (!obj) return;
  if (typeof obj === 'string') {
    try {
      if (obj.trim().startsWith('{') || obj.trim().startsWith('[')) {
        const parsed = JSON.parse(obj);
        extractUrlsFromJson(parsed, urlsArray);
      }
    } catch(e) {}
    return;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach(item => extractUrlsFromJson(item, urlsArray));
    return;
  }
  
  if (typeof obj === 'object') {
    if (obj.display_url) urlsArray.push({ url: obj.display_url, type: 'image' });
    if (obj.video_url) urlsArray.push({ url: obj.video_url, type: 'video' });
    
    // image_versions2 is used in many API endpoints
    if (obj.image_versions2 && obj.image_versions2.candidates) {
      const best = obj.image_versions2.candidates[0]; // usually the highest resolution
      if (best && best.url) urlsArray.push({ url: best.url, type: 'image' });
    }
    
    // video_versions
    if (obj.video_versions && Array.isArray(obj.video_versions)) {
      const best = obj.video_versions[0];
      if (best && best.url) urlsArray.push({ url: best.url, type: 'video' });
    }

    for (let key in obj) {
      extractUrlsFromJson(obj[key], urlsArray);
    }
  }
}

// Download media and create a ZIP file
async function downloadMedia(mediaItems, username) {
  const zip = new JSZip();
  let count = 0;

  for (const item of mediaItems) {
    try {
      const url = typeof item === 'string' ? item : item.url;
      const type = typeof item === 'string' ? 'unknown' : item.type;
      
      console.log(`⬇️  [${count + 1}/${mediaItems.length}] Downloading ${type}: ${url.substring(0, 80)}...`);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`⚠️  Failed to download ${url}: ${res.status}`);
        continue;
      }
      const buffer = await res.arrayBuffer();
      
      // Determine extension from URL or type
      let ext = path.extname(new URL(url).pathname).split('?')[0];
      if (!ext || ext === '') {
        ext = type.includes('video') ? '.mp4' : '.jpg';
      }
      
      const filename = `${username}_${String(count + 1).padStart(4, '0')}${ext}`;
      zip.file(filename, Buffer.from(buffer));
      count++;
    } catch (err) {
      console.error(`❌ Error downloading:`, err.message);
    }
  }

  if (count === 0) {
    console.log('❌ No media was downloaded.');
    return;
  }

  const zipData = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = `${username}.zip`;
  fs.writeFileSync(zipFilename, zipData);
  console.log(`\n📦 Backup saved to ${zipFilename}`);
  console.log(`✅ Successfully downloaded ${count} files!`);
}

// Scroll to load all posts
async function scrollToLoadPosts(page) {
  console.log('🔄 Scrolling to load all posts...');
  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollAttempts = 0;
  
  // Keep scrolling until we hit the bottom 3 times consecutively
  while (scrollAttempts < 3) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) {
      scrollAttempts++;
      console.log(`📜 Attempt ${scrollAttempts}/3 to load more...`);
    } else {
      scrollAttempts = 0;
      console.log(`📜 Scrolled down, more posts loaded.`);
    }
    previousHeight = newHeight;
  }
  console.log('🛑 Reached end of posts.');
}

// Main function to download media from Instagram profile
async function downloadInstagramMedia(profileUrl) {
  const usernameMatch = profileUrl.match(/instagram\.com\/([^\/]+)/);
  const username = usernameMatch ? usernameMatch[1].replace(/\/$/, '') : 'instagram_user';

  console.log(`🚀 Starting advanced media download for ${username}...`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  
  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  // Load and inject cookies for authentication
  const cookies = loadCookies('cookie.json');
  if (cookies && cookies.length > 0) {
    console.log('🍪 Injecting cookies for authentication...');
    await page.setCookie(...cookies);
    console.log('✅ Cookies injected successfully!');
  }

  // Set up network interception array
  let interceptedMedia = [];

  // Listen for responses
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const resourceType = response.request().resourceType();
      
      // We only care about xhr/fetch requests that might contain GraphQL or API JSON
      if (resourceType === 'xhr' || resourceType === 'fetch') {
        if (url.includes('/graphql/query') || url.includes('/api/v1/')) {
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            extractUrlsFromJson(json, interceptedMedia);
          } catch(e) {
            // Not a JSON response, ignore
          }
        }
      }
    } catch (e) {
      // Ignore errors related to incomplete or aborted responses
    }
  });

  console.log(`🧭 Loading profile: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Extract from the initial page load's inline JSON (often stored in <script> tags)
  console.log(`🧠 Parsing initial page state for media...`);
  const inlineScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent)
      .filter(text => text && (text.includes('requireLazy') || text.includes('window.__initialDataLoaded') || text.includes('display_url')));
  });

  for (const scriptContent of inlineScripts) {
    // Basic regex to find JSON-like blobs inside script tags
    extractUrlsFromJson(scriptContent, interceptedMedia);
    
    // Also run a raw regex fallback on the script body to catch straggler URLs just in case
    const displayMatches = scriptContent.match(/"display_url":"([^"]+)"/g);
    if (displayMatches) {
      displayMatches.forEach(m => {
        try {
          const url = JSON.parse('{' + m + '}').display_url;
          interceptedMedia.push({ url, type: 'image' });
        } catch(e){}
      });
    }
    const videoMatches = scriptContent.match(/"video_url":"([^"]+)"/g);
    if (videoMatches) {
      videoMatches.forEach(m => {
        try {
          const url = JSON.parse('{' + m + '}').video_url;
          interceptedMedia.push({ url, type: 'video' });
        } catch(e){}
      });
    }
  }

  const isLoggedIn = await page.evaluate(() => {
    return !document.querySelector('input[name="username"]');
  });
  
  if (isLoggedIn) {
    console.log('✅ Successfully authenticated with cookies!');
  } else {
    console.log('⚠️  Not authenticated - limited access to public posts only');
  }

  // Scroll completely to the bottom to trigger all GraphQL requests
  await scrollToLoadPosts(page);

  // Wait a few seconds for final requests to finish parsing
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Close browser after we're done scrolling and intercepting
  await browser.close();

  // Process the intercepted media
  console.log('🔍 Processing intercepted network payloads...');

  // Remove duplicates based on URL
  const uniqueMediaMap = new Map();
  interceptedMedia.forEach(item => {
    const url = item.url;
    // Basic filtering to avoid junk data
    if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('logging') && !url.includes('graphql')) {
      uniqueMediaMap.set(url, item);
    }
  });
  
  let uniqueMediaItems = Array.from(uniqueMediaMap.values());
  
  // Filter out low-resolution images
  const beforeFilter = uniqueMediaItems.length;
  uniqueMediaItems = uniqueMediaItems.filter(item => {
    const url = item.url;
    const filtered = filterHighResUrls([url]);
    return filtered.length > 0;
  });
  
  console.log(`🔧 Filtered ${beforeFilter - uniqueMediaItems.length} low-resolution images/thumbnails`);
  console.log(`✅ Extracted a total of ${uniqueMediaItems.length} high-quality media files directly from Instagram API.\n`);

  // Download all media into ZIP file
  if (uniqueMediaItems.length > 0) {
    console.log(`📥 Downloading ${uniqueMediaItems.length} media files...\n`);
    await downloadMedia(uniqueMediaItems, username);
  } else {
    console.log('❌ No media found to download.');
  }

  console.log('🏁 Download completed!');
}

// --- Entry Point ---
(async () => {
  const profileUrl = await askQuestion('🔗 Enter Instagram profile URL: ');

  if (!profileUrl || !profileUrl.startsWith('https://www.instagram.com/')) {
    console.error('❌ Invalid Instagram profile URL.');
    process.exit(1);
  }

  try {
    await downloadInstagramMedia(profileUrl);
  } catch (err) {
    console.error('❌ An unexpected error occurred:', err);
  }
})();
