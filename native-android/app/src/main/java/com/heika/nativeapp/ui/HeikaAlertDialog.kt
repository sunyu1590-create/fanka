package com.heika.nativeapp.ui

import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.shape.CircleShape

/** Centered glass dialog using Android's native cross-window blur, bounded to this dialog window. */
@Composable
fun HeikaAlertDialog(
    onDismissRequest: () -> Unit,
    confirmButton: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    dismissButton: (@Composable () -> Unit)? = null,
    title: (@Composable () -> Unit)? = null,
    text: (@Composable () -> Unit)? = null,
    icon: (@Composable () -> Unit)? = null,
    properties: DialogProperties = DialogProperties(usePlatformDefaultWidth = true),
) {
    Dialog(onDismissRequest = onDismissRequest, properties = properties) {
        val view = LocalView.current
        val blurWindow = (view.parent as? DialogWindowProvider)?.window
        val density = androidx.compose.ui.platform.LocalDensity.current
        val blurRadiusPx = with(density) { HeikaGlassTokens.dialogBlurRadius.roundToPx() }
        DisposableEffect(blurWindow, blurRadiusPx) {
            val window = blurWindow
            window?.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))
            window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            window?.setDimAmount(HeikaGlassTokens.backdropDimAmount)
            if (window != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = view.context.getSystemService(WindowManager::class.java)
                val applyBlur: (Boolean) -> Unit = { enabled ->
                    if (enabled) {
                        window.setBackgroundBlurRadius(blurRadiusPx)
                        window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                    } else {
                        window.setBackgroundBlurRadius(0)
                        window.clearFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                    }
                }
                val listener = java.util.function.Consumer<Boolean> { enabled -> applyBlur(enabled) }
                applyBlur(manager.isCrossWindowBlurEnabled)
                manager.addCrossWindowBlurEnabledListener(listener)
                onDispose {
                    manager.removeCrossWindowBlurEnabledListener(listener)
                    window.setBackgroundBlurRadius(0)
                    window.clearFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                }
            } else {
                onDispose { }
            }
        }
        val dark = LocalHeikaDark.current
        val shape = RoundedCornerShape(HeikaGlassTokens.dialogRadius)
        val background = if (dark) Color(0xFF24262B) else Color(0xFFF7F5F0)
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
            Column(
                modifier.fillMaxWidth(.88f).widthIn(max = 340.dp).heightIn(max = 600.dp)
                    .clip(shape)
                    .background(
                        background.copy(
                            alpha = if (dark) HeikaGlassTokens.darkDialogGlassAlpha * HeikaGlassTokens.darkDialogAlpha
                            else HeikaGlassTokens.lightDialogGlassAlpha * HeikaGlassTokens.lightDialogAlpha,
                        ),
                        shape,
                    )
                    .border(HeikaGlassTokens.borderWidth, MaterialTheme.colorScheme.outline.copy(alpha = if (dark) .48f else .60f), shape)
                    .padding(horizontal = 20.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                    icon?.let { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) { it() } }
                    title?.let {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                            CompositionLocalProvider(
                                androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.titleMedium.copy(
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.SemiBold,
                                    textAlign = TextAlign.Start,
                                ),
                            ) { it() }
                        }
                    }
                    text?.let {
                        Column(
                            Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                            horizontalAlignment = Alignment.Start,
                        ) {
                            CompositionLocalProvider(
                                androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Start),
                            ) { it() }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                        dismissButton?.invoke()
                        confirmButton()
                    }
            }
        }
    }
}

/** Standard confirmation dialog for destructive and reversible actions. */
@Composable
fun HeikaGlassDialog(
    title: String,
    message: String,
    confirmText: String,
    cancelText: String = "取消",
    destructive: Boolean = false,
    dismissible: Boolean = true,
    loading: Boolean = false,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    var confirming by remember(title) { mutableStateOf(false) }
    var wasLoading by remember(title) { mutableStateOf(loading) }
    LaunchedEffect(loading) {
        if (wasLoading && !loading) confirming = false
        wasLoading = loading
    }
    HeikaAlertDialog(
        onDismissRequest = { if (dismissible && !loading) onCancel() },
        properties = DialogProperties(
            dismissOnBackPress = dismissible,
            dismissOnClickOutside = dismissible,
            usePlatformDefaultWidth = true,
        ),
        title = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        text = { Text(message) },
        dismissButton = {
            DialogPillButton(text = cancelText, enabled = !loading, destructive = false, secondary = true, onClick = onCancel)
        },
        confirmButton = {
            DialogPillButton(
                text = if (loading) "处理中…" else confirmText,
                enabled = !loading && !confirming,
                destructive = destructive,
                secondary = false,
                loading = loading,
            ) {
                confirming = true
                onConfirm()
            }
        },
    )
}

@Composable
private fun DialogPillButton(
    text: String,
    enabled: Boolean,
    destructive: Boolean,
    secondary: Boolean,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val dark = LocalHeikaDark.current
    val foreground = when {
        destructive -> if (dark) Color(0xFFFF5F66) else Color(0xFFE5484D)
        secondary -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.onPrimary
    }
    val background = when {
        destructive -> foreground.copy(alpha = if (dark) .13f else .10f)
        secondary -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (dark) .72f else .82f)
        else -> MaterialTheme.colorScheme.primary
    }
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = background,
        contentColor = foreground,
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 17.dp, vertical = 11.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (loading) CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 1.7.dp, color = foreground)
            Text(text, color = foreground, fontWeight = FontWeight.Medium, maxLines = 1)
        }
    }
}
