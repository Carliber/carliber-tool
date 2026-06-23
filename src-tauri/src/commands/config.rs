// get_config / save_config — ported from electron/ipc/config.js.
// theme is driven by CSS variables on the frontend; the Rust side does not touch
// native theme (Tauri has no electron-nativeTheme equivalent).

use crate::state::{atomic_write, read_json_value, CONFIG_PATH};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_omp_cli_path", rename = "ompCliPath")]
    pub omp_cli_path: String,
    #[serde(default, rename = "windowWidth")]
    pub window_width: i64,
    #[serde(default = "default_window_h", rename = "windowHeight")]
    pub window_height: i64,
    #[serde(default = "neg_one", rename = "windowX")]
    pub window_x: i64,
    #[serde(default = "neg_one", rename = "windowY")]
    pub window_y: i64,
    #[serde(default = "default_close_action", rename = "closeAction")]
    pub close_action: String,
    #[serde(default = "default_ui_font", rename = "uiFontSize")]
    pub ui_font_size: i64,
    #[serde(default = "default_editor_font", rename = "editorFontSize")]
    pub editor_font_size: i64,
    #[serde(default = "default_term_font", rename = "terminalFontSize")]
    pub terminal_font_size: i64,
    #[serde(default = "default_tree_font", rename = "treeFontSize")]
    pub tree_font_size: i64,
    #[serde(default, rename = "rightPanelOpen")]
    pub right_panel_open: bool,
    #[serde(default = "default_true", rename = "beautifyTerminal")]
    pub beautify_terminal: bool,
}

fn default_theme() -> String {
    "light".to_string()
}
fn default_omp_cli_path() -> String {
    "omp".to_string()
}
fn default_window_h() -> i64 {
    800
}
fn neg_one() -> i64 {
    -1
}
fn default_close_action() -> String {
    "ask".to_string()
}
fn default_ui_font() -> i64 {
    14
}
fn default_editor_font() -> i64 {
    13
}
fn default_term_font() -> i64 {
    14
}
fn default_tree_font() -> i64 {
    13
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            theme: default_theme(),
            omp_cli_path: default_omp_cli_path(),
            window_width: 1280,
            window_height: default_window_h(),
            window_x: neg_one(),
            window_y: neg_one(),
            close_action: default_close_action(),
            ui_font_size: default_ui_font(),
            editor_font_size: default_editor_font(),
            terminal_font_size: default_term_font(),
            tree_font_size: default_tree_font(),
            right_panel_open: false,
            beautify_terminal: true,
        }
    }
}

pub fn default_config_value() -> Value {
    serde_json::to_value(AppConfig::default()).unwrap_or(Value::Null)
}

#[tauri::command]
pub fn get_config() -> Value {
    read_json_value(&CONFIG_PATH, default_config_value())
}

#[tauri::command]
pub fn save_config(config: Value) -> bool {
    // Persist whatever the frontend sent (shape is free-form JSON here).
    let data = match serde_json::to_string_pretty(&config) {
        Ok(s) => s,
        Err(_) => return false,
    };
    atomic_write(&CONFIG_PATH, &data).is_ok()
}
