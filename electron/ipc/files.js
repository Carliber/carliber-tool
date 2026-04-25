const path = require('path');
const fs = require('fs');
const { IGNORED_DIRS, MAX_FILE_SIZE, atomicWrite, getProjects } = require('../shared');

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function normalizePath(p) {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

function isPathAllowed(filePath) {
  const resolved = normalizePath(path.resolve(filePath));
  const projects = getProjects();
  return projects.some(p => {
    const projPath = normalizePath(path.resolve(p.path));
    return resolved.startsWith(projPath + path.sep) || resolved === projPath;
  });
}

const watchers = new Map();

function register(ipcMain) {
  ipcMain.handle('read-dir', (_, dirPath) => {
    if (!isPathAllowed(dirPath)) return [];
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(e => !IGNORED_DIRS.has(e.name))
        .map(e => {
          const fullPath = path.join(dirPath, e.name);
          try {
            const stat = fs.statSync(fullPath);
            return { name: e.name, path: fullPath, type: e.isDirectory() ? 'dir' : 'file', size: stat.size, mtime: stat.mtime.toISOString() };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => { if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name); });
    } catch { return []; }
  });

  ipcMain.handle('read-file', (_, filePath) => {
    if (!isPathAllowed(filePath)) return { error: '路径不在项目范围内' };
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return { error: '文件超过 2MB 限制' };
      return { content: fs.readFileSync(filePath, 'utf-8'), size: stat.size };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('write-file', (_, filePath, content) => {
    if (!isPathAllowed(filePath)) return false;
    try { atomicWrite(filePath, content); return true; } catch { return false; }
  });
  ipcMain.handle('create-file', (_, filePath) => {
    if (!isPathAllowed(filePath)) return false;
    try { if (fs.existsSync(filePath)) return false; atomicWrite(filePath, ''); return true; } catch { return false; }
  });
  ipcMain.handle('create-dir', (_, dirPath) => {
    if (!isPathAllowed(dirPath)) return false;
    try { fs.mkdirSync(dirPath, { recursive: true }); return true; } catch { return false; }
  });
  ipcMain.handle('rename-path', (_, oldPath, newPath) => {
    if (!isPathAllowed(oldPath) || !isPathAllowed(newPath)) return false;
    try { fs.renameSync(oldPath, newPath); return true; } catch { return false; }
  });
  ipcMain.handle('delete-path', (_, targetPath) => {
    if (!isPathAllowed(targetPath)) return false;
    try { if (fs.statSync(targetPath).isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true }); else fs.unlinkSync(targetPath); return true; } catch { return false; }
  });

  ipcMain.handle('watch-dir', (e, dirPath) => {
    if (!isPathAllowed(dirPath)) return;
    if (watchers.has(dirPath)) return;
    try {
      const w = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const segs = filename.split(/[/\\]/);
        if (segs.some(s => IGNORED_DIRS.has(s))) return;
        try { e.sender.send('fs-change', { type: eventType, filename, dir: dirPath }); } catch {}
      });
      watchers.set(dirPath, { watcher: w, sender: e.sender });
    } catch {}
  });
  ipcMain.handle('unwatch-dir', (_, dirPath) => {
    const entry = watchers.get(dirPath);
    if (entry) { entry.watcher.close(); watchers.delete(dirPath); }
  });
}

module.exports = { register };
