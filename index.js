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
      
      // Normalize cookies for Puppeteer
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
        
        // Fix sameSite value - Puppeteer only accepts 'Strict', 'Lax', or 'None'
        if (cookie.sameSite) {
          const sameSite = cookie.sameSite.toLowerCase();
          if (sameSite === 'no_restriction') {
            normalized.sameSite = 'None';
          } else if (sameSite === 'lax') {
            normalized.sameSite = 'Lax';
          } else if (sameSite === 'strict') {
            normalized.sameSite = 'Strict';
          } else {
            normalized.sameSite = 'Lax'; // Default fallback
          }
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

// Scroll to load all posts
async function scrollToLoadPosts(page, maxScrolls = 20) {
  console.log('🔄 Scrolling to load all posts...');
  let previousHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollAttempts = 0;
  
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) {
      scrollAttempts++;
      if (scrollAttempts >= 3) {
        console.log('🛑 Reached end of posts.');
        break;
      }
    } else {
      scrollAttempts = 0;
    }
    previousHeight = newHeight;
    console.log(`📜 Scrolled ${i + 1} time(s).`);
  }
}

// Extract all post URLs
async function extractPostLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();
    document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach((a) => {
      const href = a.href;
      if (href.includes('/p/') || href.includes('/reel/')) {
        links.add(href.split('?')[0]); // Remove query parameters
      }
    });
    return Array.from(links);
  });
}

// Extract media from a single post page
async function extractMediaFromPost(page, postUrl) {
  try {
    console.log(`📸 Visiting post: ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for lazy loading
    
    const mediaUrls = await page.evaluate(() => {
      const urls = [];

      // Extract all images
      document.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.src;
        if (src && !src.includes('avatar') && !src.includes('profile') && !src.startsWith('blob:')) {
          urls.push({ url: src, type: 'image' });
        }
        
        // Check srcset for higher resolution images
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          srcset.split(',').forEach(part => {
            const url = part.trim().split(' ')[0];
            if (url && !url.includes('avatar') && !url.includes('profile') && !url.startsWith('blob:')) {
              urls.push({ url: url, type: 'image' });
            }
          });
        }
      });

      // Extract all videos - improved extraction, skip blob URLs
      document.querySelectorAll('video').forEach(video => {
        // Try src attribute first
        const src = video.getAttribute('src') || video.src;
        if (src && !src.startsWith('blob:')) {
          urls.push({ url: src, type: 'video' });
        }
        
        // Check source children
        video.querySelectorAll('source').forEach(source => {
          const sourceSrc = source.getAttribute('src') || source.src;
          if (sourceSrc && !sourceSrc.startsWith('blob:')) {
            urls.push({ url: sourceSrc, type: 'video' });
          }
        });
      });

      // Also check for video URLs in page scripts and meta tags
      const scripts = Array.from(document.querySelectorAll('script'));
      scripts.forEach(script => {
        const content = script.textContent || '';
        // Look for video URLs in JSON data - more comprehensive patterns
        const videoMatches = content.match(/"video_url":"(https:\/\/[^"]+\.mp4[^"]*)"/g);
        if (videoMatches) {
          videoMatches.forEach(match => {
            const url = match.match(/"video_url":"([^"]+)"/)[1];
            if (url && !url.includes('profile') && !url.includes('avatar')) {
              urls.push({ url: url, type: 'video' });
            }
          });
        }
        
        // Alternative pattern for video URLs
        const altMatches = content.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
        if (altMatches) {
          altMatches.forEach(url => {
            if (!url.includes('profile') && !url.includes('avatar') && !url.startsWith('blob:')) {
              urls.push({ url: url, type: 'video' });
            }
          });
        }
      });

      return urls;
    });
    
    const videos = mediaUrls.filter(m => m.type === 'video').length;
    const images = mediaUrls.filter(m => m.type === 'image').length;
    console.log(`  ✅ Found ${images} images and ${videos} videos`);
    return mediaUrls;
  } catch (err) {
    console.error(`  ❌ Error extracting media from ${postUrl}:`, err.message);
    return [];
  }
}

// Extract stories (currently available)
async function extractStories(page, username) {
  try {
    console.log('\n📖 Checking for stories...');
    await page.goto(`https://www.instagram.com/stories/${username}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const storyUrls = await page.evaluate(() => {
      const urls = [];
      
      // Extract story images - skip blob URLs
      document.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || img.src;
        if (src && !src.includes('avatar') && !src.includes('profile') && !src.includes('150x150') && !src.startsWith('blob:')) {
          urls.push({ url: src, type: 'story-image' });
        }
      });
      
      // Extract story videos - skip blob URLs
      document.querySelectorAll('video').forEach(video => {
        const src = video.getAttribute('src') || video.src;
        if (src && !src.startsWith('blob:')) {
          urls.push({ url: src, type: 'story-video' });
        }
        
        video.querySelectorAll('source').forEach(source => {
          const sourceSrc = source.getAttribute('src') || source.src;
          if (sourceSrc && !sourceSrc.startsWith('blob:')) {
            urls.push({ url: sourceSrc, type: 'story-video' });
          }
        });
      });
      
      // Check scripts for video URLs
      const scripts = Array.from(document.querySelectorAll('script'));
      scripts.forEach(script => {
        const content = script.textContent || '';
        // Look for video_url pattern
        const videoMatches = content.match(/"video_url":"(https:\/\/[^"]+\.mp4[^"]*)"/g);
        if (videoMatches) {
          videoMatches.forEach(match => {
            const url = match.match(/"video_url":"([^"]+)"/)[1];
            if (url && !url.startsWith('blob:')) {
              urls.push({ url: url, type: 'story-video' });
            }
          });
        }
        
        // Alternative pattern
        const altMatches = content.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
        if (altMatches) {
          altMatches.forEach(url => {
            if (!url.startsWith('blob:')) {
              urls.push({ url: url, type: 'story-video' });
            }
          });
        }
      });
      
      return urls;
    });
    
    if (storyUrls.length > 0) {
      console.log(`✅ Found ${storyUrls.length} story items`);
    } else {
      console.log('ℹ️  No active stories found');
    }
    
    return storyUrls;
  } catch (err) {
    console.log('ℹ️  No stories available or error accessing stories');
    return [];
  }
}

// Extract highlights
async function extractHighlights(page, username) {
  try {
    console.log('\n⭐ Checking for highlights...');
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find highlight URLs
    const highlightLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/stories/highlights/"]').forEach(a => {
        links.push(a.href);
      });
      return [...new Set(links)]; // Remove duplicates
    });
    
    if (highlightLinks.length === 0) {
      console.log('ℹ️  No highlights found');
      return [];
    }
    
    console.log(`📂 Found ${highlightLinks.length} highlight folders`);
    
    let allHighlightUrls = [];
    
    for (let i = 0; i < highlightLinks.length; i++) {
      const link = highlightLinks[i];
      console.log(`  [${i + 1}/${highlightLinks.length}] Extracting highlight: ${link}`);
      
      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const mediaUrls = await page.evaluate(() => {
          const urls = [];
          
          // Extract images - skip blob URLs
          document.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || img.src;
            if (src && !src.includes('avatar') && !src.includes('profile') && !src.includes('150x150') && !src.startsWith('blob:')) {
              urls.push({ url: src, type: 'highlight-image' });
            }
          });
          
          // Extract videos - skip blob URLs
          document.querySelectorAll('video').forEach(video => {
            const src = video.getAttribute('src') || video.src;
            if (src && !src.startsWith('blob:')) {
              urls.push({ url: src, type: 'highlight-video' });
            }
            
            video.querySelectorAll('source').forEach(source => {
              const sourceSrc = source.getAttribute('src') || source.src;
              if (sourceSrc && !sourceSrc.startsWith('blob:')) {
                urls.push({ url: sourceSrc, type: 'highlight-video' });
              }
            });
          });
          
          // Check scripts for video URLs
          const scripts = Array.from(document.querySelectorAll('script'));
          scripts.forEach(script => {
            const content = script.textContent || '';
            // Look for video_url pattern
            const videoMatches = content.match(/"video_url":"(https:\/\/[^"]+\.mp4[^"]*)"/g);
            if (videoMatches) {
              videoMatches.forEach(match => {
                const url = match.match(/"video_url":"([^"]+)"/)[1];
                if (url && !url.startsWith('blob:')) {
                  urls.push({ url: url, type: 'highlight-video' });
                }
              });
            }
            
            // Alternative pattern
            const altMatches = content.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
            if (altMatches) {
              altMatches.forEach(url => {
                if (!url.startsWith('blob:')) {
                  urls.push({ url: url, type: 'highlight-video' });
                }
              });
            }
          });
          
          return urls;
        });
        
        console.log(`    ✅ Found ${mediaUrls.length} items in this highlight`);
        allHighlightUrls.push(...mediaUrls);
      } catch (err) {
        console.log(`    ⚠️  Could not extract from highlight: ${err.message}`);
      }
    }
    
    console.log(`✅ Total highlight items: ${allHighlightUrls.length}`);
    return allHighlightUrls;
  } catch (err) {
    console.log('ℹ️  Error accessing highlights');
    return [];
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

// Main function to download media from Instagram profile
async function downloadInstagramMedia(profileUrl) {
  const usernameMatch = profileUrl.match(/instagram\.com\/([^\/]+)/);
  const username = usernameMatch ? usernameMatch[1].replace(/\/$/, '') : 'instagram_user';

  console.log(`🚀 Starting media download for ${username}...`);

  const browser = await puppeteer.launch({
    headless: true, // Run in headless mode
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

  console.log(`🧭 Loading profile: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'networkidle2' });
  
  // Check if we're logged in
  const isLoggedIn = await page.evaluate(() => {
    return !document.querySelector('input[name="username"]');
  });
  
  if (isLoggedIn) {
    console.log('✅ Successfully authenticated with cookies!');
  } else {
    console.log('⚠️  Not authenticated - limited access to public posts only');
  }

  // Scroll to load what we can
  await scrollToLoadPosts(page);

  // Extract post URLs
  console.log('🔍 Extracting post URLs...');
  const postUrls = await extractPostLinks(page);
  console.log(`✅ Found ${postUrls.length} posts.`);

  if (postUrls.length === 0) {
      console.log('❌ No posts found. This could be due to a private profile or an Instagram login wall.');
      await browser.close();
      return;
  }

  // Extract media from each post
  console.log(`\n📦 Extracting media from ${postUrls.length} posts...\n`);
  let allMediaItems = [];
  let postCount = 0;
  
  for (const postUrl of postUrls) {
    postCount++;
    console.log(`[${postCount}/${postUrls.length}] Processing post...`);
    const mediaItems = await extractMediaFromPost(page, postUrl);
    allMediaItems.push(...mediaItems);
  }

  // Extract stories (if available)
  const storyItems = await extractStories(page, username);
  allMediaItems.push(...storyItems);

  // Extract highlights (if available)
  const highlightItems = await extractHighlights(page, username);
  allMediaItems.push(...highlightItems);

  // Remove duplicates based on URL
  const uniqueMediaMap = new Map();
  allMediaItems.forEach(item => {
    const url = typeof item === 'string' ? item : item.url;
    if (!uniqueMediaMap.has(url)) {
      uniqueMediaMap.set(url, item);
    }
  });
  let uniqueMediaItems = Array.from(uniqueMediaMap.values());
  
  // Filter out low-resolution images
  const beforeFilter = uniqueMediaItems.length;
  uniqueMediaItems = uniqueMediaItems.filter(item => {
    const url = typeof item === 'string' ? item : item.url;
    const filtered = filterHighResUrls([url]);
    return filtered.length > 0;
  });
  
  console.log(`\n🔧 Filtered ${beforeFilter - uniqueMediaItems.length} low-resolution images`);
  console.log(`✅ Found a total of ${uniqueMediaItems.length} high-quality media files.\n`);

  // Download all media into ZIP file
  if (uniqueMediaItems.length > 0) {
    console.log(`📥 Downloading ${uniqueMediaItems.length} media files...\n`);
    await downloadMedia(uniqueMediaItems, username);
  } else {
    console.log('❌ No media found to download.');
  }

  // Close the browser
  await browser.close();
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
