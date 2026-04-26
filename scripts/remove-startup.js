const { removeStartupShortcut } = require('../src/windowsStartup');

try {
  const result = removeStartupShortcut();
  if (result.removed) {
    console.log(`Removed Windows startup shortcut: ${result.shortcutPath}`);
  } else {
    console.log(`No startup shortcut found: ${result.shortcutPath}`);
  }
} catch (err) {
  console.error(`Failed to remove startup shortcut: ${err.message}`);
  process.exit(1);
}
