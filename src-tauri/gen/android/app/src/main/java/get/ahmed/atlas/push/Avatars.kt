package get.ahmed.atlas.push

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import android.util.Log
import java.io.BufferedInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Builds the round avatar bitmap used as a notification's large icon.
 *
 * Two tiers, mirroring the web Avatar component: the uploaded photo when the
 * user has one, otherwise a coloured circle with their initial. Falling back
 * rather than showing the app logo means the notification always identifies a
 * person, which is the whole point of the large icon.
 */
internal object Avatars {
    private const val TAG = "AtlasPush"
    private const val TIMEOUT_MS = 10_000

    /** Large icons are displayed small; 128px is ample and keeps decoding cheap. */
    private const val SIZE = 128

    /**
     * @param hasPhoto when false the network call is skipped entirely — the
     *   server already told us there's no photo to fetch.
     */
    fun forSender(
        base: String,
        authToken: String,
        userId: String,
        hasPhoto: Boolean,
        initial: String,
        colorHex: String,
    ): Bitmap {
        if (hasPhoto) {
            fetch(base, authToken, userId)?.let { return circleCrop(it) }
        }
        return initialsCircle(initial, colorHex)
    }

    /**
     * PNG bytes, for handing an already-decoded avatar to another activity via
     * an Intent extra. A 128px circle compresses to a few KB, comfortably under
     * the Binder transaction limit that a raw Bitmap extra would risk.
     */
    fun toPng(bitmap: Bitmap): ByteArray? = try {
        java.io.ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }
    } catch (e: Exception) {
        Log.w(TAG, "avatar encode failed: ${e.message}")
        null
    }

    private fun fetch(base: String, authToken: String, userId: String): Bitmap? {
        return try {
            val conn = (URL("$base/api/users/$userId/avatar").openConnection() as HttpURLConnection)
                .apply {
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    setRequestProperty("Authorization", "Bearer $authToken")
                }
            if (conn.responseCode !in 200..299) {
                // 404 simply means the photo was removed since the push was sent.
                conn.errorStream?.close()
                return null
            }
            conn.inputStream.use { BitmapFactory.decodeStream(BufferedInputStream(it)) }
        } catch (e: Exception) {
            Log.w(TAG, "avatar fetch failed: ${e.message}")
            null
        }
    }

    /** Centre-crop to a square, then mask to a circle. */
    private fun circleCrop(src: Bitmap): Bitmap {
        val edge = minOf(src.width, src.height)
        val left = (src.width - edge) / 2
        val top = (src.height - edge) / 2

        val out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val square = Bitmap.createBitmap(src, left, top, edge, edge)
        val scaled = square.scale(SIZE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }
        val r = SIZE / 2f
        canvas.drawCircle(r, r, r, paint)
        return out
    }

    private fun Bitmap.scale(size: Int): Bitmap =
        if (width == size && height == size) this
        else Bitmap.createScaledBitmap(this, size, size, true)

    /** Coloured disc with a centred initial — the no-photo fallback. */
    private fun initialsCircle(initial: String, colorHex: String): Bitmap {
        val out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val r = SIZE / 2f

        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(colorHex) }
        canvas.drawCircle(r, r, r, bg)

        val letter = initial.take(1).uppercase().ifEmpty { "?" }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = SIZE * 0.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        // Centre on the glyph's own bounds rather than the font metrics, so
        // letters with different heights all sit visually centred.
        val bounds = Rect()
        text.getTextBounds(letter, 0, letter.length, bounds)
        canvas.drawText(letter, r, r + bounds.height() / 2f, text)
        return out
    }

    private fun parseColor(hex: String): Int = try {
        Color.parseColor(if (hex.startsWith("#")) hex else "#$hex")
    } catch (e: IllegalArgumentException) {
        // Neutral slate, matching the server's own avatar_color fallback.
        Color.parseColor("#94a3b8")
    }
}
