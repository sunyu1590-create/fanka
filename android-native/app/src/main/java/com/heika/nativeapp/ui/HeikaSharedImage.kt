package com.heika.nativeapp.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.heika.nativeapp.data.HeikaPost

/** Canonical key shared by every card source and its post detail destination. */
fun HeikaPost.sharedImageKey(): String = cloudId.ifBlank { "client-$id" }.lowercase()

/**
 * 卡片封面 -> 详情头图。
 *
 * sharedElement 本身没有淡入淡出参数，内容在整个飞行过程中始终可见；
 * 只要两端用同一个 key 注册，图片就是"长成"详情页头图而不是换一张图。
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.heikaSharedPostImage(
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    postKey: String,
    isDetail: Boolean,
    enabled: Boolean,
    sourceCornerRadius: Dp = HeikaRadii.feedCard,
): Modifier {
    if (!enabled) return this
    val clip = remember(postKey, isDetail, sourceCornerRadius) { MorphingCardClip(isDetail, sourceCornerRadius) }
    // Motion 2.0：共享元素时长跟随速度档位，但曲线与空间关系完全保留原有实现。
    val motion = LocalHeikaMotion.current
    val morphMs = HeikaMotion.scaled(HeikaMotion.morph, motion.mode, motion.speed)
    return with(sharedTransitionScope) {
        this@heikaSharedPostImage.sharedElement(
            sharedContentState = rememberSharedContentState("post-image-${postKey.lowercase()}"),
            animatedVisibilityScope = animatedVisibilityScope,
            boundsTransform = { initial, target ->
                clip.record(initial, target)
                tween(morphMs, easing = HeikaMotion.spatialEasing)
            },
            clipInOverlayDuringTransition = clip,
        )
    }
}

/**
 * 卡片上的标签 / 评分 / 作者名 -> 详情页对应文字。
 *
 * 这几类元素两端**字号几乎一致**（9–13sp），内容也完全相同，所以用 sharedElement 做等比位移即可，
 * 不需要 sharedBounds 重新排版——标题那种 15sp 长到 22sp 的重排会在中途出现字号跳变，
 * 这也是标题共享被撤掉的原因。
 *
 * enter/exit 固定为 None：默认的 fadeIn/fadeOut 会让文字在飞行途中淡出淡入，看起来像"换了一处文字"。
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.heikaSharedPostMeta(
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    sharedKey: String,
    enabled: Boolean = true,
): Modifier {
    if (!enabled) return this
    val motion = LocalHeikaMotion.current
    val morphMs = HeikaMotion.scaled(HeikaMotion.morph, motion.mode, motion.speed)
    return with(sharedTransitionScope) {
        this@heikaSharedPostMeta.sharedElement(
            sharedContentState = rememberSharedContentState(sharedKey),
            animatedVisibilityScope = animatedVisibilityScope,
            boundsTransform = { _, _ -> tween(morphMs, easing = HeikaMotion.spatialEasing) },
            // 压在封面图之上，避免文字飞到一半被图片盖住。
            zIndexInOverlay = 0.5f,
        )
    }
}

/** 标签、评分、作者名各自独立的共享 key，同一张卡片上互不干扰。 */
fun HeikaPost.sharedTagKey(): String = "post-tag-${sharedImageKey()}"

fun HeikaPost.sharedRatingKey(): String = "post-rating-${sharedImageKey()}"

fun HeikaPost.sharedAuthorKey(): String = "post-author-${sharedImageKey()}"

@OptIn(ExperimentalSharedTransitionApi::class)
private class MorphingCardClip(
    private val isDetail: Boolean,
    private val sourceCornerRadius: Dp,
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
        val cardRadius = with(density) { sourceCornerRadius.toPx() }
        // The outgoing element owns the overlay clip: feed -> detail shrinks the radius,
        // while detail -> feed grows it back from the square detail image.
        val radius = if (isDetail) cardRadius * fraction else cardRadius * (1f - fraction)
        return Path().apply {
            addRoundRect(RoundRect(bounds, CornerRadius(radius, radius)))
        }
    }
}
