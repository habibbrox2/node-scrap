const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getVersion: () => ipcRenderer.invoke('app-version'),
    getAppName: () => ipcRenderer.invoke('app-name'),
});
