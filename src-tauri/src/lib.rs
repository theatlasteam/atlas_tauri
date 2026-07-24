mod e2ee;
mod secure;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secure::secret_get,
            secure::secret_set,
            secure::secret_delete,
            e2ee::e2ee_public_key,
            e2ee::e2ee_fingerprint,
            e2ee::e2ee_seal,
            e2ee::e2ee_open,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
