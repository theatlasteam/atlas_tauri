package get.ahmed.atlas.push

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * The handful of REST calls the notification path needs. Deliberately plain
 * HttpURLConnection with no new dependencies, matching the native/ prototype's
 * ApiClient. All calls block, and are only ever made from FirebaseMessagingService
 * worker threads or a background thread.
 */
internal object PushApi {
    private const val TAG = "AtlasPush"
    private const val TIMEOUT_MS = 15_000

    private fun request(
        base: String,
        path: String,
        token: String,
        method: String = "GET",
        payload: JSONObject? = null,
    ): String? {
        return try {
            val conn = (URL("$base$path").openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Authorization", "Bearer $token")
                if (payload != null) {
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                }
            }
            if (payload != null) {
                conn.outputStream.use { it.write(payload.toString().toByteArray()) }
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "$method $path -> $code")
                conn.errorStream?.close()
                return null
            }
            conn.inputStream.bufferedReader().use(BufferedReader::readText)
        } catch (e: Exception) {
            Log.w(TAG, "$method $path failed: ${e.message}")
            null
        }
    }

    /** Register this device's FCM token. Idempotent server-side. */
    fun registerDevice(base: String, token: String, fcmToken: String): Boolean {
        val payload = JSONObject().put("token", fcmToken).put("platform", "android")
        return request(base, "/api/devices", token, "POST", payload) != null
    }

    fun unregisterDevice(base: String, token: String, fcmToken: String): Boolean =
        request(base, "/api/devices/$fcmToken", token, "DELETE") != null

    /** The message a push refers to: `scheme` plus an opaque or plaintext `body`. */
    fun getMessage(base: String, token: String, messageId: String): JSONObject? =
        request(base, "/api/messages/$messageId", token)?.let {
            try {
                JSONObject(it)
            } catch (e: Exception) {
                null
            }
        }

    /** The sender's published X25519 identity key (base64), needed to decrypt. */
    fun getIdentityKey(base: String, token: String, userId: String): String? =
        request(base, "/api/keys/identity/$userId", token)?.let {
            try {
                JSONObject(it).optString("identityKey").takeIf { k -> k.isNotEmpty() }
            } catch (e: Exception) {
                null
            }
        }
}
