//! Secure secret storage for the auth token (and anything else small).
//!
//! Desktop: the OS keychain (macOS Keychain, Windows Credential Manager,
//! Secret Service on Linux) via the `keyring` crate. If the keychain is
//! unavailable (e.g. headless Linux without a Secret Service), falls back to
//! a 0600 file in the app data dir so the app still works — a weaker but
//! honest fallback.
//!
//! Mobile: the app-sandboxed data dir. On iOS that file is covered by Data
//! Protection (encrypted at rest, per-app); on Android it's app-private
//! storage. This is the platform-blessed location short of writing native
//! Keychain/Keystore plugin code.
//!
//! Never localStorage: webview storage is world-readable on disk, unencrypted,
//! and reachable from any XSS in the webview.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum SecureError {
    #[error("storage unavailable: {0}")]
    Unavailable(String),
}

impl serde::Serialize for SecureError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Guards the fallback file against concurrent command invocations.
static FILE_LOCK: Mutex<()> = Mutex::new(());

fn fallback_path(app: &AppHandle) -> Result<PathBuf, SecureError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| SecureError::Unavailable(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| SecureError::Unavailable(e.to_string()))?;
    Ok(dir.join("secrets.json"))
}

fn file_read(app: &AppHandle) -> Result<HashMap<String, String>, SecureError> {
    let path = fallback_path(app)?;
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| SecureError::Unavailable(format!("corrupt secrets file: {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(SecureError::Unavailable(e.to_string())),
    }
}

fn file_write(app: &AppHandle, map: &HashMap<String, String>) -> Result<(), SecureError> {
    let path = fallback_path(app)?;
    let bytes = serde_json::to_vec(map).map_err(|e| SecureError::Unavailable(e.to_string()))?;
    std::fs::write(&path, bytes).map_err(|e| SecureError::Unavailable(e.to_string()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn file_get(app: &AppHandle, key: &str) -> Result<Option<String>, SecureError> {
    let _guard = FILE_LOCK.lock().unwrap();
    Ok(file_read(app)?.get(key).cloned())
}

fn file_set(app: &AppHandle, key: &str, value: &str) -> Result<(), SecureError> {
    let _guard = FILE_LOCK.lock().unwrap();
    let mut map = file_read(app)?;
    map.insert(key.to_string(), value.to_string());
    file_write(app, &map)
}

fn file_delete(app: &AppHandle, key: &str) -> Result<(), SecureError> {
    let _guard = FILE_LOCK.lock().unwrap();
    let mut map = file_read(app)?;
    if map.remove(key).is_some() {
        file_write(app, &map)?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod backend {
    use super::*;

    const SERVICE: &str = "get.ahmed.atlas";

    pub fn get(app: &AppHandle, key: &str) -> Result<Option<String>, SecureError> {
        match keyring::Entry::new(SERVICE, key).and_then(|e| e.get_password()) {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => file_get(app, key),
        }
    }

    pub fn set(app: &AppHandle, key: &str, value: &str) -> Result<(), SecureError> {
        match keyring::Entry::new(SERVICE, key).and_then(|e| e.set_password(value)) {
            Ok(()) => Ok(()),
            Err(_) => file_set(app, key, value),
        }
    }

    pub fn delete(app: &AppHandle, key: &str) -> Result<(), SecureError> {
        match keyring::Entry::new(SERVICE, key).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => {
                // Also clear any fallback copy from before the keychain worked.
                file_delete(app, key)
            }
            Err(_) => file_delete(app, key),
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
mod backend {
    use super::*;

    pub fn get(app: &AppHandle, key: &str) -> Result<Option<String>, SecureError> {
        file_get(app, key)
    }
    pub fn set(app: &AppHandle, key: &str, value: &str) -> Result<(), SecureError> {
        file_set(app, key, value)
    }
    pub fn delete(app: &AppHandle, key: &str) -> Result<(), SecureError> {
        file_delete(app, key)
    }
}

#[tauri::command]
pub fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, SecureError> {
    backend::get(&app, &key)
}

#[tauri::command]
pub fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), SecureError> {
    backend::set(&app, &key, &value)
}

#[tauri::command]
pub fn secret_delete(app: AppHandle, key: String) -> Result<(), SecureError> {
    backend::delete(&app, &key)
}
