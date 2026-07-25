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
function loadCookies(cookieFile = 'fb_cookie.json') {
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
          secure: cookie.secure !== undefined ? cookie.secure : true
        };

        if (cookie.sameSite) {
          const sameSite = cookie.sameSite.toLowerCase();
          if (sameSite === 'no_restriction') normalized.sameSite = 'None';
          else if (sameSite === 'lax') normalized.sameSite = 'Lax';
          else if (sameSite === 'strict') normalized.sameSite = 'Strict';
          else normalized.sameSite = 'Lax';
        }
        return normalized;
      }).filter(cookie => {
        // Only keep cookies for facebook domains
        return cookie.domain && (
          cookie.domain.includes('facebook.com') ||
          cookie.domain.includes('.facebook.com')
        );
      });
      
      console.log(`✅ Loaded ${normalizedCookies.length} cookies from ${cookieFile}`);
      return normalizedCookies;
    } else {
      console.log(`⚠️  Cookie file ${cookieFile} not found. You likely need it for full access.`);
    }
  } catch (err) {
    console.log(`⚠️  Could not load cookies: ${err.message}`);
  }
  return null;
}

// Filter out low-resolution images and unwanted URLs
function filterHighResUrls(urls) {
  const lowResPatterns = [
    /\/p\d+x\d+\//i,
    /\/s\d+x\d+\//i,
    /\/c\d+\.\d+\.\d+\.\d+\//i, // cropping parameters e.g., c0.0.200.200
    /\/cp\d+\//i,
    /thumb/i,
    /small/i,
    /thumbnail/i,
    /\/32x32\//i,
    /\/50x50\//i,
    /\/75x75\//i,
    /\/100x100\//i,
    /\/130x130\//i,
    /\/160x160\//i,
    /\/200x200\//i,
    /\/240x240\//i,
    /\/320x320\//i,
    /\/480x480\//i,
    /video_preview/i,
    /vthumb/i
  ];
  return urls.filter(url => !lowResPatterns.some(pattern => pattern.test(url)));
}

function isValidFbMediaUrl(urlStr) {
  if (typeof urlStr !== 'string') return false;
  if (!urlStr.startsWith('http')) return false;
  if (!urlStr.includes('fbcdn.net')) return false;
  
  // Exclude tiny icons or static assets
  if (urlStr.includes('/rsrc.php/')) return false;
  if (urlStr.includes('emoji.php')) return false;
  
  return true;
}

// Recursively find all media URLs in a JSON object
function extractUrlsFromJson(obj, urlsArray, depth) {
  if (!obj || depth > 15) return;
  if (typeof obj === 'string') {
    try {
      if (obj.trim().startsWith('{') || obj.trim().startsWith('[')) {
        const parsed = JSON.parse(obj);
        extractUrlsFromJson(parsed, urlsArray, (depth || 0) + 1);
      } else {
        // Direct string check for FB CDN
        if (isValidFbMediaUrl(obj)) {
          const type = obj.includes('.mp4') || obj.includes('video') ? 'video' : 'image';
          urlsArray.push({ url: obj, type });
        }
      }
    } catch(e) {}
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach(item => extractUrlsFromJson(item, urlsArray, (depth || 0) + 1));
    return;
  }

  if (typeof obj === 'object') {
    // Specific Facebook GraphQL keys
    if (obj.playable_url_quality_hd) {
      urlsArray.push({ url: obj.playable_url_quality_hd, type: 'video' });
    } else if (obj.playable_url) {
      urlsArray.push({ url: obj.playable_url, type: 'video' });
    }
    
    if (obj.browser_native_hd_url) {
       urlsArray.push({ url: obj.browser_native_hd_url, type: 'video' });
    } else if (obj.browser_native_sd_url) {
       urlsArray.push({ url: obj.browser_native_sd_url, type: 'video' });
    }

    if (obj.uri && isValidFbMediaUrl(obj.uri)) {
      const type = obj.uri.includes('.mp4') ? 'video' : 'image';
      urlsArray.push({ url: obj.uri, type });
    }

    if (obj.url && isValidFbMediaUrl(obj.url)) {
      const type = obj.url.includes('.mp4') ? 'video' : 'image';
      urlsArray.push({ url: obj.url, type });
    }

    for (let key in obj) {
      extractUrlsFromJson(obj[key], urlsArray, (depth || 0) + 1);
    }
  }
}

// Download media and create a ZIP file
async function downloadMedia(mediaItems, profileName) {
  const zip = new JSZip();
  let count = 0;

  for (const item of mediaItems) {
    try {
      const url = item.url;
      let type = item.type;
      
      // Attempt to guess type if unknown
      if (type === 'unknown' || !type) {
        type = url.includes('.mp4') ? 'video' : 'photo';
      } else if (type === 'image') {
        type = 'photo'; // map to user requested suffix
      }

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
        ext = type === 'video' ? '.mp4' : '.jpg';
      }
      
      // Format: profilename_0001_photo.jpg or profilename_0002_video.mp4
      const filename = `${profileName}_${String(count + 1).padStart(4, '0')}_${type}${ext}`;
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
  const zipFilename = `${profileName}.zip`;
  fs.writeFileSync(zipFilename, zipData);
  console.log(`\n📦 Backup saved to ${zipFilename}`);
  console.log(`✅ Successfully downloaded ${count} files!`);
}

// Scroll to load all posts
async function scrollToLoadPosts(page) {
  console.log('🔄 Scrolling to load all posts/media...');
  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollAttempts = 0;
  
  // Keep scrolling until we hit the bottom 4 times consecutively
  while (scrollAttempts < 4) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) {
      scrollAttempts++;
      console.log(`📜 Attempt ${scrollAttempts}/4 to load more...`);
    } else {
      scrollAttempts = 0;
      console.log(`📜 Scrolled down, more media loaded.`);
    }
    previousHeight = newHeight;
  }
  console.log('🛑 Reached end of media feed.');
}

// Main function to download media from Facebook
async function downloadFacebookMedia(targetUrl) {
  // Try to parse out a neat name for the zip
  let profileName = 'facebook_media';
  try {
    const urlObj = new URL(targetUrl);
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    if (pathParts.length > 0) {
      profileName = pathParts[0];
    }
  } catch(e) {}

  console.log(`🚀 Starting advanced media download for ${profileName}...`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US', '--disable-notifications'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');

  // Load and inject cookies for authentication
  const cookies = loadCookies('fb_cookie.json');
  if (cookies && cookies.length > 0) {
    console.log('🍪 Injecting cookies for authentication...');
    await page.setCookie(...cookies);
    console.log('✅ Cookies injected successfully!');
  }

  // Set up network interception array
  let interceptedMedia = [];

  // Listen for responses - Facebook uses GraphQL over POST for most feeds/media
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const resourceType = response.request().resourceType();

      if (resourceType === 'xhr' || resourceType === 'fetch') {
        const isApiEndpoint = url.includes('/api/graphql/') || url.includes('/graphql/');

        if (isApiEndpoint) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('json') || contentType.includes('text') || contentType.includes('application/x-www-form-urlencoded')) {
            const text = await response.text();
            
            // Facebook sometimes batches responses separated by newlines
            const parts = text.split('\n');
            const before = interceptedMedia.length;

            for (const part of parts) {
              if (!part.trim()) continue;
              try {
                const json = JSON.parse(part);
                extractUrlsFromJson(json, interceptedMedia, 0);
              } catch(e) {
                // If not JSON, use regex fallback on raw response part
                // Looking for fbcdn URLs directly in text
                const urlMatches = part.match(/https:\/\/[^"]*fbcdn\.net[^"\\]*/g);
                if (urlMatches) {
                  urlMatches.forEach(m => {
                    const cleanUrl = m.replace(/\\/g, ''); // Clean escaped slashes
                    if (isValidFbMediaUrl(cleanUrl)) {
                      const type = cleanUrl.includes('.mp4') ? 'video' : 'image';
                      interceptedMedia.push({ url: cleanUrl, type });
                    }
                  });
                }
              }
            }
            
            if (interceptedMedia.length > before) {
              console.log(`  🔗 Intercepted ${interceptedMedia.length - before} media items from GraphQL`);
            }
          }
        }
      }
    } catch (e) {
      // Ignore errors related to incomplete or aborted responses
    }
  });

  console.log(`🧭 Loading URL: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Extract from the initial page load's inline JSON (<script type="application/json">)
  console.log(`🧠 Parsing initial page state for media...`);

  const inlineScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent)
      .filter(text => text && text.includes('fbcdn.net'));
  });

  console.log(`  📄 Found ${inlineScripts.length} relevant script tags`);

  for (const scriptContent of inlineScripts) {
    try {
      extractUrlsFromJson(scriptContent, interceptedMedia, 0);
    } catch(e) {}
    
    // Regex fallback
    const urlMatches = scriptContent.match(/https:\/\/[^"]*fbcdn\.net[^"\\]*/g);
    if (urlMatches) {
      urlMatches.forEach(m => {
        const cleanUrl = m.replace(/\\/g, '');
        if (isValidFbMediaUrl(cleanUrl)) {
          const type = cleanUrl.includes('.mp4') ? 'video' : 'image';
          interceptedMedia.push({ url: cleanUrl, type });
        }
      });
    }
  }

  const isLoggedIn = await page.evaluate(() => {
    const isLoginUrl = window.location.href.includes('/login');
    return !isLoginUrl;
  });
  
  if (isLoggedIn) {
    console.log('✅ Successfully authenticated with cookies (or public page accessible)!');
  } else {
    console.log('⚠️  Not authenticated - redirected to login screen! Check your fb_cookie.json');
  }

  // Scroll completely to the bottom to trigger all GraphQL requests
  await scrollToLoadPosts(page);

  // Wait for final requests to finish parsing
  console.log('⏳ Waiting for final API responses...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  await browser.close();

  // Process the intercepted media
  console.log('🔍 Processing intercepted network payloads...');
  console.log(`  📦 Raw intercepted items: ${interceptedMedia.length}`);

  // Remove duplicates based on URL (ignoring query parameters for uniqueness if they match the same base, but FB URLs need query params for auth signatures, so we match exactly but decode entities)
  const uniqueMediaMap = new Map();
  interceptedMedia.forEach(item => {
    let url = item.url;
    try {
      url = url.replace(/\\u0025/g, '%');
      url = decodeURIComponent(url);
    } catch(e){}

    if (isValidFbMediaUrl(url)) {
      // Strip some dynamic tokens if we want strict deduping, but FB requires tokens like _nc_cat to fetch.
      // Usually the base path + filename is unique enough.
      const baseUrl = url.split('?')[0];
      // Keep highest priority type (video > image) if duplicate base found
      if (uniqueMediaMap.has(baseUrl)) {
        if (item.type === 'video' && uniqueMediaMap.get(baseUrl).type === 'image') {
          uniqueMediaMap.set(baseUrl, { url, type: item.type });
        }
      } else {
        uniqueMediaMap.set(baseUrl, { url, type: item.type });
      }
    }
  });

  let uniqueMediaItems = Array.from(uniqueMediaMap.values());
  console.log(`  📦 After dedup: ${uniqueMediaItems.length}`);

  // Filter out low-resolution images
  const beforeFilter = uniqueMediaItems.length;
  uniqueMediaItems = uniqueMediaItems.filter(item => {
    const filtered = filterHighResUrls([item.url]);
    return filtered.length > 0;
  });

  console.log(`🔧 Filtered ${beforeFilter - uniqueMediaItems.length} low-resolution images/thumbnails`);
  console.log(`✅ Extracted a total of ${uniqueMediaItems.length} high-quality media files directly from Facebook API.\n`);

  // Download all media into ZIP file
  if (uniqueMediaItems.length > 0) {
    console.log(`📥 Downloading ${uniqueMediaItems.length} media files...\n`);
    await downloadMedia(uniqueMediaItems, profileName);
  } else {
    console.log('❌ No media found to download.');
  }

  console.log('🏁 Download completed!');
}

// --- Entry Point ---
(async () => {
  console.log('📘 Welcome to Facebook Media Downloader');
  const targetUrl = await askQuestion('🔗 Enter Facebook profile/page URL (e.g. https://www.facebook.com/username/photos): ');

  if (!targetUrl || !targetUrl.includes('facebook.com')) {
    console.error('❌ Invalid Facebook URL.');
    process.exit(1);
  }

  try {
    await downloadFacebookMedia(targetUrl);
  } catch (err) {
    console.error('❌ An unexpected error occurred:', err);
  }
})();
