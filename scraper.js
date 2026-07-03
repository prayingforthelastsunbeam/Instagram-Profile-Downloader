const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');

// Filter out low-resolution images and unwanted URLs
function filterHighResUrls(urls) {
  const lowResPatterns = [
    /p\d+x\d+/i,
    /thumb/i,
    /small/i,
    /lowres/i,
    /thumbnail/i,
    /s\d+x\d+/i,
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
    
    if (obj.image_versions2 && obj.image_versions2.candidates) {
      const best = obj.image_versions2.candidates[0];
      if (best && best.url) urlsArray.push({ url: best.url, type: 'image' });
    }
    
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
async function downloadMedia(mediaItems, username, onProgress) {
  const zip = new JSZip();
  let count = 0;
  
  const publicDir = path.join(__dirname, 'public');
  const downloadsDir = path.join(publicDir, 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  // Create a subfolder for individual files
  const userMediaDir = path.join(downloadsDir, username);
  if (!fs.existsSync(userMediaDir)) {
    fs.mkdirSync(userMediaDir, { recursive: true });
  }

  const savedFiles = [];

  for (const item of mediaItems) {
    try {
      const url = typeof item === 'string' ? item : item.url;
      const type = typeof item === 'string' ? 'unknown' : item.type;
      
      onProgress(`⬇️ [${count + 1}/${mediaItems.length}] Downloading ${type}...`);
      const res = await fetch(url);
      if (!res.ok) {
        continue;
      }
      const buffer = await res.arrayBuffer();
      
      let ext = path.extname(new URL(url).pathname).split('?')[0];
      if (!ext || ext === '') {
        ext = type.includes('video') ? '.mp4' : '.jpg';
      }
      
      const filename = `${username}_${String(count + 1).padStart(4, '0')}${ext}`;
      const nodeBuffer = Buffer.from(buffer);
      zip.file(filename, nodeBuffer);
      
      // Save individual file for the gallery
      fs.writeFileSync(path.join(userMediaDir, filename), nodeBuffer);
      savedFiles.push({ filename, type, url: `/downloads/${username}/${filename}` });
      
      count++;
    } catch (err) {
      // ignore
    }
  }

  if (count > 0) {
    onProgress(`📦 Creating ZIP archive...`);
    const zipData = await zip.generateAsync({ type: 'nodebuffer' });
    const zipFilename = `${username}.zip`;
    fs.writeFileSync(path.join(downloadsDir, zipFilename), zipData);
    onProgress(`✅ Backup saved to ${zipFilename}`);
    return { zipUrl: `/downloads/${zipFilename}`, files: savedFiles, count };
  }
  return { zipUrl: null, files: [], count: 0 };
}

// Scroll to load all posts
async function scrollToLoadPosts(page, onProgress) {
  onProgress('🔄 Scrolling to load all posts...');
  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollAttempts = 0;
  
  while (scrollAttempts < 3) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) {
      scrollAttempts++;
      onProgress(`📜 Attempt ${scrollAttempts}/3 to load more...`);
    } else {
      scrollAttempts = 0;
      onProgress(`📜 Scrolled down, more posts loaded.`);
    }
    previousHeight = newHeight;
  }
  onProgress('🛑 Reached end of posts.');
}

// Main exported function
async function scrapeInstagram(profileUrl, cookiesData, onProgress) {
  const usernameMatch = profileUrl.match(/instagram\.com\/([^\/]+)/);
  const username = usernameMatch ? usernameMatch[1].replace(/\/$/, '') : 'instagram_user';

  onProgress(`🚀 Starting advanced media download for ${username}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  if (cookiesData && Array.isArray(cookiesData)) {
    const normalizedCookies = cookiesData.map(cookie => {
      const normalized = { ...cookie };
      if (cookie.sameSite) {
        const sameSite = cookie.sameSite.toLowerCase();
        if (sameSite === 'no_restriction') normalized.sameSite = 'None';
        else if (sameSite === 'lax') normalized.sameSite = 'Lax';
        else if (sameSite === 'strict') normalized.sameSite = 'Strict';
        else normalized.sameSite = 'Lax'; 
      }
      return normalized;
    });
    onProgress('🍪 Injecting cookies for authentication...');
    await page.setCookie(...normalizedCookies);
    onProgress('✅ Cookies injected successfully!');
  }

  let interceptedMedia = [];

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const resourceType = response.request().resourceType();
      
      if (resourceType === 'xhr' || resourceType === 'fetch') {
        if (url.includes('/graphql/query') || url.includes('/api/v1/')) {
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            extractUrlsFromJson(json, interceptedMedia);
          } catch(e) {}
        }
      }
    } catch (e) {}
  });

  onProgress(`🧭 Loading profile: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  
  onProgress(`🧠 Parsing initial page state for media...`);
  const inlineScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent)
      .filter(text => text && (text.includes('requireLazy') || text.includes('window.__initialDataLoaded') || text.includes('display_url')));
  });

  for (const scriptContent of inlineScripts) {
    extractUrlsFromJson(scriptContent, interceptedMedia);
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

  const isLoggedIn = await page.evaluate(() => !document.querySelector('input[name="username"]'));
  if (isLoggedIn) {
    onProgress('✅ Successfully authenticated with cookies!');
  } else {
    onProgress('⚠️ Not authenticated - limited access to public posts only');
  }

  await scrollToLoadPosts(page, onProgress);
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();

  onProgress('🔍 Processing intercepted network payloads...');

  const uniqueMediaMap = new Map();
  interceptedMedia.forEach(item => {
    const url = item.url;
    if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('logging') && !url.includes('graphql')) {
      uniqueMediaMap.set(url, item);
    }
  });
  
  let uniqueMediaItems = Array.from(uniqueMediaMap.values());
  const beforeFilter = uniqueMediaItems.length;
  uniqueMediaItems = uniqueMediaItems.filter(item => {
    const url = item.url;
    const filtered = filterHighResUrls([url]);
    return filtered.length > 0;
  });
  
  onProgress(`🔧 Filtered ${beforeFilter - uniqueMediaItems.length} low-resolution images/thumbnails`);
  onProgress(`✅ Extracted a total of ${uniqueMediaItems.length} high-quality media files.\n`);

  if (uniqueMediaItems.length > 0) {
    onProgress(`📥 Preparing to download ${uniqueMediaItems.length} files...`);
    const result = await downloadMedia(uniqueMediaItems, username, onProgress);
    onProgress(`🏁 Download completed!`);
    return result;
  } else {
    onProgress('❌ No media found to download.');
    return { zipUrl: null, files: [], count: 0 };
  }
}

module.exports = { scrapeInstagram };
