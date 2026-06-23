// System commands — ported from electron/ipc/system.js.
// Uses tauri-plugin-dialog for pickers and tauri-plugin-shell for opening paths.

use crate::state::{ensure_dir, PROJECTS_PATH};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub fn open_directory(path: String, app: AppHandle) {
    let _ = app.shell().open(path, None);
}

#[tauri::command]
pub fn open_native_terminal(cwd: String) -> bool {
    use std::process::Command;
    if cfg!(windows) {
        // start cmd.exe in a new window. Ported from electron/ipc/system.js.
        let escaped = cwd.replace('"', "\\\"");
        let cmd_str = format!("start cmd.exe /K \"cd /d \\\"{}\\\"\" || echo error", escaped);
        let res = Command::new("cmd.exe")
            .args(["/c", &cmd_str])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map(|_| true)
            .unwrap_or(false);
        return res;
    } else if cfg!(target_os = "macos") {
        return Command::new("open")
            .args(["-a", "Terminal.app", &cwd])
            .spawn()
            .is_ok();
    }
    // linux
    let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
    let term = terminals
        .iter()
        .find(|t| Command::new("which").arg(t).output().is_ok_and(|o| o.status.success()))
        .unwrap_or(&"xterm");
    Command::new(term)
        .args(["--working-directory", &cwd])
        .spawn()
        .is_ok()
}

#[tauri::command]
pub async fn open_directory_picker(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("选择目录")
        .pick_folder(move |chosen| {
            let _ = tx.send(chosen.and_then(|p| p.into_path().ok()));
        });
    rx.await.ok().flatten().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_file_picker(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("选择文件")
        .pick_file(move |chosen| {
            let _ = tx.send(chosen.and_then(|p| p.into_path().ok()));
        });
    rx.await.ok().flatten().map(|p| p.to_string_lossy().to_string())
}

/// Detect the omp CLI on PATH, with known-location fallbacks. Replaces detect-claude-cli.
#[tauri::command]
pub fn detect_omp_cli() -> Option<String> {
    let find = |prog: &str| {
        std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg(prog)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .next()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            })
    };
    if let Some(p) = find("omp") {
        return Some(p);
    }
    // Known-location fallbacks.
    let home = dirs::home_dir()?;
    let local_app = std::env::var("LOCALAPPDATA").ok();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(la) = local_app {
        candidates.push(PathBuf::from(la).join("omp").join("omp.exe"));
    }
    candidates.push(home.join("scoop/shims/omp.exe"));
    candidates.push(home.join("scoop/apps/omp/current/omp.exe"));
    for c in candidates {
        if c.exists() {
            return Some(c.to_string_lossy().to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn export_backup(app: AppHandle) -> bool {
    let dest = open_directory_picker(app.clone()).await;
    let dest = match dest {
        Some(d) => PathBuf::from(d),
        None => return false,
    };
    if PROJECTS_PATH.exists() {
        let target = dest.join("projects.json");
        return fs::copy(&*PROJECTS_PATH, &target).is_ok();
    }
    true
}

#[tauri::command]
pub async fn import_backup(app: AppHandle) -> bool {
    let src_dir = open_directory_picker(app.clone()).await;
    let src_dir = match src_dir {
        Some(d) => PathBuf::from(d),
        None => return false,
    };
    let src = src_dir.join("projects.json");
    if !src.exists() {
        return false;
    }
    if let Some(parent) = PROJECTS_PATH.parent() {
        ensure_dir(parent);
    }
    fs::copy(src, &*PROJECTS_PATH).is_ok()
}
