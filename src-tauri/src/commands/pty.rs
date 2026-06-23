// PTY management via portable-pty. Ported from electron/pty.js + electron/ipc/pty.js.
// Shell detection mirrors electron/pty.js:6-52 (git-bash probe list on Windows,
// COMSPEC fallback, $SHELL on Unix). CLAUDE_CODE_GIT_BASH_PATH env is forwarded.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter};

struct PtyHandle {
    writer: Box<dyn std::io::Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    killer: Box<dyn portable_pty::Child + Send + Sync>,
}

struct Registry {
    sessions: HashMap<String, PtyHandle>,
    owners: HashMap<String, String>,
}

static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| {
    Mutex::new(Registry {
        sessions: HashMap::new(),
        owners: HashMap::new(),
    })
});

/// Locate a git-bash binary on Windows. Ported from electron/pty.js gitBashPaths.
fn find_git_bash() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let home = dirs::home_dir()?;
    let program_files = std::env::var("ProgramFiles").unwrap_or_default();
    let local_app_data = std::env::var("LocalAppData").unwrap_or_default();
    let candidates = [
        home.join("scoop/apps/git/current/bin/bash.exe"),
        home.join("scoop/apps/git/current/usr/bin/bash.exe"),
        PathBuf::from(&program_files).join("Git/bin/bash.exe"),
        PathBuf::from(&program_files).join("Git/usr/bin/bash.exe"),
        PathBuf::from(&local_app_data).join("Programs/Git/bin/bash.exe"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    None
}

/// Spawn a PTY. Emits `pty:data` and `pty:exit` to the owning window label.
#[tauri::command]
pub fn pty_create(
    session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    owner_window_label: String,
    app: AppHandle,
) -> bool {
    let cols = if cols == 0 { 80 } else { cols };
    let rows = if rows == 0 { 24 } else { rows };

    // Shell + args selection.
    let (shell, shell_args, git_bash): (PathBuf, Vec<&'static str>, Option<PathBuf>) = if cfg!(
        windows
    ) {
        if let Some(gb) = find_git_bash() {
            (gb.clone(), vec!["--login", "-i"], Some(gb))
        } else {
            let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
            (PathBuf::from(comspec), Vec::new(), None)
        }
    } else {
        let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        (PathBuf::from(sh), Vec::new(), None)
    };

    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut cmd = CommandBuilder::new(&shell);
    for a in &shell_args {
        cmd.arg(a);
    }
    cmd.cwd(if PathBuf::from(&cwd).is_dir() {
        PathBuf::from(&cwd)
    } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    });
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLUMNS", cols.to_string());
    if let Some(gb) = &git_bash {
        cmd.env(
            "CLAUDE_CODE_GIT_BASH_PATH",
            std::env::var("CLAUDE_CODE_GIT_BASH_PATH")
                .unwrap_or_else(|_| gb.to_string_lossy().to_string()),
        );
    }

    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let mut killer = child; // Box<dyn Child + Send + Sync>; mut for kill-on-failure.

    let mut reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(_) => {
            let _ = killer.kill();
            return false;
        }
    };
    drop(pair.slave);

    // Take the writer before moving the master into the registry.
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(_) => {
            let _ = killer.kill();
            return false;
        }
    };

    // Apply initial size on the master.
    let _ = pair.master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    });

    // Spawn a blocking reader thread that forwards bytes to the owning window.
    let sid = session_id.clone();
    let owner = owner_window_label.clone();
    let app2 = app.clone();
    let killer_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let payload = (sid.clone(), chunk);
                    if app2.emit_to(&owner, "pty:data", payload).is_err() {
                        break;
                    }
                }
            }
        }
        // child exited
        let _ = app2.emit_to(&owner, "pty:exit", (killer_id.clone(), 0i32));
        // remove from registry on exit
        let mut reg = REGISTRY.lock();
        reg.sessions.remove(&killer_id);
        reg.owners.remove(&killer_id);
    });

    let handle = PtyHandle {
        writer,
        master: pair.master,
        killer,
    };
    let mut reg = REGISTRY.lock();
    reg.sessions.insert(session_id.clone(), handle);
    reg.owners.insert(session_id.clone(), owner_window_label);
    true
}

#[tauri::command]
pub fn pty_write(session_id: String, data: String) {
    let mut reg = REGISTRY.lock();
    if let Some(h) = reg.sessions.get_mut(&session_id) {
        use std::io::Write;
        let _ = h.writer.write_all(data.as_bytes());
        let _ = h.writer.flush();
    }
}

#[tauri::command]
pub fn pty_resize(session_id: String, cols: u16, rows: u16) {
    let mut reg = REGISTRY.lock();
    if let Some(h) = reg.sessions.get_mut(&session_id) {
        let _ = h.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
}

#[tauri::command]
pub fn pty_kill(session_id: String) -> bool {
    let killed = {
        let mut reg = REGISTRY.lock();
        if let Some(h) = reg.sessions.remove(&session_id) {
            reg.owners.remove(&session_id);
            Some(h)
        } else {
            None
        }
    };
    match killed {
        Some(mut h) => { let _ = h.killer.kill(); true }
        None => false,
    }
}

/// Kill every PTY owned by a window (called on window close).
pub fn kill_by_owner(window_label: &str) {
    let victims: Vec<(String, PtyHandle)> = {
        let mut reg = REGISTRY.lock();
        let ids: Vec<String> = reg
            .owners
            .iter()
            .filter(|(_, owner)| *owner == window_label)
            .map(|(id, _)| id.clone())
            .collect();
        let mut out = Vec::new();
        for id in ids {
            if let Some(h) = reg.sessions.remove(&id) {
                out.push((id.clone(), h));
            }
            reg.owners.remove(&id);
        }
        out
    };
    for (_, mut h) in victims {
        let _ = h.killer.kill();
    }
}

/// Kill every PTY (called on app quit).
pub fn kill_all() {
    let handles: Vec<PtyHandle> = {
        let mut reg = REGISTRY.lock();
        reg.sessions.drain().map(|(_, h)| h).collect()
    };
    for mut h in handles {
        let _ = h.killer.kill();
    }
    let mut reg = REGISTRY.lock();
    reg.owners.clear();
}

