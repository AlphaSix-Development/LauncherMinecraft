const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getSessionPath() {
  return path.join(app.getPath('userData'), 'session.json');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { apiUrl: 'http://localhost:3001', serverName: 'Mon Serveur Minecraft' };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  const config = readConfig();
  // Expose la config au renderer via variable globale sûre (preload la relit aussi)
  globalThis.__APP_CONFIG__ = config;
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Session persistante (token + user) ---
ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('get-session', () => {
  try {
    const raw = fs.readFileSync(getSessionPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('save-session', (e, session) => {
  fs.writeFileSync(getSessionPath(), JSON.stringify(session, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('clear-session', () => {
  try { fs.unlinkSync(getSessionPath()); } catch {}
  return true;
});
