const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),
  clearSession: () => ipcRenderer.invoke('clear-session')
});
