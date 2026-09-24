package get.ahmed.atlas

import android.os.Bundle

/**
 * Secondary Tauri activity for multi-window on mobile.
 *
 * Every `WebviewWindow` created from JS with `activityName:
 * "SecondaryActivity"` lands here, pushed onto the system back stack — so
 * the Android back button/gesture pops back to MainActivity for free.
 * On large screens (tablets/foldables, API 32+) Activity Embedding shows it
 * side-by-side with MainActivity per res/xml/main_split_config.xml.
 *
 * Deliberately minimal: push wiring (FCM token, notifications, call
 * intents) lives in MainActivity only. Auth/E2EE state is shared via the
 * Rust core + app-private storage, and live updates via Tauri events.
 */
class SecondaryActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }
}
