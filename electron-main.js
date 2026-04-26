const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const net = require('net');
const http = require('http');

const SERVER_PORT = 9999;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const STARTUP_TIMEOUT_MS = 15000;
const SERVER_PING_TIMEOUT_MS = 1500;
const isDevMode = process.argv.includes('--dev') || !app.isPackaged;
const serverEntryRelativePath = 'index.js';
const iconPath = path.join(__dirname, 'assets', 'icon.png');

if (app.isPackaged && process.platform === 'win32') {
  process.env.BROX_AUTO_INSTALL_STARTUP = '1';
}

let mainWindow = null;
let serverProcess = null;
let inProcessServerStarted = false;
let appIsQuitting = false;

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const fallback = {
    width: 1400,
    height: 900,
  };

  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const width = Number.parseInt(parsed.width, 10);
    const height = Number.parseInt(parsed.height, 10);

    return {
      width: Number.isFinite(width) && width >= 800 ? width : fallback.width,
      height: Number.isFinite(height) && height >= 600 ? height : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    const bounds = mainWindow.getBounds();
    fs.mkdirSync(path.dirname(getWindowStatePath()), { recursive: true });
    fs.writeFileSync(
      getWindowStatePath(),
      JSON.stringify({ width: bounds.width, height: bounds.height }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[Electron] Could not save window state:', err.message);
  }
}

function resolveServerScriptPath() {
  const candidates = [
    path.join(app.getAppPath(), serverEntryRelativePath),
    path.join(__dirname, serverEntryRelativePath),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', serverEntryRelativePath),
  ];

  const existingPath = candidates.find((candidatePath) => fs.existsSync(candidatePath));
  return existingPath || candidates[0];
}

function startServerInProcess(serverScriptPath) {
  if (inProcessServerStarted) {
    return;
  }

  require(serverScriptPath);
  inProcessServerStarted = true;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => resolve(err.code === 'EADDRINUSE'))
      .once('listening', () => server.close(() => resolve(false)))
      .listen(port, '127.0.0.1');
  });
}

function pingServer() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(SERVER_PING_TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function createApplicationMenu() {
  const template = [
    {
      label: 'ফাইল',
      submenu: [
        {
          label: 'রিফ্রেশ',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: 'ড্যাশবোর্ড খুলুন',
          accelerator: 'CmdOrCtrl+L',
          click: () => shell.openExternal(SERVER_URL),
        },
        { type: 'separator' },
        {
          label: 'প্রস্থান',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'সম্পাদনা',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'দৃশ্য',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'togglefullscreen' },
        ...(isDevMode ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'সহায়তা',
      submenu: [
        {
          label: 'লোকাল ড্যাশবোর্ড ব্রাউজারে খুলুন',
          click: () => shell.openExternal(SERVER_URL),
        },
        {
          label: 'সম্পর্কে',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Brox Scraper সম্পর্কে',
              message: 'Brox Scraper',
              detail: `সংস্করণ ${app.getVersion()}\n\nলোকাল Windows dashboard app for scraping news and mobile data.`,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const windowState = loadWindowState();
  const windowConfig = {
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: '#f5f0e8',
    title: 'Brox Scraper',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  };

  if (fs.existsSync(iconPath)) {
    windowConfig.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowConfig);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) {
      return;
    }

    dialog.showErrorBox(
      'পেজ লোড ব্যর্থ',
      `Dashboard load করা যায়নি.\nURL: ${validatedURL}\nError: ${errorDescription} (${errorCode})`
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Renderer process gone:', details);
    dialog.showErrorBox(
      'উইন্ডো বন্ধ হয়ে গেছে',
      `Renderer process বন্ধ হয়েছে (${details.reason || 'unknown'}). অ্যাপটি আবার চালু করুন।`
    );
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) {
      return;
    }

    mainWindow.show();
    mainWindow.focus();

    if (isDevMode) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('closed', () => {
    saveWindowState();
    mainWindow = null;
  });

  createApplicationMenu();
  mainWindow.loadURL(SERVER_URL);
}

function stopServer() {
  if (inProcessServerStarted) {
    console.log('[Electron] Server is running in-process and will stop on app exit');
    return;
  }

  if (!serverProcess) {
    return;
  }

  const processToStop = serverProcess;
  serverProcess = null;

  try {
    processToStop.kill('SIGTERM');
  } catch (err) {
    console.warn('[Electron] Could not stop server cleanly:', err.message);
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let healthCheck = null;
    let startupTimeout = null;
    const serverScriptPath = resolveServerScriptPath();

    const cleanup = () => {
      if (healthCheck) {
        clearInterval(healthCheck);
        healthCheck = null;
      }
      if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = null;
      }
    };

    const resolveOnce = () => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (err) => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      reject(err);
    };

    (async () => {
      try {
        if (serverProcess && !serverProcess.killed) {
          console.log('[Electron] Server process already running');
          resolveOnce();
          return;
        }

        const portInUse = await isPortInUse(SERVER_PORT);
        if (portInUse) {
          const reachable = await pingServer();
          if (reachable) {
            console.log('[Electron] Reusing existing local server on port', SERVER_PORT);
            resolveOnce();
            return;
          }

          rejectOnce(new Error(`Port ${SERVER_PORT} is already in use by another process`));
          return;
        }

        const startServerInSameProcess = (reason) => {
          if (inProcessServerStarted) {
            return true;
          }

          try {
            console.warn(
              `[Electron] Background server process failed (${reason?.message || reason}). Falling back to in-process server startup.`
            );
            startServerInProcess(serverScriptPath);
            resolveOnce();
            return true;
          } catch (fallbackErr) {
            console.error('[Electron] In-process fallback failed:', fallbackErr);
            return false;
          }
        };

        if (!fs.existsSync(serverScriptPath)) {
          rejectOnce(new Error(`Server entry not found: ${serverScriptPath}`));
          return;
        }

        console.log('[Electron] Starting background server:', serverScriptPath);
        serverProcess = fork(serverScriptPath, [], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          cwd: __dirname,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          execArgv: [],
          windowsHide: true,
        });
        console.log('[Electron] Background server PID:', serverProcess.pid ?? 'unknown');

        serverProcess.stdout.on('data', (data) => {
          console.log(`[Server stdout] ${data.toString().trim()}`);
        });

        serverProcess.stderr.on('data', (data) => {
          console.error(`[Server stderr] ${data.toString().trim()}`);
        });

        serverProcess.once('error', (err) => {
          if (startServerInSameProcess(err)) {
            return;
          }
          rejectOnce(new Error(`Server process error: ${err.message}`));
        });

        serverProcess.once('exit', (code, signal) => {
          if (!isResolved) {
            if (startServerInSameProcess(`exit code ${code}${signal ? ` (signal: ${signal})` : ''}`)) {
              return;
            }
            rejectOnce(new Error(`Server exited early with code ${code}${signal ? ` (signal: ${signal})` : ''}`));
            return;
          }

          console.log(`[Electron] Server exited with code ${code}, signal ${signal}`);
        });

        healthCheck = setInterval(async () => {
          const reachable = await pingServer();
          if (reachable) {
            console.log('[Electron] Server health check succeeded');
            resolveOnce();
          }
        }, 500);

        startupTimeout = setTimeout(() => {
          if (startServerInSameProcess('startup timeout')) {
            return;
          }
          rejectOnce(new Error('Server startup timeout - dashboard did not respond in time'));
        }, STARTUP_TIMEOUT_MS);
      } catch (err) {
        rejectOnce(err);
      }
    })();
  });
}

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('app-name', () => 'Brox Scraper');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    createWindow();
  });
}

app.on('before-quit', () => {
  appIsQuitting = true;
  saveWindowState();
  stopServer();
});

app.whenReady().then(async () => {
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.broxscraper.app');
    }

    await startServer();
    createWindow();
  } catch (err) {
    console.error('[Electron] Startup error:', err);
    dialog.showErrorBox(
      'স্টার্টআপ ত্রুটি',
      `অ্যাপ্লিকেশন শুরু করতে ব্যর্থ হয়েছে: ${err.message || 'অজানা ত্রুটি'}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length > 0) {
    return;
  }

  try {
    const reachable = await pingServer();
    if (!reachable && (!serverProcess || serverProcess.killed)) {
      await startServer();
    }
    createWindow();
  } catch (err) {
    console.error('[Electron] Activate error:', err);
    dialog.showErrorBox('উইন্ডো খুলতে সমস্যা', err.message || 'অজানা ত্রুটি');
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Electron] Uncaught exception:', err);
  dialog.showErrorBox('অপ্রত্যাশিত ত্রুটি', err.message || 'অজানা ত্রুটি');

  if (!appIsQuitting) {
    stopServer();
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron] Unhandled rejection:', reason);
});
