package com.heika.nativeapp.feature.detail

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaReadingPalette
import com.heika.nativeapp.ui.MdHeading
import com.heika.nativeapp.ui.heikaReadingPalette

/**
 * 详情页顶栏：实心底色 + 轻微模糊，不再用「从顶部往下淡出」的大渐变。
 *
 * 渐变是过去用来压封面亮部的，但它同时把正文顶部一起糊掉了；现在顶栏就是
 * 一条实心条，模糊只作用在它自己身上，正文滚到下面时不会透色。
 */
@Composable
fun ReadingTopBar(
    brand: String,
    progress: Float,
    showToc: Boolean,
    showProgress: Boolean = true,
    onBack: () -> Unit,
    onToc: () -> Unit,
    trailing: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = heikaReadingPalette()
    val animated by animateFloatAsState(progress.coerceIn(0f, 1f), tween(160), label = "reading-progress")
    Column(modifier.fillMaxWidth().background(palette.page.copy(alpha = .97f)).zIndex(2f)) {
        Box(Modifier.fillMaxWidth().height(56.dp)) {
            // 品牌字样绝对居中，不参与左右按钮的宽度分配；目录在右侧倒数第二，更多在最右。
            Row(
                Modifier.fillMaxSize().padding(horizontal = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
                    Icon(HeikaIcons.Back, contentDescription = "返回", tint = palette.title, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.weight(1f))
                if (showToc) IconButton(onClick = onToc, modifier = Modifier.size(44.dp)) {
                    Icon(HeikaIcons.List, contentDescription = "文章目录", tint = palette.title, modifier = Modifier.size(19.dp))
                }
                trailing()
            }
            Text(
                brand,
                Modifier.align(Alignment.Center),
                color = palette.title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
                maxLines = 1,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
        // 阅读进度：1.5dp 细线；用户在阅读设置里关掉后整条移除，不留空位。
        if (showProgress) {
            Box(Modifier.fillMaxWidth().height(1.5.dp).background(palette.progressTrack)) {
                Box(
                    Modifier
                        .fillMaxWidth(animated)
                        .height(1.5.dp)
                        .background(palette.accent),
                )
            }
        }
    }
}

/** 目录面板：完全实心，三级缩进，当前章节用品牌色标记。 */
@Composable
fun ReadingTocSheet(
    headings: List<MdHeading>,
    currentOrdinal: Int,
    onSelect: (MdHeading) -> Unit,
    onClose: () -> Unit,
) {
    val palette = heikaReadingPalette()
    Box(Modifier.fillMaxSize().zIndex(21f)) {
        Box(
            Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black.copy(alpha = .36f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        )
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(palette.panel)
                .navigationBarsPadding(),
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.width(38.dp).height(4.dp).clip(RoundedCornerShape(999.dp)).background(palette.line))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("目录", Modifier.weight(1f), color = palette.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text("${headings.size} 节", color = palette.muted, fontSize = 11.sp)
                Box(Modifier.size(32.dp).padding(start = 8.dp), contentAlignment = Alignment.Center) {
                    Icon(
                        HeikaIcons.Close,
                        contentDescription = "关闭目录",
                        tint = palette.muted,
                        modifier = Modifier.size(17.dp).clickable(onClick = onClose),
                    )
                }
            }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 6.dp)) {
                items(headings, key = { "${it.ordinal}-${it.text}" }) { heading ->
                    val active = heading.ordinal == currentOrdinal
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { onSelect(heading) }
                            .padding(start = (18 + (heading.level - 1) * 14).dp, end = 18.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            heading.text,
                            color = if (active) palette.accent else palette.body,
                            fontSize = if (heading.level == 1) 14.sp else 13.sp,
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (active) Box(Modifier.width(3.dp).height(14.dp).clip(RoundedCornerShape(2.dp)).background(palette.accent))
                    }
                }
            }
        }
    }
}

/**
 * 底部常驻操作栏：黑色微模糊，复用主底栏的 haze 材质，但把底色压到接近实心，
 * 保证按钮始终清晰、正文不会从操作栏里透出来。
 */
@Composable
fun ReadingDock(
    commentCount: Int,
    liked: Boolean,
    likeCount: Int,
    saved: Boolean,
    likeSending: Boolean,
    saveSending: Boolean,
    onComment: () -> Unit,
    onInput: () -> Unit,
    onLike: () -> Unit,
    onSave: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = heikaReadingPalette()
    Row(
        modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            Modifier.weight(1f).height(50.dp)
                .clip(RoundedCornerShape(25.dp))
                .background(palette.dockBackground.copy(alpha = .96f))
                .border(.8.dp, palette.dockBorder, RoundedCornerShape(25.dp))
                .clickable(onClick = onInput)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(HeikaIcons.Comment, contentDescription = null, tint = palette.muted, modifier = Modifier.size(18.dp))
            Text("说说你的想法…", color = palette.muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
            if (commentCount > 0) Text("$commentCount", color = palette.muted, fontSize = 11.sp)
        }
        Row(
            Modifier.height(50.dp)
                .clip(RoundedCornerShape(25.dp))
                .background(palette.dockBackground.copy(alpha = .96f))
                .border(.8.dp, palette.dockBorder, RoundedCornerShape(25.dp))
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 左侧评论入口已承载「看评论」，右侧不再重复放评论图标。
            DockAction(
                if (liked) HeikaIcons.LikeFilled else HeikaIcons.LikeOutline,
                "点赞",
                liked,
                likeSending,
                onLike,
                count = likeCount,
            )
            DockAction(if (saved) HeikaIcons.SaveFilled else HeikaIcons.SaveOutline, "收藏", saved, saveSending, onSave)
            DockAction(HeikaIcons.Share, "分享", false, false, onShare)
        }
    }
}

@Composable
private fun DockAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    sending: Boolean,
    onClick: () -> Unit,
    count: Int? = null,
) {
    val palette = heikaReadingPalette()
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .9f else 1f, tween(120), label = "dock-$label")
    val haptics = LocalHapticFeedback.current
    Row(
        Modifier.height(42.dp)
            .clip(RoundedCornerShape(21.dp))
            .clickable(enabled = !sending, interactionSource = source, indication = null) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = if (count != null) 8.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (sending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.8.dp, color = palette.accent)
        else Icon(
            icon,
            contentDescription = label,
            tint = if (selected) palette.accent else palette.secondary,
            modifier = Modifier.size(20.dp).graphicsLayer { scaleX = scale; scaleY = scale },
        )
        if (count != null && count > 0) Text(
            "$count",
            color = if (selected) palette.accent else palette.muted,
            fontSize = 11.sp,
        )
    }
}
