// Session reading for omp JSONL — replaces electron/ipc/sessions.js.
// omp stores sessions at ~/.omp/agent/sessions/<dir-encoded>/<timestamp>_<sessionId>.jsonl
// with a deterministic dir encoding (see encode_session_dir) so we no longer scan every
// dir looking for a cwd match.

use crate::state::{system_time_iso, HOME_DIR, OMP_SESSIONS_DIR};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct OmpSession {
    pub sessionId: String,
    pub title: String,
    pub messageCount: u64,
    pub startTime: String,
    pub lastModified: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct SessionMessage {
    pub role: String,
    pub text: String,
    pub ts: String,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct ScannedProject {
    pub dirName: String,
    pub path: String,
    pub name: String,
    pub sessionCount: u64,
    pub lastModified: String,
}

pub fn sanitize_segment(s: &str) -> String {
    s.replace(['/', '\\', ':'], "-")
}

/// Strip Windows verbatim path prefixes (\\?\ and \\?\UNC\) added by canonicalize.
fn strip_verbatim_prefix(s: &str) -> String {
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        format!("\\\\{}", rest)
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        s.to_string()
    }
}
/// Encode a cwd into omp's deterministic session-subdir name.
///
/// Rules (from omp session docs):
///  - inside home:   "-" + sanitized(home-relative path); home itself is bare "-"
///  - inside temp:   "-tmp-" + sanitized(temp-relative path)
///  - otherwise:     "--" + sanitized(absolute path without leading slash) + "--"
pub fn encode_session_dir(cwd: &Path) -> String {
    // Try canonicalize first; fall back to the literal path on failure
    // (project dir may not yet exist on disk in edge cases).
    let canon = fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
    // Strip the Windows verbatim-path prefix (\\?\ and \\?\UNC\) that canonicalize
    // adds, so the string matches the ordinary paths returned by dirs::home_dir().
    let canon_str = strip_verbatim_prefix(&canon.to_string_lossy());
    let home = HOME_DIR.to_string_lossy().to_string();
    // Case-insensitive prefix match on Windows/macOS.
    let starts = |haystack: &str, needle: &str| -> bool {
        if crate::state::case_insensitive() {
            haystack
                .to_lowercase()
                .starts_with(&needle.to_lowercase())
        } else {
            haystack.starts_with(needle)
        }
    };

    if starts(&canon_str, &home) {
        let rel = &canon_str[home.len()..];
        // Strip a leading separator so home itself -> "" -> bare "-".
        let rel = rel.trim_start_matches(['/', '\\']);
        if rel.is_empty() {
            return "-".to_string();
        }
        return format!("-{}", sanitize_segment(rel));
    }

    let temp = std::env::temp_dir().to_string_lossy().to_string();
    if starts(&canon_str, &temp) {
        let rel = &canon_str[temp.len()..];
        let rel = rel.trim_start_matches(['/', '\\']);
        return format!("-tmp-{}", sanitize_segment(rel));
    }

    // Absolute path elsewhere: strip a leading separator + drive-letter colon.
    let abs = canon_str.trim_start_matches(['/', '\\']);
    // Drop a Windows drive-letter colon (e.g. "E:") — it's part of sanitize.
    format!("--{}--", sanitize_segment(abs))
}

/// Resolve the session subdir for a given project path.
fn session_dir(project_path: &str) -> PathBuf {
    OMP_SESSIONS_DIR.join(encode_session_dir(Path::new(project_path)))
}

/// Extract text from an omp message content array (join text blocks with newline).
/// omp roles: user / assistant / toolResult / developer / custom. We treat
/// user + assistant as conversational; others are skipped for the message list.
fn extract_text(content: &Value) -> String {
    if let Some(arr) = content.as_array() {
        arr.iter()
            .filter_map(|item| {
                if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                    item.get("text").and_then(|v| v.as_str()).map(String::from)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else if let Some(s) = content.as_str() {
        s.to_string()
    } else {
        String::new()
    }
}

/// Read and parse the first line of a jsonl file as a JSON object (the header).
fn read_header(path: &Path) -> Option<Value> {
    let f = fs::File::open(path).ok()?;
    let mut first = String::new();
    use std::io::BufRead;
    let mut reader = std::io::BufReader::new(f);
    reader.read_line(&mut first).ok()?;
    if first.is_empty() {
        return None;
    }
    serde_json::from_str(first.trim()).ok()
}

/// Count conversational messages (user/assistant) in a jsonl file. Lenient parse.
fn count_messages(path: &Path) -> u64 {
    let f = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 0,
    };
    use std::io::BufRead;
    let mut count = 0u64;
    for line in std::io::BufReader::new(f).lines().flatten() {
        if let Ok(o) = serde_json::from_str::<Value>(&line) {
            if o.get("type").and_then(|v| v.as_str()) == Some("message") {
                let role = o
                    .get("message")
                    .and_then(|m| m.get("role"))
                    .and_then(|r| r.as_str())
                    .unwrap_or("");
                if matches!(role, "user" | "assistant") {
                    count += 1;
                }
            }
        }
    }
    count
}

#[tauri::command]
pub fn get_sessions(project_path: String) -> Vec<OmpSession> {
    let dir = session_dir(&project_path);
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<OmpSession> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".jsonl") {
            continue;
        }
        let path = entry.path();
        let header = read_header(&path).unwrap_or(Value::Null);
        let id = header
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        // sessionId returned to the frontend is the filename stem, matching the
        // legacy electron behaviour (which used sessionId = filename.jsonl-less).
        let session_id = name.trim_end_matches(".jsonl").to_string();
        let title = header
            .get("title")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| id.chars().take(8).collect());
        let start_time = header
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let message_count = count_messages(&path);
        let (size, mtime) = match fs::metadata(&path) {
            Ok(m) => (m.len(), crate::state::system_time_iso(m.modified().unwrap_or(std::time::UNIX_EPOCH))),
            Err(_) => (0u64, String::new()),
        };
        out.push(OmpSession {
            sessionId: session_id,
            title,
            messageCount: message_count,
            startTime: start_time,
            lastModified: mtime,
            size,
        });
    }
    // newest first, matching legacy sort
    out.sort_by(|a, b| b.lastModified.cmp(&a.lastModified));
    out
}

/// Locate a session file by id (which may be the timestamped stem, or a bare uuid).
fn locate_session_file(dir: &Path, session_id: &str) -> Option<PathBuf> {
    let direct = dir.join(format!("{}.jsonl", session_id));
    if direct.exists() {
        return Some(direct);
    }
    // glob `<*>_{session_id}.jsonl`
    if let Ok(entries) = fs::read_dir(dir) {
        let suffix = format!("_{}.jsonl", session_id);
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(&suffix) {
                return Some(e.path());
            }
        }
    }
    None
}

#[tauri::command]
pub fn get_session_messages(project_path: String, session_id: String) -> Vec<SessionMessage> {
    let dir = session_dir(&project_path);
    let path = match locate_session_file(&dir, &session_id) {
        Some(p) => p,
        None => return Vec::new(),
    };
    let f = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<SessionMessage> = Vec::new();
    for line in f.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let o: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let kind = o.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if kind == "message" {
            let role = o
                .get("message")
                .and_then(|m| m.get("role"))
                .and_then(|r| r.as_str())
                .unwrap_or("");
            if !matches!(role, "user" | "assistant") {
                continue;
            }
            let content = o
                .get("message")
                .and_then(|m| m.get("content"))
                .cloned()
                .unwrap_or(Value::Null);
            let text = extract_text(&content);
            let trimmed = text.trim();
            if trimmed.is_empty() {
                continue;
            }
            out.push(SessionMessage {
                role: role.to_string(),
                text: trimmed.to_string(),
                ts: o
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        } else if kind == "summary" {
            if let Some(s) = o.get("summary").and_then(|v| v.as_str()) {
                let s = s.chars().take(500).collect::<String>();
                out.push(SessionMessage {
                    role: "system".to_string(),
                    text: s,
                    ts: o
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                });
            }
        }
    }
    out
}

#[tauri::command]
pub fn get_last_session_time(project_path: String) -> Option<String> {
    let dir = session_dir(&project_path);
    let mut latest: Option<std::time::SystemTime> = None;
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if !n.ends_with(".jsonl") {
                continue;
            }
            if let Ok(m) = fs::metadata(e.path()) {
                if let Ok(mtime) = m.modified() {
                    latest = Some(match latest {
                        Some(cur) if cur > mtime => cur,
                        _ => mtime,
                    });
                }
            }
        }
    }
    latest.map(system_time_iso)
}

#[tauri::command]
pub fn delete_session(project_path: String, session_id: String) -> bool {
    let dir = session_dir(&project_path);
    if let Some(file) = locate_session_file(&dir, &session_id) {
        let _ = fs::remove_file(&file);
    }
    // also remove same-named subdir (legacy behaviour)
    let sub = dir.join(&session_id);
    if sub.is_dir() {
        let _ = fs::remove_dir_all(&sub);
    }
    true
}

/// Scan every session subdir, returning real projects that exist on disk.
/// Replaces electron scan-claude-projects (which scanned ~/.claude/projects/).
#[tauri::command]
pub fn scan_omp_projects() -> Vec<ScannedProject> {
    let mut out: Vec<ScannedProject> = Vec::new();
    let entries = match fs::read_dir(&*OMP_SESSIONS_DIR) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    for e in entries.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let dir = e.path();
        let dir_name = e.file_name().to_string_lossy().to_string();
        // collect jsonl files
        let mut jsonl: Vec<PathBuf> = Vec::new();
        if let Ok(inner) = fs::read_dir(&dir) {
            for f in inner.flatten() {
                let n = f.file_name().to_string_lossy().to_string();
                if n.ends_with(".jsonl") {
                    jsonl.push(f.path());
                }
            }
        }
        if jsonl.is_empty() {
            continue;
        }
        // cwd from the first header that has one
        let mut real_path: Option<String> = None;
        for f in &jsonl {
            if let Some(h) = read_header(f) {
                if let Some(cwd) = h.get("cwd").and_then(|v| v.as_str()) {
                    if !cwd.is_empty() {
                        real_path = Some(cwd.to_string());
                        break;
                    }
                }
            }
        }
        let path = match real_path {
            Some(p) => p,
            None => continue,
        };
        if !Path::new(&path).is_dir() {
            continue;
        }
        let name = Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        // latest mtime among jsonl files
        let mut latest: Option<std::time::SystemTime> = None;
        let mut count = 0u64;
        for f in &jsonl {
            count += 1;
            if let Ok(m) = fs::metadata(f) {
                if let Ok(mt) = m.modified() {
                    latest = Some(match latest {
                        Some(c) if c > mt => c,
                        _ => mt,
                    });
                }
            }
        }
        if count == 0 {
            continue;
        }
        out.push(ScannedProject {
            dirName: dir_name,
            path,
            name,
            sessionCount: count,
            lastModified: latest.map(system_time_iso).unwrap_or_default(),
        });
    }
    out.sort_by(|a, b| b.lastModified.cmp(&a.lastModified));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_sanitize_segment() {
        assert_eq!(sanitize_segment("a/b"), "a-b");
        assert_eq!(sanitize_segment(r"a\b"), "a-b");
        assert_eq!(sanitize_segment("C:"), "C-");
        assert_eq!(sanitize_segment("E:\\project"), "E--project");
    }

    #[test]
    fn test_strip_verbatim_prefix() {
        assert_eq!(strip_verbatim_prefix(r"\\?\C:\Users"), r"C:\Users");
        assert_eq!(strip_verbatim_prefix(r"\\?\UNC\server\share"), r"\\server\share");
        assert_eq!(strip_verbatim_prefix(r"C:\normal"), r"C:\normal");
        assert_eq!(strip_verbatim_prefix("/unix/path"), "/unix/path");
    }

    #[test]
    fn test_encode_session_dir_absolute_outside_home() {
        // E:\project\claude-tool should encode to --E--project-claude-tool--
        let cwd = Path::new(r"E:\project\claude-tool");
        let encoded = encode_session_dir(cwd);
        // On the machine where this test runs, if E: is not under home,
        // it should be the --<abs>-- form.
        let home = HOME_DIR.to_string_lossy().to_string();
        let canon = fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
        let canon_str = strip_verbatim_prefix(&canon.to_string_lossy());
        if !canon_str.starts_with(&home) {
            assert!(encoded.starts_with("--"), "expected -- prefix, got {}", encoded);
            assert!(encoded.ends_with("--"), "expected -- suffix, got {}", encoded);
            assert!(encoded.contains("project"), "expected project in {}", encoded);
        }
    }
}
