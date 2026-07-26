package get.ahmed.atlas.native

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Minimal REST client for the same API the webview's src/data/api.ts talks
 * to — plain HttpURLConnection + org.json, no OkHttp/Retrofit/Gson, to keep
 * this experimental prototype's dependency footprint at zero beyond what
 * the app already ships (recyclerview/swiperefreshlayout aside).
 *
 * No WebSocket, no retry/backoff, no E2EE — see NativeChatActivity's banner.
 */
class ApiClient(private val serverUrl: String, private val token: String) {
    private val executor = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    private fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        onResult: (Result<JSONObject?>) -> Unit,
    ) {
        executor.execute {
            try {
                val url = URL(serverUrl.trimEnd('/') + path)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = method
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
                }
                val status = conn.responseCode
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() }
                conn.disconnect()
                if (status in 200..299) {
                    main.post { onResult(Result.success(text?.takeIf { it.isNotBlank() }?.let { JSONObject(it) })) }
                } else {
                    val message = text?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }
                    main.post { onResult(Result.failure(Exception(message ?: "HTTP $status"))) }
                }
            } catch (e: Exception) {
                main.post { onResult(Result.failure(e)) }
            }
        }
    }

    /** GET a path that returns a JSON array, wrapped for JSONObject-only `request`. */
    private fun requestArray(path: String, onResult: (Result<org.json.JSONArray>) -> Unit) {
        executor.execute {
            try {
                val url = URL(serverUrl.trimEnd('/') + path)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                val status = conn.responseCode
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() } ?: ""
                conn.disconnect()
                if (status in 200..299) {
                    main.post { onResult(Result.success(org.json.JSONArray(text))) }
                } else {
                    main.post { onResult(Result.failure(Exception("HTTP $status"))) }
                }
            } catch (e: Exception) {
                main.post { onResult(Result.failure(e)) }
            }
        }
    }

    fun me(onResult: (Result<JSONObject?>) -> Unit) = request("GET", "/api/me", onResult = onResult)

    fun listChats(onResult: (Result<List<NativeChat>>) -> Unit) {
        requestArray("/api/chats") { result ->
            onResult(result.map { NativeChat.listFromJson(it) })
        }
    }

    fun listMessages(chatId: String, onResult: (Result<List<NativeMessage>>) -> Unit) {
        requestArray("/api/chats/$chatId/messages?limit=50") { result ->
            onResult(result.map { NativeMessage.listFromJson(it) })
        }
    }

    fun sendMessage(chatId: String, text: String, onResult: (Result<Unit>) -> Unit) {
        val body = JSONObject().apply {
            put("scheme", "plain")
            put("body", text)
            put("clientTag", java.util.UUID.randomUUID().toString())
        }
        request("POST", "/api/chats/$chatId/messages", body) { result ->
            onResult(result.map {})
        }
    }
}
