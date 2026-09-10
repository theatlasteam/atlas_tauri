package get.ahmed.atlas

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import get.ahmed.atlas.push.CallNotifier
import get.ahmed.atlas.push.FcmService
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private companion object {
    const val TAG = "AtlasPush"
    const val REQ_NOTIFICATIONS = 4001
    const val PREF_ASKED_FSI = "asked_full_screen_intent"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestNotificationPermission()
    ensureFullScreenIntentAccess()
    syncPushToken()
    clearCallNotification(intent)
    injectAutoAnswer(intent)
  }

  /**
   * Apps targeting SDK 34+ that aren't registered calling apps are denied
   * full-screen-intent access by default, which means an incoming call shows
   * nothing at all on a locked screen. It can only be granted by the user in
   * Settings, so offer that once rather than nagging on every launch.
   */
  private fun ensureFullScreenIntentAccess() {
    if (Build.VERSION.SDK_INT < 34) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.canUseFullScreenIntent()) return

    val prefs = getSharedPreferences("atlas_push", MODE_PRIVATE)
    if (prefs.getBoolean(PREF_ASKED_FSI, false)) return

    AlertDialog.Builder(this)
      .setTitle("Show calls on the lock screen")
      .setMessage(
        "Android needs permission to show a full-screen call screen. " +
          "Without it, incoming calls only appear as a notification banner."
      )
      .setPositiveButton("Open settings") { _, _ ->
        prefs.edit().putBoolean(PREF_ASKED_FSI, true).apply()
        runCatching {
          startActivity(
            Intent(
              Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
              Uri.parse("package:$packageName"),
            )
          )
        }.onFailure { Log.w(TAG, "could not open full-screen-intent settings: ${it.message}") }
      }
      .setNegativeButton("Not now") { _, _ ->
        prefs.edit().putBoolean(PREF_ASKED_FSI, true).apply()
      }
      .show()
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    clearCallNotification(intent)
    injectAutoAnswer(intent)
  }

  /**
   * Native Answer (full-screen or CallStyle) opens the app *and* tells the
   * webview to send the SDP answer as soon as the pending offer is replayed.
   * Without this flag the overlay waits for a second Accept tap.
   */
  private fun injectAutoAnswer(intent: Intent?) {
    val callId = intent?.getStringExtra(CallNotifier.EXTRA_CALL_ID) ?: return
    if (intent.getBooleanExtra(CallNotifier.EXTRA_ANSWER, false).not()) return
    val js =
      "window.__atlasAutoAnswerCallId=${JSONObject.quote(callId)};" +
        "window.dispatchEvent(new CustomEvent('atlas-auto-answer',{detail:${JSONObject.quote(callId)}}));"
    fun tryInject(left: Int) {
      val web = findWebView(window.decorView)
      if (web != null) {
        web.evaluateJavascript(js, null)
        return
      }
      if (left <= 0) return
      window.decorView.postDelayed({ tryInject(left - 1) }, 150)
    }
    window.decorView.post { tryInject(40) }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  /**
   * Launched from Answer on a call notification. The notification's job ends
   * here: the server replays the pending offer once the socket connects, so the
   * in-app call UI takes over from this point.
   */
  private fun clearCallNotification(intent: android.content.Intent?) {
    if (intent?.getStringExtra(CallNotifier.EXTRA_CALL_ID) == null) return
    CallNotifier.dismiss(applicationContext)
  }

  /** Android 13+ silently drops notifications unless this is granted at runtime. */
  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED
    ) return
    ActivityCompat.requestPermissions(
      this,
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      REQ_NOTIFICATIONS,
    )
  }

  /**
   * FcmService.onNewToken only fires when the token is created or rotated,
   * which usually happens before the user has signed in. So re-register on
   * every launch — the endpoint is idempotent, and this is what actually ties
   * an existing device token to the account now signed in.
   */
  private fun syncPushToken() {
    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        Log.w(TAG, "could not obtain FCM token: ${task.exception?.message}")
        return@addOnCompleteListener
      }
      val token = task.result ?: return@addOnCompleteListener
      Thread { FcmService.syncToken(applicationContext, token) }.start()
    }
  }
}
