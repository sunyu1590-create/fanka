package com.heika.nativeapp.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * 呼吸脉冲骨架。
 *
 * 系统转圈只能表达"在等"，看不出等待的是一片什么内容；骨架先画出页面结构，
 * 再用缓慢的明暗呼吸提示进度，页面加载完成时视觉落点不会跳。
 */
@Composable
fun pulseAlpha(): Float {
    val transition = rememberInfiniteTransition(label = "heika-pulse")
    val alpha by transition.animateFloat(
        initialValue = 0.34f,
        targetValue = 0.86f,
        animationSpec = infiniteRepeatable(
            animation = tween(920, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "heika-pulse-alpha",
    )
    return alpha
}

@Composable
fun HeikaPulseBlock(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(10.dp),
    color: Color = MaterialTheme.colorScheme.surfaceVariant,
) {
    Box(modifier.clip(shape).background(color.copy(alpha = pulseAlpha())))
}

/** 一行文字占位。宽度用比例控制，避免每行等长显得呆板。 */
@Composable
fun HeikaPulseLine(
    modifier: Modifier = Modifier,
    height: Dp = 12.dp,
    widthFraction: Float = 1f,
    color: Color = MaterialTheme.colorScheme.surfaceVariant,
) {
    HeikaPulseBlock(
        modifier = modifier.fillMaxWidth(widthFraction).height(height),
        shape = RoundedCornerShape(6.dp),
        color = color,
    )
}

/** 列表/区块的骨架：若干行文字。 */
@Composable
fun HeikaPulseLines(
    modifier: Modifier = Modifier,
    lines: Int = 3,
    lineHeight: Dp = 12.dp,
    spacing: Dp = 9.dp,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(spacing)) {
        repeat(lines) { index ->
            HeikaPulseLine(
                height = lineHeight,
                widthFraction = when {
                    lines == 1 -> 1f
                    index == lines - 1 -> 0.62f
                    index == 0 -> 1f
                    else -> 0.9f
                },
            )
        }
    }
}

/** 卡片网格骨架，用于信息流类页面。 */
@Composable
fun HeikaPulseFeed(
    modifier: Modifier = Modifier,
    cards: Int = 4,
    cardHeight: Dp = 168.dp,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(cards) { index ->
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                HeikaPulseBlock(
                    modifier = Modifier.fillMaxWidth().height(cardHeight),
                    shape = RoundedCornerShape(HeikaRadii.feedCard),
                )
                HeikaPulseLine(height = 13.dp, widthFraction = if (index % 2 == 0) 0.86f else 0.7f)
                HeikaPulseLine(height = 10.dp, widthFraction = 0.44f)
            }
        }
    }
}

/** 整页骨架：标题、说明、列表块，适配绝大多数页面。 */
@Composable
fun HeikaPulsePage(
    modifier: Modifier = Modifier,
    showHeader: Boolean = false,
    cards: Int = 3,
    cardHeight: Dp = 96.dp,
    horizontalPadding: Dp = 18.dp,
) {
    Column(
        modifier.fillMaxSize().padding(horizontal = horizontalPadding, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        if (showHeader) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                HeikaPulseBlock(Modifier.size(44.dp), CircleShape)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HeikaPulseLine(height = 14.dp, widthFraction = 0.52f)
                    HeikaPulseLine(height = 10.dp, widthFraction = 0.34f)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            HeikaPulseLine(height = 20.dp, widthFraction = 0.46f)
            HeikaPulseLine(height = 11.dp, widthFraction = 0.82f)
            HeikaPulseLine(height = 11.dp, widthFraction = 0.64f)
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(cards) {
                HeikaPulseBlock(
                    Modifier.fillMaxWidth().height(cardHeight),
                    RoundedCornerShape(HeikaRadii.surface),
                )
            }
        }
        Spacer(Modifier.height(6.dp))
    }
}

/** 行内等待：一条短脉冲条，替代列表底部的小转圈。 */
@Composable
fun HeikaPulseRow(modifier: Modifier = Modifier, height: Dp = 44.dp) {
    HeikaPulseBlock(
        modifier.fillMaxWidth().height(height),
        RoundedCornerShape(HeikaRadii.surface),
    )
}

/** 小尺寸占位：用于按钮内或图标位置的操作等待。 */
@Composable
fun HeikaPulseDot(modifier: Modifier = Modifier, size: Dp = 17.dp, color: Color = MaterialTheme.colorScheme.primary) {
    Box(modifier.size(size).clip(CircleShape).background(color.copy(alpha = pulseAlpha())))
}
