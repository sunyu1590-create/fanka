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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    HeikaLiquidGlassSurface(hazeState, modifier = Modifier.fillMaxWidth().height(68.dp)) {
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
}

@Composable
fun BackHeader(title: String, onBack: () -> Unit, trailing: @Composable (() -> Unit)? = null) {
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
) {
    val shape = RoundedCornerShape(37.dp)
    val isDark = LocalHeikaDark.current
    val surface = MaterialTheme.colorScheme.surface
    Row(
        modifier = modifier.fillMaxWidth()
            .padding(horizontal = 14.dp)
            .clip(shape)
            .then(if (blurEnabled) Modifier.hazeEffect(
                state = hazeState,
                style = HazeStyle(
                    backgroundColor = surface,
                    tint = HazeTint(surface.copy(alpha = if (isDark) 0.16f else 0.28f)),
                    blurRadius = 30.dp,
                    noiseFactor = 0.025f,
                    fallbackTint = HazeTint(surface.copy(alpha = if (isDark) 0.48f else 0.62f)),
                ),
            ) else Modifier)
            .background(
                Brush.verticalGradient(
                    listOf(
                        surface.copy(alpha = if (isDark) 0.32f else 0.56f),
                        surface.copy(alpha = if (isDark) 0.23f else 0.42f),
                    ),
                ),
                shape,
            )
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.82f), shape)
            .drawBehind {
                val highlight = Brush.horizontalGradient(
                    0f to Color.White.copy(alpha = if (isDark) 0.27f else 0.52f),
                    0.45f to Color.White.copy(alpha = if (isDark) 0.10f else 0.22f),
                    1f to Color.White.copy(alpha = if (isDark) 0.18f else 0.36f),
                )
                drawLine(highlight, Offset(18.dp.toPx(), 1.dp.toPx()), Offset(size.width - 18.dp.toPx(), 1.dp.toPx()), 1.dp.toPx())
            }
            .padding(start = 9.dp, top = 9.dp, end = 9.dp, bottom = 9.dp)
            .height(73.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(30.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (isDark) 0.52f else 0.66f))
                .padding(horizontal = 3.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavigationItem("home", "首页", selected, onSelect)
            NavigationItem("discovery", "发现", selected, onSelect)
            NavigationItem("messages", "消息", selected, onSelect)
            NavigationItem("profile", "我的", selected, onSelect)
        }
        Spacer(Modifier.width(10.dp))
        Surface(
            modifier = Modifier.size(61.dp).clickable(onClick = onPublish),
            shape = CircleShape,
            color = Color(0xFFF5F4F0),
            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.9f)),
            shadowElevation = 6.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(HeikaIcons.Add, contentDescription = "发布内容", tint = Color(0xFF202125), modifier = Modifier.size(31.dp))
            }
        }
    }
}

@Composable
private fun RowScope.NavigationItem(key: String, label: String, selected: String, onSelect: (String) -> Unit) {
    val active = selected == key
    val scale by animateFloatAsState(if (active) 1f else 0.96f, animationSpec = spring(dampingRatio = 0.72f, stiffness = 560f), label = "nav-scale")
    val labelColor by animateColorAsState(
        if (active) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
        tween(HeikaMotion.control),
        label = "nav-label-color-$key",
    )
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
            .clickable { onSelect(key) }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AnimatedContent(targetState = active, label = "nav-icon") { isSelected ->
            NavigationGlyph(key, if (isSelected) iconColor else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(label, color = labelColor, fontSize = 12.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun NavigationGlyph(key: String, color: Color) {
    val icon = when (key) {
        "home" -> HeikaIcons.Home
        "discovery" -> HeikaIcons.Discovery
        "messages" -> HeikaIcons.Messages
        else -> HeikaIcons.Profile
    }
    Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(27.dp))
}
