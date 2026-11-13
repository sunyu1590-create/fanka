package com.heika.nativeapp.ui

import android.graphics.drawable.ColorDrawable
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider

/** Counts in-window dialogs so the app content behind their transparent windows can blur. */
val LocalHeikaModalBackdropCount = staticCompositionLocalOf<MutableIntState?> { null }

/** Centered app dialog with a clear glass surface and a non-dimming backdrop. */
@Composable
fun HeikaAlertDialog(
    onDismissRequest: () -> Unit,
    confirmButton: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    dismissButton: (@Composable () -> Unit)? = null,
    title: (@Composable () -> Unit)? = null,
    text: (@Composable () -> Unit)? = null,
    icon: (@Composable () -> Unit)? = null,
    properties: DialogProperties = DialogProperties(usePlatformDefaultWidth = false),
) {
    val backdropCount = LocalHeikaModalBackdropCount.current
    DisposableEffect(backdropCount) {
        backdropCount?.intValue = (backdropCount?.intValue ?: 0) + 1
        onDispose { backdropCount?.intValue = ((backdropCount?.intValue ?: 1) - 1).coerceAtLeast(0) }
    }
    Dialog(onDismissRequest = onDismissRequest, properties = properties) {
        AnimatedVisibility(
            visible = true,
            enter = fadeIn(tween(190)) + slideInVertically(tween(190)) { it / 30 },
        ) {
            val view = LocalView.current
            androidx.compose.runtime.SideEffect {
                val window = (view.parent as? DialogWindowProvider)?.window
                window?.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))
                window?.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                window?.setDimAmount(0f)
                window?.setWindowAnimations(com.heika.nativeapp.R.style.HeikaGlassDialogAnimation)
            }
            val dark = LocalHeikaDark.current
            val shape = RoundedCornerShape(14.dp)
            val background = if (dark) Color(0xFF303238) else Color(0xFFF8F6F1)
            CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
                Column(
                    modifier.fillMaxWidth(.92f).heightIn(max = 600.dp)
                        .clip(shape)
                        .background(background.copy(alpha = if (dark) .72f else .76f), shape)
                        .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = if (dark) .46f else .58f), shape)
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    icon?.let { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { it() } }
                    title?.let {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                            CompositionLocalProvider(
                                androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.titleMedium.copy(
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.SemiBold,
                                ),
                            ) { it() }
                        }
                    }
                    text?.let {
                        Column(
                            Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            CompositionLocalProvider(
                                androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                            ) { it() }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.End) {
                        dismissButton?.invoke()
                        confirmButton()
                    }
                }
            }
        }
    }
}
