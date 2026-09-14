mod e2ee;
mod e2ee2;
mod e2ee_megolm;
mod plugins;
mod secure;

// JNI shim letting the Android push notification service decrypt a message
// body without a second copy of the crypto in Kotlin.
#[cfg(target_os = "android")]
mod android_push;

/// Wayland (and many X11 panels) look up the taskbar icon by app_id + a
/// freedesktop icon named after `identifier`. `tauri dev` never installs a
/// .desktop file, so the compositor falls back to the generic Wayland "W".
#[cfg(target_os = "linux")]
fn install_linux_app_icon() {
    let Ok(home) = std::env::var("HOME") else { return };
    let icon_dir = format!("{home}/.local/share/icons/hicolor/512x512/apps");
    let apps_dir = format!("{home}/.local/share/applications");
    let _ = std::fs::create_dir_all(&icon_dir);
    let _ = std::fs::create_dir_all(&apps_dir);
    let png = include_bytes!("../icons/logo-fg.png");
    let icon_path = format!("{icon_dir}/get.ahmed.atlas.png");
    let _ = std::fs::write(&icon_path, png);
    for dir in [
        format!("{home}/.local/share/icons/hicolor/32x32/apps"),
        format!("{home}/.local/share/icons/hicolor/48x48/apps"),
        format!("{home}/.local/share/icons/hicolor/64x64/apps"),
        format!("{home}/.local/share/icons/hicolor/128x128/apps"),
        format!("{home}/.local/share/icons/hicolor/256x256/apps"),
        format!("{home}/.local/share/pixmaps"),
    ] {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(format!("{dir}/get.ahmed.atlas.png"), png);
        let _ = std::fs::write(format!("{dir}/atlas.png"), png);
    }
    let _ = std::process::Command::new("gtk-update-icon-cache")
        .args(["-f", "-t", &format!("{home}/.local/share/icons/hicolor")])
        .status();
    let exec = std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "atlas".into());
    let desktop = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Atlas\n\
         Comment=Atlas Messenger\n\
         Exec={exec}\n\
         Icon={icon_path}\n\
         Terminal=false\n\
         Categories=Network;InstantMessaging;Chat;\n\
         StartupNotify=true\n\
         StartupWMClass=get.ahmed.atlas\n\
         X-GNOME-UsesNotifications=true\n"
    );
    let _ = std::fs::write(format!("{apps_dir}/get.ahmed.atlas.desktop"), &desktop);
    // productName is `atlas`, so some compositors match WM_CLASS=atlas instead.
    let desktop_short = desktop.replace(
        "StartupWMClass=get.ahmed.atlas",
        "StartupWMClass=atlas",
    );
    let _ = std::fs::write(format!("{apps_dir}/atlas.desktop"), desktop_short);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    install_linux_app_icon();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/logo-fg.png")) {
                    let _ = win.set_icon(icon);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secure::secret_get,
            secure::secret_set,
            secure::secret_delete,
            e2ee::e2ee_public_key,
            e2ee::e2ee_fingerprint,
            e2ee::e2ee_seal,
            e2ee::e2ee_open,
            e2ee2::e2ee2_bundle,
            e2ee2::e2ee2_new_prekeys,
            e2ee2::e2ee2_start_session,
            e2ee2::e2ee2_encrypt,
            e2ee2::e2ee2_decrypt,
            e2ee2::e2ee2_has_session,
            e2ee2::e2ee2_remote_identity,
            e2ee2::e2ee2_forget_peer,
            e2ee2::e2ee2_reset_account,
            e2ee2::e2ee2_fingerprint,
            e2ee2::take_push_preview,
            e2ee_megolm::megolm_encrypt,
            e2ee_megolm::megolm_import_key,
            e2ee_megolm::megolm_decrypt,
            plugins::plugin_list,
            plugins::plugin_save,
            plugins::plugin_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
