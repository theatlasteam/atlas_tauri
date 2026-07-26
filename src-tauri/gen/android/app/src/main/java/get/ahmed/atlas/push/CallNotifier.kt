package get.ahmed.atlas.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import get.ahmed.atlas.MainActivity
import get.ahmed.atlas.R

/**
 * Incoming-call notification.
 *
 * Answering only opens the app: the server retains the caller's SDP offer for
 * the duration of the ring and replays it when the socket connects
 * (ws::calls::replay_pending), so the in-app call UI comes up on its own. That
 * avoids having to plumb a call hand-off from Kotlin into the webview.
 *
 * Declining, by contrast, must work with the app closed, so it posts straight
 * to the server from a broadcast receiver — see [CallActionReceiver].
 */
internal object CallNotifier {
    private const val TAG = "AtlasPush"

    const val CHANNEL_ID = "calls"

    /** One incoming call at a time, so a fixed id is enough to cancel it. */
    const val NOTIFICATION_ID = 7001

    const val EXTRA_CALL_ID = "callId"

    /** Matches RING_TIMEOUT in the server, as a backstop if no dismissal arrives. */
    private const val RING_TIMEOUT_MS = 60_000L

    fun showIncoming(
        context: Context,
        callId: String,
        callerName: String,
        media: String,
        avatar: Bitmap?,
        avatarPng: ByteArray?,
    ) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannel(manager)

        // Full-screen ring UI. On API 34+ this is inert unless the user has
        // granted the full-screen-intent special access (see
        // MainActivity.ensureFullScreenIntentAccess) — apps targeting 34+ that
        // aren't registered calling apps are denied it by default, which is why
        // a locked screen otherwise shows nothing at all.
        val fullScreenIntent = PendingIntent.getActivity(
            context,
            3,
            Intent(context, IncomingCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId)
                putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, callerName)
                putExtra(IncomingCallActivity.EXTRA_MEDIA, media)
                putExtra(IncomingCallActivity.EXTRA_AVATAR_PNG, avatarPng)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        if (Build.VERSION.SDK_INT >= 34 && !manager.canUseFullScreenIntent()) {
            Log.w(
                TAG,
                "full-screen intent not permitted; ringing as a heads-up notification only",
            )
        }

        // Activity PendingIntent, not a broadcast: a receiver cannot launch an
        // activity from the background on Android 10+, but a notification action
        // that *is* an activity intent may.
        val answerIntent = PendingIntent.getActivity(
            context,
            1,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_CALL_ID, callId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val declineIntent = PendingIntent.getBroadcast(
            context,
            2,
            Intent(context, CallActionReceiver::class.java).apply {
                action = CallActionReceiver.ACTION_DECLINE
                putExtra(EXTRA_CALL_ID, callId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val caller = Person.Builder()
            .setName(callerName)
            .setImportant(true)
            .apply { if (avatar != null) setIcon(IconCompat.createWithBitmap(avatar)) }
            .build()

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(callerName)
            .setContentText(
                if (media == "video") "Incoming video call" else "Incoming voice call"
            )
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Backstop: if neither a dismissal push nor the app clears this, it
            // still goes away when the server would have given up ringing.
            .setTimeoutAfter(RING_TIMEOUT_MS)
            // Launches the native ring screen, which can show over the
            // keyguard. Degrades to this heads-up notification where the
            // permission isn't granted.
            .setFullScreenIntent(fullScreenIntent, true)

        // CallStyle gives the proper two-button call layout on API 31+ and
        // degrades to plain actions below it.
        builder.setStyle(
            NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, answerIntent)
        )

        manager.notify(NOTIFICATION_ID, builder.build())
    }

    fun dismiss(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID)
    }

    /**
     * Separate channel from messages so it can carry the ringtone and its own
     * importance. Channel settings are immutable after creation, which is why
     * the ringtone can't just be set per-notification.
     */
    private fun createChannel(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "Incoming voice and video calls"
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 1000, 1000)
        channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        manager.createNotificationChannel(channel)
    }
}
