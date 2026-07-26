package get.ahmed.atlas.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Handles Decline on the incoming-call notification. This has to work with the
 * app not running, so it can't go through the WebSocket — it posts to
 * POST /api/calls/{id}/decline using the token in app-private storage.
 */
internal class CallActionReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "AtlasPush"
        const val ACTION_DECLINE = "get.ahmed.atlas.push.DECLINE_CALL"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DECLINE) return
        val callId = intent.getStringExtra(CallNotifier.EXTRA_CALL_ID) ?: return

        // Clear the UI immediately — the network call must not delay it.
        CallNotifier.dismiss(context)

        // goAsync keeps the process alive past onReceive for the HTTP request;
        // without it Android may kill us before it completes, leaving the caller
        // ringing until the server's own timeout.
        val result = goAsync()
        val app = context.applicationContext
        Thread {
            try {
                val base = Secrets.serverUrl(app)
                val auth = Secrets.authToken(app)
                if (base == null || auth == null) {
                    Log.w(TAG, "cannot decline: no server url or token")
                } else if (PushApi.declineCall(base, auth, callId)) {
                    Log.i(TAG, "call declined from notification")
                }
            } finally {
                result.finish()
            }
        }.start()
    }
}
