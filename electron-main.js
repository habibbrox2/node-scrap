const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

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
    mainWindow = new BrowserWindow({
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
        icon: path.join(__dirname, 'assets', 'icon.png'),
    });

    mainWindow.loadURL(SERVER_URL);

    // Open DevTools in development
    // mainWindow.webContents.openDevTools();

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
    return new Promise(async (resolve, reject) => {
        // Check if server is already running
        if (serverProcess && !serverProcess.killed) {
            console.log('Server already running');
            resolve();
            return;
        }

        // Check if port is in use
        const portInUse = await isPortInUse(SERVER_PORT);
        if (portInUse) {
            console.log(`Port ${SERVER_PORT} already in use, killing existing process...`);
            // Try to kill any existing process on this port
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/IM', 'node.exe'], { stdio: 'ignore' });
            } else {
                spawn('killall', ['node'], { stdio: 'ignore' });
            }
            // Wait a bit for the port to be freed
            await new Promise(r => setTimeout(r, 1000));
        }

        // Start the Node.js server
        serverProcess = spawn('node', [mainScriptPath], {
            stdio: 'pipe',
            shell: false,
            detached: false,
        });

        let isResolved = false;

        serverProcess.stdout.on('data', (data) => {
            console.log(`[Server] ${data}`);
            if (!isResolved && (data.toString().includes('listening') || data.toString().includes('Server running') || data.toString().includes('PORT'))) {
                isResolved = true;
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server Error] ${data}`);
        });

        serverProcess.on('error', (err) => {
            console.error('Failed to start server:', err);
            if (!isResolved) {
                isResolved = true;
                reject(err);
            }
        });

        serverProcess.on('exit', (code) => {
            console.log(`Server exited with code ${code}`);
        });

        // Timeout - assume server started after 5 seconds
        setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                resolve();
            }
        }, 5000);
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
        console.log('শুরু করা হচ্ছে...');
        await startServer();
        console.log('সার্ভার শুরু হয়েছে');

        // Wait a bit for server to fully start
        await new Promise(resolve => setTimeout(resolve, 1000));

        createWindow();
    } catch (err) {
        console.error('ত্রুটি:', err);
        dialog.showErrorBox('স্টার্টআপ ত্রুটি', 'অ্যাপ্লিকেশন শুরু করতে ব্যর্থ হয়েছে।');
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
