package com.heika.nativeapp.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.remember

/** Shared image bounds plus an overlay clip whose corner radius tracks the animated width. */
@OptIn(ExperimentalSharedTransitionApi::class)
@androidx.compose.runtime.Composable
fun Modifier.heikaSharedPostImage(
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    postKey: String,
    isDetail: Boolean,
    enabled: Boolean,
): Modifier {
    if (!enabled) return this
    val clip = remember(postKey, isDetail) { MorphingCardClip(isDetail) }
    return with(sharedTransitionScope) {
        this@heikaSharedPostImage.sharedElement(
            sharedContentState = rememberSharedContentState("post-image-$postKey"),
            animatedVisibilityScope = animatedVisibilityScope,
            boundsTransform = { initial, target ->
                clip.record(initial, target)
                tween(HeikaMotion.spatial, easing = HeikaMotion.spatialEasing)
            },
            clipInOverlayDuringTransition = clip,
        )
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
private class MorphingCardClip(
    private val isDetail: Boolean,
) : SharedTransitionScope.OverlayClip {
    private var initialBounds: Rect? = null
    private var targetBounds: Rect? = null

    fun record(initial: Rect, target: Rect) {
        initialBounds = initial
        targetBounds = target
    }

    override fun getClipPath(
        sharedContentState: SharedTransitionScope.SharedContentState,
        bounds: Rect,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Path {
        val start = initialBounds
        val end = targetBounds
        val fraction = if (start == null || end == null) 1f else {
            val dx = end.center.x - start.center.x
            val dy = end.center.y - start.center.y
            val dw = end.width - start.width
            val dh = end.height - start.height
            val currentX = bounds.center.x - start.center.x
            val currentY = bounds.center.y - start.center.y
            val currentW = bounds.width - start.width
            val currentH = bounds.height - start.height
            val denominator = dx * dx + dy * dy + dw * dw + dh * dh
            if (denominator <= 1f) 1f else ((currentX * dx + currentY * dy + currentW * dw + currentH * dh) / denominator).coerceIn(0f, 1f)
        }
        val cardRadius = with(density) { HeikaRadii.feedCard.toPx() }
        val radius = if (isDetail) cardRadius * (1f - fraction) else cardRadius * fraction
        return Path().apply {
            addRoundRect(RoundRect(bounds, CornerRadius(radius, radius)))
        }
    }
}
