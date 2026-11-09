package com.heika.nativeapp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
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
    val Gold = Color(0xFFD1B566)
    val DarkBackground = Color(0xFF0D0F13)
    val DarkSurface = Color(0xFF17191E)
    val DarkRaised = Color(0xFF202329)
    val LightBackground = Color(0xFFF5F3EE)
    val LightSurface = Color(0xFFFFFEFA)
    val Ink = Color(0xFFF3F1E9)
    val Muted = Color(0xFF9A9CA3)
    val Line = Color(0xFF32353B)
}

@Composable
fun HeikaTheme(theme: String, content: @Composable () -> Unit) {
    val dark = when (theme) {
        "light" -> false
        "system" -> isSystemInDarkTheme()
        else -> true
    }
    val scheme = if (dark) darkColorScheme(
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
        primary = Color(0xFF8C7136),
        onPrimary = Color.White,
        background = HeikaPalette.LightBackground,
        onBackground = Color(0xFF22221F),
        surface = HeikaPalette.LightSurface,
        onSurface = Color(0xFF22221F),
        surfaceVariant = Color(0xFFEAE8E2),
        onSurfaceVariant = Color(0xFF686861),
        outline = Color(0xFFD2D0C9),
        secondary = Color(0xFF66675F),
    )
    MaterialTheme(colorScheme = scheme, content = content)
}
