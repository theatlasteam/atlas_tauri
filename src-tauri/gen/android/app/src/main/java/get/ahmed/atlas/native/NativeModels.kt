package get.ahmed.atlas.native

import org.json.JSONArray
import org.json.JSONObject

/** Minimal view of ChatDto (server/src/models.rs) — only what the native
 * chat-list screen renders. Anything not "plain" is shown as encrypted;
 * this prototype has no E2EE (see NativeChatActivity's banner). */
data class NativeChat(
    val id: String,
    val kind: String,
    val name: String,
    val avatarInitial: String,
    val avatarColor: String,
    val peerUserId: String?,
    val lastMessagePreview: String,
    val unreadCount: Int,
) {
    companion object {
        fun fromJson(o: JSONObject): NativeChat {
            val last = o.optJSONObject("lastMessage")
            val preview = when {
                last == null -> ""
                last.optString("scheme", "plain") == "plain" -> last.optString("body", "")
                else -> "🔒 Encrypted message"
            }
            return NativeChat(
                id = o.getString("id"),
                kind = o.getString("kind"),
                name = o.getString("name"),
                avatarInitial = o.optString("avatarInitial", "?"),
                avatarColor = o.optString("avatarColor", "#94a3b8"),
                peerUserId = if (o.has("peerUserId") && !o.isNull("peerUserId")) o.getString("peerUserId") else null,
                lastMessagePreview = preview,
                unreadCount = o.optInt("unreadCount", 0),
            )
        }

        fun listFromJson(arr: JSONArray): List<NativeChat> =
            (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
    }
}

/** Minimal view of MessageDto — plaintext only; anything else is shown as a
 * placeholder telling the user to switch back to the full app. */
data class NativeMessage(
    val id: String,
    val authorId: String,
    val scheme: String,
    val text: String,
    val sentAt: String,
) {
    companion object {
        fun fromJson(o: JSONObject): NativeMessage {
            val scheme = o.optString("scheme", "plain")
            val text = if (scheme == "plain") o.optString("body", "") else "🔒 Encrypted — open the full app to read this"
            return NativeMessage(
                id = o.getString("id"),
                authorId = o.getString("authorId"),
                scheme = scheme,
                text = text,
                sentAt = o.optString("sentAt", ""),
            )
        }

        fun listFromJson(arr: JSONArray): List<NativeMessage> =
            (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
    }
}
