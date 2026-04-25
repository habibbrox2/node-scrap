const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;
const SERVER_PORT = 9999;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Path to the main index.js
const mainScriptPath = path.join(__dirname, 'index.js');

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
        // Start the Node.js server
        serverProcess = spawn('node', [mainScriptPath], {
            stdio: 'pipe',
            shell: true,
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`[Server] ${data}`);
            if (data.toString().includes('listening') || data.toString().includes('Server running')) {
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server Error] ${data}`);
        });

        serverProcess.on('error', (err) => {
            console.error('Failed to start server:', err);
            reject(err);
        });

        // Timeout - assume server started after 3 seconds
        setTimeout(() => {
            resolve();
        }, 3000);
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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
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
