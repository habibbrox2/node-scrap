const fs = require('fs');
const path = require('path');
const { installStartupShortcut } = require('../src/windowsStartup');

const defaultTarget = path.resolve(__dirname, '..', 'dist', 'brox-scraper.exe');
const targetPath = process.env.BROX_STARTUP_TARGET || process.argv[2] || defaultTarget;

if (!fs.existsSync(targetPath)) {
  console.error(`Startup target not found: ${targetPath}`);
  console.error('Build the Windows exe first, or pass the exe path as the first argument.');
  process.exit(1);
}

try {
  const result = installStartupShortcut(targetPath);
  console.log(`Installed Windows startup shortcut: ${result.shortcutPath}`);
  console.log(`Target: ${result.targetPath}`);
} catch (err) {
  console.error(`Failed to install startup shortcut: ${err.message}`);
  process.exit(1);
}
