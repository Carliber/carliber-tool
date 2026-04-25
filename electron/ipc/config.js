const { nativeTheme } = require('electron');
const { CONFIG_PATH, readJson, writeJson } = require('../shared');

function getDefaultConfig() {
  return {
    theme: 'light',
    claudeCliPath: 'claude',
    windowWidth: 1280,
    windowHeight: 800,
    windowX: -1,
    windowY: -1,
    closeAction: 'ask',
    uiFontSize: 14,
    editorFontSize: 13,
    terminalFontSize: 14,
    treeFontSize: 13,
  };
}

function register(ipcMain) {
  ipcMain.handle('get-config', () => readJson(CONFIG_PATH, getDefaultConfig()));
  ipcMain.handle('save-config', (_, config) => {
    nativeTheme.themeSource = config.theme === 'dark' ? 'dark' : 'light';
    writeJson(CONFIG_PATH, config);
  });
}

module.exports = { register, getDefaultConfig };
