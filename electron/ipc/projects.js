const { PROJECTS_PATH, writeJson, getProjects, setProjects } = require('../shared');

function register(ipcMain) {
  ipcMain.handle('get-projects', () => getProjects());
  ipcMain.handle('save-projects', (_, projects) => { setProjects(projects); writeJson(PROJECTS_PATH, projects); });
}

module.exports = { register };
