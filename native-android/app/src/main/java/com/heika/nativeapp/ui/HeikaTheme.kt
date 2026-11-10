package com.heika.nativeapp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object HeikaRadii {
    val feedCard = 13.dp
    val dailyCard = 15.dp
    val categoryTag = 9.dp
    val ratingTag = 11.dp
    val control = 11.dp
    val surface = 14.dp
    val dialog = 18.dp
}

object HeikaPalette {
    val Gold = Color(0xFFD5B96E)
    val DarkBackground = Color(0xFF0D0E10)
    val DarkSurface = Color(0xFF191B1E)
    val DarkRaised = Color(0xFF222429)
    val LightBackground = Color(0xFFF8F7F4)
    val LightSurface = Color(0xFFFFFFFF)
    val Ink = Color(0xFFF0EEE9)
    val Muted = Color(0xFFA3A3A8)
    val Line = Color(0xFF2D3034)
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
        primary = Color(0xFFA5853C),
        onPrimary = Color.White,
        background = HeikaPalette.LightBackground,
        onBackground = Color(0xFF222326),
        surface = HeikaPalette.LightSurface,
        onSurface = Color(0xFF22221F),
        surfaceVariant = Color(0xFFEAE8E2),
        onSurfaceVariant = Color(0xFF77787D),
        outline = Color(0xFFE5E2DA),
        secondary = Color(0xFF66675F),
    )
    val scheme = targetScheme.copy(
        primary = animateColorAsState(targetScheme.primary, tween(240), label = "theme-primary").value,
        background = animateColorAsState(targetScheme.background, tween(240), label = "theme-background").value,
        onBackground = animateColorAsState(targetScheme.onBackground, tween(240), label = "theme-ink").value,
        surface = animateColorAsState(targetScheme.surface, tween(240), label = "theme-surface").value,
        onSurface = animateColorAsState(targetScheme.onSurface, tween(240), label = "theme-on-surface").value,
        surfaceVariant = animateColorAsState(targetScheme.surfaceVariant, tween(240), label = "theme-raised").value,
        onSurfaceVariant = animateColorAsState(targetScheme.onSurfaceVariant, tween(240), label = "theme-muted").value,
        outline = animateColorAsState(targetScheme.outline, tween(240), label = "theme-outline").value,
    )
    CompositionLocalProvider(LocalHeikaDark provides dark) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
