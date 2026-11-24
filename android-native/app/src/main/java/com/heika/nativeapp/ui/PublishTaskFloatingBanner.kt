package com.heika.nativeapp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.heika.nativeapp.feature.publish.PublishTaskCoordinator

/**
 * 全局发布任务悬浮条：不属于发布页，页面切换期间保持可见。
 * 最小化形态只显示真实阶段与进度；点击可收起（收起≠取消任务）。
 */
@Composable
fun PublishTaskFloatingBanner(modifier: Modifier = Modifier) {
    val task by PublishTaskCoordinator.state.collectAsState()
    val current = task ?: return
    AnimatedVisibility(
        visible = true,
        enter = fadeIn(tween(220, easing = HeikaMotion.standard)) +
            slideInVertically(tween(220, easing = HeikaMotion.standard)) { it / 2 },
        exit = fadeOut(tween(220, easing = HeikaMotion.standard)) +
            slideOutVertically(tween(220, easing = HeikaMotion.standard)) { it / 2 },
        modifier = modifier,
    ) {
        HeikaGlassSurface(
            hazeState = null,
            shape = RoundedCornerShape(HeikaRadii.group),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(RoundedCornerShape(HeikaRadii.group))
                .clickable { PublishTaskCoordinator.dismiss() },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!current.finished) {
                    CircularProgressIndicator(
                        progress = { current.percent / 100f },
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.4.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Text(if (current.published) "✓" else if (current.underReview) "⌛" else "!", style = MaterialTheme.typography.titleMedium)
                }
                Column {
                    Text(current.stage, style = MaterialTheme.typography.labelLarge)
                    Text(
                        buildString {
                            if (!current.finished) append("${current.percent}% · ")
                            if (current.totalImages > 0) append("图片 ${current.readyImages}/${current.totalImages} · ")
                            append(current.error ?: current.title)
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
