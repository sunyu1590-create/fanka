package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint

/**
 * HEIKA Solid Glass 基元。
 *
 * 设计语言：实体磨砂底色为绝对主体，局部高斯模糊仅作辅助；
 * 不再使用液态玻璃的流动光泽、噪点流光、动态高光与过度透明。
 * 玻璃层保留透光和原有模糊半径，叠加中性底色压低艳色；不支持模糊时使用清晰的实体底板。
 */

/** 弹窗 / 菜单 / 浮层用的中性磨砂面板：适度透光 + 局部模糊 + 轻边框。 */
@Composable
fun HeikaGlassSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 9.dp, vertical = 6.dp),
    emphasis: Float = 1f,
    glassColor: Color? = null,
    drawTopHighlight: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val surface = glassColor ?: MaterialTheme.colorScheme.surface
    // 材质底色向中性灰偏一点，避免直接取 #1C1D21 造成「深灰实心卡片」。
    val glassBase = if (dark) lerp(Color(0xFF2B2D35), surface, .18f) else lerp(Color(0xFFFFFEFA), surface, .22f)
    val luminous = lerp(glassBase, Color.White, if (dark) .05f else .02f)
    val alpha = ((if (hazeState != null) { if (dark) HeikaGlassTokens.darkDialogTintAlpha else HeikaGlassTokens.lightDialogTintAlpha } else { if (dark) .93f else .94f }) * emphasis)
        .coerceIn(if (hazeState != null) .50f else .88f, .98f)
    val clipped = modifier.clip(shape)
    Box(
        clipped
            .then(
                if (hazeState != null) Modifier.hazeEffect(
                    state = hazeState,
                    style = HazeStyle(
                        backgroundColor = luminous.copy(alpha = alpha),
                        // 深色模式用极淡的白 tint 提亮透出的背景，而不是压黑。
                        tint = HazeTint(if (dark) Color.White.copy(alpha = .10f) else Color.White.copy(alpha = .28f)),
                        blurRadius = HeikaGlassTokens.menuBlurRadius,
                        fallbackTint = HazeTint(luminous.copy(alpha = if (dark) .94f else .96f)),
                    ),
                ) else Modifier,
            )
            .shadow(6.dp, shape)
            .background(luminous.copy(alpha = alpha), shape)
            .border(
                HeikaGlassTokens.borderWidth,
                if (dark) Color.White.copy(alpha = HeikaGlassTokens.glassBorderAlphaDark)
                else Color(0xFF3A362B).copy(alpha = HeikaGlassTokens.glassBorderAlphaLight),
                shape,
            )
            .padding(contentPadding),
        content = content,
    )
}

/** 图片上标签用的高对比实体磨砂徽标：不透明磨砂底，不追求透图。 */
@Composable
fun HeikaSolidGlassSurface(
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 9.dp, vertical = 6.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val base = if (dark) Color(0xFF27292E) else Color(0xFFF0EEEA)
    Box(
        modifier.shadow(5.dp, shape).clip(shape)
            .background(base, shape)
            .padding(contentPadding),
        content = content,
    )
}

/** 发现页 / 首页图片角标：固态磨砂小胶囊，无流光、无动态高光。 */
@Composable
fun HeikaSolidBadgeSurface(
    hazeState: HazeState? = null,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val surface = MaterialTheme.colorScheme.surface
    val outline = MaterialTheme.colorScheme.outline
    val neutralSurface = if (dark) lerp(surface, Color(0xFF090B0E), .26f) else lerp(surface, Color(0xFFFFFEFC), .18f)
    val alpha = if (hazeState != null) { if (dark) .74f else .80f } else { if (dark) .92f else .94f }
    val clipped = modifier.clip(shape)
    Box(
        clipped.then(
            if (hazeState != null) Modifier.hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = neutralSurface.copy(alpha = alpha),
                    tint = HazeTint(if (dark) Color.Black.copy(alpha = .14f) else Color.White.copy(alpha = .12f)),
                    blurRadius = 16.dp,
                    fallbackTint = HazeTint(neutralSurface.copy(alpha = if (dark) .94f else .96f)),
                ),
            ) else Modifier,
        ).background(neutralSurface.copy(alpha = alpha), shape)
            .border(.5.dp, outline.copy(alpha = if (dark) .42f else .52f), shape)
            .padding(contentPadding),
        content = content,
    )
}

/** 兼容旧命名：内部已切到固态磨砂实现。 */
@Composable
fun HeikaLiquidBadgeSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
    content: @Composable BoxScope.() -> Unit,
) = HeikaSolidBadgeSurface(hazeState, modifier, shape, contentPadding, content)

/** 底部 / 顶部导航条的固态磨砂材质：实体底色 + 局部模糊，无流光。 */
@Composable
fun HeikaSolidNavSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(0.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    drawTopHighlight: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val surface = MaterialTheme.colorScheme.surface
    val alpha = if (dark) .93f else .96f
    val clipped = modifier.clip(shape)
    Box(
        clipped.then(
            if (hazeState != null) Modifier.hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = surface.copy(alpha = alpha),
                    tint = HazeTint(surface.copy(alpha = if (dark) .06f else .08f)),
                    blurRadius = 18.dp,
                    fallbackTint = HazeTint(surface.copy(alpha = if (dark) .96f else .98f)),
                ),
            ) else Modifier,
        ).background(surface.copy(alpha = alpha), shape)
            .border(.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = if (dark) .32f else .40f), shape)
            .padding(contentPadding),
        content = content,
    )
}

/** 兼容旧命名：内部已切到固态磨砂实现。 */
@Composable
fun HeikaLiquidGlassSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(0.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    drawTopHighlight: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) = HeikaSolidNavSurface(hazeState, modifier, shape, contentPadding, drawTopHighlight, content)

/**
 * 顶部导航专用的横向玻璃条：只在下沿画一条细线，不再给整块加边框。
 * 与详情页悬浮栏共用同一个 HazeState，避免重复全屏模糊造成掉帧。
 */
@Composable
fun HeikaGlassTopBar(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val base = if (dark) Color(0xFF24262D) else Color(0xFFFDFCF9)
    val alpha = if (hazeState != null) (if (dark) .58f else .64f) else (if (dark) .94f else .95f)
    val border = if (dark) Color.White.copy(alpha = .10f) else Color(0xFF3A362B).copy(alpha = .10f)
    Box(
        modifier
            .fillMaxWidth()
            .then(
                if (hazeState != null) Modifier.hazeEffect(
                    state = hazeState,
                    style = HazeStyle(
                        backgroundColor = base.copy(alpha = alpha),
                        tint = HazeTint(if (dark) Color.White.copy(alpha = .10f) else Color.White.copy(alpha = .26f)),
                        blurRadius = 18.dp,
                        fallbackTint = HazeTint(base.copy(alpha = if (dark) .95f else .96f)),
                    ),
                ) else Modifier,
            )
            .background(base.copy(alpha = alpha))
            .drawBehind {
                drawLine(border, Offset(0f, size.height), Offset(size.width, size.height), 1f)
            },
        content = content,
    )
}
