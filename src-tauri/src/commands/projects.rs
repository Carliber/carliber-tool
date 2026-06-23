// get_projects / save_projects — ported from electron/ipc/projects.js.
// Uses a process-wide cache mirroring electron/shared.js projectsCache.

use crate::state::{atomic_write, PROJECTS_CACHE, PROJECTS_PATH};
use serde_json::Value;

fn load_from_disk() -> Vec<Value> {
    match std::fs::read_to_string(&*PROJECTS_PATH) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Return the cached project list, lazily loading from disk on first access.
pub fn projects() -> Vec<Value> {
    let mut cache = PROJECTS_CACHE.lock();
    if cache.is_none() {
        *cache = Some(load_from_disk());
    }
    cache.clone().unwrap_or_default()
}

pub fn set_projects(list: Vec<Value>) {
    let mut cache = PROJECTS_CACHE.lock();
    *cache = Some(list);
}

#[tauri::command]
pub fn get_projects() -> Vec<Value> {
    projects()
}

#[tauri::command]
pub fn save_projects(projects: Vec<Value>) -> bool {
    set_projects(projects.clone());
    let data = match serde_json::to_string_pretty(&projects) {
        Ok(s) => s,
        Err(_) => return false,
    };
    atomic_write(&PROJECTS_PATH, &data).is_ok()
}
