package com.heika.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 阅读系统 2.0 的颜色令牌。
 *
 * 之前正文直接借用 Material 的 `onSurfaceVariant`（那是「辅助文字」色位），
 * 深色模式下等于 #AAA9AD，长文读起来整体发灰。正文必须有独立的色位，
 * 与标题、辅助信息形成三级层级，这里把它固化下来，避免再次被顺手复用。
 */
data class HeikaReadingPalette(
    val page: Color,
    val title: Color,
    val body: Color,
    val heading1: Color,
    val heading2: Color,
    val heading3: Color,
    val muted: Color,
    val secondary: Color,
    val line: Color,
    val panel: Color,
    val field: Color,
    val codeBackground: Color,
    val codeBorder: Color,
    val quoteBackground: Color,
    val tableHeader: Color,
    val link: Color,
    val dockBackground: Color,
    val dockBorder: Color,
    val progressTrack: Color,
    val accent: Color,
)

private val DarkReading = HeikaReadingPalette(
    page = Color(0xFF121316),
    title = Color(0xFFF5F5F5),
    body = Color(0xFFDEDEE2),
    heading1 = Color(0xFFF0F0F2),
    heading2 = Color(0xFFEAEAEC),
    heading3 = Color(0xFFE4E4E7),
    muted = Color(0xFF96969E),
    secondary = Color(0xFFA0A0A8),
    line = Color(0xFF2A2B2F),
    panel = Color(0xFF1C1D20),
    field = Color(0xFF292A2E),
    codeBackground = Color(0xFF191A1E),
    codeBorder = Color(0xFF2C2D32),
    quoteBackground = Color(0xFF1A1B1F),
    tableHeader = Color(0xFF202127),
    link = Color(0xFFD8BE82),
    dockBackground = Color(0xFF141518),
    dockBorder = Color(0xFF2E3037),
    progressTrack = Color(0xFF232428),
    accent = Color(0xFFD0B571),
)

private val LightReading = HeikaReadingPalette(
    page = Color(0xFFFFFFFF),
    title = Color(0xFF171717),
    body = Color(0xFF303030),
    heading1 = Color(0xFF202020),
    heading2 = Color(0xFF202020),
    heading3 = Color(0xFF242424),
    muted = Color(0xFF737373),
    secondary = Color(0xFF5E5E5E),
    line = Color(0xFFEAEAEA),
    panel = Color(0xFFFFFFFF),
    field = Color(0xFFF3F3F3),
    codeBackground = Color(0xFFF5F5F5),
    codeBorder = Color(0xFFE6E6E6),
    quoteBackground = Color(0xFFF7F7F5),
    tableHeader = Color(0xFFF5F5F5),
    link = Color(0xFF8A6A2F),
    dockBackground = Color(0xFFF7F7F7),
    dockBorder = Color(0xFFE2E2E2),
    progressTrack = Color(0xFFEDEDED),
    accent = Color(0xFFA98C51),
)

@Composable
fun heikaReadingPalette(): HeikaReadingPalette =
    if (LocalHeikaDark.current) DarkReading else LightReading

/** 正文排版基准：16sp / 1.75 倍行高，标题按层级递减，不做大面积粗体。 */
object HeikaReadingType {
    /** 阅读系统 2.0 之前的实际正文字号与行高（14sp / 1.72），2.30.2 起恢复。 */
    val body = 14.sp
    const val bodyLineHeight = 1.72f
    const val titleLineHeight = 1.32f

    fun heading(level: Int): Float = when (level) {
        1 -> 1.5f
        2 -> 1.3f
        3 -> 1.14f
        4 -> 1.04f
        else -> 1f
    }

    fun headingLineHeight(level: Int): Float = when (level) {
        1 -> 1.38f
        2 -> 1.42f
        else -> 1.5f
    }
}

object HeikaReadingSpacing {
    /** 段落之间：16dp 起步，长文不显得挤。 */
    val paragraph = 16.dp
    val listItem = 7.dp
    /** 章节标题与上一段之间留白更大，形成明确分段。 */
    val headingTop = 26.dp
    val headingBottom = 10.dp
    val imageGap = 18.dp
    val pageHorizontal = 20.dp
    /** 底栏高度 + 安全区，正文末尾必须留出这段空间，否则最后一行被压住。 */
    val dockReserve = 132.dp
}
