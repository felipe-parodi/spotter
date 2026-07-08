'use strict';
/* Shared helper: locate Chromium for Playwright across environments. */
const fs = require('fs');

function chromiumPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      const p = root + '/' + d + '/chrome-linux/chrome';
      if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
    }
  }
  return undefined; // let Playwright resolve its own download
}

module.exports = { chromiumPath, BASE: process.env.SPOTTER_URL || 'http://localhost:8642' };
