const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude-tool-electron');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const PROJECTS_PATH = path.join(DATA_DIR, 'data', 'projects.json');
const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.claude');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CLAUDE_LOCAL_SETTINGS = path.join(CLAUDE_DIR, 'settings.local.json');
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');
const IGNORED_DIRS = new Set(['node_modules', '.git', '__pycache__', '.next', '.nuxt', 'dist', '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error('readJson error:', e);
  }
  return fallback;
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}

function readRulesDir(rulesDir) {
  if (!fs.existsSync(rulesDir)) return [];
  try {
    return fs.readdirSync(rulesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, content: fs.readFileSync(path.join(rulesDir, f), 'utf-8') }));
  } catch { return []; }
}

function saveRuleFile(rulesDir, name, content) {
  ensureDir(rulesDir);
  const filePath = path.join(rulesDir, name.endsWith('.md') ? name : name + '.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

function deleteRuleFile(rulesDir, name) {
  const filePath = path.join(rulesDir, name);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); return true; } catch { return false; }
}

let projectsCache = null;
function getProjects() {
  if (!projectsCache) projectsCache = readJson(PROJECTS_PATH, []);
  return projectsCache;
}
function setProjects(projects) {
  projectsCache = projects;
}

// Logging
const LOG_PATH = path.join(DATA_DIR, 'app.log');
const MAX_LOG_SIZE = 512 * 1024;

function log(level, ...args) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] [${level}] ${args.join(' ')}\n`;
  try {
    ensureDir(DATA_DIR);
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_SIZE) {
      fs.unlinkSync(LOG_PATH);
    }
    fs.appendFileSync(LOG_PATH, msg, 'utf-8');
  } catch {}
  if (level === 'ERROR') console.error(msg.trim());
}

module.exports = {
  DATA_DIR, CONFIG_PATH, PROJECTS_PATH, CLAUDE_DIR, CLAUDE_SETTINGS, CLAUDE_LOCAL_SETTINGS, CLAUDE_MD,
  IGNORED_DIRS, MAX_FILE_SIZE, LOG_PATH,
  ensureDir, readJson, atomicWrite, writeJson,
  readRulesDir, saveRuleFile, deleteRuleFile,
  getProjects, setProjects, log,
};
