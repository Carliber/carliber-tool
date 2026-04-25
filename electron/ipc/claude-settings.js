const path = require('path');
const fs = require('fs');
const { CLAUDE_DIR, CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS, CLAUDE_MD, ensureDir, readJson, writeJson, readRulesDir, saveRuleFile, deleteRuleFile } = require('../shared');

function register(ipcMain) {
  // Global Claude settings
  ipcMain.handle('get-claude-settings', () => readJson(CLAUDE_SETTINGS, {}));
  ipcMain.handle('save-claude-settings', (_, data) => { writeJson(CLAUDE_SETTINGS, data); return true; });
  ipcMain.handle('get-claude-local-settings', () => readJson(CLAUDE_LOCAL_SETTINGS, {}));
  ipcMain.handle('save-claude-local-settings', (_, data) => { writeJson(CLAUDE_LOCAL_SETTINGS, data); return true; });
  ipcMain.handle('get-claude-md', () => { try { return fs.readFileSync(CLAUDE_MD, 'utf-8'); } catch { return ''; } });
  ipcMain.handle('save-claude-md', (_, content) => { fs.writeFileSync(CLAUDE_MD, content, 'utf-8'); return true; });
  ipcMain.handle('get-claude-dir', () => CLAUDE_DIR);

  // Project-level Claude settings
  ipcMain.handle('get-project-settings', (_, projectPath) => readJson(path.join(projectPath, '.claude', 'settings.local.json'), {}));
  ipcMain.handle('save-project-settings', (_, projectPath, data) => {
    const p = path.join(projectPath, '.claude', 'settings.local.json');
    ensureDir(path.dirname(p)); writeJson(p, data); return true;
  });
  ipcMain.handle('get-project-claude-md', (_, projectPath) => { try { return fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf-8'); } catch { return ''; } });
  ipcMain.handle('save-project-claude-md', (_, projectPath, content) => { fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf-8'); return true; });
  ipcMain.handle('get-project-rules', (_, projectPath) => readRulesDir(path.join(projectPath, '.claude', 'rules')));
  ipcMain.handle('save-project-rule', (_, projectPath, name, content) => saveRuleFile(path.join(projectPath, '.claude', 'rules'), name, content));
  ipcMain.handle('delete-project-rule', (_, projectPath, name) => deleteRuleFile(path.join(projectPath, '.claude', 'rules'), name));

  // Global rules
  ipcMain.handle('get-global-rules', () => readRulesDir(path.join(CLAUDE_DIR, 'rules')));
  ipcMain.handle('save-global-rule', (_, name, content) => saveRuleFile(path.join(CLAUDE_DIR, 'rules'), name, content));
  ipcMain.handle('delete-global-rule', (_, name) => deleteRuleFile(path.join(CLAUDE_DIR, 'rules'), name));

  // Scan Claude projects
  ipcMain.handle('scan-claude-projects', () => {
    const projectsDir = path.join(CLAUDE_DIR, 'projects');
    if (!fs.existsSync(projectsDir)) return [];
    try {
      return fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
          const fullDir = path.join(projectsDir, e.name);
          const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'));
          let realPath = '';
          for (const f of files) {
            try {
              const content = fs.readFileSync(path.join(fullDir, f), 'utf-8');
              const cwdMatch = content.match(/"cwd"\s*:\s*"([^"]+)"/);
              if (cwdMatch) { realPath = cwdMatch[1].replace(/\\\\/g, '\\'); break; }
            } catch {}
          }
          if (!realPath) return null;
          try { if (!fs.statSync(realPath).isDirectory()) return null; } catch { return null; }
          const lastModified = files
            .map(f => { try { return fs.statSync(path.join(fullDir, f)).mtime; } catch { return new Date(0); } })
            .reduce((a, b) => a > b ? a : b, new Date(0));
          return { dirName: e.name, path: realPath, name: path.basename(realPath), sessionCount: files.length, lastModified: lastModified.toISOString() };
        })
        .filter(p => p !== null && p.sessionCount > 0)
        .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    } catch (e) { console.error('scan-claude-projects error:', e); return []; }
  });
}

module.exports = { register };
