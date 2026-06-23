// File operations with project-path allowlist — ported from electron/ipc/files.js.
// Watchers use notify + notify-debouncer-mini (recursive, 200ms debounce).

use crate::commands::projects::projects;
use crate::state::{IGNORED_DIRS, MAX_FILE_SIZE, WATCHERS};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub size: u64,
    pub mtime: String,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct FileContent {
    pub content: Option<String>,
    pub size: u64,
    pub error: Option<String>,
}

/// True if the resolved path is inside (or equal to) any known project path.
/// Ported from electron/ipc/files.js isPathAllowed.
pub fn is_path_allowed(file_path: &str) -> bool {
    let resolved = match fs::canonicalize(file_path) {
        Ok(p) => p,
        Err(_) => {
            // canonicalize fails for non-existent paths (create_file/rename targets);
            // fall back to a lexically-resolved absolute path, collapsing `..` to
            // prevent path-traversal escapes (e.g. /project/../etc/hosts).
            let pb = PathBuf::from(file_path);
            let abs = if pb.is_absolute() {
                pb
            } else {
                match std::env::current_dir() {
                    Ok(cwd) => cwd.join(pb),
                    Err(_) => pb,
                }
            };
            normalize_components(&abs)
        }
    };
    let resolved_s = crate::state::normalize_path(&resolved.to_string_lossy());
    let sep = std::path::MAIN_SEPARATOR.to_string();
    let list = projects();
    list.iter().any(|p| {
        let raw = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let proj = match fs::canonicalize(raw) {
            Ok(p) => p,
            Err(_) => normalize_components(&PathBuf::from(raw)),
        };
        let proj_s = crate::state::normalize_path(&proj.to_string_lossy());
        resolved_s == proj_s || resolved_s.starts_with(&format!("{}{}", proj_s, sep))
    })
}

/// Lexically normalize a path by collapsing `.` and `..` components without touching
/// the filesystem. Prevents traversal escapes in the canonicalize-failure fallback.
pub fn normalize_components(p: &Path) -> PathBuf {
    let mut out: Vec<std::path::Component> = Vec::new();
    for comp in p.components() {
        match comp {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if matches!(out.last(), Some(std::path::Component::Normal(_))) {
                    out.pop();
                } else {
                    out.push(comp);
                }
            }
            c => out.push(c),
        }
    }
    out.iter().collect()
}

fn mtime_iso(meta: &fs::Metadata) -> String {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| crate::state::system_time_iso(std::time::UNIX_EPOCH + d))
        .unwrap_or_default()
}

fn ignored_set() -> HashSet<&'static str> {
    IGNORED_DIRS.iter().copied().collect()
}

#[tauri::command]
pub fn read_dir(dir_path: String) -> Vec<FileEntry> {
    if !is_path_allowed(&dir_path) {
        return Vec::new();
    }
    let ignored = ignored_set();
    let mut out: Vec<FileEntry> = Vec::new();
    let entries = match fs::read_dir(&dir_path) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if ignored.contains(name.as_str()) {
            continue;
        }
        let full = entry.path().to_string_lossy().to_string();
        let kind = match entry.file_type() {
            Ok(t) if t.is_dir() => "dir",
            _ => "file",
        };
        let (size, mtime) = match fs::metadata(entry.path()) {
            Ok(m) => (m.len(), mtime_iso(&m)),
            Err(_) => continue,
        };
        out.push(FileEntry {
            name,
            path: full,
            kind: kind.to_string(),
            size,
            mtime,
        });
    }
    // dirs first, then locale-sort by name. Ported from electron/ipc/files.js.
    out.sort_by(|a, b| {
        if a.kind != b.kind {
            if a.kind == "dir" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.name.cmp(&b.name)
        }
    });
    out
}

#[tauri::command]
pub fn read_file(file_path: String) -> FileContent {
    if !is_path_allowed(&file_path) {
        return FileContent {
            content: None,
            size: 0,
            error: Some("路径不在项目范围内".to_string()),
        };
    }
    let meta = match fs::metadata(&file_path) {
        Ok(m) => m,
        Err(e) => {
            return FileContent {
                content: None,
                size: 0,
                error: Some(e.to_string()),
            }
        }
    };
    if meta.len() > MAX_FILE_SIZE {
        return FileContent {
            content: None,
            size: meta.len(),
            error: Some("文件超过 2MB 限制".to_string()),
        };
    }
    match fs::read_to_string(&file_path) {
        Ok(s) => FileContent {
            content: Some(s),
            size: meta.len(),
            error: None,
        },
        Err(e) => FileContent {
            content: None,
            size: 0,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
pub fn write_file(file_path: String, content: String) -> bool {
    if !is_path_allowed(&file_path) {
        return false;
    }
    crate::state::atomic_write(Path::new(&file_path), &content).is_ok()
}

#[tauri::command]
pub fn create_file(file_path: String) -> bool {
    if !is_path_allowed(&file_path) {
        return false;
    }
    if Path::new(&file_path).exists() {
        return false;
    }
    crate::state::atomic_write(Path::new(&file_path), "").is_ok()
}

#[tauri::command]
pub fn create_dir(dir_path: String) -> bool {
    if !is_path_allowed(&dir_path) {
        return false;
    }
    fs::create_dir_all(&dir_path).is_ok()
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> bool {
    if !is_path_allowed(&old_path) || !is_path_allowed(&new_path) {
        return false;
    }
    fs::rename(&old_path, &new_path).is_ok()
}

#[tauri::command]
pub fn delete_path(target_path: String) -> bool {
    if !is_path_allowed(&target_path) {
        return false;
    }
    let meta = match fs::metadata(&target_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta.is_dir() {
        fs::remove_dir_all(&target_path).is_ok()
    } else {
        fs::remove_file(&target_path).is_ok()
    }
}

/// Recursive debounced watcher. Events fire `fs-change` with { type, filename, dir }.
/// Ported from electron/ipc/files.js watch-dir (which used recursive fs.watch).
#[tauri::command]
pub fn watch_dir(dir_path: String, app: AppHandle) -> bool {
    if !is_path_allowed(&dir_path) {
        return false;
    }
    let path = PathBuf::from(&dir_path);
    {
        let reg = WATCHERS.lock();
        if reg.contains_key(&path) {
            return true;
        }
    }

    let ignored: HashSet<String> = IGNORED_DIRS.iter().map(|s| s.to_string()).collect();
    let dir_for_cb = dir_path.clone();
    let app_for_cb = app.clone();
    // Debounce: coalesce events within a 200ms window so bulk operations
    // (git checkout, npm install) don't flood the frontend.
    let last_emit = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
    let pending = std::sync::Arc::new(parking_lot::Mutex::new(std::collections::HashSet::<String>::new()));

    let watcher: Box<dyn notify::Watcher + Send> = match notify::recommended_watcher({
        let ignored = ignored.clone();
        let dir_for_cb = dir_for_cb.clone();
        let app_for_cb = app_for_cb.clone();
        let last_emit = last_emit.clone();
        let pending = pending.clone();
        move |res: notify::Result<notify::Event>| {
            let ev = match res { Ok(e) => e, Err(_) => return };
            for p in &ev.paths {
                if p.components().any(|c| {
                    ignored.contains(&c.as_os_str().to_string_lossy().to_string())
                }) { continue; }
                let filename = if let Ok(rel) = p.strip_prefix(&dir_for_cb) {
                    rel.to_string_lossy().replace('\\', "/")
                } else {
                    p.to_string_lossy().to_string()
                };
                let kind = if ev.kind.is_create() { "create" }
                    else if ev.kind.is_remove() { "delete" }
                    else { "change" };
                let now = std::time::Instant::now();
                let should_emit = {
                    let mut le = last_emit.lock();
                    if now.duration_since(*le) > std::time::Duration::from_millis(200) {
                        *le = now;
                        true
                    } else { false }
                };
                if should_emit {
                    let payload = serde_json::json!({
                        "type": kind, "filename": filename, "dir": dir_for_cb,
                    });
                    let _ = app_for_cb.emit("fs-change", payload);
                } else {
                    pending.lock().insert(filename.clone());
                    let app_flush = app_for_cb.clone();
                    let dir_flush = dir_for_cb.clone();
                    let le2 = last_emit.clone();
                    let pending2 = pending.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        *le2.lock() = std::time::Instant::now();
                        for f in pending2.lock().drain() {
                            let payload = serde_json::json!({
                                "type": "change", "filename": f, "dir": dir_flush,
                            });
                            let _ = app_flush.emit("fs-change", payload);
                        }
                    });
                }
            }
        }
    }) {
        Ok(w) => Box::new(w),
        Err(_) => return false,
    };
    let path_for_watch = path.clone();
    let mut w = watcher;
    if w.watch(&path_for_watch, notify::RecursiveMode::Recursive).is_err() {
        return false;
    }

    let mut reg = WATCHERS.lock();
    reg.insert(path, w);
    true
}

#[tauri::command]
pub fn unwatch_dir(dir_path: String) {
    let path = PathBuf::from(&dir_path);
    let mut reg = WATCHERS.lock();
    reg.remove(&path);
}

/// On app shutdown: drop every watcher.
pub fn unwatch_all() {
    let mut reg = WATCHERS.lock();
    reg.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_components_collapses_dotdot() {
        let p = Path::new("/project/sub/../../etc/hosts");
        let norm = normalize_components(p);
        assert_eq!(norm, Path::new("/etc/hosts"));
    }

    #[test]
    fn test_normalize_components_collapses_dot() {
        let p = Path::new("/project/./sub/./file");
        let norm = normalize_components(p);
        assert_eq!(norm, Path::new("/project/sub/file"));
    }

    #[test]
    fn test_normalize_components_leading_dotdot_preserved() {
        let p = Path::new("../../etc");
        let norm = normalize_components(p);
        assert_eq!(norm, Path::new("../../etc"));
    }

    #[test]
    fn test_normalize_components_no_change() {
        let p = Path::new("/project/src/main.rs");
        let norm = normalize_components(p);
        assert_eq!(norm, Path::new("/project/src/main.rs"));
    }

    #[test]
    fn test_normalize_components_windows_path() {
        let p = Path::new(r"C:\project\sub\..\evil");
        let norm = normalize_components(p);
        assert_eq!(norm, Path::new(r"C:\project\evil"));
    }
}
