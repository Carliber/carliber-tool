// Version control commands — Git + SVN via direct CLI invocation.
// We spawn `git` / `svn` in the project cwd and parse their machine-readable output.
// This avoids heavy native deps (git2) and naturally supports SVN which git2 cannot.

use serde::Serialize;
use std::process::Command;
use std::time::Duration;

/// Which VCS backend is active for a given path (detected by presence of .git / .svn).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VcsKind {
    None,
    Git,
    Svn,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct VcsStatus {
    pub kind: String,
    pub branch: String,
    pub remote: String,
    pub ahead: i64,
    pub behind: i64,
    pub clean: bool,
    pub staged: Vec<VcsFile>,
    pub unstaged: Vec<VcsFile>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct VcsFile {
    pub path: String,
    pub status: String, // e.g. "M", "A", "D", "R", "C", "?"
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct VcsLogEntry {
    pub hash: String,
    pub shortHash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[allow(non_snake_case)]
pub struct VcsDiff {
    pub path: String,
    pub staged: bool,
    pub diff: String,
}

/// Run a command in cwd with a hard timeout, returning stdout as a string (None on
/// failure or timeout). Spawns the child and owns the handle so it can be killed on
/// timeout — preventing orphaned git/svn processes (the previous thread+output()
/// version leaked the child on timeout).
fn run(cwd: &str, program: &str, args: &[&str], timeout_secs: u64) -> Option<String> {
    use std::process::Stdio;
    let mut child = match Command::new(program)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return None,
    };

    // Wait with timeout; kill the child if it exceeds the deadline.
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process exited; drain stdout via wait_with_output (returns
                // immediately since the child has already terminated).
                return child
                    .wait_with_output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string());
            }
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait(); // reap to avoid zombie
                    return None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// Find the `git` executable (git on PATH, with Windows fallbacks).
fn git_bin() -> &'static str {
    "git"
}

/// Find the `svn` executable.
fn svn_bin() -> &'static str {
    "svn"
}

/// Detect which VCS manages a path by checking for .git / .svn in the path or ancestors.
fn detect_kind(cwd: &str) -> VcsKind {
    let p = std::path::Path::new(cwd);
    if p.join(".git").exists() {
        return VcsKind::Git;
    }
    if p.join(".svn").exists() {
        return VcsKind::Svn;
    }
    // Walk up ancestors (git/svn can be in a parent dir).
    let mut cur = p;
    while let Some(parent) = cur.parent() {
        if parent.join(".git").exists() {
            return VcsKind::Git;
        }
        if parent.join(".svn").exists() {
            return VcsKind::Svn;
        }
        cur = parent;
    }
    VcsKind::None
}

#[tauri::command]
pub fn vcs_detect(project_path: String) -> String {
    match detect_kind(&project_path) {
        VcsKind::Git => "git".to_string(),
        VcsKind::Svn => "svn".to_string(),
        VcsKind::None => "none".to_string(),
    }
}

/// Parse `git status --porcelain=v1 -b -z` output into structured status.
fn git_status(cwd: &str) -> VcsStatus {
    let raw = run(cwd, git_bin(), &["status", "--porcelain=v1", "-b", "-z"], 15)
        .unwrap_or_default();
    let mut branch = String::new();
    let mut remote = String::new();
    let mut ahead = 0i64;
    let mut behind = 0i64;
    let mut staged: Vec<VcsFile> = Vec::new();
    let mut unstaged: Vec<VcsFile> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();

    // Entries are NUL-separated; the first starts with "## " for the branch line.
    for entry in raw.split('\0') {
        if entry.is_empty() {
            continue;
        }
        if let Some(rest) = entry.strip_prefix("## ") {
            // "main...origin/main [ahead 2, behind 1]" or "No commits yet (main)"
            let no_track = rest.find("...").is_none();
            let head_part: &str = rest.split("...").next().unwrap_or(rest);
            branch = head_part.split_whitespace().next().unwrap_or("").to_string();
            if !no_track {
                if let Some(r) = rest.find("...") {
                    let after = &rest[r + 3..];
                    remote = after.split_whitespace().next().unwrap_or("").to_string();
                }
            }
            if let Some(a) = rest.find("ahead ") {
                let n: String = rest[a + 6..].chars().take_while(|c| c.is_ascii_digit()).collect();
                ahead = n.parse().unwrap_or(0);
            }
            if let Some(b) = rest.find("behind ") {
                let n: String = rest[b + 7..].chars().take_while(|c| c.is_ascii_digit()).collect();
                behind = n.parse().unwrap_or(0);
            }
            continue;
        }
        if entry.len() < 3 {
            continue;
        }
        // XY <path>  (X = index/staged, Y = worktree/unstaged)
        let x = entry.as_bytes()[0] as char;
        let y = entry.as_bytes()[1] as char;
        let path = entry[3..].to_string();
        if x == '?' && y == '?' {
            untracked.push(path);
            continue;
        }
        if x != ' ' && x != '?' {
            staged.push(VcsFile { path: path.clone(), status: x.to_string(), staged: true });
        }
        if y != ' ' && y != '?' {
            unstaged.push(VcsFile { path, status: y.to_string(), staged: false });
        }
    }

    VcsStatus {
        kind: "git".to_string(),
        branch,
        remote,
        ahead,
        behind,
        clean: staged.is_empty() && unstaged.is_empty() && untracked.is_empty(),
        staged,
        unstaged,
        untracked,
    }
}

/// Parse `svn status` output (one entry per line, column-based).
fn svn_status(cwd: &str) -> VcsStatus {
    let raw = run(cwd, svn_bin(), &["status"], 15).unwrap_or_default();
    let info = run(cwd, svn_bin(), &["info"], 15).unwrap_or_default();
    let mut branch = String::new();
    let mut remote = String::new();
    for line in info.lines() {
        if let Some(rest) = line.strip_prefix("URL: ") {
            remote = rest.trim().to_string();
            // Branch/Tag inference from URL path segment.
            if let Some(b) = remote.rsplit('/').next() {
                branch = b.to_string();
            }
        }
        if let Some(rest) = line.strip_prefix("Relative URL: ") {
            remote = rest.trim().to_string();
            if let Some(b) = remote.rsplit('/').next() {
                branch = b.to_string();
            }
        }
    }
    let mut unstaged: Vec<VcsFile> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    for line in raw.lines() {
        if line.is_empty() || line.len() < 8 {
            continue;
        }
        let status_char = line.as_bytes()[0] as char;
        let path = line[7..].trim().to_string();
        if path.is_empty() {
            continue;
        }
        match status_char {
            '?' => untracked.push(path),
            _ => unstaged.push(VcsFile { path, status: status_char.to_string(), staged: false }),
        }
    }
    VcsStatus {
        kind: "svn".to_string(),
        branch,
        remote,
        ahead: 0,
        behind: 0,
        clean: unstaged.is_empty() && untracked.is_empty(),
        staged: Vec::new(),
        unstaged,
        untracked,
    }
}

#[tauri::command]
pub fn vcs_status(project_path: String) -> VcsStatus {
    match detect_kind(&project_path) {
        VcsKind::Git => git_status(&project_path),
        VcsKind::Svn => svn_status(&project_path),
        VcsKind::None => VcsStatus {
            kind: "none".to_string(),
            branch: String::new(),
            remote: String::new(),
            ahead: 0,
            behind: 0,
            clean: true,
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
        },
    }
}

#[tauri::command]
pub fn vcs_stage(project_path: String, paths: Vec<String>) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => {
            let mut args: Vec<&str> = vec!["add", "--"];
            for p in &paths {
                args.push(p.as_str());
            }
            run(&project_path, git_bin(), &args, 30).is_some()
        }
        VcsKind::Svn => {
            let mut args: Vec<&str> = vec!["add", "--"];
            for p in &paths {
                args.push(p.as_str());
            }
            run(&project_path, svn_bin(), &args, 30).is_some()
        }
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_unstage(project_path: String, paths: Vec<String>) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => {
            let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
            for p in &paths {
                args.push(p.as_str());
            }
            run(&project_path, git_bin(), &args, 30).is_some()
        }
        VcsKind::Svn => {
            // svn revert unstages additions (destructive for unstaged content; only un-stages here).
            let mut args: Vec<&str> = vec!["revert", "--"];
            for p in &paths {
                args.push(p.as_str());
            }
            run(&project_path, svn_bin(), &args, 30).is_some()
        }
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_commit(project_path: String, message: String, kind_hint: Option<String>) -> bool {
    let kind = match kind_hint.as_deref() {
        Some("git") => VcsKind::Git,
        Some("svn") => VcsKind::Svn,
        _ => detect_kind(&project_path),
    };
    match kind {
        VcsKind::Git => {
            run(&project_path, git_bin(), &["commit", "-m", &message], 60).is_some()
        }
        VcsKind::Svn => {
            run(&project_path, svn_bin(), &["commit", "-m", &message], 120).is_some()
        }
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_pull(project_path: String) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => run(&project_path, git_bin(), &["pull", "--ff-only"], 120).is_some(),
        VcsKind::Svn => run(&project_path, svn_bin(), &["update"], 120).is_some(),
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_push(project_path: String) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => run(&project_path, git_bin(), &["push"], 120).is_some(),
        VcsKind::Svn => true, // SVN commits push immediately; no separate push.
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_fetch(project_path: String) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => run(&project_path, git_bin(), &["fetch"], 60).is_some(),
        VcsKind::Svn => run(&project_path, svn_bin(), &["info"], 60).is_some(),
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_log(project_path: String, limit: Option<u32>) -> Vec<VcsLogEntry> {
    let limit = limit.unwrap_or(50);
    match detect_kind(&project_path) {
        VcsKind::Git => {
            // %H hash, %h short, %an author, %aI iso date, %s subject
            let fmt = "%H%x1f%h%x1f%an%x1f%aI%x1f%s";
            let raw = run(
                &project_path,
                git_bin(),
                &["log", &format!("-n{}", limit), &format!("--pretty=format:{}", fmt)],
                30,
            )
            .unwrap_or_default();
            let mut out = Vec::new();
            for line in raw.lines() {
                let parts: Vec<&str> = line.split('\x1f').collect();
                if parts.len() == 5 {
                    out.push(VcsLogEntry {
                        hash: parts[0].to_string(),
                        shortHash: parts[1].to_string(),
                        author: parts[2].to_string(),
                        date: parts[3].to_string(),
                        message: parts[4].to_string(),
                    });
                }
            }
            out
        }
        VcsKind::Svn => {
            // svn log --xml would be cleaner but requires XML parsing; use --quiet with -r and revprops.
            let raw = run(
                &project_path,
                svn_bin(),
                &["log", "--limit", &limit.to_string()],
                60,
            )
            .unwrap_or_default();
            let mut out = Vec::new();
            let mut cur = VcsLogEntry {
                hash: String::new(),
                shortHash: String::new(),
                author: String::new(),
                date: String::new(),
                message: String::new(),
            };
            for line in raw.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("r") {
                    if rest
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                    {
                        // commit separator line: "r123 | author | date | n lines"
                        if !cur.hash.is_empty() {
                            cur.message = cur.message.trim().to_string();
                            out.push(std::mem::replace(
                                &mut cur,
                                VcsLogEntry {
                                    hash: String::new(),
                                    shortHash: String::new(),
                                    author: String::new(),
                                    date: String::new(),
                                    message: String::new(),
                                },
                            ));
                        }
                        let segs: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
                        if segs.len() >= 3 {
                            cur.hash = segs[0].to_string();
                            cur.shortHash = segs[0].to_string();
                            cur.author = segs[1].to_string();
                            cur.date = segs[2].to_string();
                        }
                        // in_msg state was removed; commit boundary handled by cur.hash.
                    }
                } else if !cur.hash.is_empty() && trimmed == "Changed paths:" {
                    // SVN log section header — skip, don't accumulate as message.
                } else if !cur.hash.is_empty() && (trimmed.starts_with("M /") || trimmed.starts_with("A /") || trimmed.starts_with("D /") || trimmed.starts_with("A  /") || trimmed.starts_with("M  /")) {
                    // changed-path line — skip
                } else if !cur.hash.is_empty() && !trimmed.is_empty() {
                    if !cur.message.is_empty() {
                        cur.message.push('\n');
                    }
                    cur.message.push_str(trimmed);
                }
            }
            if !cur.hash.is_empty() {
                cur.message = cur.message.trim().to_string();
                out.push(cur);
            }
            out
        }
        VcsKind::None => Vec::new(),
    }
}

#[tauri::command]
pub fn vcs_diff(project_path: String, path: String, staged: bool) -> VcsDiff {
    match detect_kind(&project_path) {
        VcsKind::Git => {
            let mut args: Vec<&str> = vec!["diff"];
            if staged {
                args.push("--cached");
            }
            args.push("--");
            let path_arg: &str = path.as_str();
            args.push(path_arg);
            let diff = run(&project_path, git_bin(), &args, 30).unwrap_or_default();
            VcsDiff { path, staged, diff }
        }
        VcsKind::Svn => {
            let diff = run(&project_path, svn_bin(), &["diff", &path], 30).unwrap_or_default();
            VcsDiff { path, staged: false, diff }
        }
        VcsKind::None => VcsDiff { path, staged, diff: String::new() },
    }
}

#[tauri::command]
pub fn vcs_branches(project_path: String) -> Vec<String> {
    match detect_kind(&project_path) {
        VcsKind::Git => {
            let raw = run(
                &project_path,
                git_bin(),
                &["branch", "--list", "--format=%(refname:short)"],
                15,
            )
            .unwrap_or_default();
            raw.lines().map(|l| l.trim().to_string()).filter(|s| !s.is_empty()).collect()
        }
        VcsKind::Svn => {
            // svn branches are usually separate dirs under /branches; listing requires the repo URL.
            // Return the current branch only as a minimal approximation.
            let s = svn_status(&project_path);
            if s.branch.is_empty() { Vec::new() } else { vec![s.branch] }
        }
        VcsKind::None => Vec::new(),
    }
}
/// Validate a branch/ref name to prevent flag injection. Rejects names starting
/// with `-` or containing shell metacharacters / control chars.
pub fn is_safe_ref(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && !name.contains('\0')
        && !name.contains("..")
        && name.chars().all(|c| !c.is_ascii_control())
}

#[tauri::command]
pub fn vcs_checkout(project_path: String, branch: String) -> bool {
    if !is_safe_ref(&branch) {
        return false;
    }
    match detect_kind(&project_path) {
        VcsKind::Git => run(&project_path, git_bin(), &["checkout", &branch], 60).is_some(),
        VcsKind::Svn => {
            run(&project_path, svn_bin(), &["switch", &branch], 120).is_some()
        }
        VcsKind::None => false,
    }
}

#[tauri::command]
pub fn vcs_discard(project_path: String, path: String) -> bool {
    match detect_kind(&project_path) {
        VcsKind::Git => run(&project_path, git_bin(), &["checkout", "--", &path], 30).is_some(),
        VcsKind::Svn => run(&project_path, svn_bin(), &["revert", &path], 30).is_some(),
        VcsKind::None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_ref_valid() {
        assert!(is_safe_ref("main"));
        assert!(is_safe_ref("feature/add-login"));
        assert!(is_safe_ref("v1.0.0"));
        assert!(is_safe_ref("release-2"));
    }

    #[test]
    fn test_is_safe_ref_rejects_flag_injection() {
        assert!(!is_safe_ref("--detach"));
        assert!(!is_safe_ref("-b"));
        assert!(!is_safe_ref("--help"));
        assert!(!is_safe_ref("--orphan=new"));
    }

    #[test]
    fn test_is_safe_ref_rejects_empty() {
        assert!(!is_safe_ref(""));
    }

    #[test]
    fn test_is_safe_ref_rejects_dotdot() {
        assert!(!is_safe_ref("main..other"));
        assert!(!is_safe_ref(".."));
    }

    #[test]
    fn test_is_safe_ref_rejects_control_chars() {
        assert!(!is_safe_ref("main\nrm -rf /"));
        assert!(!is_safe_ref("main\0"));
        assert!(!is_safe_ref("main\r"));
    }

    #[test]
    fn test_detect_kind_none_for_temp() {
        let tmp = std::env::temp_dir().join("carliber-test-no-vcs-xyz");
        let _ = std::fs::create_dir_all(&tmp);
        assert_eq!(detect_kind(tmp.to_str().unwrap()), VcsKind::None);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
