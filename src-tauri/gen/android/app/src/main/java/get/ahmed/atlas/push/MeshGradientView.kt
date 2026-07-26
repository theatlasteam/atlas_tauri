package get.ahmed.atlas.push

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.cos
import kotlin.math.sin

/**
 * Slowly drifting mesh gradient, in the spirit of early One UI call screens.
 *
 * A handful of soft radial blobs move on independent sine paths and are blended
 * additively, so where they overlap the colour builds instead of covering. The
 * bottom edge fades to the screen background so the header melts into the page
 * rather than ending on a hard line.
 *
 * Each blob's gradient is allocated once and repositioned per frame with a local
 * matrix — rebuilding shaders every frame would allocate on the draw path.
 */
class MeshGradientView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    /**
     * @param cx,cy  resting centre, as a fraction of view size
     * @param ax,ay  drift amplitude, as a fraction of view size
     * @param speed  radians per second
     */
    private class Blob(
        val color: Int,
        val radiusFactor: Float,
        val cx: Float,
        val cy: Float,
        val ax: Float,
        val ay: Float,
        val speed: Float,
        val phase: Float,
    ) {
        var radius = 0f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            // ADD rather than SRC_OVER: overlapping blobs brighten, which is
            // what gives the mesh its glow instead of looking like flat discs.
            xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
        }
        var shader: RadialGradient? = null
        val matrix = Matrix()
    }

    // Drawn on the app's dark background; colours are the Atlas accent palette.
    //
    // Amplitudes and speeds are deliberately large: at a ~14s cycle and 0.10
    // amplitude the drift was technically animating but far too slow to read as
    // movement. These give each blob a visible wander of a few seconds.
    private val blobs = listOf(
        Blob(Color.parseColor("#7B5EC9"), 0.85f, 0.26f, 0.22f, 0.26f, 0.20f, 1.05f, 0f),
        Blob(Color.parseColor("#2F6FC9"), 0.78f, 0.74f, 0.18f, 0.30f, 0.17f, 0.83f, 1.7f),
        Blob(Color.parseColor("#C9436F"), 0.72f, 0.60f, 0.44f, 0.24f, 0.22f, 1.28f, 3.1f),
        Blob(Color.parseColor("#1F8F8A"), 0.68f, 0.32f, 0.50f, 0.28f, 0.16f, 0.71f, 4.6f),
    )

    /** Fades the mesh into the page background at the bottom edge. */
    private val fadePaint = Paint()
    private var backgroundColorInt = Color.parseColor("#131110")

    private val startNanos = System.nanoTime()

    fun setFadeToColor(color: Int) {
        backgroundColorInt = color
        buildFade(width, height)
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w == 0 || h == 0) return
        val base = maxOf(w, h).toFloat()
        for (blob in blobs) {
            blob.radius = base * blob.radiusFactor
            // Centred on the origin; onDraw translates it into place.
            blob.shader = RadialGradient(
                0f,
                0f,
                blob.radius,
                intArrayOf(blob.color, Color.TRANSPARENT),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP,
            )
            blob.paint.shader = blob.shader
        }
        buildFade(w, h)
    }

    private fun buildFade(w: Int, h: Int) {
        if (w == 0 || h == 0) return
        fadePaint.shader = LinearGradient(
            0f,
            h * 0.45f,
            0f,
            h.toFloat(),
            intArrayOf(Color.TRANSPARENT, backgroundColorInt),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w == 0f || h == 0f) return

        val t = (System.nanoTime() - startNanos) / 1_000_000_000f

        for (blob in blobs) {
            val x = (blob.cx + blob.ax * sin(blob.speed * t + blob.phase)) * w
            // A different rate on each axis so the path is a wander rather than
            // a circle — 0.73 is irrational enough that it doesn't visibly loop.
            val y = (blob.cy + blob.ay * cos(blob.speed * 0.73f * t + blob.phase)) * h
            // Breathe the size too; static-radius blobs read as sliding cutouts.
            val pulse = 1f + 0.12f * sin(blob.speed * 0.5f * t + blob.phase)
            blob.matrix.setTranslate(x, y)
            blob.matrix.postScale(pulse, pulse, x, y)
            blob.shader?.setLocalMatrix(blob.matrix)
            // Draw only the blob's own circle rather than the whole view — four
            // full-bounds additive passes per frame would be wasteful.
            canvas.drawCircle(x, y, blob.radius * pulse, blob.paint)
        }

        canvas.drawRect(0f, 0f, w, h, fadePaint)

        // Self-scheduling, vsync-aligned. Only runs while attached, and this
        // screen lives at most for one ring (~60s), so the cost is bounded.
        if (isAttachedToWindow) postInvalidateOnAnimation()
    }
}
