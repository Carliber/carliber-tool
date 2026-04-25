const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('./pty');
const shared = require('./shared');
const { getDefaultConfig } = require('./ipc/config');

const { DATA_DIR, CONFIG_PATH, PROJECTS_PATH, readJson, writeJson, ensureDir, getProjects, setProjects, log } = shared;
const preloadPath = path.join(__dirname, 'preload.js');
const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
const isDev = process.argv.includes('--dev') || process.env.CLAUDE_TOOL_DEV === '1';

function setupCsp() {
  if (isDev) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'"
        ],
      },
    });
  });
}

log('INFO', '=== Claude Tool starting ===');
log('INFO', 'Node:', process.version, 'Electron:', process.versions.electron);

let mainWindow = null;
let tray = null;
let isQuitting = false;
const openProjectWindows = new Map();

function getLoadURL(hash) {
  if (isDev) return `http://localhost:5173${hash ? '#' + hash : ''}`;
  const url = 'file:///' + distIndexPath.replace(/\\/g, '/');
  return hash ? `${url}#${hash}` : url;
}

function createPopupWindow(hash, opts) {
  const url = getLoadURL(hash);
  const win = new BrowserWindow({
    width: opts.width || 720, height: opts.height || 560, minWidth: opts.minWidth || 480, minHeight: opts.minHeight || 400,
    frame: true, title: opts.title || '', resizable: true, parent: mainWindow, modal: false, show: false, autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(url);
  win.once('ready-to-show', () => win.show());
  return win;
}

function saveWindowState() {
  if (!mainWindow) return;
  const config = readJson(CONFIG_PATH, getDefaultConfig());
  const [w, h] = mainWindow.getSize();
  const [x, y] = mainWindow.getPosition();
  Object.assign(config, { windowWidth: w, windowHeight: h, windowX: x, windowY: y });
  writeJson(CONFIG_PATH, config);
}

function createWindow() {
  const config = readJson(CONFIG_PATH, getDefaultConfig());
  nativeTheme.themeSource = config.theme === 'dark' ? 'dark' : 'light';
  mainWindow = new BrowserWindow({
    width: config.windowWidth || 1280, height: config.windowHeight || 800, minWidth: 960, minHeight: 600,
    ...(config.windowX >= 0 && config.windowY >= 0 ? { x: config.windowX, y: config.windowY } : {}),
    frame: true, show: false, autoHideMenuBar: true, title: 'Claude Tool',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(getLoadURL(''));
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    log('ERROR', 'Render process crashed:', JSON.stringify(details));
  });
  mainWindow.webContents.on('console-message', (_, level, message, line, source) => {
    if (level >= 2) log('ERROR', `Renderer [${source}:${line}] ${message}`);
  });
  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log('ERROR', 'Failed to load:', code, desc);
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const projects = getProjects();
    if (projects.length > 0) {
      const sorted = [...projects].sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''));
      const lastProject = sorted[0];
      if (lastProject && lastProject.id) {
        const win = new BrowserWindow({
          width: 1280, height: 800, minWidth: 960, minHeight: 600, frame: true,
          title: lastProject.name, show: false, autoHideMenuBar: true,
          webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
        });
        win.loadURL(getLoadURL('workspace/' + lastProject.id));
        win.once('ready-to-show', () => win.show());
        win.on('closed', () => {
          openProjectWindows.delete(lastProject.id);
          if (openProjectWindows.size === 0 && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            isQuitting = true; tray?.destroy(); tray = null; mainWindow.destroy(); app.quit();
          }
        });
        openProjectWindows.set(lastProject.id, win);
        mainWindow.hide();
      }
    }
  });
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    saveWindowState();
    if ([...openProjectWindows.values()].some(w => !w.isDestroyed())) { mainWindow.hide(); }
    else { isQuitting = true; tray?.destroy(); tray = null; mainWindow.destroy(); app.quit(); }
  });
}

function setupTray() {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = 7.5, cy = 7.5, r = 6;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inRing = dist <= r && dist >= r - 2.5;
      const inC = inRing && !(x > cx + 1.5 && dy > -3 && dy < 3);
      if (inC) { pixels[i] = 74; pixels[i+1] = 144; pixels[i+2] = 217; pixels[i+3] = 255; }
    }
  }
  let trayIcon;
  try { trayIcon = nativeImage.createFromBitmap(pixels, { width: size, height: size }); } catch { trayIcon = nativeImage.createEmpty(); }
  tray = new Tray(trayIcon);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; tray?.destroy(); tray = null; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); app.quit(); } },
  ]));
  tray.setToolTip('Claude Tool');
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// Register IPC handlers
const ipcDeps = { mainWindow: () => mainWindow, dialog, createPopupWindow, state: { get openProjectWindows() { return openProjectWindows; }, get isQuitting() { return isQuitting; }, set isQuitting(v) { isQuitting = v; }, get tray() { return tray; }, set tray(v) { tray = v; } } };

const ipcModules = [
  ['./ipc/config', []],
  ['./ipc/projects', []],
  ['./ipc/claude-settings', []],
  ['./ipc/sessions', []],
  ['./ipc/system', [{ mainWindow: () => mainWindow, dialog }]],
  ['./ipc/files', []],
  ['./ipc/windows', [{ state: ipcDeps.state, createPopupWindow }]],
  ['./ipc/pty', []],
];
for (const [mod, args] of ipcModules) {
  try {
    require(mod).register(ipcMain, ...args);
    log('INFO', 'IPC registered:', mod);
  } catch (e) {
    log('ERROR', 'IPC register FAILED:', mod, e.message);
  }
}

// select-project stays here (tight coupling to mainWindow/openProjectWindows/tray/isQuitting)
ipcMain.on('select-project', (_, projectId) => {
  // close selector if open
  const allWins = BrowserWindow.getAllWindows();
  for (const w of allWins) { try { const url = w.webContents.getURL(); if (url.includes('project-selector')) { w.close(); break; } } catch {} }

  const existing = openProjectWindows.get(projectId);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const projects = getProjects();
  const proj = projects.find(p => p.id === projectId);
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600, frame: true,
    title: proj ? proj.name : 'Claude Tool', show: false, autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(getLoadURL('workspace/' + projectId));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    pty.killByOwner(win.webContents.id);
    openProjectWindows.delete(projectId);
    if (openProjectWindows.size === 0 && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      isQuitting = true; tray?.destroy(); tray = null; mainWindow.destroy(); app.quit();
    }
  });
  openProjectWindows.set(projectId, win);
});

// Renderer error reporting
ipcMain.on('renderer-error', (_, { message, source, line, col, error }) => {
  log('ERROR', `Renderer error: ${message} at ${source}:${line}:${col}`, error);
});

// App lifecycle
process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught Exception:', err.message, err.stack);
  try { dialog.showErrorBox('启动错误', err.message || String(err)); } catch {}
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    setupCsp();
    ensureDir(DATA_DIR);
    ensureDir(path.join(DATA_DIR, 'data'));
    // migrate old data
    const oldProjects = path.join(process.env.USERPROFILE || process.env.HOME, '.claude-tool', 'data', 'projects.json');
    if (fs.existsSync(oldProjects) && !fs.existsSync(PROJECTS_PATH)) {
      try {
        const migrated = JSON.parse(fs.readFileSync(oldProjects, 'utf-8')).map(p => ({
          ...p, status: p.status ? p.status.toLowerCase() : 'active', lastOpenedAt: p.updatedAt || new Date().toISOString(),
        }));
        writeJson(PROJECTS_PATH, migrated);
      } catch (e) { console.error('Migration error:', e); }
    }
    // cleanup stale projects
    try {
      const projects = getProjects();
      const valid = projects.filter(p => { if (!p.path) return false; try { return fs.statSync(p.path).isDirectory(); } catch { return false; } });
      if (valid.length < projects.length) { setProjects(valid); writeJson(PROJECTS_PATH, valid); }
    } catch {}
    log('INFO', 'App ready, creating window...');
    createWindow();
    setupTray();
    log('INFO', 'Window created, log file:', path.join(DATA_DIR, 'app.log'));
  });
}
app.on('before-quit', () => { pty.killAll(); if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(); });
app.on('window-all-closed', () => {});
