package get.ahmed.atlas

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import get.ahmed.atlas.push.FcmService

class MainActivity : TauriActivity() {
  private companion object {
    const val TAG = "AtlasPush"
    const val REQ_NOTIFICATIONS = 4001
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestNotificationPermission()
    syncPushToken()
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
