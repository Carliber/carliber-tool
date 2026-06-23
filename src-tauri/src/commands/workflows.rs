// Workflows + AI command search for the Warp-style block terminal.
// Workflows persist at ~/.carliber-tool/workflows.json.
// AI command search spawns `omp -p` in print mode to translate natural language to a shell command.

use crate::state::{atomic_write, read_json_value, HISTORY_PATH, WORKFLOWS_PATH};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    #[serde(rename = "commandTemplate")]
    pub command_template: String,
    #[serde(default)]
    pub description: String,
}

fn read_workflows() -> Vec<Workflow> {
    let v = read_json_value(&WORKFLOWS_PATH, Value::Array(Vec::new()));
    serde_json::from_value(v).unwrap_or_default()
}

fn write_workflows(list: &[Workflow]) -> bool {
    let data = serde_json::to_string_pretty(list).unwrap_or_else(|_| "[]".to_string());
    atomic_write(&WORKFLOWS_PATH, &data).is_ok()
}

#[tauri::command]
pub fn get_workflows() -> Vec<Workflow> {
    read_workflows()
}

#[tauri::command]
pub fn save_workflow(workflow: Workflow) -> bool {
    let mut list = read_workflows();
    if let Some(idx) = list.iter().position(|w| w.id == workflow.id) {
        list[idx] = workflow;
    } else {
        list.push(workflow);
    }
    write_workflows(&list)
}

#[tauri::command]
pub fn delete_workflow(id: String) -> bool {
    let list = read_workflows();
    write_workflows(&list.into_iter().filter(|w| w.id != id).collect::<Vec<_>>())
}

/// Translate a natural-language query into a single shell command using omp print mode.
/// Spawn `omp -p --mode text <prompt>`, return stdout. Silently returns null on failure.
#[tauri::command]
pub async fn ai_command_search(query: String, cwd: String) -> Option<String> {
    let omp = crate::commands::system::detect_omp_cli()?;
    let prompt = format!(
        "将以下自然语言转为单条 shell 命令，只输出命令本身不要解释或代码块标记：{}",
        query
    );
    let mut child = tokio::process::Command::new(omp);
    child.args(["-p", "--mode", "text", &prompt]);
    child.current_dir(if std::path::Path::new(&cwd).is_dir() {
        std::path::PathBuf::from(&cwd)
    } else {
        std::path::PathBuf::from(".")
    });
    child.stdin(std::process::Stdio::null());
    child.stdout(std::process::Stdio::piped());
    child.stderr(std::process::Stdio::null());
    child.kill_on_drop(true);
    let out = tokio::time::timeout(Duration::from_secs(10), child.output()).await;
    let output = match out {
        Ok(Ok(o)) => o,
        _ => return None,
    };
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Persist the in-memory shell history for the block terminal's Ctrl-R search.
/// The frontend appends entries; we just store the JSON array verbatim.
#[tauri::command]
pub fn get_history() -> Value {
    read_json_value(&HISTORY_PATH, Value::Array(Vec::new()))
}

#[tauri::command]
pub fn save_history(history: Value) -> bool {
    let data = serde_json::to_string_pretty(&history).unwrap_or_else(|_| "[]".to_string());
    atomic_write(&HISTORY_PATH, &data).is_ok()
}
