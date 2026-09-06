//! Synchronous key/value bag the JS host hydrates from IndexedDB.
//! WASM crypto stays identical to the Tauri core; only persistence differs.

use std::collections::HashMap;
use std::sync::Mutex;

static STORE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn map() -> std::sync::MutexGuard<'static, Option<HashMap<String, String>>> {
    STORE.lock().unwrap_or_else(|p| p.into_inner())
}

pub fn hydrate(json: &str) {
    let parsed: HashMap<String, String> = serde_json::from_str(json).unwrap_or_default();
    *map() = Some(parsed);
}

pub fn dump() -> String {
    let guard = map();
    let empty = HashMap::new();
    let m = guard.as_ref().unwrap_or(&empty);
    serde_json::to_string(m).unwrap_or_else(|_| "{}".into())
}

pub fn secret_get(key: impl AsRef<str>) -> Result<Option<String>, String> {
    let guard = map();
    Ok(guard.as_ref().and_then(|m| m.get(key.as_ref()).cloned()))
}

pub fn secret_set(key: impl Into<String>, value: impl Into<String>) -> Result<(), String> {
    let mut guard = map();
    guard.get_or_insert_with(HashMap::new).insert(key.into(), value.into());
    Ok(())
}

pub fn secret_delete(key: impl AsRef<str>) -> Result<(), String> {
    if let Some(m) = map().as_mut() {
        m.remove(key.as_ref());
    }
    Ok(())
}
