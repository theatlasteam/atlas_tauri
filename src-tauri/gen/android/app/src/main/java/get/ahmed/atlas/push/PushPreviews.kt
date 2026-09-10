package get.ahmed.atlas.push

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Plaintext opened by [FcmService] so the in-app Olm path does not decrypt the
 * same ciphertext again (that would fail — the ratchet already advanced).
 */
internal object PushPreviews {
    private const val FILE = "push_previews.json"

    fun put(context: Context, messageId: String, text: String) {
        val dir = Secrets.dir(context) ?: return
        val file = File(dir, FILE)
        val obj = try {
            if (file.isFile) JSONObject(file.readText()) else JSONObject()
        } catch (_: Exception) {
            JSONObject()
        }
        obj.put(messageId, text)
        runCatching { file.writeText(obj.toString()) }
    }
}
