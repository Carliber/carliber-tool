// Application state, constants, and shared utility functions ported from electron/shared.js.
// Data directory is ~/.carliber-tool (no migration of old ~/.claude-tool-electron data).

use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// Home directory of the current user.
pub static HOME_DIR: LazyLock<PathBuf> =
    LazyLock::new(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));

/// Application data directory: ~/.carliber-tool
pub static DATA_DIR: LazyLock<PathBuf> =
    LazyLock::new(|| HOME_DIR.join(".carliber-tool"));

/// Path to the app config.json.
pub static CONFIG_PATH: LazyLock<PathBuf> = LazyLock::new(|| DATA_DIR.join("config.json"));

/// Path to the persisted projects list.
pub static PROJECTS_PATH: LazyLock<PathBuf> =
    LazyLock::new(|| DATA_DIR.join("data").join("projects.json"));

/// Path to the persisted workflows list.
pub static WORKFLOWS_PATH: LazyLock<PathBuf> = LazyLock::new(|| DATA_DIR.join("workflows.json"));

/// Path to the persisted shell history (for block terminal history search).
pub static HISTORY_PATH: LazyLock<PathBuf> = LazyLock::new(|| DATA_DIR.join("history.json"));

/// Path to the rolling application log.
pub static LOG_PATH: LazyLock<PathBuf> = LazyLock::new(|| DATA_DIR.join("app.log"));

/// Directory names skipped when listing/watching files. Ported from electron/shared.js.
pub static IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "__pycache__",
    ".next",
    ".nuxt",
    "dist",
    ".cache",
    ".venv",
    "venv",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
];

/// 2 MiB — files larger than this cannot be read in the editor. Ported from electron/shared.js.
pub const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;

/// Log file is truncated past this size. Ported from electron/shared.js.
pub const MAX_LOG_SIZE: u64 = 512 * 1024;

/// True on Windows and macOS — path comparisons are case-insensitive. Ported from electron/ipc/files.js.
pub fn case_insensitive() -> bool {
    cfg!(windows) || cfg!(target_os = "macos")
}

/// Case-insensitive-aware normalization of a path string for comparisons.
pub fn normalize_path(p: &str) -> String {
    if case_insensitive() {
        p.to_lowercase()
    } else {
        p.to_string()
    }
}

// ---------------------------------------------------------------------------
// omp directories and configuration.  omp honours PI_CODING_AGENT_DIR to
// relocate ~/.omp/agent; we honour the same variable.
// ---------------------------------------------------------------------------

/// Effective omp agent directory (~/.omp/agent, overridable via PI_CODING_AGENT_DIR).
pub static OMP_AGENT_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    if let Ok(custom) = std::env::var("PI_CODING_AGENT_DIR") {
        if !custom.is_empty() {
            return PathBuf::from(custom);
        }
    }
    HOME_DIR.join(".omp").join("agent")
});

/// Global omp config.yml.
pub static OMP_CONFIG_PATH: LazyLock<PathBuf> = LazyLock::new(|| OMP_AGENT_DIR.join("config.yml"));

/// Directory containing omp session JSONL files, one encoded subdir per cwd.
pub static OMP_SESSIONS_DIR: LazyLock<PathBuf> =
    LazyLock::new(|| OMP_AGENT_DIR.join("sessions"));

// ---------------------------------------------------------------------------
// Path / project state
// ---------------------------------------------------------------------------

/// Process-wide project list cache. Mirrors electron/shared.js projectsCache.
pub static PROJECTS_CACHE: Mutex<Option<Vec<Value>>> = Mutex::new(None);

/// Process-wide filesystem watcher registry (keyed by watched dir path).
pub static WATCHERS: LazyLock<Mutex<HashMap<PathBuf, Box<dyn notify::Watcher + Send>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// ---------------------------------------------------------------------------
// Shared utility functions (ported from electron/shared.js)
// ---------------------------------------------------------------------------

/// Create a directory if it does not exist (recursive). Ported from ensureDir.
pub fn ensure_dir(dir: &Path) {
    if !dir.exists() {
        let _ = fs::create_dir_all(dir);
    }
}

/// Read and parse a JSON file, returning the fallback on any error. Ported from readJson.
pub fn read_json<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => T::default(),
    }
}

/// Read a JSON file into a serde_json::Value, returning the provided fallback on error.
pub fn read_json_value(path: &Path, fallback: Value) -> Value {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

/// Atomically write text to a file via a .tmp sibling then rename (falls back to
/// copy+unlink across volumes, matching electron/shared.js atomicWrite).
pub fn atomic_write(path: &Path, data: &str) -> std::io::Result<()> {
    // Use a sibling temp file in the same dir to maximize atomic-rename reliability.
    let tmp = path.with_file_name(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("file")
    ));
    fs::write(&tmp, data)?;
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) if e.raw_os_error() == Some(18) /* EXDEV */ => {
            fs::copy(&tmp, path)?;
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(e)
        }
    }
}

/// Pretty-print a value as JSON and atomically write it, creating parent dirs. Ported from writeJson.
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent);
    }
    let data = serde_json::to_string_pretty(value)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    atomic_write(path, &data)
}

/// Write raw text to a file, creating parent dirs. Used for YAML / markdown / toml.
pub fn write_text(path: &Path, data: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent);
    }
    fs::write(path, data)
}

/// Read all `*.md` files in a rules directory. Ported from readRulesDir.
pub fn read_rules_dir(rules_dir: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(rules_dir) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".md") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(entry.path()) {
            out.push((name, content));
        }
    }
    out
}

/// Persist a single rule file (appending `.md` if missing). Ported from saveRuleFile.
pub fn save_rule_file(rules_dir: &Path, name: &str, content: &str) -> bool {
    ensure_dir(rules_dir);
    let file_name = if name.ends_with(".md") {
        name.to_string()
    } else {
        format!("{name}.md")
    };
    fs::write(rules_dir.join(&file_name), content).is_ok()
}

/// Delete a rule file by name. Ported from deleteRuleFile.
pub fn delete_rule_file(rules_dir: &Path, name: &str) -> bool {
    let path = rules_dir.join(name);
    if path.exists() {
        fs::remove_file(&path).is_ok()
    } else {
        true
    }
}

/// Append a timestamped log line, rotating the log file past MAX_LOG_SIZE. Ported from log().
pub fn log_line(level: &str, args: Vec<String>) {
    use std::io::Write;
    let ts = chrono_now_iso();
    let line = format!("[{}] [{}] {}\n", ts, level, args.join(" "));
    ensure_dir(&DATA_DIR);
    if let Ok(meta) = fs::metadata(&*LOG_PATH) {
        if meta.len() > MAX_LOG_SIZE {
            let _ = fs::remove_file(&*LOG_PATH);
        }
    }
    if let Ok(mut f) = fs::OpenOptions::new().append(true).create(true).open(&*LOG_PATH) {
        let _ = f.write_all(line.as_bytes());
    }
    if level.eq_ignore_ascii_case("error") {
        eprint!("{}", line);
    }
}

/// ISO 8601 timestamp for the current instant.
pub fn chrono_now_iso() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Build ISO-8601 manually to avoid pulling in chrono for one timestamp.
    let secs = d.as_secs() as i64;
    let nanos = d.subsec_nanos();
    let (y, mo, dy, h, mi, s) = epoch_to_ymdhms(secs);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, mo, dy, h, mi, s, nanos / 1_000_000
    )
}

/// Convert a Unix epoch second count (UTC) into (year, month, day, hour, min, sec).
/// Algorithm: Howard Hinnant's civil_from_days.
fn epoch_to_ymdhms(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let h = (rem / 3600) as u32;
    let mi = ((rem % 3600) / 60) as u32;
    let s = (rem % 60) as u32;
    // civil_from_days
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d, h, mi, s)
}

/// Convert a SystemTime into an ISO 8601 string (used for file mtimes).
pub fn system_time_iso(t: std::time::SystemTime) -> String {
    match t.duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => epoch_to_ymdhms_iso(d.as_secs() as i64, d.subsec_nanos()),
        Err(_) => String::new(),
    }
}

fn epoch_to_ymdhms_iso(secs: i64, nanos: u32) -> String {
    let (y, mo, dy, h, mi, s) = epoch_to_ymdhms(secs);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, mo, dy, h, mi, s, nanos / 1_000_000
    )
}

/// Ensure the data directory tree exists. Called once at startup.
pub fn ensure_data_dirs() {
    ensure_dir(&DATA_DIR);
    ensure_dir(&DATA_DIR.join("data"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epoch_to_ymdhms_known() {
        // 2024-01-01T00:00:00Z = 1704067200
        let (y, mo, dy, h, mi, s) = epoch_to_ymdhms(1704067200);
        assert_eq!((y, mo, dy, h, mi, s), (2024, 1, 1, 0, 0, 0));
    }

    #[test]
    fn test_epoch_to_ymdhms_epoch() {
        let (y, mo, dy, h, mi, s) = epoch_to_ymdhms(0);
        assert_eq!((y, mo, dy, h, mi, s), (1970, 1, 1, 0, 0, 0));
    }

    #[test]
    fn test_normalize_path_case() {
        assert_eq!(normalize_path("Hello"), if case_insensitive() { "hello" } else { "Hello" });
    }

    #[test]
    fn test_atomic_write_and_read() {
        let tmp = std::env::temp_dir().join("carliber-test-aw.txt");
        let _ = atomic_write(&tmp, "hello world");
        let content = std::fs::read_to_string(&tmp).unwrap();
        assert_eq!(content, "hello world");
        let _ = std::fs::remove_file(&tmp);
    }
}
