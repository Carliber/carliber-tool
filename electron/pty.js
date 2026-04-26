const sessions = new Map();
const sessionOwners = new Map(); // sessionId → webContents id
const fs = require('fs');
const os = require('os');

function createPty(sessionId, cwd, cols, rows, ownerId) {
  let pty;
  try {
    const platform = process.platform;
    let shell, shellArgs, gitBash = null;
    if (platform === 'win32') {
      const homeDir = os.homedir();
      const programFiles = process.env.ProgramFiles || '';
      const localAppData = process.env.LocalAppData || '';
      const gitBashPaths = [
        homeDir + '\\scoop\\apps\\git\\current\\bin\\bash.exe',
        homeDir + '\\scoop\\apps\\git\\current\\usr\\bin\\bash.exe',
        programFiles + '\\Git\\bin\\bash.exe',
        programFiles + '\\Git\\usr\\bin\\bash.exe',
        localAppData + '\\Programs\\Git\\bin\\bash.exe',
      ];
      gitBash = gitBashPaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });
      if (gitBash) {
        shell = gitBash;
        shellArgs = ['--login', '-i'];
      } else {
        shell = process.env.COMSPEC || 'cmd.exe';
        shellArgs = [];
      }
    } else {
      shell = process.env.SHELL || '/bin/bash';
      shellArgs = [];
    }
    pty = require('node-pty').spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd,
      env: Object.assign({}, process.env, {
        TERM: 'xterm-256color',
        COLUMNS: String(cols || 80),
        CLAUDE_CODE_GIT_BASH_PATH: gitBash || process.env.CLAUDE_CODE_GIT_BASH_PATH || '',
      }),
    });
  } catch {
    return null;
  }

  sessions.set(sessionId, pty);
  if (ownerId !== undefined) sessionOwners.set(sessionId, ownerId);
  return pty;
}

function getPty(sessionId) {
  return sessions.get(sessionId);
}

function writePty(sessionId, data) {
  const pty = sessions.get(sessionId);
  if (pty) pty.write(data);
}

function resizePty(sessionId, cols, rows) {
  const pty = sessions.get(sessionId);
  if (pty) pty.resize(cols, rows);
}

function killPty(sessionId) {
  const pty = sessions.get(sessionId);
  if (pty) {
    pty.kill();
    sessions.delete(sessionId);
  }
}

function killAll() {
  for (const [id] of sessions) killPty(id);
}

function killByOwner(ownerId) {
  for (const [sessionId, oid] of sessionOwners) {
    if (oid === ownerId) killPty(sessionId);
  }
}

module.exports = { createPty, getPty, writePty, resizePty, killPty, killAll, killByOwner };
