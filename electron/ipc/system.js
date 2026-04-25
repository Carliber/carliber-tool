const path = require('path');
const fs = require('fs');
const { PROJECTS_PATH, ensureDir } = require('../shared');

function register(ipcMain, { mainWindow, dialog }) {
  ipcMain.handle('open-directory', (_, p) => { require('electron').shell.openPath(p); });
  ipcMain.handle('open-native-terminal', (_, cwd) => {
    const { spawn } = require('child_process');
    const platform = process.platform;
    if (platform === 'win32') {
      const escaped = cwd.replace(/"/g, '\\"');
      spawn('cmd.exe', ['/c', `start cmd.exe /K "cd /d \\"${escaped}\\"" || echo error`], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'darwin') {
      spawn('open', ['-a', 'Terminal.app', cwd], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
      const term = terminals.find(t => {
        try { require('child_process').execSync(`which ${t}`, { stdio: 'ignore' }); return true; } catch { return false; }
      }) || 'xterm';
      spawn(term, ['--working-directory', cwd], { detached: true, stdio: 'ignore' }).unref();
    }
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
      const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
      return require('child_process').execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0].trim();
    } catch { return null; }
  });
  ipcMain.handle('export-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择备份保存位置' });
    if (result.canceled) return false;
    if (fs.existsSync(PROJECTS_PATH)) fs.copyFileSync(PROJECTS_PATH, path.join(result.filePaths[0], 'projects.json'));
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
}

module.exports = { register };
