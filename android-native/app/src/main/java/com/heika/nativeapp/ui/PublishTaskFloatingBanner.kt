package com.heika.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.feature.publish.PublishTaskCoordinator
import com.heika.nativeapp.feature.publish.PublishTaskUi
import kotlinx.coroutines.delay

private fun formatBytes(bytes: Long): String = when {
    bytes <= 0 -> "0 B"
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
    else -> String.format("%.1f MB", bytes / 1024.0 / 1024.0)
}

private fun formatSpeed(bps: Long): String = if (bps <= 0) "—" else "${formatBytes(bps)}/s"

/**
 * 全局发布任务悬浮条（原生组件，非 WebView）。
 *
 * - 最小化：真实阶段 + 环形进度 + 图片张数；
 * - 展开：总进度条、真实字节/速度、单张状态、返回发布页、隐藏；
 * - 点击展开而不是关闭：关闭只收起界面，任务在后台继续；
 * - 成功/待审 6 秒后自动收起；失败保留入口；
 * - 多任务并行时顶部可切换。
 * 由宿主用 navigationBarsPadding 定位，避免遮挡底栏与手势区。
 */
@Composable
fun PublishTaskFloatingBanner(
    onResume: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tasks by PublishTaskCoordinator.tasks.collectAsState()
    val activeKey by PublishTaskCoordinator.activeKey.collectAsState()
    val hidden by PublishTaskCoordinator.hidden.collectAsState()
    val expanded by PublishTaskCoordinator.expanded.collectAsState()
    val active = tasks.firstOrNull { it.taskKey == activeKey } ?: tasks.lastOrNull() ?: return
    val running = tasks.filterNot(PublishTaskUi::finished)

    // 成功/待审提示短暂停留后自动收起；失败保留，便于返回处理。
    LaunchedEffect(active.taskKey, active.finished, active.finishedAt) {
        if (active.finished && (active.published || active.underReview)) {
            delay(6000)
            PublishTaskCoordinator.hide()
        }
    }

    AnimatedVisibility(
        visible = !hidden,
        enter = fadeIn(tween(220, easing = HeikaMotion.standard)) +
            slideInVertically(tween(220, easing = HeikaMotion.standard)) { it / 2 },
        exit = fadeOut(tween(220, easing = HeikaMotion.standard)) +
            slideOutVertically(tween(220, easing = HeikaMotion.standard)) { it / 2 },
        modifier = modifier,
    ) {
        HeikaGlassSurface(
            hazeState = null,
            shape = RoundedCornerShape(HeikaRadii.group),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 9.dp),
            modifier = Modifier
                .widthIn(max = if (expanded) 330.dp else 292.dp)
                .clip(RoundedCornerShape(HeikaRadii.group))
                .animateContentSize(),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (running.size > 1) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        running.take(3).forEach { item ->
                            val selected = item.taskKey == active.taskKey
                            Text(
                                text = "${item.title.take(6)} · ${item.percent}%",
                                fontSize = 11.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .weight(1f, fill = false)
                                    .clip(RoundedCornerShape(HeikaRadii.chip))
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                                        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    )
                                    .clickable { PublishTaskCoordinator.focus(item.taskKey) }
                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(HeikaRadii.control))
                        .clickable {
                            if (expanded) PublishTaskCoordinator.collapse() else PublishTaskCoordinator.expand()
                        },
                ) {
                    if (!active.finished) {
                        Box(contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(
                                progress = { active.percent / 100f },
                                modifier = Modifier.size(30.dp),
                                strokeWidth = 2.6.dp,
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                            )
                            Text("${active.percent}", fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(RoundedCornerShape(HeikaRadii.chip))
                                .background(
                                    if (active.published) MaterialTheme.colorScheme.primary
                                    else if (active.underReview) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                    else MaterialTheme.colorScheme.error.copy(alpha = 0.16f),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = if (active.published) "✓" else if (active.underReview) "⌛" else "!",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (active.published) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onBackground,
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = active.stage,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = buildString {
                                if (!active.finished && active.totalImages > 0) append("图片 ${active.readyImages}/${active.totalImages} · ")
                                append(active.error ?: active.title)
                            },
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        imageVector = HeikaIcons.Close,
                        contentDescription = "收起浮窗（不取消任务）",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { PublishTaskCoordinator.hide() },
                    )
                }
                AnimatedVisibility(visible = expanded) {
                    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(5.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth((active.percent / 100f).coerceIn(0f, 1f))
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(MaterialTheme.colorScheme.primary),
                            )
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("已传输 ${formatBytes(active.sentBytes)} / ${formatBytes(active.totalBytes)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(formatSpeed(active.speedBps), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        active.images.take(5).forEach { image ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(image.name, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                Text(
                                    text = image.state,
                                    fontSize = 10.sp,
                                    color = if (image.failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (active.error != null) {
                            Text(active.error ?: "", fontSize = 10.sp, color = MaterialTheme.colorScheme.error, lineHeight = 15.sp)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BannerAction(text = if (active.finished) "返回发布" else "继续编辑", primary = true) {
                                PublishTaskCoordinator.requestResume()
                                onResume()
                            }
                            BannerAction(text = "隐藏") { PublishTaskCoordinator.hide() }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BannerAction(text: String, primary: Boolean = false, onClick: () -> Unit) {
    Text(
        text = text,
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = if (primary) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onBackground,
        modifier = Modifier
            .clip(RoundedCornerShape(HeikaRadii.chip))
            .background(if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    )
}
