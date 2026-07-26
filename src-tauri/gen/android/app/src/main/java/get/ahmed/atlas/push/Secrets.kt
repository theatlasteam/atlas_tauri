package get.ahmed.atlas.push

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * Read-only view of the secrets file the Rust core writes (see
 * src-tauri/src/secure.rs). On Android there is no OS keychain in use, so the
 * auth token and the E2EE identity secret both live in an app-private
 * `secrets.json` (mode 0600) as a flat string map.
 *
 * Only the auth token and server URL are read here. The identity secret is
 * deliberately left alone — decryption happens inside Rust via [NativeCrypto],
 * so the private key never enters the JVM heap.
 */
internal object Secrets {
    private const val TAG = "AtlasPush"
    private const val FILE = "secrets.json"

    const val KEY_AUTH_TOKEN = "auth_token"
    const val KEY_SERVER_URL = "server_url"

    /**
     * Directory containing [FILE]. Tauri's `app_data_dir()` does not map to a
     * single fixed Context accessor across platform versions, so rather than
     * hardcode a guess we probe the candidates and return whichever actually
     * holds the file. That directory is also what [NativeCrypto] is handed.
     */
    fun dir(context: Context): File? {
        val candidates = listOf(context.filesDir, context.dataDir, File(context.dataDir, "files"))
        return candidates.firstOrNull { File(it, FILE).isFile }
    }

    private fun read(context: Context): JSONObject? {
        val dir = dir(context) ?: return null
        return try {
            JSONObject(File(dir, FILE).readText())
        } catch (e: Exception) {
            Log.w(TAG, "could not read $FILE: ${e.message}")
            null
        }
    }

    /** Null when signed out — the token is deleted on sign-out. */
    fun authToken(context: Context): String? =
        read(context)?.optString(KEY_AUTH_TOKEN)?.takeIf { it.isNotEmpty() }

    /**
     * Base API URL, mirrored here by the web layer on sign-in. It normally
     * lives in localStorage, which is not reachable from a background service.
     */
    fun serverUrl(context: Context): String? =
        read(context)?.optString(KEY_SERVER_URL)?.takeIf { it.isNotEmpty() }?.trimEnd('/')
}
