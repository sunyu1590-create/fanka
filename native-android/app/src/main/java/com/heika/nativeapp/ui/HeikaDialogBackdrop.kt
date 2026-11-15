package com.heika.nativeapp.ui

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.Window
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.math.min
import java.util.concurrent.atomic.AtomicReference

/** Captures only the pixels under a dialog panel; the dialog window is a separate surface. */
internal suspend fun captureHeikaDialogBackdrop(window: Window, screenRect: Rect, maxWidthPx: Int = 520): Bitmap? {
    val source = window.decorView
    val sourceWidth = source.width
    val sourceHeight = source.height
    if (sourceWidth <= 0 || sourceHeight <= 0) return null

    val origin = IntArray(2)
    source.getLocationOnScreen(origin)
    val left = (screenRect.left - origin[0]).coerceIn(0, sourceWidth - 1)
    val top = (screenRect.top - origin[1]).coerceIn(0, sourceHeight - 1)
    val right = screenRect.right.minus(origin[0]).coerceIn(left + 1, sourceWidth)
    val bottom = screenRect.bottom.minus(origin[1]).coerceIn(top + 1, sourceHeight)
    val captureRect = Rect(left, top, right, bottom)
    val captured = Bitmap.createBitmap(right - left, bottom - top, Bitmap.Config.ARGB_8888)

    val copyResult = try {
        suspendCancellableCoroutine<Int> { continuation ->
            PixelCopy.request(window, captureRect, captured, { result ->
                if (continuation.isActive) continuation.resume(result)
                else if (!captured.isRecycled) captured.recycle()
            }, Handler(Looper.getMainLooper()))
        }
    } catch (_: Throwable) {
        if (!captured.isRecycled) captured.recycle()
        return null
    }
    if (copyResult != PixelCopy.SUCCESS) {
        if (!captured.isRecycled) captured.recycle()
        return null
    }

    val output = AtomicReference<Bitmap?>(null)
    return try {
        withContext(Dispatchers.Default) {
        var scaled: Bitmap? = null
        var delivered: Bitmap? = null
        try {
            val scale = min(1f, maxWidthPx.toFloat() / captured.width)
            scaled = if (scale < 1f) {
                Bitmap.createScaledBitmap(captured, (captured.width * scale).toInt().coerceAtLeast(1), (captured.height * scale).toInt().coerceAtLeast(1), true)
            } else captured
            delivered = scaled
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                val effectiveRadius = (34f * scale).toInt().coerceIn(8, 24)
                delivered?.let { blurBitmapInPlace(it, effectiveRadius, passes = 3) }
            }
            output.set(delivered)
            delivered
        } catch (_: Throwable) {
            null
        } finally {
            if (!captured.isRecycled && captured !== delivered) captured.recycle()
            if (scaled != null && !scaled.isRecycled && scaled !== delivered && scaled !== captured) scaled.recycle()
        }
        }
    } catch (cancelled: CancellationException) {
        output.getAndSet(null)?.let { if (!it.isRecycled) it.recycle() }
        throw cancelled
    }
}

/** Three inexpensive box passes approximate a Gaussian when GPU RenderEffect is unavailable. */
private fun blurBitmapInPlace(bitmap: Bitmap, radius: Int, passes: Int) {
    if (radius <= 0 || bitmap.width <= 1 || bitmap.height <= 1) return
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    val scratch = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    repeat(passes) {
        blurPixelsHorizontal(pixels, scratch, width, height, radius)
        blurPixelsVertical(scratch, pixels, width, height, radius)
    }
    bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
}

private fun blurPixelsHorizontal(input: IntArray, output: IntArray, width: Int, height: Int, radius: Int) {
    val window = radius * 2 + 1
    for (y in 0 until height) {
        val row = y * width
        var a = 0; var r = 0; var g = 0; var b = 0
        for (offset in -radius..radius) {
            val color = input[row + offset.coerceIn(0, width - 1)]
            a += color ushr 24; r += (color ushr 16) and 0xFF; g += (color ushr 8) and 0xFF; b += color and 0xFF
        }
        for (x in 0 until width) {
            output[row + x] = ((a / window) shl 24) or ((r / window) shl 16) or ((g / window) shl 8) or (b / window)
            val remove = input[row + (x - radius).coerceIn(0, width - 1)]
            val add = input[row + (x + radius + 1).coerceIn(0, width - 1)]
            a += (add ushr 24) - (remove ushr 24)
            r += ((add ushr 16) and 0xFF) - ((remove ushr 16) and 0xFF)
            g += ((add ushr 8) and 0xFF) - ((remove ushr 8) and 0xFF)
            b += (add and 0xFF) - (remove and 0xFF)
        }
    }
}

private fun blurPixelsVertical(input: IntArray, output: IntArray, width: Int, height: Int, radius: Int) {
    val window = radius * 2 + 1
    for (x in 0 until width) {
        var a = 0; var r = 0; var g = 0; var b = 0
        for (offset in -radius..radius) {
            val color = input[offset.coerceIn(0, height - 1) * width + x]
            a += color ushr 24; r += (color ushr 16) and 0xFF; g += (color ushr 8) and 0xFF; b += color and 0xFF
        }
        for (y in 0 until height) {
            output[y * width + x] = ((a / window) shl 24) or ((r / window) shl 16) or ((g / window) shl 8) or (b / window)
            val remove = input[(y - radius).coerceIn(0, height - 1) * width + x]
            val add = input[(y + radius + 1).coerceIn(0, height - 1) * width + x]
            a += (add ushr 24) - (remove ushr 24)
            r += ((add ushr 16) and 0xFF) - ((remove ushr 16) and 0xFF)
            g += ((add ushr 8) and 0xFF) - ((remove ushr 8) and 0xFF)
            b += (add and 0xFF) - (remove and 0xFF)
        }
    }
}

internal fun Context.findHeikaActivity(): Activity? {
    var current = this
    while (current is android.content.ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}
