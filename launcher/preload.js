const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  gameLaunch: (payload) => ipcRenderer.invoke('game-launch', payload),
  gameKill: () => ipcRenderer.invoke('game-kill'),
  gameStatus: () => ipcRenderer.invoke('game-status'),
  onGameEvent: (cb) => ipcRenderer.on('game-event', (_e, msg) => cb(msg))
});
