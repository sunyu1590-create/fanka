package com.heika.nativeapp.feature.decor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.CardPalette
import com.heika.nativeapp.data.DecorConfig
import com.heika.nativeapp.feature.home.CardBack
import com.heika.nativeapp.ui.GlassNavigationBar
import com.heika.nativeapp.ui.LocalDecor
import com.heika.nativeapp.ui.LocalHeikaDark
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

/**
 * 底栏实时预览（需求 6.1）：直接复用真实导航栏组件渲染工作区配置，
 * 预览即所得，不存在「预览一套、应用另一套」的偏差。
 */
@Composable
fun DecorBarPreview(config: DecorConfig, dark: Boolean, modifier: Modifier = Modifier) {
    CompositionLocalProvider(LocalDecor provides config, LocalHeikaDark provides dark) {
        // 预览同样走真模糊：底栏是玻璃，就必须有「背后内容」可折射。
        // source 与 effect 必须是兄弟节点，不能互为父子，否则 haze 会判定为循环而失效。
        val hazeState = rememberHazeState()
        Box(modifier.background(Color(0xFF1A1C20))) {
            Box(Modifier.matchParentSize().hazeSource(hazeState))
            GlassNavigationBar(
                selected = "home",
                hazeState = hazeState,
                onSelect = {},
                onPublish = {},
            )
        }
    }
}

/** 卡背实时预览：复用首页 CardBack 的完整纹理与图案绘制。 */
@Composable
fun DecorCardBackPreview(config: DecorConfig, dark: Boolean, modifier: Modifier = Modifier) {
    CompositionLocalProvider(LocalDecor provides config, LocalHeikaDark provides dark) {
        Box(
            modifier
                .aspectRatio(0.78f)
                .clip(RoundedCornerShape(16.dp)),
        ) {
            CardBack(number = 1, preview = true)
        }
    }
}

/**
 * 内容面实时预览（需求 7.3）：
 * 自定义底图属于装扮层（背景 + 遮罩），示例标题/摘要/按钮属于内容层，互不替换。
 */
@Composable
fun DecorCardContentPreview(config: DecorConfig, dark: Boolean, modifier: Modifier = Modifier) {
    val palette: CardPalette = config.card.palette(dark)
    Box(
        modifier
            .aspectRatio(0.78f)
            .clip(RoundedCornerShape(16.dp))
            .background(palette.contentBg)
            .border(1.dp, palette.contentBorder, RoundedCornerShape(16.dp)),
    ) {
        // 装扮层：自定义内容面底图
        if (palette.contentImage != null) {
            AsyncImage(
                model = palette.contentImage,
                contentDescription = null,
                imageLoader = LocalHeikaImageLoader.current,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
            // 遮罩只压暗装饰底图（0–0.6），保证标题摘要可读
            Box(Modifier.fillMaxSize().background(palette.contentBg.copy(alpha = palette.contentScrim)))
        }
        // 内容层：示例文本与按钮
        Column(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.Bottom,
        ) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(palette.chipBg)
                    .border(1.dp, palette.chipBorder, RoundedCornerShape(999.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text("AI 知识", color = palette.bodyColor, fontSize = 9.sp)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "把复杂的事讲清楚",
                color = palette.titleColor,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                "这是一段示例摘要，用来确认翻开后的标题、正文与按钮在主题下的可读性。",
                color = palette.bodyColor,
                fontSize = 10.5.sp,
                lineHeight = 15.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(10.dp))
            Box(
                Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(palette.actionBg)
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            ) {
                Text("查看更多", color = palette.actionText, fontSize = 10.5.sp, fontWeight = FontWeight.Medium)
            }
        }
        // 强调色细线：确认 accent 生效
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(2.dp)
                .background(palette.accent),
        )
    }
}

/** 深浅色预览切换的分段控件（工作室与主题详情共用）。 */
@Composable
fun DecorModeToggle(dark: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0x14808080))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf(true to "深色", false to "浅色").forEach { (isDark, label) ->
            val active = dark == isDark
            Box(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (active) Color(0xFFC9A961) else Color.Transparent)
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            ) {
                Text(label, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 11.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

/** 资源类型小标签。 */
@Composable
fun DecorSectionHint(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, color = Color(0xFF8E9099), fontSize = 10.5.sp, lineHeight = 15.sp)
}
