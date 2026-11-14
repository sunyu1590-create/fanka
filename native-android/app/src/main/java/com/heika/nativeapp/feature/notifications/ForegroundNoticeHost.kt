package com.heika.nativeapp.feature.notifications

import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaNotice
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import com.heika.nativeapp.ui.LocalHeikaDark
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.heika.nativeapp.data.HeikaNotification
import kotlinx.coroutines.delay

@Composable
fun ForegroundNoticeHost(
    modifier: Modifier = Modifier,
    hazeState: HazeState? = null,
    onOpen: (HeikaNotification) -> Unit,
    viewModel: ForegroundNotificationsViewModel = hiltViewModel(),
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val transientQueue = remember { mutableStateListOf<HeikaNotice>() }
    val transient = transientQueue.firstOrNull()
    val foreground = if (transient == null) state.current else null
    val visible = transient != null || foreground != null

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                viewModel.pollForeground()
                delay(POLL_INTERVAL_MS)
            }
        }
    }
    LaunchedEffect(Unit) {
        HeikaNoticeBus.events.collect { event ->
            if (event.kind == HeikaNoticeKind.SELECTION) {
                // Replace a pending selection message instead of replaying stale filter choices.
                transientQueue.removeAll { it.kind == HeikaNoticeKind.SELECTION }
            }
            if (transientQueue.none { it.id == event.id }) {
                transientQueue.add(event)
                if (transientQueue.size > 4) transientQueue.removeAt(1.coerceAtMost(transientQueue.lastIndex))
            }
        }
    }
    LaunchedEffect(transient?.id, foreground?.id) {
        if (transient != null) {
            delay(TRANSIENT_DISMISS_MS)
            transientQueue.removeAll { it.id == transient.id }
        } else if (foreground != null) {
            delay(AUTO_DISMISS_MS)
            viewModel.dismiss(foreground.id)
        }
    }

    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = slideInVertically(tween(250)) { -it / 5 } + fadeIn(tween(240)),
        exit = slideOutVertically(tween(190)) { -it / 6 } + fadeOut(tween(180)),
    ) {
        val blurRadius by transition.animateDp(label = "notice-blur") { state -> if (state == EnterExitState.Visible) 18.dp else 0.dp }
        val surfaceAlpha by transition.animateFloat(label = "notice-glass-alpha") { state -> if (state == EnterExitState.Visible) .68f else 0f }
        val isDark = LocalHeikaDark.current
        val shape = RoundedCornerShape(14.dp)
        val surface = MaterialTheme.colorScheme.surface
        Box(
            Modifier.fillMaxWidth().clip(shape)
                .then(if (hazeState != null) Modifier.hazeEffect(
                    state = hazeState,
                    HazeStyle(
                        backgroundColor = surface.copy(alpha = if (isDark) .64f else .74f),
                        tint = HazeTint(surface.copy(alpha = if (isDark) .16f else .10f)),
                        blurRadius = blurRadius,
                        noiseFactor = .01f,
                        fallbackTint = HazeTint(surface.copy(alpha = .94f)),
                    ),
                ) else Modifier)
                .graphicsLayer { alpha = surfaceAlpha }
                .border(.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = if (isDark) .6f else .72f), shape),
        ) {
            transient?.let { item ->
                val icon = when (item.kind) {
                    HeikaNoticeKind.SUCCESS -> HeikaIcons.Check
                    HeikaNoticeKind.SELECTION -> HeikaIcons.Check
                    HeikaNoticeKind.ERROR -> HeikaIcons.Warning
                    HeikaNoticeKind.WARNING -> HeikaIcons.Warning
                    HeikaNoticeKind.INFO -> HeikaIcons.Notifications
                }
                Row(Modifier.fillMaxWidth().padding(start = 13.dp, end = 4.dp, top = 9.dp, bottom = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, null, tint = if (item.kind == HeikaNoticeKind.ERROR) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, modifier = Modifier.size(19.dp))
                    Text(item.message, Modifier.weight(1f).padding(start = 10.dp), color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    IconButton(onClick = { transientQueue.removeAll { it.id == item.id } }, modifier = Modifier.size(36.dp)) {
                        Icon(HeikaIcons.Close, contentDescription = "关闭通知", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                }
            }
            foreground?.let { item ->
                Row(
                    Modifier.fillMaxWidth().clickable {
                        viewModel.markReadAndDismiss(item.id)
                        onOpen(item)
                    }.padding(start = 13.dp, end = 4.dp, top = 9.dp, bottom = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(HeikaIcons.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(19.dp))
                    Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                        Text(item.title.ifBlank { noticeTitle(item.type) }, color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val body = listOfNotNull(item.actorName.takeIf(String::isNotBlank), item.postTitle).joinToString(" · ").ifBlank { "黑卡有一条新动态" }
                        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    }
                    IconButton(onClick = { viewModel.dismiss(item.id) }, modifier = Modifier.size(36.dp)) {
                        Icon(HeikaIcons.Close, contentDescription = "关闭通知", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

private fun noticeTitle(type: String): String = when (type) {
    "comment" -> "收到一条评论"
    "reply" -> "收到一条回复"
    "like" -> "收到一个赞"
    "follow" -> "新增关注"
    "message" -> "收到一条私信"
    else -> "HEIKA 有新动态"
}

private const val POLL_INTERVAL_MS = 30_000L
private const val AUTO_DISMISS_MS = 5_500L
private const val TRANSIENT_DISMISS_MS = 3_200L
