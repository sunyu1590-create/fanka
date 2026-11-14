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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
    hazeState: HazeState? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(68.dp).padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 25.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.3.sp)
        Spacer(Modifier.width(10.dp))
        Text("HEIKA", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, letterSpacing = 2.2.sp)
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onSearch) { Icon(HeikaIcons.Search, contentDescription = "搜索", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (trailing != null) trailing() else IconButton(onClick = onNotifications) {
            Icon(HeikaIcons.Notifications, contentDescription = "通知", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun BackHeader(
    title: String,
    onBack: () -> Unit,
    centeredTitle: Boolean = false,
    centeredTitleSize: TextUnit = HeikaType.pageTitle,
    trailing: @Composable (() -> Unit)? = null,
) {
    if (centeredTitle) {
        Box(Modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = 8.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterStart).size(44.dp)) {
                Icon(HeikaIcons.Back, contentDescription = "返回", tint = MaterialTheme.colorScheme.onBackground)
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
        modifier = Modifier.fillMaxWidth().height(HeikaSpacing.headerHeight).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
            Icon(HeikaIcons.Back, contentDescription = "返回", tint = MaterialTheme.colorScheme.onBackground)
        }
        Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = HeikaType.pageTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
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
    val surface = MaterialTheme.colorScheme.surface
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
                            backgroundColor = surface,
                            tint = HazeTint(surface.copy(alpha = if (previewBackdropActive) .08f else if (dark) .20f else .30f)),
                            blurRadius = if (previewBackdropActive) 20.dp else 24.dp,
                            fallbackTint = HazeTint(surface.copy(alpha = if (dark) .82f else .90f)),
                        ),
                    ) else Modifier,
                )
                .background(surface.copy(alpha = if (previewBackdropActive) { if (dark) .24f else .36f } else if (dark) .34f else .48f), tabShape)
                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = if (dark) .56f else .46f), tabShape)
                .padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavigationItem("home", "首页", selected, onSelect)
            NavigationItem("discovery", "发现", selected, onSelect)
            NavigationItem("messages", "消息", selected, onSelect)
            NavigationItem("profile", "我的", selected, onSelect)
        }
        Surface(
            modifier = Modifier.size(58.dp).clickable(onClick = onPublish),
            shape = CircleShape,
            color = Color(0xFFF5F4F0),
            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.9f)),
            shadowElevation = 4.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(HeikaIcons.Add, contentDescription = "发布内容", tint = Color(0xFF202125), modifier = Modifier.size(29.dp))
            }
        }
    }
}

@Composable
private fun RowScope.NavigationItem(key: String, label: String, selected: String, onSelect: (String) -> Unit) {
    val active = selected == key
    val scale by animateFloatAsState(if (active) 1f else 0.96f, animationSpec = spring(dampingRatio = 0.72f, stiffness = 560f), label = "nav-scale")
    val iconColor by animateColorAsState(
        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(HeikaMotion.control),
        label = "nav-icon-color-$key",
    )
    Column(
        modifier = Modifier
            .weight(1f)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(24.dp))
            .clickable(onClickLabel = label) { onSelect(key) }
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AnimatedContent(targetState = active, label = "nav-icon") { isSelected ->
            NavigationGlyph(key, if (isSelected) iconColor else MaterialTheme.colorScheme.onSurfaceVariant, label)
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
