const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  APP_NAME,
  getStartupShortcutPath,
} = require('./appPaths');

function runPowerShell(script, env = {}) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'pipe',
    windowsHide: true,
    encoding: 'utf8',
  });
}

function installStartupShortcut(targetPath = process.execPath) {
  const shortcutPath = getStartupShortcutPath();
  const startupDir = path.dirname(shortcutPath);
  fs.mkdirSync(startupDir, { recursive: true });

  const script = [
    '$shortcutPath = $env:BROX_STARTUP_SHORTCUT',
    '$targetPath = $env:BROX_STARTUP_TARGET',
    '$wsh = New-Object -ComObject WScript.Shell',
    '$shortcut = $wsh.CreateShortcut($shortcutPath)',
    '$shortcut.TargetPath = $targetPath',
    '$shortcut.WorkingDirectory = Split-Path $targetPath',
    '$shortcut.WindowStyle = 7',
    `$shortcut.Description = 'Start ${APP_NAME} with Windows'`,
    '$shortcut.Save()',
  ].join('; ');

  const result = runPowerShell(script, {
    BROX_STARTUP_SHORTCUT: shortcutPath,
    BROX_STARTUP_TARGET: targetPath,
  });

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim() || 'Unable to create startup shortcut';
    throw new Error(message);
  }

  return { shortcutPath, targetPath };
}

function removeStartupShortcut() {
  const shortcutPath = getStartupShortcutPath();
  if (!fs.existsSync(shortcutPath)) {
    return { removed: false, shortcutPath };
  }

  fs.unlinkSync(shortcutPath);
  return { removed: true, shortcutPath };
}

function getStartupShortcutState() {
  const shortcutPath = getStartupShortcutPath();
  return {
    shortcutPath,
    installed: fs.existsSync(shortcutPath),
  };
}

module.exports = {
  installStartupShortcut,
  removeStartupShortcut,
  getStartupShortcutState,
};
