const sessions = new Map();
const sessionOwners = new Map(); // sessionId → webContents id

function createPty(sessionId, cwd, cols, rows, ownerId) {
  let pty;
  try {
    const platform = process.platform;
    const shell = platform === 'win32'
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || '/bin/bash');
    const shellArgs = platform === 'win32' ? [] : [];
    pty = require('node-pty').spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd,
      env: Object.assign({}, process.env, { TERM: 'xterm-256color', COLUMNS: String(cols || 80) }),
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
