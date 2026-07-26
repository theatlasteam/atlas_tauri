package get.ahmed.atlas.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import get.ahmed.atlas.MainActivity
import get.ahmed.atlas.R

/**
 * Receives the data-only pushes sent by the server (see server/src/push.rs) and
 * turns them into notifications.
 *
 * The payload carries ids and the sender's name but never message content — the
 * server cannot read E2EE bodies, and a plaintext body can exceed FCM's 4KB
 * limit. So this service fetches the message itself and, for encrypted chats,
 * decrypts it through [NativeCrypto]. If anything in that chain fails the
 * notification still fires, just without a preview.
 */
class FcmService : FirebaseMessagingService() {
    companion object {
        private const val TAG = "AtlasPush"
        private const val CHANNEL_ID = "messages"

        /** Schemes whose body is already readable text (mirrors is_text_scheme in the server). */
        private val TEXT_SCHEMES = setOf("plain")

        /**
         * Push the current FCM token to the server. Safe to call whenever —
         * no-ops when signed out or when the server URL hasn't been mirrored
         * into the secrets file yet.
         */
        fun syncToken(context: Context, fcmToken: String) {
            val base = Secrets.serverUrl(context)
            val auth = Secrets.authToken(context)
            if (base == null || auth == null) {
                Log.i(TAG, "not registering push token yet (signed out or no server url)")
                return
            }
            if (PushApi.registerDevice(base, auth, fcmToken)) {
                Log.i(TAG, "push token registered")
            }
        }
    }

    override fun onNewToken(token: String) {
        // Fired on first run and whenever FCM rotates the token.
        Thread { syncToken(applicationContext, token) }.start()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Runs on a Firebase worker thread, so blocking IO here is fine.
        val data = message.data
        if (data["kind"] != "message") return

        // Signed out: drop it silently. The server may still hold this device's
        // token (sign-out can't unregister it — the web layer has no way to read
        // the FCM token), so this guard is what stops a previous account's
        // notifications appearing to whoever holds the phone now.
        if (Secrets.authToken(applicationContext) == null) {
            Log.i(TAG, "push received while signed out, ignoring")
            return
        }

        val chatId = data["chatId"] ?: return
        val messageId = data["messageId"] ?: return
        val senderId = data["senderId"]
        val senderName = data["senderName"]?.takeIf { it.isNotEmpty() } ?: "New message"

        notify(senderName, preview(messageId, senderId), chatId, messageId)
    }

    /**
     * Best-effort message text. Returns null when it can't be resolved, which
     * renders as a notification with no preview rather than no notification.
     */
    private fun preview(messageId: String, senderId: String?): String? {
        val base = Secrets.serverUrl(applicationContext) ?: return null
        val auth = Secrets.authToken(applicationContext) ?: return null

        val msg = PushApi.getMessage(base, auth, messageId) ?: return null
        val scheme = msg.optString("scheme")
        val body = msg.optString("body")
        if (body.isEmpty()) {
            // An attachment-only message has no body to show.
            return if (msg.isNull("attachment")) null else "Attachment"
        }
        if (scheme in TEXT_SCHEMES) return body
        if (scheme == "call-log") return "Call"

        // Encrypted: needs the sender's identity key, then Rust does the rest.
        val sender = senderId ?: return null
        val dir = Secrets.dir(applicationContext)?.absolutePath ?: return null
        val peerKey = PushApi.getIdentityKey(base, auth, sender) ?: return null
        return NativeCrypto.decrypt(dir, peerKey, body)
    }

    private fun notify(title: String, text: String?, chatId: String, messageId: String) {
        // Android 13+ silently drops notifications without this permission.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.i(TAG, "notification permission not granted, dropping push")
            return
        }

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH)
                    .apply { description = "New chat messages" }
            )
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("chatId", chatId)
        }
        val pending = PendingIntent.getActivity(
            this,
            chatId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply { if (text != null) setContentText(text) }
            .build()

        // Keyed on the message so a redelivered push replaces rather than stacks.
        manager.notify(messageId.hashCode(), notification)
    }
}
