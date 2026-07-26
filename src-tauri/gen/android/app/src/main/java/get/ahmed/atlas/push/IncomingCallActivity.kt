package get.ahmed.atlas.push

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import get.ahmed.atlas.MainActivity
import get.ahmed.atlas.R

/**
 * Full-screen incoming-call screen, launched by the call notification's
 * full-screen intent so it can appear over the lock screen.
 *
 * Plain Views on purpose: this must render immediately from a cold start, which
 * the WebView-based MainActivity can't do. Answering hands off to MainActivity,
 * where the replayed offer (ws::calls::replay_pending) drives the real call UI.
 */
class IncomingCallActivity : AppCompatActivity() {
    companion object {
        private const val TAG = "AtlasPush"

        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_CALLER_NAME = "callerName"
        const val EXTRA_MEDIA = "media"
        const val EXTRA_AVATAR_PNG = "avatarPng"

        /** Sent by FcmService when the call is over, so this screen closes itself. */
        const val ACTION_CALL_ENDED = "get.ahmed.atlas.push.CALL_ENDED"
    }

    private var callId: String? = null

    /** Closes the screen when the caller gives up or cancels. */
    private val endedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Log.i(TAG, "call ended while ringing, closing full-screen UI")
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Show over the keyguard and light up the screen — without these the
        // activity launches but stays behind the lock screen, invisible.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            )
        }

        setContentView(R.layout.activity_incoming_call)

        callId = intent.getStringExtra(EXTRA_CALL_ID)
        val callerName = intent.getStringExtra(EXTRA_CALLER_NAME) ?: "Incoming call"
        val media = intent.getStringExtra(EXTRA_MEDIA) ?: "audio"

        findViewById<TextView>(R.id.call_name).text = callerName
        findViewById<TextView>(R.id.call_subtitle).text =
            if (media == "video") "Incoming video call" else "Incoming voice call"

        // Already circle-cropped by Avatars before being handed over.
        intent.getByteArrayExtra(EXTRA_AVATAR_PNG)?.let { png ->
            BitmapFactory.decodeByteArray(png, 0, png.size)?.let {
                findViewById<ImageView>(R.id.call_avatar).setImageBitmap(it)
            }
        }

        // Answering is a deliberate drag, not a tap — a pocket tap shouldn't
        // pick up a call.
        findViewById<SlideToAnswerView>(R.id.call_slider).onAnswer = { answer() }
        findViewById<ImageButton>(R.id.call_decline).setOnClickListener { decline() }

        ContextCompat.registerReceiver(
            this,
            endedReceiver,
            IntentFilter(ACTION_CALL_ENDED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        runCatching { unregisterReceiver(endedReceiver) }
    }

    private fun answer() {
        CallNotifier.dismiss(applicationContext)
        // Ask the system to drop the keyguard so the app is actually usable;
        // on a secured lock screen this prompts for the PIN first.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
                .requestDismissKeyguard(this, null)
        }
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(CallNotifier.EXTRA_CALL_ID, callId)
            },
        )
        finish()
    }

    private fun decline() {
        CallNotifier.dismiss(applicationContext)
        val id = callId
        val app = applicationContext
        if (id != null) {
            // Fire and forget: the screen closes immediately either way, and the
            // server's ring timeout covers the request failing.
            Thread {
                val base = Secrets.serverUrl(app)
                val auth = Secrets.authToken(app)
                if (base != null && auth != null) PushApi.declineCall(base, auth, id)
            }.start()
        }
        finish()
    }
}
