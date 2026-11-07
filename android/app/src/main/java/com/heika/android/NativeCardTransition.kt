package com.heika.android

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** A single, short lived image snapshot used for card-to-detail transitions. */
internal class NativeCardTransition(
    private val activity: Activity,
    private val root: FrameLayout,
    private val webView: WebView,
    private val diagnostics: Diagnostics,
    private val onFinished: (String, Boolean) -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var snapshot: Bitmap? = null
    private var transactionId: String? = null
    private var sourceRect: RectF? = null
    private var snapshotDensity = 1f
    private var overlay: ImageView? = null
    private var activeAnimator: ViewPropertyAnimatorHandle? = null

    private data class RectF(val left: Float, val top: Float, val width: Float, val height: Float)
    private data class ViewPropertyAnimatorHandle(val view: ImageView, val transactionId: String)

    fun prepare(id: String, rect: JSONObject, devicePixelRatio: Double, callback: (Boolean) -> Unit) {
        clearAnimation(notify = false)
        recycleSnapshot()
        transactionId = id
        val density = devicePixelRatio.toFloat()
        val cssRect = parseRect(rect)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !id.matches(TRANSITION_ID) ||
            cssRect == null || !density.isFinite() || density !in 0.5f..4f ||
            !webView.isAttachedToWindow || !activity.hasWindowFocus()
        ) {
            callback(false)
            return
        }

        val webLocation = IntArray(2)
        val decorLocation = IntArray(2)
        webView.getLocationOnScreen(webLocation)
        activity.window.decorView.getLocationOnScreen(decorLocation)
        val leftOnScreen = webLocation[0] + (cssRect.left * density).roundToInt()
        val topOnScreen = webLocation[1] + (cssRect.top * density).roundToInt()
        val width = (cssRect.width * density).roundToInt()
        val height = (cssRect.height * density).roundToInt()
        if (width <= 0 || height <= 0 || width > MAX_SOURCE_EDGE_PX * 4 || height > MAX_SOURCE_EDGE_PX * 4 ||
            cssRect.left < 0 || cssRect.top < 0 ||
            cssRect.left + cssRect.width > webView.width / density + 2 ||
            cssRect.top + cssRect.height > webView.height / density + 2
        ) {
            callback(false)
            return
        }
        val sourceWindowRect = Rect(
            leftOnScreen - decorLocation[0],
            topOnScreen - decorLocation[1],
            leftOnScreen - decorLocation[0] + width,
            topOnScreen - decorLocation[1] + height,
        )
        val decor = activity.window.decorView
        if (sourceWindowRect.left < 0 || sourceWindowRect.top < 0 ||
            sourceWindowRect.right > decor.width || sourceWindowRect.bottom > decor.height
        ) {
            callback(false)
            return
        }

        val areaScale = sqrt(MAX_SOURCE_PIXELS.toDouble() / (width.toDouble() * height)).toFloat()
        val scale = min(1f, min(areaScale, min(MAX_SOURCE_EDGE_PX.toFloat() / width, MAX_SOURCE_EDGE_PX.toFloat() / height)))
        val bitmapWidth = max(1, (width * scale).roundToInt())
        val bitmapHeight = max(1, (height * scale).roundToInt())
        val bitmap = runCatching { Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888) }
            .getOrElse { callback(false); return }
        val preparedId = id
        snapshotDensity = density
        sourceRect = RectF(cssRect.left, cssRect.top, cssRect.width, cssRect.height)
        PixelCopy.request(activity.window, sourceWindowRect, bitmap, { result ->
            if (preparedId != transactionId) {
                bitmap.recycle()
                callback(false)
            } else if (result == PixelCopy.SUCCESS) {
                snapshot = bitmap
                diagnostics.record("native_card_snapshot_ready")
                callback(true)
            } else {
                bitmap.recycle()
                recycleSnapshot()
                diagnostics.record("native_card_snapshot_failed", result.toLong())
                callback(false)
            }
        }, mainHandler)
    }

    fun start(id: String, direction: String, target: JSONObject, durationMs: Long): Boolean {
        val bitmap = snapshot
        val fromRect = sourceRect
        if (id != transactionId || bitmap == null || fromRect == null || direction !in setOf("open", "close")) return false
        val targetRect = parseRect(target) ?: return false
        val webLocation = IntArray(2)
        val rootLocation = IntArray(2)
        webView.getLocationOnScreen(webLocation)
        root.getLocationOnScreen(rootLocation)

        val from = if (direction == "open") fromRect else targetRect
        val to = if (direction == "open") targetRect else fromRect
        val screenFromLeft = webLocation[0] + (from.left * snapshotDensity).roundToInt()
        val screenFromTop = webLocation[1] + (from.top * snapshotDensity).roundToInt()
        val screenToLeft = webLocation[0] + (to.left * snapshotDensity).roundToInt()
        val screenToTop = webLocation[1] + (to.top * snapshotDensity).roundToInt()
        val fromWidth = max(1, (from.width * snapshotDensity).roundToInt())
        val fromHeight = max(1, (from.height * snapshotDensity).roundToInt())
        val toWidth = max(1, (to.width * snapshotDensity).roundToInt())
        val toHeight = max(1, (to.height * snapshotDensity).roundToInt())
        val startWidth = fromWidth
        val startHeight = fromHeight
        val startLeft = screenFromLeft - rootLocation[0] - root.paddingLeft
        val startTop = screenFromTop - rootLocation[1] - root.paddingTop

        clearAnimation(notify = false)
        val image = ImageView(activity).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(Color.TRANSPARENT)
            contentDescription = null
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            isClickable = false
            isFocusable = false
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            pivotX = 0f
            pivotY = 0f
        }
        val params = FrameLayout.LayoutParams(startWidth, startHeight, Gravity.TOP or Gravity.LEFT).apply {
            leftMargin = startLeft
            topMargin = startTop
        }
        return runCatching {
            root.addView(image, params)
            overlay = image
            activeAnimator = ViewPropertyAnimatorHandle(image, id)
            val deltaX = (screenToLeft - screenFromLeft).toFloat()
            val deltaY = (screenToTop - screenFromTop).toFloat()
            val scaleX = toWidth.toFloat() / startWidth
            val scaleY = toHeight.toFloat() / startHeight
            image.animate()
                .translationX(deltaX)
                .translationY(deltaY)
                .scaleX(scaleX)
                .scaleY(scaleY)
                .setDuration(durationMs.coerceIn(160L, 600L))
                .withEndAction {
                    if (activeAnimator?.transactionId != id) return@withEndAction
                    activeAnimator = null
                    removeOverlay()
                    if (direction == "close") recycleSnapshot()
                    diagnostics.record("native_card_transition_completed")
                    onFinished(id, true)
                }
            true
        }.getOrElse {
            removeOverlay()
            diagnostics.record("native_card_transition_failed")
            false
        }
    }

    fun cancel(id: String): Boolean {
        if (id != transactionId) return false
        val wasRunning = activeAnimator?.transactionId == id
        clearAnimation(notify = true)
        return wasRunning
    }

    fun release(id: String) {
        if (id != transactionId) return
        clearAnimation(notify = true)
        recycleSnapshot()
        transactionId = null
        sourceRect = null
    }

    fun clearAll() {
        clearAnimation(notify = true)
        recycleSnapshot()
        transactionId = null
        sourceRect = null
    }

    private fun clearAnimation(notify: Boolean) {
        val running = activeAnimator
        activeAnimator = null
        running?.view?.animate()?.cancel()
        removeOverlay()
        if (notify && running != null) onFinished(running.transactionId, false)
    }

    private fun removeOverlay() {
        overlay?.let { image ->
            image.animate().cancel()
            image.setImageDrawable(null)
            (image.parent as? ViewGroup)?.removeView(image)
            image.setLayerType(View.LAYER_TYPE_NONE, null)
        }
        overlay = null
    }

    private fun recycleSnapshot() {
        snapshot?.let { if (!it.isRecycled) it.recycle() }
        snapshot = null
    }

    private fun parseRect(value: JSONObject): RectF? {
        val left = value.optDouble("left", Double.NaN).toFloat()
        val top = value.optDouble("top", Double.NaN).toFloat()
        val width = value.optDouble("width", Double.NaN).toFloat()
        val height = value.optDouble("height", Double.NaN).toFloat()
        if (!left.isFinite() || !top.isFinite() || !width.isFinite() || !height.isFinite() ||
            width <= 0f || height <= 0f || width > MAX_CSS_EDGE || height > MAX_CSS_EDGE ||
            kotlin.math.abs(left) > MAX_CSS_COORD || kotlin.math.abs(top) > MAX_CSS_COORD
        ) return null
        return RectF(left, top, width, height)
    }

    companion object {
        private const val MAX_SOURCE_EDGE_PX = 2_048
        private const val MAX_SOURCE_PIXELS = 2_000_000
        private const val MAX_CSS_EDGE = 2_000f
        private const val MAX_CSS_COORD = 10_000f
        private val TRANSITION_ID = Regex("^[A-Za-z0-9_-]{1,80}$")
    }
}
