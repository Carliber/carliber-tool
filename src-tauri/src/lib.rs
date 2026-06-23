// carliber-tool — Tauri 2 entrypoint.
// Sets up the main window, tray, single-instance handling, window-management
// commands (select_project / open_project_selector / open_agent_settings), and
// registers every domain command. PTY + watcher cleanup is wired into lifecycle hooks.

mod commands;
mod state;

use commands::pty as pty_cmd;
use serde_json::Value;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

use state::{log_line, read_json_value, write_json, CONFIG_PATH};

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

/// Load saved bounds from config.json. Returns (w, h, x, y) or defaults.
fn saved_bounds() -> (u32, u32, Option<i32>, Option<i32>) {
    let cfg = read_json_value(&CONFIG_PATH, Value::Null);
    let w = cfg
        .get("windowWidth")
        .and_then(|v| v.as_i64())
        .unwrap_or(1280) as u32;
    let h = cfg
        .get("windowHeight")
        .and_then(|v| v.as_i64())
        .unwrap_or(800) as u32;
    let x = cfg
        .get("windowX")
        .and_then(|v| v.as_i64())
        .filter(|v| *v >= 0)
        .map(|v| v as i32);
    let y = cfg
        .get("windowY")
        .and_then(|v| v.as_i64())
        .filter(|v| *v >= 0)
        .map(|v| v as i32);
    (w, h, x, y)
}

/// Persist the main window bounds into config.json.
fn save_window_state(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let mut cfg = read_json_value(&CONFIG_PATH, commands::config::default_config_value());
        if let Ok(size) = win.outer_size() {
            cfg["windowWidth"] = Value::from(size.width as i64);
            cfg["windowHeight"] = Value::from(size.height as i64);
        }
        if let Ok(pos) = win.outer_position() {
            cfg["windowX"] = Value::from(pos.x as i64);
            cfg["windowY"] = Value::from(pos.y as i64);
        }
        let _ = write_json(&CONFIG_PATH, &cfg);
    }
}

/// Build a frameless window loading `index.html#<hash>` with the given size.
fn spawn_window(
    app: &AppHandle,
    label: &str,
    hash: &str,
    title: &str,
    width: u32,
    height: u32,
    min_w: u32,
    min_h: u32,
) -> tauri::Result<()> {
    // Reuse existing window if present.
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let url = if hash.is_empty() {
        WebviewUrl::App("/".into())
    } else {
        WebviewUrl::App(format!("index.html#{}", hash).into())
    };
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(width as f64, height as f64)
        .min_inner_size(min_w as f64, min_h as f64)
        .decorations(false)
        .visible(false)
        .resizable(true)
        .center();
    if let (Some(x), Some(y)) = {
        let (_w, _h, x, y) = saved_bounds();
        (x, y)
    } {
        // only applied for main window
        if label == "main" {
            builder = builder.position(x as f64, y as f64);
        }
    }
    let win = builder.build()?;
    let label_clone = label.to_string();
    let app_handle_clone = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } => {
            // Kill PTYs owned by this window on close.
            pty_cmd::kill_by_owner(&label_clone);
            if label_clone == "main" {
                save_window_state(&app_handle_clone);
            }
        }
        _ => {}
    });
    // Show after build (Tauri has no ready-to-show for webview windows; show immediately).
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

// ---------------------------------------------------------------------------
// Window-management commands (formerly IPC channels)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn select_project(project_id: String, app: AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Close project selector if open.
        if let Some(sel) = app2.get_webview_window("project-selector") {
            let _ = sel.close();
        }
        let projects = commands::projects::get_projects();
        let name = projects
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&project_id))
            .and_then(|p| p.get("name").and_then(|v| v.as_str()).map(String::from))
            .unwrap_or_else(|| "carliber-tool".to_string());
        let label = format!("workspace-{}", project_id);
        spawn_window(&app2, &label, &format!("workspace/{}", project_id), &name, 1280, 800, 960, 600)
    }).await.map_err(|e| format!("{:?}", e))?
        .map_err(|e| format!("{:?}", e))
}

#[tauri::command]
async fn open_project_selector(app: AppHandle) -> Result<(), String> {
    log_line("INFO", vec!["open_project_selector called".to_string()]);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        spawn_window(&app2, "project-selector", "project-selector", "选择项目", 720, 560, 480, 400)
    }).await.map_err(|e| format!("{:?}", e))?
        .map_err(|e| {
            log_line("ERROR", vec![format!("open_project_selector failed: {:?}", e)]);
            format!("{:?}", e)
        })
}

#[tauri::command]
async fn open_agent_settings(app: AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        spawn_window(&app2, "agent-settings", "agent-settings", "全局设置", 800, 640, 480, 400)
    }).await.map_err(|e| format!("{:?}", e))?
        .map_err(|e| format!("{:?}", e))
}
/// Close the current popup window. Replaces IPC close-popup.
#[tauri::command]
fn close_popup(window: tauri::WebviewWindow) {
    let _ = window.close();
}

/// Renderer error reporting — writes a line to the app log. Replaces IPC renderer-error.
#[tauri::command]
fn renderer_error(message: String, source: String, line: i64, col: i64, error: String) {
    log_line(
        "ERROR",
        vec![format!(
            "Renderer error: {} at {}:{}:{} {}",
            message, source, line, col, error
        )],
    );
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

fn build_tray(app: &AppHandle) {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::TrayIconBuilder;
    let show = MenuItemBuilder::with_id("show", "显示主窗口").build(app).ok();
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app).ok();
    let mut menu = MenuBuilder::new(app);
    if let Some(s) = show {
        menu = menu.item(&s);
    }
    if let Some(q) = quit {
        menu = menu.item(&q);
    }
    let menu = match menu.build() {
        Ok(m) => m,
        Err(_) => return,
    };
    let _ = TrayIconBuilder::with_id("main-tray")
        .tooltip("carliber-tool")
        .icon(app.default_window_icon().cloned().expect("icon"))
        .menu(&menu)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                pty_cmd::kill_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, _event| {
            let app = tray.app_handle();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        })
        .build(app);
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            // config / projects
            commands::config::get_config,
            commands::config::save_config,
            commands::projects::get_projects,
            commands::projects::save_projects,
            // files
            commands::files::read_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::create_file,
            commands::files::create_dir,
            commands::files::rename_path,
            commands::files::delete_path,
            commands::files::watch_dir,
            commands::files::unwatch_dir,
            // sessions (omp)
            commands::sessions::get_sessions,
            commands::sessions::get_session_messages,
            commands::sessions::get_last_session_time,
            commands::sessions::delete_session,
            commands::sessions::scan_omp_projects,
            // pty
            commands::pty::pty_create,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            // system
            commands::system::open_directory,
            commands::system::open_native_terminal,
            commands::system::open_directory_picker,
            commands::system::open_file_picker,
            commands::system::detect_omp_cli,
            commands::system::export_backup,
            commands::system::import_backup,
            // agent config (multi-agent)
            commands::agent_config::get_agent_global_config,
            commands::agent_config::save_agent_global_config,
            commands::agent_config::get_agent_project_config,
            commands::agent_config::save_agent_project_config,
            commands::agent_config::get_agent_rules,
            commands::agent_config::save_agent_rule,
            commands::agent_config::delete_agent_rule,
            commands::agent_config::get_agent_instructions,
            commands::agent_config::save_agent_instructions,
            commands::agent_config::list_agent_skills,
            commands::agent_config::get_omp_dir,
            commands::agent_config::agent_instructions_filename,
            // workflows + ai command search + history
            commands::workflows::get_workflows,
            commands::workflows::save_workflow,
            commands::workflows::delete_workflow,
            commands::workflows::ai_command_search,
            commands::workflows::get_history,
            commands::workflows::save_history,
            // window management + errors
            select_project,
            open_project_selector,
            open_agent_settings,
            close_popup,
            renderer_error,
            // version control (git + svn)
            commands::vcs::vcs_detect,
            commands::vcs::vcs_status,
            commands::vcs::vcs_stage,
            commands::vcs::vcs_unstage,
            commands::vcs::vcs_commit,
            commands::vcs::vcs_pull,
            commands::vcs::vcs_push,
            commands::vcs::vcs_fetch,
            commands::vcs::vcs_log,
            commands::vcs::vcs_diff,
            commands::vcs::vcs_branches,
            commands::vcs::vcs_checkout,
            commands::vcs::vcs_discard,
        ])
        .setup(|app| {
            state::ensure_data_dirs();
            log_line("INFO", vec!["=== carliber-tool starting ===".to_string()]);

            // The main window is declared in tauri.conf.json; show it once ready.
            if let Some(main) = app.get_webview_window("main") {
                let (w, h, x, y) = saved_bounds();
                let _ = main.set_size(LogicalSize::new(w as f64, h as f64));
                if let (Some(x), Some(y)) = (x, y) {
                    let _ = main.set_position(PhysicalPosition::new(x as i32, y as i32));
                }
                let _ = main.show();
                let _ = main.set_focus();
            }
            build_tray(app.handle());

            // Reopen a workspace on startup if there is a most-recently-opened project.
            let projects = commands::projects::get_projects();
            let last = projects
                .iter()
                .filter_map(|p| {
                    p.get("lastOpenedAt")
                        .and_then(|v| v.as_str())
                        .map(|t| (t.to_string(), p))
                })
                .max_by(|(a, _), (b, _)| a.cmp(b))
                .map(|(_, p)| p);
            if let Some(p) = last {
                if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                    if let Some(main) = app.get_webview_window("main") {
                        let app2 = app.handle().clone();
                        let id2 = id.to_string();
                        let name = p
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("carliber-tool")
                            .to_string();
                        // Defer to next tick so main window is fully shown first.
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            let app3 = app2.clone();
                            let label = format!("workspace-{}", id2);
                            let name_clone = name.clone();
                            let id3 = id2.clone();
                            let _ = tauri::async_runtime::spawn_blocking(move || {
                                spawn_window(&app3, &format!("workspace-{}", id3), &format!("workspace/{}", id3), &name_clone, 1280, 800, 960, 600)
                            }).await;
                            if let Some(m) = app2.get_webview_window("main") {
                                let _ = m.hide();
                            }
                        });
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let label = window.label().to_string();
                pty_cmd::kill_by_owner(&label);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                pty_cmd::kill_all();
                commands::files::unwatch_all();
                save_window_state(app);
            }
        });
}
