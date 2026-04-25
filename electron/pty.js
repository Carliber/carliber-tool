const sessions = new Map();

function createPty(sessionId, cwd, cols, rows) {
  let pty;
  try {
    pty = require('node-pty').spawn(process.env.COMSPEC || 'cmd.exe', [], {
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

module.exports = { createPty, getPty, writePty, resizePty, killPty, killAll };
