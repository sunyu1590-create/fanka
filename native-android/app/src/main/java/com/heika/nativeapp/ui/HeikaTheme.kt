package com.heika.nativeapp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object HeikaRadii {
    val feedCard = 12.dp
    val dailyCard = 12.dp
    val categoryTag = 8.dp
    val ratingTag = 9.dp
    val control = 10.dp
    val surface = 12.dp
    val dialog = 16.dp
}

private val HeikaShapes = Shapes(
    small = RoundedCornerShape(HeikaRadii.control),
    medium = RoundedCornerShape(HeikaRadii.surface),
    large = RoundedCornerShape(HeikaRadii.dialog),
)

object HeikaSpacing {
    val pageHorizontal = 18.dp
    val compactHorizontal = 16.dp
    val sectionGap = 20.dp
    val rowGap = 12.dp
    val headerHeight = 58.dp
}

object HeikaType {
    val pageTitle = 22.sp
    val sectionTitle = 18.sp
    val body = 14.sp
    val secondary = 12.sp
    val caption = 10.sp
}

object HeikaPalette {
    val Gold = Color(0xFFD0B571)
    val LightAccent = Color(0xFFA98C51)
    val DailyCardStart = Color(0xFF28343A)
    val DailyCardMiddle = Color(0xFF141B20)
    val DailyCardEnd = Color(0xFF202A2F)
    val DailyCardRim = Color(0xFF9BA9AD)
    val DailyCardMuted = Color(0xFFC1CBCD)
    val DarkBackground = Color(0xFF101114)
    val DarkSurface = Color(0xFF1C1D21)
    val DarkRaised = Color(0xFF25262B)
    val DarkLine = Color(0xFF303137)
    val LightBackground = Color(0xFFF8F7F4)
    val LightSurface = Color(0xFFFFFFFF)
    val LightRaised = Color(0xFFF0EEEA)
    val LightInk = Color(0xFF222326)
    val LightMuted = Color(0xFF77787D)
    val LightLine = Color(0xFFE5E2DC)
    val Ink = Color(0xFFF1F0ED)
    val Muted = Color(0xFFAAA9AD)
    val Line = DarkLine
}

object HeikaMotion {
    const val quick = 150
    const val control = 220
    const val transition = 280
    const val spatial = 380
    const val rating = 320
    val standard = FastOutSlowInEasing
    val spatialEasing = CubicBezierEasing(0.22f, 0.78f, 0.18f, 1f)
}

val LocalHeikaDark = staticCompositionLocalOf { true }

@Composable
fun HeikaTheme(theme: String, content: @Composable () -> Unit) {
    val dark = when (theme) {
        "light" -> false
        "system" -> isSystemInDarkTheme()
        else -> true
    }
    val targetScheme = if (dark) darkColorScheme(
        primary = HeikaPalette.Gold,
        onPrimary = Color(0xFF18150D),
        background = HeikaPalette.DarkBackground,
        onBackground = HeikaPalette.Ink,
        surface = HeikaPalette.DarkSurface,
        onSurface = HeikaPalette.Ink,
        surfaceVariant = HeikaPalette.DarkRaised,
        onSurfaceVariant = HeikaPalette.Muted,
        outline = HeikaPalette.Line,
        secondary = Color(0xFFB6B9C1),
    ) else lightColorScheme(
        primary = HeikaPalette.LightAccent,
        onPrimary = Color.White,
        background = HeikaPalette.LightBackground,
        onBackground = HeikaPalette.LightInk,
        surface = HeikaPalette.LightSurface,
        onSurface = HeikaPalette.LightInk,
        surfaceVariant = HeikaPalette.LightRaised,
        onSurfaceVariant = HeikaPalette.LightMuted,
        outline = HeikaPalette.LightLine,
        secondary = Color(0xFF66675F),
    )
    val scheme = targetScheme.copy(
        primary = animateColorAsState(targetScheme.primary, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-primary").value,
        background = animateColorAsState(targetScheme.background, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-background").value,
        onBackground = animateColorAsState(targetScheme.onBackground, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-ink").value,
        surface = animateColorAsState(targetScheme.surface, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-surface").value,
        onSurface = animateColorAsState(targetScheme.onSurface, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-on-surface").value,
        surfaceVariant = animateColorAsState(targetScheme.surfaceVariant, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-raised").value,
        onSurfaceVariant = animateColorAsState(targetScheme.onSurfaceVariant, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-muted").value,
        outline = animateColorAsState(targetScheme.outline, tween(HeikaMotion.transition, easing = HeikaMotion.standard), label = "theme-outline").value,
    )
    CompositionLocalProvider(LocalHeikaDark provides dark) {
        MaterialTheme(colorScheme = scheme, shapes = HeikaShapes, content = content)
    }
}
