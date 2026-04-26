const { BrowserWindow, screen } = require('electron');

let selectorWindow = null;
let claudeSettingsWindow = null;

const maximizedState = new WeakMap();

function toggleMaximize(win) {
  if (!win) return;
  const prev = maximizedState.get(win);
  if (prev) {
    win.setBounds(prev);
    maximizedState.delete(win);
  } else {
    maximizedState.set(win, win.getBounds());
    const display = screen.getDisplayMatching(win.getBounds());
    const wa = display.workArea;
    const db = display.bounds;
    let { x, y, width, height } = wa;
    if (wa.width === db.width && wa.height === db.height && wa.x === db.x && wa.y === db.y) {
      height -= 48;
    }
    win.setBounds({ x, y, width, height });
  }
}

function register(ipcMain, { state, createPopupWindow }) {
  ipcMain.on('window-minimize', (e) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) win.minimize(); });
  ipcMain.on('window-maximize', (e) => { const win = BrowserWindow.fromWebContents(e.sender); toggleMaximize(win); });
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
