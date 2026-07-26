package get.ahmed.atlas.push

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.core.content.ContextCompat
import get.ahmed.atlas.R
import kotlin.math.abs

/**
 * iOS-style slide-to-answer control: drag the knob to the right to accept.
 *
 * Deliberately not a tap target — an incoming call is easy to answer by accident
 * from a pocket, and a deliberate horizontal drag is much harder to trigger
 * unintentionally. Released short of the threshold, the knob springs back.
 */
class SlideToAnswerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    /** Fired once, when the knob is dragged past [COMMIT_FRACTION]. */
    var onAnswer: (() -> Unit)? = null

    private companion object {
        /** Fraction of the travel that counts as a commit. */
        const val COMMIT_FRACTION = 0.72f
        const val LABEL = "slide to answer"
        /** Seconds for one pass of the shimmer across the label. */
        const val SHIMMER_PERIOD = 2.2f
        /** Knob growth while held, as grab feedback. */
        const val HELD_SCALE = 1.18f
        /** Gap between the knob's outer edge (when grown) and the track edge. */
        const val INSET = 5f
        /** Glyph size. Must match the Decline button's content size in the layout. */
        const val ICON_DP = 30f
    }

    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#26FFFFFF")
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#2F8F6E")
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }

    /**
     * mutate() so bounds/tint here can't leak into the shared resource cache,
     * and an explicit white tint so the glyph can't pick up a theme tint list
     * and render invisibly against the green knob.
     */
    private val icon: Drawable? =
        ContextCompat.getDrawable(context, R.drawable.ic_call_answer)?.mutate()?.apply {
            setTint(Color.WHITE)
            setTintMode(PorterDuff.Mode.SRC_IN)
            alpha = 255
        }

    private val trackRect = RectF()
    private val shimmerMatrix = Matrix()
    private val startNanos = System.nanoTime()

    /** 0 = resting, 1 = fully slid. */
    private var progress = 0f
    private var dragging = false
    private var committed = false
    private var touchStartX = 0f
    private var progressAtTouchStart = 0f
    private var springBack: ValueAnimator? = null

    /** Knob size multiplier while held. */
    private var knobScale = 1f
    private var scaleAnim: ValueAnimator? = null

    /** Half the track's height — the track fills the view vertically. */
    private val trackHalf: Float get() = (height - paddingTop - paddingBottom) / 2f

    /**
     * Resting knob radius, divided by [HELD_SCALE] so that a *grown* knob still
     * fits inside the track. Sizing it to the full track height meant the
     * enlarged knob spilled past the view bounds and got clipped.
     */
    private val knobRadius: Float get() = (trackHalf - INSET) / HELD_SCALE

    /** Distance from the track edge to the knob's centre at rest. */
    private val knobInset: Float get() = trackHalf - knobRadius

    private val travel: Float
        get() = (width - paddingLeft - paddingRight) - 2 * knobInset - 2 * knobRadius

    /** Centre of the label: the space right of the knob, not the whole track. */
    private val labelCenterX: Float
        get() {
            val knobRestRight = paddingLeft + knobInset + 2 * knobRadius
            return (knobRestRight + (width - paddingRight)) / 2f
        }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w == 0 || h == 0) return

        // Fit the label into the space beside the knob, so it can never end up
        // sitting under it.
        val available = (w - paddingRight) - (paddingLeft + knobInset + 2 * knobRadius)
        labelPaint.textSize = trackHalf * 0.5f
        val measured = labelPaint.measureText(LABEL)
        if (measured > available * 0.9f && measured > 0f) {
            labelPaint.textSize = labelPaint.textSize * (available * 0.9f / measured)
        }

        labelPaint.shader = LinearGradient(
            0f,
            0f,
            w * 0.45f,
            0f,
            intArrayOf(
                Color.parseColor("#66FFFFFF"),
                Color.WHITE,
                Color.parseColor("#66FFFFFF"),
            ),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    override fun onDraw(canvas: Canvas) {
        if (width == 0 || height == 0) return
        val r = knobRadius
        val cy = height / 2f
        val left = paddingLeft.toFloat()

        trackRect.set(left, cy - trackHalf, (width - paddingRight).toFloat(), cy + trackHalf)
        val radius = trackRect.height() / 2f
        canvas.drawRoundRect(trackRect, radius, radius, trackPaint)

        // Fades out as the knob advances, so it never fights the icon.
        val labelAlpha = ((1f - progress * 1.6f).coerceIn(0f, 1f) * 255).toInt()
        if (labelAlpha > 0) {
            val t = (System.nanoTime() - startNanos) / 1_000_000_000f
            val sweep = ((t % SHIMMER_PERIOD) / SHIMMER_PERIOD) * (width * 1.6f) - width * 0.3f
            shimmerMatrix.setTranslate(sweep, 0f)
            labelPaint.shader?.setLocalMatrix(shimmerMatrix)
            labelPaint.alpha = labelAlpha
            canvas.drawText(
                LABEL,
                labelCenterX,
                cy - (labelPaint.descent() + labelPaint.ascent()) / 2f,
                labelPaint,
            )
        }

        val knobCx = left + knobInset + r + travel * progress
        val drawnR = r * knobScale
        canvas.drawCircle(knobCx, cy, drawnR, knobPaint)
        icon?.let {
            // Sized in dp, not as a fraction of the knob, so it matches the
            // Decline button exactly (which draws at a fixed dp size). Scales
            // with the knob so it still grows on hold.
            val half = (ICON_DP / 2f * resources.displayMetrics.density * knobScale).toInt()
            it.setBounds(
                (knobCx - half).toInt(),
                (cy - half).toInt(),
                (knobCx + half).toInt(),
                (cy + half).toInt(),
            )
            it.draw(canvas)
        }

        if (labelAlpha > 0 && isAttachedToWindow) postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (committed) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                springBack?.cancel()
                dragging = true
                touchStartX = event.x
                progressAtTouchStart = progress
                animateKnobScale(HELD_SCALE)
                // Claim the gesture so a parent can't steal it mid-drag.
                parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                if (!dragging) return false
                val delta = (event.x - touchStartX) / travel.coerceAtLeast(1f)
                progress = (progressAtTouchStart + delta).coerceIn(0f, 1f)
                invalidate()
                return true
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                dragging = false
                if (progress >= COMMIT_FRACTION) {
                    commit() // stays enlarged through the commit animation
                } else {
                    animateKnobScale(1f)
                    animateBack()
                }
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun animateKnobScale(target: Float) {
        scaleAnim?.cancel()
        scaleAnim = ValueAnimator.ofFloat(knobScale, target).apply {
            duration = 140
            interpolator = android.view.animation.DecelerateInterpolator()
            addUpdateListener {
                knobScale = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun commit() {
        committed = true
        // Slide the rest of the way so the gesture visibly completes before the
        // screen changes.
        ValueAnimator.ofFloat(progress, 1f).apply {
            duration = (120 * (1f - progress)).toLong().coerceAtLeast(60L)
            addUpdateListener {
                progress = it.animatedValue as Float
                invalidate()
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    onAnswer?.invoke()
                }
            })
            start()
        }
    }

    private fun animateBack() {
        springBack = ValueAnimator.ofFloat(progress, 0f).apply {
            duration = (220 * abs(progress)).toLong().coerceAtLeast(90L)
            interpolator = android.view.animation.OvershootInterpolator(1.4f)
            addUpdateListener {
                progress = (it.animatedValue as Float).coerceAtLeast(0f)
                invalidate()
            }
            start()
        }
    }
}
