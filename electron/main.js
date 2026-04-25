const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, nativeTheme, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('./pty');

const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude-tool-electron');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const PROJECTS_PATH = path.join(DATA_DIR, 'data', 'projects.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;
const preloadPath = path.join(__dirname, 'preload.js');
const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');

function getLoadURL(hash) {
  const isDev = process.argv.includes('--dev') || process.env.CLAUDE_TOOL_DEV === '1';
  if (isDev) return `http://localhost:5173${hash ? '#' + hash : ''}`;
  const url = 'file:///' + distIndexPath.replace(/\\/g, '/');
  return hash ? `${url}#${hash}` : url;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error('readJson error:', e);
  }
  return fallback;
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}

function getDefaultConfig() {
  return {
    theme: 'light',
    claudeCliPath: 'claude',
    windowWidth: 1280,
    windowHeight: 800,
    windowX: -1,
    windowY: -1,
    closeAction: 'ask', // 'ask' | 'minimize' | 'quit'
    uiFontSize: 14,
    editorFontSize: 13,
    terminalFontSize: 14,
    treeFontSize: 13,
  };
}

function migrateOldData() {
  const oldDir = path.join(process.env.USERPROFILE || process.env.HOME, '.claude-tool');
  const oldProjects = path.join(oldDir, 'data', 'projects.json');
  if (!fs.existsSync(oldProjects) || fs.existsSync(PROJECTS_PATH)) return;

  try {
    const old = JSON.parse(fs.readFileSync(oldProjects, 'utf-8'));
    const migrated = old.map(p => ({
      ...p,
      status: p.status ? p.status.toLowerCase() : 'active',
      lastOpenedAt: p.updatedAt || new Date().toISOString(),
    }));
    ensureDir(path.dirname(PROJECTS_PATH));
    writeJson(PROJECTS_PATH, migrated);
  } catch (e) {
    console.error('Migration error:', e);
  }
}

function cleanupStaleProjects() {
  try {
    const projects = readJson(PROJECTS_PATH, []);
    if (projects.length === 0) return;
    const valid = projects.filter(p => {
      if (!p.path) return false;
      try { return fs.statSync(p.path).isDirectory(); } catch { return false; }
    });
    if (valid.length < projects.length) {
      writeJson(PROJECTS_PATH, valid);
    }
  } catch (e) {
    console.error('cleanupStaleProjects error:', e);
  }
}

function createWindow() {
  const config = readJson(CONFIG_PATH, getDefaultConfig());
  nativeTheme.themeSource = config.theme === 'dark' ? 'dark' : 'light';

  mainWindow = new BrowserWindow({
    width: config.windowWidth || 1280,
    height: config.windowHeight || 800,
    minWidth: 960,
    minHeight: 600,
    ...(config.windowX >= 0 && config.windowY >= 0 ? { x: config.windowX, y: config.windowY } : {}),
    frame: true,
    show: false,
    autoHideMenuBar: true,
    title: 'Claude Tool',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = getLoadURL('');
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Auto-open last used project
    const projects = readJson(PROJECTS_PATH, []);
    if (projects.length > 0) {
      const sorted = [...projects].sort((a, b) =>
        (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '')
      );
      const lastProject = sorted[0];
      if (lastProject && lastProject.id) {
        const url2 = getLoadURL('workspace/' + lastProject.id);
        const win = new BrowserWindow({
          width: 1280, height: 800, minWidth: 960, minHeight: 600,
          frame: true, title: lastProject.name, show: false,
          autoHideMenuBar: true,
          webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
        });
        win.loadURL(url2);
        win.once('ready-to-show', () => win.show());
        win.on('closed', () => {
          openProjectWindows.delete(lastProject.id);
          if (openProjectWindows.size === 0 && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            isQuitting = true;
            tray?.destroy(); tray = null;
            mainWindow.destroy();
            app.quit();
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
    const hasOpenProjects = [...openProjectWindows.values()].some(w => !w.isDestroyed());
    if (hasOpenProjects) {
      mainWindow.hide();
    } else {
      isQuitting = true;
      tray?.destroy();
      tray = null;
      mainWindow.destroy();
      app.quit();
    }
  });
}

function createPopupWindow(hash, opts) {
  const url = getLoadURL(hash);
  const win = new BrowserWindow({
    width: opts.width || 720,
    height: opts.height || 560,
    minWidth: opts.minWidth || 480,
    minHeight: opts.minHeight || 400,
    frame: true,
    title: opts.title || '',
    resizable: true,
    parent: mainWindow,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(url);
  win.once('ready-to-show', () => win.show());
  return win;
}

let selectorWindow = null;
let claudeSettingsWindow = null;

function saveWindowState() {
  if (!mainWindow) return;
  const config = readJson(CONFIG_PATH, getDefaultConfig());
  const [w, h] = mainWindow.getSize();
  const [x, y] = mainWindow.getPosition();
  Object.assign(config, { windowWidth: w, windowHeight: h, windowX: x, windowY: y });
  writeJson(CONFIG_PATH, config);
}

function setupTray() {
  // Generate a tray icon using a small PNG data URL
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
      if (inC) {
        pixels[i] = 74; pixels[i+1] = 144; pixels[i+2] = 217; pixels[i+3] = 255;
      }
    }
  }
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromBitmap(pixels, { width: size, height: size });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; tray?.destroy(); tray = null; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); app.quit(); } },
  ]);
  tray.setToolTip('Claude Tool');
  tray.setContextMenu(menu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// IPC handlers
ipcMain.handle('get-config', () => readJson(CONFIG_PATH, getDefaultConfig()));
ipcMain.handle('save-config', (_, config) => {
  nativeTheme.themeSource = config.theme === 'dark' ? 'dark' : 'light';
  writeJson(CONFIG_PATH, config);
});
ipcMain.handle('get-projects', () => readJson(PROJECTS_PATH, []));
ipcMain.handle('save-projects', (_, projects) => writeJson(PROJECTS_PATH, projects));

// Claude global settings
const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CLAUDE_LOCAL_SETTINGS = path.join(CLAUDE_DIR, 'settings.local.json');
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');

ipcMain.handle('get-claude-settings', () => readJson(CLAUDE_SETTINGS, {}));
ipcMain.handle('save-claude-settings', (_, data) => {
  writeJson(CLAUDE_SETTINGS, data);
  return true;
});
ipcMain.handle('get-claude-local-settings', () => readJson(CLAUDE_LOCAL_SETTINGS, {}));
ipcMain.handle('save-claude-local-settings', (_, data) => {
  writeJson(CLAUDE_LOCAL_SETTINGS, data);
  return true;
});
ipcMain.handle('get-claude-md', () => {
  try { return fs.readFileSync(CLAUDE_MD, 'utf-8'); } catch { return ''; }
});
ipcMain.handle('save-claude-md', (_, content) => {
  fs.writeFileSync(CLAUDE_MD, content, 'utf-8');
  return true;
});
ipcMain.handle('get-claude-dir', () => CLAUDE_DIR);

// Project-level Claude settings
ipcMain.handle('get-project-settings', (_, projectPath) => {
  const p = path.join(projectPath, '.claude', 'settings.local.json');
  return readJson(p, {});
});
ipcMain.handle('save-project-settings', (_, projectPath, data) => {
  const p = path.join(projectPath, '.claude', 'settings.local.json');
  ensureDir(path.dirname(p));
  writeJson(p, data);
  return true;
});
ipcMain.handle('get-project-claude-md', (_, projectPath) => {
  const p = path.join(projectPath, 'CLAUDE.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
});
ipcMain.handle('save-project-claude-md', (_, projectPath, content) => {
  const p = path.join(projectPath, 'CLAUDE.md');
  fs.writeFileSync(p, content, 'utf-8');
  return true;
});
ipcMain.handle('get-project-rules', (_, projectPath) => {
  const rulesDir = path.join(projectPath, '.claude', 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  try {
    return fs.readdirSync(rulesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(rulesDir, f), 'utf-8'),
      }));
  } catch { return []; }
});
ipcMain.handle('save-project-rule', (_, projectPath, name, content) => {
  const rulesDir = path.join(projectPath, '.claude', 'rules');
  ensureDir(rulesDir);
  const filePath = path.join(rulesDir, name.endsWith('.md') ? name : name + '.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});
ipcMain.handle('delete-project-rule', (_, projectPath, name) => {
  const filePath = path.join(projectPath, '.claude', 'rules', name);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); return true; } catch { return false; }
});

// Global Claude rules (~/.claude/rules/)
ipcMain.handle('get-global-rules', () => {
  const rulesDir = path.join(CLAUDE_DIR, 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  try {
    return fs.readdirSync(rulesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(rulesDir, f), 'utf-8'),
      }));
  } catch { return []; }
});
ipcMain.handle('save-global-rule', (_, name, content) => {
  const rulesDir = path.join(CLAUDE_DIR, 'rules');
  ensureDir(rulesDir);
  const filePath = path.join(rulesDir, name.endsWith('.md') ? name : name + '.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});
ipcMain.handle('delete-global-rule', (_, name) => {
  const filePath = path.join(CLAUDE_DIR, 'rules', name);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); return true; } catch { return false; }
});
ipcMain.handle('scan-claude-projects', () => {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dirName = e.name;
        const fullDir = path.join(projectsDir, dirName);
        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'));

        // Extract real path from session jsonl (cwd field)
        let realPath = '';
        for (const f of files) {
          try {
            const content = fs.readFileSync(path.join(fullDir, f), 'utf-8');
            const cwdMatch = content.match(/"cwd"\s*:\s*"([^"]+)"/);
            if (cwdMatch) {
              realPath = cwdMatch[1].replace(/\\\\/g, '\\');
              break;
            }
          } catch {}
        }

        if (!realPath) return null;
        // Skip non-existent paths
        try { if (!fs.statSync(realPath).isDirectory()) return null; } catch { return null; }

        const sessionCount = files.length;
        const lastModified = files
          .map(f => { try { return fs.statSync(path.join(fullDir, f)).mtime; } catch { return new Date(0); } })
          .reduce((a, b) => a > b ? a : b, new Date(0));

        return {
          dirName,
          path: realPath,
          name: path.basename(realPath),
          sessionCount,
          lastModified: lastModified.toISOString(),
        };
      })
      .filter(p => p !== null && p.sessionCount > 0)
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  } catch (e) {
    console.error('scan-claude-projects error:', e);
    return [];
  }
});

// Session management
const claudeDirCache = new Map();
function getProjectClaudeDir(projectPath) {
  if (claudeDirCache.has(projectPath)) {
    const cached = claudeDirCache.get(projectPath);
    // cache hit
    return cached;
  }
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) {
    return null;
    return null;
  }
  try {
    for (const dirName of fs.readdirSync(projectsDir)) {
      const dirPath = path.join(projectsDir, dirName);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
          const lines = content.split('\n').filter(Boolean);
          // cwd may be on line 2+, not line 1
          for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const o = JSON.parse(lines[i]);
            if (o.cwd && path.resolve(o.cwd) === path.resolve(projectPath)) {
              claudeDirCache.set(projectPath, dirPath);
              return dirPath;
            }
          }
        } catch {}
      }
    }
  } catch (e) { console.error('[watcher] getProjectClaudeDir 扫描错误:', e.message); }
  return null;
}

ipcMain.handle('get-sessions', (_, projectPath) => {
  const dir = getProjectClaudeDir(projectPath);
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    return files.map(f => {
      const filePath = path.join(dir, f);
      const sessionId = f.replace('.jsonl', '');
      let firstUserMsg = '';
      let messageCount = 0;
      let startTime = '';
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        startTime = lines[0] ? JSON.parse(lines[0]).timestamp || '' : '';
        for (const line of lines) {
          try {
            const o = JSON.parse(line);
            if (o.type === 'user' && o.message) {
              messageCount++;
              const c = o.message.content;
              const text = Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text || '').join(' ') : typeof c === 'string' ? c : '';
              if (!firstUserMsg && text.trim()) firstUserMsg = text.trim().slice(0, 200);
            } else if (o.type === 'assistant') {
              messageCount++;
            }
          } catch {}
        }
      } catch {}
      const stat = fs.statSync(filePath);
      return {
        sessionId,
        title: firstUserMsg || sessionId.slice(0, 8),
        messageCount,
        startTime,
        lastModified: stat.mtime.toISOString(),
        size: stat.size,
      };
    }).sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  } catch (e) { return []; }
});

ipcMain.handle('get-last-session-time', (_, projectPath) => {
  const dir = getProjectClaudeDir(projectPath);
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    let latest = null;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
      const stat = fs.statSync(path.join(dir, f));
      if (!latest || stat.mtime > latest) latest = stat.mtime;
    }
    return latest ? latest.toISOString() : null;
  } catch { return null; }
});

ipcMain.handle('get-session-messages', (_, projectPath, sessionId) => {
  const dir = getProjectClaudeDir(projectPath);
  if (!dir) return [];
  const filePath = path.join(dir, sessionId + '.jsonl');
  if (!fs.existsSync(filePath)) return [];
  try {
    const messages = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const o = JSON.parse(line);
        if (o.type === 'user' && o.message) {
          const c = o.message.content;
          const text = Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text || '').join('\n') : typeof c === 'string' ? c : '';
          if (text.trim()) messages.push({ role: 'user', text: text.trim(), ts: o.timestamp });
        } else if (o.type === 'assistant' && o.message) {
          const c = o.message.content;
          const texts = Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text || '').join('\n') : typeof c === 'string' ? c : '';
          if (texts.trim()) messages.push({ role: 'assistant', text: texts.trim(), ts: o.timestamp });
        } else if (o.type === 'summary' && o.summary) {
          messages.push({ role: 'system', text: o.summary.toString().slice(0, 500), ts: o.timestamp });
        }
      } catch {}
    }
    return messages;
  } catch (e) { return []; }
});

ipcMain.handle('delete-session', (_, projectPath, sessionId) => {
  const dir = getProjectClaudeDir(projectPath);
  if (!dir) return false;
  const filePath = path.join(dir, sessionId + '.jsonl');
  const subDir = path.join(dir, sessionId);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(subDir)) fs.rmSync(subDir, { recursive: true });
    return true;
  } catch { return false; }
});
ipcMain.handle('open-directory', (_, p) => {
  const { shell } = require('electron');
  shell.openPath(p);
});
ipcMain.handle('open-native-terminal', (_, cwd) => {
  const { spawn } = require('child_process');
  const escaped = cwd.replace(/"/g, '\\"');
  spawn('cmd.exe', ['/c', `start cmd.exe /K "cd /d \\"${escaped}\\"" || echo 无法跳转到目录`], { detached: true, stdio: 'ignore' }).unref();
});
ipcMain.handle('open-directory-picker', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('open-file-picker', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('detect-claude-cli', () => {
  try {
    const result = require('child_process').execSync('where claude', { encoding: 'utf-8' }).trim();
    return result.split('\n')[0].trim();
  } catch {
    return null;
  }
});
ipcMain.handle('export-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择备份保存位置' });
  if (result.canceled) return false;
  const backupDir = result.filePaths[0];
  if (fs.existsSync(PROJECTS_PATH)) {
    fs.copyFileSync(PROJECTS_PATH, path.join(backupDir, 'projects.json'));
  }
  return true;
});
ipcMain.handle('import-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择备份目录' });
  if (result.canceled) return false;
  const src = path.join(result.filePaths[0], 'projects.json');
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(PROJECTS_PATH));
  fs.copyFileSync(src, PROJECTS_PATH);
  return true;
});

// File operations
const IGNORED_DIRS = new Set(['node_modules', '.git', '__pycache__', '.next', '.nuxt', 'dist', '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath).toLowerCase();
  const projects = readJson(PROJECTS_PATH, []);
  return projects.some(p => resolved.startsWith(path.resolve(p.path).toLowerCase() + path.sep) || resolved === path.resolve(p.path).toLowerCase());
}

ipcMain.handle('read-dir', (_, dirPath) => {
  if (!isPathAllowed(dirPath)) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(dirPath, e.name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            path: fullPath,
            type: e.isDirectory() ? 'dir' : 'file',
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch { return []; }
});
ipcMain.handle('read-file', (_, filePath) => {
  if (!isPathAllowed(filePath)) return { error: '路径不在项目范围内' };
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return { error: '文件超过 2MB 限制' };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, size: stat.size };
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('write-file', (_, filePath, content) => {
  if (!isPathAllowed(filePath)) return false;
  try {
    atomicWrite(filePath, content);
    return true;
  } catch { return false; }
});

ipcMain.handle('create-file', (_, filePath) => {
  if (!isPathAllowed(filePath)) return false;
  try {
    if (fs.existsSync(filePath)) return false;
    atomicWrite(filePath, '');
    return true;
  } catch { return false; }
});

ipcMain.handle('create-dir', (_, dirPath) => {
  if (!isPathAllowed(dirPath)) return false;
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch { return false; }
});

ipcMain.handle('rename-path', (_, oldPath, newPath) => {
  if (!isPathAllowed(oldPath) || !isPathAllowed(newPath)) return false;
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch { return false; }
});

ipcMain.handle('delete-path', (_, targetPath) => {
  if (!isPathAllowed(targetPath)) return false;
  try {
    if (fs.statSync(targetPath).isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    return true;
  } catch { return false; }
});

// File watchers
const watchers = new Map();
ipcMain.handle('watch-dir', (e, dirPath) => {
  if (!isPathAllowed(dirPath)) return;
  if (watchers.has(dirPath)) return;
  try {
    const w = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const segs = filename.split(/[/\\]/);
      if (segs.some(s => IGNORED_DIRS.has(s) || s.startsWith('.'))) return;
      try { e.sender.send('fs-change', { type: eventType, filename, dir: dirPath }); } catch {}
    });
    watchers.set(dirPath, { watcher: w, sender: e.sender });
  } catch {}
});

ipcMain.handle('unwatch-dir', (_, dirPath) => {
  const entry = watchers.get(dirPath);
  if (entry) { entry.watcher.close(); watchers.delete(dirPath); }
});

ipcMain.on('window-minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.minimize();
});
ipcMain.on('window-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

// PTY IPC
ipcMain.handle('pty:create', (event, sessionId, cwd, cols, rows) => {
  const ptyProcess = pty.createPty(sessionId, cwd, cols, rows);
  if (!ptyProcess) return false;
  const senderWebContents = event.sender;
  ptyProcess.onData((data) => {
    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send('pty:data', sessionId, data);
    }
  });
  ptyProcess.onExit(({ exitCode }) => {
    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send('pty:exit', sessionId, exitCode);
    }
    if (exitCode !== 0) {
    }
  });
  return true;
});
ipcMain.on('pty:write', (_, sessionId, data) => pty.writePty(sessionId, data));
ipcMain.on('pty:resize', (_, sessionId, cols, rows) => pty.resizePty(sessionId, cols, rows));
ipcMain.handle('pty:kill', (_, sessionId) => { pty.killPty(sessionId); return true; });

// Popup windows
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
const openProjectWindows = new Map();



ipcMain.on('select-project', (_, projectId) => {
  if (selectorWindow && !selectorWindow.isDestroyed()) selectorWindow.close();
  // Check if project already open
  const existing = openProjectWindows.get(projectId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  // Open new window for project
  const config = readJson(CONFIG_PATH, getDefaultConfig());
  const projects = readJson(PROJECTS_PATH, []);
  const proj = projects.find(p => p.id === projectId);
  const title = proj ? proj.name : 'Claude Tool';
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: true,
    title,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const url = getLoadURL('workspace/' + projectId);
  win.loadURL(url);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    openProjectWindows.delete(projectId);
    // If no project windows left and main window is hidden, quit
    if (openProjectWindows.size === 0 && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      isQuitting = true;
      tray?.destroy();
      tray = null;
      mainWindow.destroy();
      app.quit();
    }
  });
  openProjectWindows.set(projectId, win);
});
ipcMain.on('close-popup', (event) => {
  try {
    const wc = event.sender;
    const win = BrowserWindow.fromWebContents(wc);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  } catch (e) {
    console.error('close-popup error:', e);
  }
});

// App lifecycle
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  try { dialog.showErrorBox('启动错误', err.message || String(err)); } catch {}
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    ensureDir(DATA_DIR);
    ensureDir(path.join(DATA_DIR, 'data'));
    migrateOldData();
    cleanupStaleProjects();
    createWindow();
    setupTray();
  });
}

app.on('before-quit', () => {
  pty.killAll();
  if (mainWindow && !mainWindow.isDestroyed()) saveWindowState();
});

app.on('window-all-closed', () => {
  // keep running in tray
});
