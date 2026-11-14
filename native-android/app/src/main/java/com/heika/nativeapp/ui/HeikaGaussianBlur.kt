package com.heika.nativeapp.ui

import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp

/**
 * HEIKA's local backdrop blur path. This applies the platform Gaussian RenderEffect
 * to one explicitly bounded Compose layer, instead of sampling Haze sources or
 * asking Android to blur a separate window behind the dialog.
 *
 * Android 12+ performs this on the GPU. Older Android versions keep the normal
 * translucent surface/scrim fallback supplied by the caller.
 */
fun Modifier.heikaGaussianBlur(radius: Dp, enabled: Boolean): Modifier = graphicsLayer {
    renderEffect = if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val radiusPx = radius.toPx().coerceAtLeast(0.1f)
        RenderEffect.createBlurEffect(radiusPx, radiusPx, Shader.TileMode.CLAMP).asComposeRenderEffect()
    } else {
        null
    }
}
