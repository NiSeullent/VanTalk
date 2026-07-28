/**
 * VanTalk hybrid shell — opens the hosted web client.
 * Full local LOCO/Java clients are discontinued as of v2026.7.29.
 */
const { app, BrowserWindow, shell } = require('electron');

const APP_URL = process.env.VANTALK_APP_URL || 'https://vantalk.nyase.kr/';
const VERSION = '2026.7.29';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: `Van톡 ${VERSION}`,
    webPreferences: {
      preload: require('path').join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
