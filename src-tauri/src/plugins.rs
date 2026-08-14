//! Installed-plugin storage. The plugin *runtime* lives in the webview
//! (src/plugins/runtime.ts) — the JS there has to be evaluated in the page
//! context anyway. What the Rust core owns is the persistence: one JSON file
//! per plugin in the app data dir's `plugins/` folder, so installed plugins
//! survive app updates and live somewhere a package manager would put them
//! rather than in localStorage (which the rest of this codebase deliberately
//! avoids for anything that isn't a cache — see secure.rs).

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("storage unavailable: {0}")]
    Unavailable(String),
}

impl serde::Serialize for PluginError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// A single installed plugin, persisted verbatim as JSON. `files` is the
/// workspace (manifest.json, main.js, …) as filename -> source; `enabled`
/// whether the runtime should load it on startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRecord {
    pub plugin_id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    pub files: BTreeMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

static FILE_LOCK: Mutex<()> = Mutex::new(());

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, PluginError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| PluginError::Unavailable(e.to_string()))?
        .join("plugins");
    std::fs::create_dir_all(&dir).map_err(|e| PluginError::Unavailable(e.to_string()))?;
    Ok(dir)
}

fn plugin_path(app: &AppHandle, plugin_id: &str) -> Result<PathBuf, PluginError> {
    // plugin_id is validated to [a-z0-9._-] by callers of plugin_save, but
    // belt-and-braces: never let it escape the plugins dir as a path segment.
    if plugin_id.is_empty()
        || plugin_id.len() > 128
        || !plugin_id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_' | '.'))
    {
        return Err(PluginError::Unavailable("invalid pluginId".into()));
    }
    Ok(plugins_dir(app)?.join(format!("{plugin_id}.json")))
}

fn read_all(app: &AppHandle) -> Result<Vec<PluginRecord>, PluginError> {
    let dir = plugins_dir(app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| PluginError::Unavailable(e.to_string()))? {
        let entry = entry.map_err(|e| PluginError::Unavailable(e.to_string()))?;
        let Ok(record) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Ok(plugin) = serde_json::from_str::<PluginRecord>(&record) {
            out.push(plugin);
        }
    }
    // Stable order for the settings list; each call re-reads the dir so the
    // UI always shows what's really on disk.
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn plugin_list(app: AppHandle) -> Result<Vec<PluginRecord>, PluginError> {
    let _guard = FILE_LOCK.lock().unwrap();
    read_all(&app)
}

#[tauri::command]
pub fn plugin_save(app: AppHandle, record: PluginRecord) -> Result<PluginRecord, PluginError> {
    let _guard = FILE_LOCK.lock().unwrap();
    let path = plugin_path(&app, &record.plugin_id)?;
    let bytes =
        serde_json::to_vec_pretty(&record).map_err(|e| PluginError::Unavailable(e.to_string()))?;
    std::fs::write(&path, bytes).map_err(|e| PluginError::Unavailable(e.to_string()))?;
    Ok(record)
}

#[tauri::command]
pub fn plugin_remove(app: AppHandle, plugin_id: String) -> Result<(), PluginError> {
    let _guard = FILE_LOCK.lock().unwrap();
    let path = plugin_path(&app, &plugin_id)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(PluginError::Unavailable(e.to_string())),
    }
}
