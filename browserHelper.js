const fs = require('fs');
const path = require('path');

/**
 * Automatically detects installed Chromium-based browsers (Brave, Chrome, Edge)
 * or returns undefined to allow Puppeteer to fallback to bundled Chromium.
 */
function getBrowserExecutablePath() {
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }

  const possiblePaths = [
    // Brave Browser (64-bit, 32-bit, LocalAppData)
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') : null,
    
    // Google Chrome (64-bit, 32-bit, LocalAppData)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,

    // Microsoft Edge (64-bit, 32-bit, LocalAppData)
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft\\Edge\\Application\\msedge.exe') : null
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  return undefined;
}

module.exports = { getBrowserExecutablePath };
