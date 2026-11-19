package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/**
 * HEIKA Solid Glass 基元。
 *
 * 设计语言：实体磨砂底色为绝对主体，局部高斯模糊仅作辅助；
 * 不再使用液态玻璃的流动光泽、噪点流光、动态高光与过度透明。
 * 无模糊设备上直接落到高不透明度实体底色，不允许文字穿透。
 */

/** 弹窗 / 菜单 / 浮层用的固态磨砂面板：高不透明度深色底板 + 局部模糊 + 轻边框。 */
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
    // 固态优先：深色约 90%、浅色约 94% 不透明度，正文永不穿透。
    val alpha = ((if (dark) .90f else .94f) * emphasis).coerceIn(.85f, .98f)
    val clipped = modifier.clip(shape)
    Box(
        clipped
            .then(
                if (hazeState != null) Modifier.hazeEffect(
                    state = hazeState,
                    style = HazeStyle(
                        backgroundColor = surface.copy(alpha = alpha),
                        tint = HazeTint(surface.copy(alpha = if (dark) .10f else .12f)),
                        blurRadius = 20.dp,
                        fallbackTint = HazeTint(surface.copy(alpha = if (dark) .96f else .98f)),
                    ),
                ) else Modifier,
            )
            .background(surface.copy(alpha = alpha), shape)
            .border(.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = if (dark) .38f else .45f), shape)
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
    // 角标贴在图片上，取中高不透明度：磨砂实感优先，必要时才透出极少底图。
    val alpha = if (dark) .82f else .88f
    val clipped = modifier.clip(shape)
    Box(
        clipped.then(
            if (hazeState != null) Modifier.hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = surface.copy(alpha = alpha),
                    tint = HazeTint(surface.copy(alpha = if (dark) .08f else .10f)),
                    blurRadius = 16.dp,
                    fallbackTint = HazeTint(surface.copy(alpha = if (dark) .90f else .94f)),
                ),
            ) else Modifier,
        ).background(surface.copy(alpha = alpha), shape)
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
