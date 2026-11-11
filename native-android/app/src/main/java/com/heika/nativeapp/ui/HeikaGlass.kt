package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/** One clipped, low-contrast glass layer. On devices without blur support its tint remains legible. */
@Composable
fun HeikaGlassSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 9.dp, vertical = 6.dp),
    emphasis: Float = 1f,
    glassColor: Color? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val surface = glassColor ?: MaterialTheme.colorScheme.surface
    val alpha = ((if (dark) .44f else .62f) * emphasis).coerceIn(.18f, .78f)
    val clipped = modifier.clip(shape)
    Box(
        clipped
            .then(
                if (hazeState != null) Modifier.hazeEffect(
                    state = hazeState,
                    style = HazeStyle(
                        backgroundColor = surface.copy(alpha = alpha),
                        tint = HazeTint(surface.copy(alpha = if (dark) .18f else .30f)),
                        blurRadius = 18.dp,
                        noiseFactor = .015f,
                        fallbackTint = HazeTint(surface.copy(alpha = if (dark) .80f else .92f)),
                    ),
                ) else Modifier,
            )
            .background(surface.copy(alpha = alpha), shape)
            .drawBehind {
                val edge = Color.White.copy(alpha = if (dark) .14f else .34f)
                drawLine(edge, Offset(8.dp.toPx(), .7.dp.toPx()), Offset(size.width - 8.dp.toPx(), .7.dp.toPx()), .7.dp.toPx())
            }
            .padding(contentPadding),
        content = content,
    )
}

/** Opaque, high-contrast glass badge for labels placed over images. */
@Composable
fun HeikaSolidGlassSurface(
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(HeikaRadii.control),
    contentPadding: PaddingValues = PaddingValues(horizontal = 9.dp, vertical = 6.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val base = if (dark) Color(0xFF27292E) else Color(0xFFF0EEEA)
    val highlight = if (dark) Color.White.copy(alpha = .17f) else Color.White.copy(alpha = .85f)
    Box(
        modifier.shadow(5.dp, shape).clip(shape)
            .background(base, shape)
            .drawBehind {
                drawLine(highlight, Offset(7.dp.toPx(), .7.dp.toPx()), Offset(size.width - 7.dp.toPx(), .7.dp.toPx()), .8.dp.toPx())
            }
            .padding(contentPadding),
        content = content,
    )
}

/** Shared liquid-glass material used by the top and bottom navigation bars. */
@Composable
fun HeikaLiquidGlassSurface(
    hazeState: HazeState?,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(0.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = LocalHeikaDark.current
    val surface = MaterialTheme.colorScheme.surface
    val alpha = if (dark) .38f else .62f
    val clipped = modifier.clip(shape)
    Box(
        clipped.then(
            if (hazeState != null) Modifier.hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = surface,
                    tint = HazeTint(surface.copy(alpha = if (dark) .14f else .24f)),
                    blurRadius = 30.dp,
                    noiseFactor = .02f,
                    fallbackTint = HazeTint(surface.copy(alpha = if (dark) .88f else .94f)),
                ),
            ) else Modifier,
        ).background(surface.copy(alpha = alpha), shape)
            .drawBehind {
                drawLine(Color.White.copy(alpha = if (dark) .23f else .55f), Offset(14.dp.toPx(), .6.dp.toPx()), Offset(size.width - 14.dp.toPx(), .6.dp.toPx()), .8.dp.toPx())
            }
            .padding(contentPadding),
        content = content,
    )
}
