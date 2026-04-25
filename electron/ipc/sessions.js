const path = require('path');
const fs = require('fs');
const { CLAUDE_DIR } = require('../shared');

const claudeDirCache = new Map();

function getProjectClaudeDir(projectPath) {
  if (claudeDirCache.has(projectPath)) return claudeDirCache.get(projectPath);
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return null;
  try {
    for (const dirName of fs.readdirSync(projectsDir)) {
      const dirPath = path.join(projectsDir, dirName);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
          const lines = content.split('\n').filter(Boolean);
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
  } catch (e) { console.error('[watcher] getProjectClaudeDir error:', e.message); }
  return null;
}

function register(ipcMain) {
  ipcMain.handle('get-sessions', (_, projectPath) => {
    const dir = getProjectClaudeDir(projectPath);
    if (!dir || !fs.existsSync(dir)) return [];
    try {
      return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => {
        const filePath = path.join(dir, f);
        const sessionId = f.replace('.jsonl', '');
        let firstUserMsg = '', messageCount = 0, startTime = '';
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
              } else if (o.type === 'assistant') { messageCount++; }
            } catch {}
          }
        } catch {}
        const stat = fs.statSync(filePath);
        return { sessionId, title: firstUserMsg || sessionId.slice(0, 8), messageCount, startTime, lastModified: stat.mtime.toISOString(), size: stat.size };
      }).sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    } catch { return []; }
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
      for (const line of fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)) {
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
    } catch { return []; }
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
}

module.exports = { register };
