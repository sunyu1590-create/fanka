package com.heika.nativeapp.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

@Composable
fun BrandHeader(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    trailing: @Composable (() -> Unit)? = null,
    showSearch: Boolean = true,
) {
    Box(
        modifier = Modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = HeikaSpacing.pageHorizontal),
    ) {
        // 品牌为整体锁定：中文与英文按基线对齐，不各自垂直居中，避免小字上浮。
        Row(Modifier.align(Alignment.CenterStart), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "黑卡",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = HeikaType.brand,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.1.sp,
                modifier = Modifier.alignByBaseline(),
            )
            Text(
                "HEIKA",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = HeikaType.brandLatin,
                letterSpacing = 1.6.sp,
                modifier = Modifier.padding(start = 7.dp).alignByBaseline(),
            )
        }
        Row(Modifier.align(Alignment.CenterEnd), verticalAlignment = Alignment.CenterVertically) {
            if (showSearch) IconButton(onClick = onSearch, modifier = Modifier.size(40.dp)) {
                Icon(HeikaIcons.Search, contentDescription = "搜索", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
            }
            if (trailing != null) trailing() else IconButton(onClick = onNotifications, modifier = Modifier.size(40.dp)) {
                Icon(HeikaIcons.Notifications, contentDescription = "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
            }
        }
    }
}

@Composable
fun BackHeader(
    title: String,
    onBack: () -> Unit,
    centeredTitle: Boolean = false,
    centeredTitleSize: TextUnit = HeikaType.headerTitle,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    if (centeredTitle) {
        Box(modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = 12.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterStart).size(44.dp)) {
                Icon(HeikaIcons.Back, contentDescription = "返回", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(20.dp))
            }
            Text(
                title,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = centeredTitleSize,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).fillMaxWidth().padding(horizontal = 56.dp),
            )
            Box(Modifier.align(Alignment.CenterEnd).widthIn(min = 44.dp), contentAlignment = Alignment.CenterEnd) {
                trailing?.invoke()
            }
        }
        return
    }
    Row(
        modifier = modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = HeikaSpacing.pageHorizontal),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
            Icon(HeikaIcons.Back, contentDescription = "返回", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(20.dp))
        }
        Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = HeikaType.headerTitle, fontWeight = FontWeight.SemiBold, letterSpacing = .2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

@Composable
fun SectionLabel(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = HeikaType.sectionTitle, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        subtitle?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
    }
}

@Composable
fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(HeikaRadii.control)
    val chipBackground by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent,
        tween(HeikaMotion.control),
        label = "filter-chip-background",
    )
    val chipBorder by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.55f),
        tween(HeikaMotion.control),
        label = "filter-chip-border",
    )
    val chipText by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(HeikaMotion.control),
        label = "filter-chip-text",
    )
    Box(
        modifier
            .clip(shape)
            .background(chipBackground)
            .border(BorderStroke(1.dp, chipBorder), shape)
            .clickable(onClick = onClick)
            .defaultMinSize(minHeight = 42.dp)
            .padding(horizontal = 15.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = chipText, fontSize = HeikaType.secondary, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
    }
}

@Composable
fun GlassNavigationBar(
    selected: String,
    hazeState: HazeState,
    onSelect: (String) -> Unit,
    onPublish: () -> Unit,
    modifier: Modifier = Modifier,
    blurEnabled: Boolean = true,
    previewBackdropActive: Boolean = false,
) {
    val tabShape = RoundedCornerShape(36.dp)
    val dark = LocalHeikaDark.current
    val decor = LocalDecor.current
    val palette = decor.bar.palette(dark)
    val surface = palette.bg
    val containerAlpha = if (previewBackdropActive) minOf(1f, palette.bgOpacity + .12f) else palette.bgOpacity
    Row(
        modifier = modifier.fillMaxWidth()
            .padding(horizontal = 14.dp)
            .height(72.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .height(66.dp)
                .clip(tabShape)
                .then(
                    if (blurEnabled) Modifier.hazeEffect(
                        state = hazeState,
                        style = HazeStyle(
                            backgroundColor = surface.copy(alpha = containerAlpha),
                            tint = HazeTint(surface.copy(alpha = if (previewBackdropActive) .10f else .06f)),
                            blurRadius = 18.dp,
                            fallbackTint = HazeTint(surface.copy(alpha = minOf(1f, containerAlpha + .04f))),
                        ),
                    ) else Modifier,
                )
                .background(surface.copy(alpha = containerAlpha), tabShape)
                .border(1.dp, palette.border.copy(alpha = palette.borderOpacity.coerceAtLeast(if (dark) .06f else .05f)), tabShape)
                .padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavigationItem("home", "首页", selected, onSelect, palette, decor.bar.icon("home"))
            NavigationItem("discovery", "发现", selected, onSelect, palette, decor.bar.icon("discover"))
            NavigationItem("messages", "消息", selected, onSelect, palette, decor.bar.icon("messages"))
            NavigationItem("profile", "我的", selected, onSelect, palette, decor.bar.icon("mine"))
        }
        Surface(
            modifier = Modifier.size(58.dp).clickable(onClick = onPublish),
            shape = CircleShape,
            color = decor.bar.publishBg,
            border = BorderStroke(1.dp, Color.White.copy(alpha = if (dark) 0.9f else 0.55f)),
            shadowElevation = 4.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                val publishIcon = decor.bar.publishIconUrl
                if (publishIcon != null) {
                    AsyncImage(
                        model = publishIcon,
                        contentDescription = "发布内容",
                        imageLoader = LocalHeikaImageLoader.current,
                        modifier = Modifier.size(27.dp),
                        colorFilter = if (decor.bar.publishTinted) ColorFilter.tint(decor.bar.publishIcon) else null,
                    )
                } else {
                    Icon(HeikaIcons.Add, contentDescription = "发布内容", tint = decor.bar.publishIcon, modifier = Modifier.size(29.dp))
                }
            }
        }
    }
}

@Composable
private fun RowScope.NavigationItem(
    key: String,
    label: String,
    selected: String,
    onSelect: (String) -> Unit,
    palette: com.heika.nativeapp.data.BarPalette,
    custom: com.heika.nativeapp.data.DecorIcon?,
) {
    val active = selected == key
    val scale by animateFloatAsState(if (active) 1f else 0.96f, animationSpec = spring(dampingRatio = 0.72f, stiffness = 560f), label = "nav-scale")
    val iconColor by animateColorAsState(
        if (active) palette.activeIcon else palette.icon,
        tween(HeikaMotion.control),
        label = "nav-icon-color-$key",
    )
    val pillColor by animateColorAsState(
        palette.activePill.copy(alpha = if (active) palette.activePillOpacity else 0f),
        tween(HeikaMotion.control),
        label = "nav-pill-$key",
    )
    Column(
        modifier = Modifier
            .weight(1f)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(24.dp))
            .clickable(onClickLabel = label) { onSelect(key) }
            .padding(vertical = 6.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .height(38.dp)
                .widthIn(min = 44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(pillColor),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedContent(targetState = active, label = "nav-icon") { isSelected ->
                val source = custom?.source(isSelected)
                val tint = if (isSelected) palette.activeIcon else palette.icon
                if (source != null) {
                    val size = (25f * (custom.scale)).dp
                    AsyncImage(
                        model = source,
                        contentDescription = label,
                        imageLoader = LocalHeikaImageLoader.current,
                        modifier = Modifier.size(size),
                        contentScale = if (custom.fitCover) ContentScale.Crop else ContentScale.Fit,
                        // 单色图标跟随主题色；彩色图标保留原色，不做任何滤镜。
                        colorFilter = if (custom.tint) ColorFilter.tint(tint) else null,
                    )
                } else {
                    NavigationGlyph(key, tint, label)
                }
            }
        }
    }
}

@Composable
private fun NavigationGlyph(key: String, color: Color, label: String) {
    val icon = when (key) {
        "home" -> HeikaIcons.Home
        "discovery" -> HeikaIcons.Discovery
        "messages" -> HeikaIcons.Messages
        else -> HeikaIcons.Profile
    }
    Icon(icon, contentDescription = label, tint = color, modifier = Modifier.size(27.dp))
}
