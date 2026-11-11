package com.heika.nativeapp.feature.notifications

import com.heika.nativeapp.ui.HeikaIcons
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    onOpen: (HeikaNotification) -> Unit,
    viewModel: ForegroundNotificationsViewModel = hiltViewModel(),
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notice = state.current

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                viewModel.pollForeground()
                delay(POLL_INTERVAL_MS)
            }
        }
    }
    LaunchedEffect(notice?.id) {
        if (notice != null) {
            delay(AUTO_DISMISS_MS)
            viewModel.dismiss(notice.id)
        }
    }

    AnimatedVisibility(
        visible = notice != null,
        modifier = modifier,
        enter = slideInVertically(tween(360, easing = FastOutSlowInEasing)) { -it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(270, easing = FastOutSlowInEasing)) { -it } + fadeOut(tween(170)),
    ) {
        notice?.let { item ->
            val shape = RoundedCornerShape(18.dp)
            Row(
                Modifier.fillMaxWidth()
                    .clip(shape)
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.8f), shape)
                    .clickable {
                        viewModel.markReadAndDismiss(item.id)
                        onOpen(item)
                    }
                    .padding(start = 14.dp, end = 5.dp, top = 11.dp, bottom = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                Icon(HeikaIcons.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        item.title.ifBlank { noticeTitle(item.type) },
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val body = listOfNotNull(item.actorName.takeIf(String::isNotBlank), item.postTitle)
                        .joinToString(" · ").ifBlank { "黑卡有一条新动态" }
                    Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                }
                Spacer(Modifier.size(1.dp))
                IconButton(onClick = { viewModel.dismiss(item.id) }, modifier = Modifier.size(38.dp)) {
                    Icon(HeikaIcons.Close, contentDescription = "关闭通知", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
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
