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
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontWeight
import com.heika.nativeapp.R

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

/** Fonts are bundled locally; selectable families are restricted to packaged resources. */
object HeikaFontCatalog {
    val availableChoices = setOf("system", "oppo_sans")
    private val families = mapOf(
        "system" to FontFamily.Default,
        "oppo_sans" to FontFamily(Font(R.font.oppo_sans_4_0, FontWeight.Normal)),
    )
    fun normalize(choice: String): String = choice.takeIf { it in availableChoices } ?: "oppo_sans"
    fun resolve(choice: String): FontFamily = families[normalize(choice)] ?: FontFamily.Default
}

object HeikaPageTransitions {
    val choices = setOf("lift", "crossfade", "shared")
    fun normalize(value: String): String = value.takeIf { it in choices } ?: "crossfade"
}

object HeikaReadingSizes {
    private val choices = setOf("standard", "slightly-large", "large")
    fun normalize(value: String): String = value.takeIf { it in choices } ?: "standard"
    fun titleScale(value: String): Float = when (normalize(value)) {
        "slightly-large" -> 1.12f
        "large" -> 1.24f
        else -> 1f
    }
    fun bodyScale(value: String): Float = when (normalize(value)) {
        "slightly-large" -> 1.14f
        "large" -> 1.29f
        else -> 1f
    }
}

val LocalHeikaBodyTextScale = staticCompositionLocalOf { 1f }
val LocalHeikaTitleTextScale = staticCompositionLocalOf { 1f }

@Composable
fun HeikaTheme(
    theme: String,
    fontChoice: String = "oppo_sans",
    bodyTextSize: String = "standard",
    titleTextSize: String = "standard",
    content: @Composable () -> Unit,
) {
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
    CompositionLocalProvider(
        LocalHeikaDark provides dark,
        LocalHeikaBodyTextScale provides HeikaReadingSizes.bodyScale(bodyTextSize),
        LocalHeikaTitleTextScale provides HeikaReadingSizes.titleScale(titleTextSize),
    ) {
        val family = HeikaFontCatalog.resolve(fontChoice)
        val base = Typography()
        val typography = base.copy(
            displayLarge = base.displayLarge.copy(fontFamily = family),
            displayMedium = base.displayMedium.copy(fontFamily = family),
            displaySmall = base.displaySmall.copy(fontFamily = family),
            headlineLarge = base.headlineLarge.copy(fontFamily = family),
            headlineMedium = base.headlineMedium.copy(fontFamily = family),
            headlineSmall = base.headlineSmall.copy(fontFamily = family),
            titleLarge = base.titleLarge.copy(fontFamily = family),
            titleMedium = base.titleMedium.copy(fontFamily = family),
            titleSmall = base.titleSmall.copy(fontFamily = family),
            bodyLarge = base.bodyLarge.copy(fontFamily = family),
            bodyMedium = base.bodyMedium.copy(fontFamily = family),
            bodySmall = base.bodySmall.copy(fontFamily = family),
            labelLarge = base.labelLarge.copy(fontFamily = family),
            labelMedium = base.labelMedium.copy(fontFamily = family),
            labelSmall = base.labelSmall.copy(fontFamily = family),
        )
        MaterialTheme(colorScheme = scheme, shapes = HeikaShapes, typography = typography, content = content)
    }
}
