const { BrowserWindow } = require('electron');

let selectorWindow = null;
let claudeSettingsWindow = null;

function register(ipcMain, { state, createPopupWindow }) {
  ipcMain.on('window-minimize', (e) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) win.minimize(); });
  ipcMain.on('window-maximize', (e) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
  ipcMain.on('window-close', (e) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) win.close(); });

  ipcMain.handle('open-project-selector', () => {
    if (selectorWindow && !selectorWindow.isDestroyed()) { selectorWindow.show(); selectorWindow.focus(); return; }
    selectorWindow = createPopupWindow('project-selector', { width: 720, height: 560, title: '选择项目' });
    selectorWindow.on('closed', () => { selectorWindow = null; });
  });
  ipcMain.handle('open-claude-settings', () => {
    if (claudeSettingsWindow && !claudeSettingsWindow.isDestroyed()) { claudeSettingsWindow.show(); claudeSettingsWindow.focus(); return; }
    claudeSettingsWindow = createPopupWindow('claude-settings', { width: 800, height: 640, title: 'Claude 全局设置' });
    claudeSettingsWindow.on('closed', () => { claudeSettingsWindow = null; });
  });
  ipcMain.on('close-popup', (event) => {
    try { const win = BrowserWindow.fromWebContents(event.sender); if (win && !win.isDestroyed()) win.destroy(); } catch {}
  });
}

module.exports = { register };
