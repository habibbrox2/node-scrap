const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');

let mainWindow;
let serverProcess;
const SERVER_PORT = 9999;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Path to the main index.js
const mainScriptPath = path.join(__dirname, 'index.js');

// Check if port is in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

function createWindow() {
    const windowConfig = {
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
        },
    };

    // Add icon if it exists
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(iconPath)) {
        windowConfig.icon = iconPath;
    }

    mainWindow = new BrowserWindow(windowConfig);

    mainWindow.loadURL(SERVER_URL);

    // Open DevTools in development
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Don't kill the server when window closes
        // User can reopen the window and server continues running
        console.log('Window closed, but server continues running');
    });

    // Create menu
    createApplicationMenu();
}

function createApplicationMenu() {
    const template = [
        {
            label: 'ফাইল',
            submenu: [
                {
                    label: 'প্রস্থান',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    },
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
            ],
        },
        {
            label: 'দৃশ্য',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
            ],
        },
        {
            label: 'সাহায্য',
            submenu: [
                {
                    label: 'সম্পর্কে',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Brox Scraper সম্পর্কে',
                            message: 'Brox Scraper',
                            detail: 'সংস্করণ 1.0.0\n\nপাঁচ টি বাংলা নিউজ সাইট এবং মোবাইল দোকান থেকে সংবাদ সংগ্রহ করে।',
                        });
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function startServer() {
    return new Promise((resolve, reject) => {
        (async () => {
            try {
                // Check if server is already running
                if (serverProcess && !serverProcess.killed) {
                    console.log('[Electron] Server already running');
                    resolve();
                    return;
                }

                console.log('[Electron] Starting server...');
                console.log('[Electron] Main script path:', mainScriptPath);
                console.log('[Electron] Server port:', SERVER_PORT);
                console.log('[Electron] Working directory:', __dirname);

                // Check if port is in use
                const portInUse = await isPortInUse(SERVER_PORT);
                console.log('[Electron] Port', SERVER_PORT, 'in use:', portInUse);

                if (portInUse) {
                    console.log(`[Electron] Port ${SERVER_PORT} already in use, killing existing node processes...`);
                    // Try to kill any existing process on this port
                    if (process.platform === 'win32') {
                        spawn('taskkill', ['/F', '/IM', 'node.exe'], { stdio: 'ignore' });
                    } else {
                        spawn('killall', ['node'], { stdio: 'ignore' });
                    }
                    // Wait a bit for the port to be freed
                    await new Promise(r => setTimeout(r, 2000));
                }

                console.log('[Electron] Spawning Node.js process for:', mainScriptPath);

                // Start the Node.js server
                serverProcess = spawn('node', [mainScriptPath], {
                    stdio: ['inherit', 'pipe', 'pipe'],
                    shell: false,
                    detached: false,
                    cwd: __dirname,
                    env: { ...process.env },
                });

                console.log('[Electron] Node process spawned, PID:', serverProcess.pid);

                if (!serverProcess.pid) {
                    throw new Error('Failed to spawn Node.js process - no PID');
                }

                let isResolved = false;
                let hasOutput = false;

                serverProcess.stdout.on('data', (data) => {
                    hasOutput = true;
                    const output = data.toString().trim();
                    console.log(`[Server stdout] ${output}`);

                    if (!isResolved && (output.includes('listening') || output.includes('running') || output.includes('9999') || output.includes('http://'))) {
                        console.log('[Electron] Server ready detected');
                        isResolved = true;
                        resolve();
                    }
                });

                serverProcess.stderr.on('data', (data) => {
                    hasOutput = true;
                    const output = data.toString().trim();
                    console.error(`[Server stderr] ${output}`);
                });

                serverProcess.on('error', (err) => {
                    console.error('[Electron] Process error:', err);
                    if (!isResolved) {
                        isResolved = true;
                        reject(new Error(`Process error: ${err.message}`));
                    }
                });

                serverProcess.on('exit', (code, signal) => {
                    console.log(`[Electron] Server process exited with code ${code}, signal ${signal}`);
                    if (!isResolved && code !== 0) {
                        isResolved = true;
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });

                // Health check - try connecting to server
                const healthCheck = setInterval(() => {
                    if (isResolved) {
                        clearInterval(healthCheck);
                        return;
                    }

                    const req = http.get(`http://localhost:${SERVER_PORT}`, (res) => {
                        console.log('[Electron] Health check successful, HTTP status:', res.statusCode);
                        clearInterval(healthCheck);
                        if (!isResolved) {
                            isResolved = true;
                            resolve();
                        }
                    });

                    req.on('error', (e) => {
                        // Server not ready yet - continue checking
                    });

                    req.setTimeout(1000);
                }, 500);

                // Timeout - assume server started after 15 seconds
                setTimeout(() => {
                    if (!isResolved) {
                        clearInterval(healthCheck);
                        console.log('[Electron] Server startup timeout (15s)');
                        console.log('[Electron] Process had output:', hasOutput);
                        console.log('[Electron] Process alive:', serverProcess && !serverProcess.killed);

                        if (hasOutput && serverProcess && !serverProcess.killed) {
                            console.log('[Electron] Assuming server is running');
                            isResolved = true;
                            resolve();
                        } else {
                            reject(new Error('Server startup timeout - no output received'));
                        }
                    }
                }, 15000);
            } catch (err) {
                console.error('[Electron] startServer error:', err);
                if (!isResolved) {
                    reject(err);
                }
            }
        })();
    });
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}

// IPC Handlers
ipcMain.handle('app-version', () => {
    return app.getVersion();
});

ipcMain.handle('app-name', () => {
    return 'Brox Scraper';
});

app.on('ready', async () => {
    try {
        console.log('[Electron] App ready, starting server...');
        console.log('[Electron] index.js path:', mainScriptPath);
        console.log('[Electron] index.js exists:', fs.existsSync(mainScriptPath));

        await startServer();
        console.log('[Electron] Server started successfully');

        // Wait a bit for server to fully start
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('[Electron] Creating window...');
        createWindow();
        console.log('[Electron] Window created successfully');
    } catch (err) {
        console.error('[Electron] Startup error:', err);
        console.error('[Electron] Error message:', err.message);
        console.error('[Electron] Error stack:', err.stack);

        // Show error with null parent (will use system default)
        dialog.showErrorBox('স্টার্টআপ ত্রুটি', 'অ্যাপ্লিকেশন শুরু করতে ব্যর্থ হয়েছে: ' + (err.message || 'অজানা ত্রুটি'));
        app.quit();
    }
});

app.on('window-all-closed', () => {
    // On Windows and Linux, do not quit when window closes
    // Only quit on macOS when all windows are closed
    if (process.platform === 'darwin') {
        app.quit();
    }
    // On Windows/Linux, keep the app running
});

app.on('activate', async () => {
    // On macOS, re-create window and restart server if needed
    try {
        if (mainWindow === null) {
            // Check if server is still running
            if (!serverProcess || serverProcess.killed) {
                console.log('Server not running, restarting...');
                await startServer();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            createWindow();
        }
    } catch (err) {
        console.error('Error on activate:', err);
    }
});

app.on('before-quit', () => {
    stopServer();
});

// Handle any uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    dialog.showErrorBox('ত্রুটি', 'একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।');
});
