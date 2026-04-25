const pty = require('../pty');

function register(ipcMain) {
  ipcMain.handle('pty:create', (event, sessionId, cwd, cols, rows) => {
    const ownerId = event.sender.id;
    const ptyProcess = pty.createPty(sessionId, cwd, cols, rows, ownerId);
    if (!ptyProcess) return false;
    const senderWebContents = event.sender;
    ptyProcess.onData((data) => {
      if (!senderWebContents.isDestroyed()) senderWebContents.send('pty:data', sessionId, data);
    });
    ptyProcess.onExit(({ exitCode }) => {
      if (!senderWebContents.isDestroyed()) senderWebContents.send('pty:exit', sessionId, exitCode);
    });
    return true;
  });
  ipcMain.on('pty:write', (_, sessionId, data) => pty.writePty(sessionId, data));
  ipcMain.on('pty:resize', (_, sessionId, cols, rows) => pty.resizePty(sessionId, cols, rows));
  ipcMain.handle('pty:kill', (_, sessionId) => { pty.killPty(sessionId); return true; });
}

module.exports = { register };
