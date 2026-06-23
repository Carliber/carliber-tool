// Multi-agent configuration commands. This is a NEW capability: a single UI can edit
// the project/global config of omp, Claude, Codex, Gemini, and GitHub Copilot by
// switching an agent selector. Each agent maps to a different on-disk file layout.
//
// Layout reference (first-version; codex/gemini/github are best-effort):
//   omp     global ~/.omp/agent/config.yml          project <cwd>/.omp/config.yml
//           rules  ~/.omp/agent/rules/              project <cwd>/.omp/rules/
//           instr  ~/.omp/agent/AGENTS.md           project <cwd>/.omp/AGENTS.md
//           skills ~/.omp/agent/skills/*/SKILL.md   project <cwd>/.omp/skills/*/SKILL.md
//   claude  global ~/.claude/settings.json          project <cwd>/.claude/settings.local.json
//           rules  ~/.claude/rules/                 project <cwd>/.claude/rules/
//           instr  ~/.claude/CLAUDE.md              project <cwd>/CLAUDE.md
//   codex   global ~/.codex/config.toml             project <cwd>/.codex/config.toml
//           instr  ~/.codex/AGENTS.md               project <cwd>/.codex/AGENTS.md
//   gemini  global ~/.gemini/settings.json          project <cwd>/.gemini/settings.json
//           instr  ~/.gemini/GEMINI.md              project <cwd>/.gemini/GEMINI.md
//   github  instr  ~/.copilot/copilot-instructions.md (global only); project .github/copilot-instructions.md

use crate::state::{read_rules_dir, save_rule_file, delete_rule_file, write_text, HOME_DIR, OMP_AGENT_DIR};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy)]
pub enum AgentKind {
    Omp,
    Claude,
    Codex,
    Gemini,
    Github,
}

impl AgentKind {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "omp" => Some(AgentKind::Omp),
            "claude" => Some(AgentKind::Claude),
            "codex" => Some(AgentKind::Codex),
            "gemini" => Some(AgentKind::Gemini),
            "github" => Some(AgentKind::Github),
            _ => None,
        }
    }
    fn global_config_path(self) -> PathBuf {
        match self {
            AgentKind::Omp => crate::state::OMP_CONFIG_PATH.clone(),
            AgentKind::Claude => HOME_DIR.join(".claude").join("settings.json"),
            AgentKind::Codex => HOME_DIR.join(".codex").join("config.toml"),
            AgentKind::Gemini => HOME_DIR.join(".gemini").join("settings.json"),
            AgentKind::Github => HOME_DIR.join(".copilot").join("copilot-instructions.md"),
        }
    }
    fn project_config_path(self, project_path: &Path) -> PathBuf {
        match self {
            AgentKind::Omp => project_path.join(".omp").join("config.yml"),
            AgentKind::Claude => project_path.join(".claude").join("settings.local.json"),
            AgentKind::Codex => project_path.join(".codex").join("config.toml"),
            AgentKind::Gemini => project_path.join(".gemini").join("settings.json"),
            AgentKind::Github => project_path.join(".github").join("copilot-instructions.md"),
        }
    }
    fn global_rules_dir(self) -> PathBuf {
        match self {
            AgentKind::Omp => OMP_AGENT_DIR.join("rules"),
            AgentKind::Claude => HOME_DIR.join(".claude").join("rules"),
            _ => PathBuf::new(), // unsupported for others
        }
    }
    fn project_rules_dir(self, project_path: &Path) -> PathBuf {
        match self {
            AgentKind::Omp => project_path.join(".omp").join("rules"),
            AgentKind::Claude => project_path.join(".claude").join("rules"),
            _ => project_path.join(".agent").join("rules"),
        }
    }
    fn global_instructions_path(self) -> Option<PathBuf> {
        match self {
            AgentKind::Omp => Some(OMP_AGENT_DIR.join("AGENTS.md")),
            AgentKind::Claude => Some(HOME_DIR.join(".claude").join("CLAUDE.md")),
            AgentKind::Codex => Some(HOME_DIR.join(".codex").join("AGENTS.md")),
            AgentKind::Gemini => Some(HOME_DIR.join(".gemini").join("GEMINI.md")),
            AgentKind::Github => Some(HOME_DIR.join(".copilot").join("copilot-instructions.md")),
        }
    }
    fn project_instructions_path(self, project_path: &Path) -> Option<PathBuf> {
        match self {
            AgentKind::Omp => Some(project_path.join(".omp").join("AGENTS.md")),
            AgentKind::Claude => Some(project_path.join("CLAUDE.md")),
            AgentKind::Codex => Some(project_path.join(".codex").join("AGENTS.md")),
            AgentKind::Gemini => Some(project_path.join(".gemini").join("GEMINI.md")),
            AgentKind::Github => Some(project_path.join(".github").join("copilot-instructions.md")),
        }
    }
    fn instructions_label(self) -> &'static str {
        match self {
            AgentKind::Omp => "AGENTS.md",
            AgentKind::Claude => "CLAUDE.md",
            AgentKind::Codex => "AGENTS.md",
            AgentKind::Gemini => "GEMINI.md",
            AgentKind::Github => "copilot-instructions.md",
        }
    }
}

fn parse_config_file(kind: AgentKind, path: &Path) -> Value {
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match kind {
        AgentKind::Omp => serde_yaml::from_str::<serde_yaml::Value>(&raw)
            .ok()
            .and_then(|v| serde_json::to_value(v).ok())
            .unwrap_or(Value::Null),
        AgentKind::Codex => raw
            .parse::<toml::Value>()
            .ok()
            .and_then(|v| serde_json::to_value(v).ok())
            .unwrap_or(Value::Null),
        _ => serde_json::from_str(&raw).unwrap_or(Value::Null),
    }
}

fn serialize_config_file(kind: AgentKind, data: &Value) -> Result<String, String> {
    match kind {
        AgentKind::Omp => {
            let yaml: serde_yaml::Value =
                serde_json::from_value(data.clone()).map_err(|e| e.to_string())?;
            serde_yaml::to_string(&yaml).map_err(|e| e.to_string())
        }
        AgentKind::Codex => {
            let toml: toml::Value = serde_json::from_value(data.clone()).map_err(|e| e.to_string())?;
            toml::to_string_pretty(&toml).map_err(|e| e.to_string())
        }
        _ => serde_json::to_string_pretty(data).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn get_agent_global_config(kind: String) -> Value {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return Value::Null,
    };
    let path = k.global_config_path();
    // github stores markdown at its config path
    if matches!(k, AgentKind::Github) {
        return fs::read_to_string(&path)
            .map(Value::String)
            .unwrap_or(Value::Null);
    }
    parse_config_file(k, &path)
}

#[tauri::command]
pub fn save_agent_global_config(kind: String, data: Value) -> Result<bool, String> {
    let k = AgentKind::parse(&kind).ok_or("unknown agent")?;
    let path = k.global_config_path();
    let text = if matches!(k, AgentKind::Github) {
        data.as_str().unwrap_or("").to_string()
    } else {
        serialize_config_file(k, &data)?
    };
    Ok(write_text(&path, &text).is_ok())
}

#[tauri::command]
pub fn get_agent_project_config(kind: String, project_path: String) -> Value {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return Value::Null,
    };
    let path = k.project_config_path(Path::new(&project_path));
    if matches!(k, AgentKind::Github) {
        return fs::read_to_string(&path)
            .map(Value::String)
            .unwrap_or(Value::Null);
    }
    parse_config_file(k, &path)
}

#[tauri::command]
pub fn save_agent_project_config(
    kind: String,
    project_path: String,
    data: Value,
) -> Result<bool, String> {
    let k = AgentKind::parse(&kind).ok_or("unknown agent")?;
    if !crate::commands::files::is_path_allowed(&project_path) {
        return Err("path not allowed".into());
    }
    let path = k.project_config_path(Path::new(&project_path));
    let text = if matches!(k, AgentKind::Github) {
        data.as_str().unwrap_or("").to_string()
    } else {
        serialize_config_file(k, &data)?
    };
    Ok(write_text(&path, &text).is_ok())
}

#[derive(Debug, Clone, serde::Serialize)]
#[allow(non_snake_case)]
pub struct RuleEntry {
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub fn get_agent_rules(kind: String, scope: String, project_path: Option<String>) -> Vec<RuleEntry> {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return Vec::new(),
    };
    let dir = match scope.as_str() {
        "project" => {
            if let Some(pp) = project_path {
                k.project_rules_dir(Path::new(&pp))
            } else {
                return Vec::new();
            }
        }
        _ => k.global_rules_dir(),
    };
    read_rules_dir(&dir)
        .into_iter()
        .map(|(name, content)| RuleEntry { name, content })
        .collect()
}

#[tauri::command]
pub fn save_agent_rule(
    kind: String,
    scope: String,
    name: String,
    content: String,
    project_path: Option<String>,
) -> bool {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return false,
    };
    let dir = match scope.as_str() {
        "project" => {
            if let Some(pp) = project_path {
                if !crate::commands::files::is_path_allowed(&pp) {
                    return false;
                }
                k.project_rules_dir(Path::new(&pp))
            } else {
                return false;
            }
        }
        _ => k.global_rules_dir(),
    };
    save_rule_file(&dir, &name, &content)
}

#[tauri::command]
pub fn delete_agent_rule(
    kind: String,
    scope: String,
    name: String,
    project_path: Option<String>,
) -> bool {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return false,
    };
    let dir = match scope.as_str() {
        "project" => {
            if let Some(pp) = project_path {
                k.project_rules_dir(Path::new(&pp))
            } else {
                return false;
            }
        }
        _ => k.global_rules_dir(),
    };
    delete_rule_file(&dir, &name)
}

#[tauri::command]
pub fn get_agent_instructions(kind: String, scope: String, project_path: Option<String>) -> String {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return String::new(),
    };
    let path = match scope.as_str() {
        "project" => {
            if let Some(pp) = project_path {
                k.project_instructions_path(Path::new(&pp))
            } else {
                None
            }
        }
        _ => k.global_instructions_path(),
    };
    match path {
        Some(p) => fs::read_to_string(p).unwrap_or_default(),
        None => String::new(),
    }
}

#[tauri::command]
pub fn save_agent_instructions(
    kind: String,
    scope: String,
    content: String,
    project_path: Option<String>,
) -> bool {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return false,
    };
    let path = match scope.as_str() {
        "project" => {
            if let Some(pp) = project_path {
                if !crate::commands::files::is_path_allowed(&pp) {
                    return false;
                }
                k.project_instructions_path(Path::new(&pp))
            } else {
                None
            }
        }
        _ => k.global_instructions_path(),
    };
    match path {
        Some(p) => write_text(&p, &content).is_ok(),
        None => false,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[allow(non_snake_case)]
pub struct SkillEntry {
    pub name: String,
    pub description: String,
}

/// Parse a minimal YAML frontmatter (---\nkey: value\n---) from a SKILL.md.
fn parse_frontmatter(content: &str) -> Option<(String, String)> {
    let mut lines = content.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut name = String::new();
    let mut description = String::new();
    for line in lines.by_ref() {
        if line.trim() == "---" {
            break;
        }
        let mut split = line.splitn(2, ':');
        let key = split.next().unwrap_or("").trim().to_string();
        let value = split.next().unwrap_or("").trim().trim_matches('"').to_string();
        match key.as_str() {
            "name" => name = value,
            "description" => description = value,
            _ => {}
        }
    }
    Some((name, description))
}

fn scan_skills_dir(dir: &Path) -> Vec<SkillEntry> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for e in entries.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let skill_md = e.path().join("SKILL.md");
        if let Ok(content) = fs::read_to_string(&skill_md) {
            let (name, description) = parse_frontmatter(&content).unwrap_or_else(|| {
                let fallback_name = e.file_name().to_string_lossy().to_string();
                (fallback_name.clone(), fallback_name)
            });
            out.push(SkillEntry { name, description });
        }
    }
    out
}

#[tauri::command]
pub fn list_agent_skills(kind: String, project_path: Option<String>) -> Vec<SkillEntry> {
    let k = match AgentKind::parse(&kind) {
        Some(k) => k,
        None => return Vec::new(),
    };
    let mut out = Vec::new();
    match k {
        AgentKind::Omp => {
            out.extend(scan_skills_dir(&OMP_AGENT_DIR.join("skills")));
            if let Some(pp) = project_path {
                out.extend(scan_skills_dir(&Path::new(&pp).join(".omp").join("skills")));
            }
        }
        AgentKind::Claude => {
            out.extend(scan_skills_dir(&HOME_DIR.join(".claude").join("skills")));
            if let Some(pp) = project_path {
                out.extend(scan_skills_dir(&Path::new(&pp).join(".claude").join("skills")));
            }
        }
        _ => {}
    }
    out
}

/// Convenience command used by the AI command-search and detect flows.
#[tauri::command]
pub fn get_omp_dir() -> String {
    OMP_AGENT_DIR.to_string_lossy().to_string()
}

/// Expose the agent instructions filename for UI labels.
#[tauri::command]
pub fn agent_instructions_filename(kind: String) -> String {
    AgentKind::parse(&kind)
        .map(|k| k.instructions_label().to_string())
        .unwrap_or_default()
}
