package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import android.webkit.WebView
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.BuildConfig

/**
 * 轻量 Markdown 渲染器：标题、列表、引用、代码块、分割线，以及行内的
 * 粗体 / 斜体 / 删除线 / 行内代码 / 链接。
 *
 * 只做展示，不做 HTML 解析；链接点击交给宿主弹风险提示，不会直接跳转。
 */
private sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Paragraph(val text: String) : MdBlock
    data class Quote(val lines: List<String>) : MdBlock
    data class Item(val ordered: Boolean, val index: Int, val text: String, val depth: Int = 0) : MdBlock
    data class Image(val alt: String, val url: String) : MdBlock
    data class Code(val language: String, val code: String) : MdBlock
    data class Table(val header: List<String>, val rows: List<List<String>>) : MdBlock
    data class Task(val checked: Boolean, val text: String) : MdBlock
    data object Rule : MdBlock
}

private val blockStart = Regex("^(#{1,6}\\s|>\\s?|[-*+]\\s|\\d+[.)]\\s|```|\\||!\\[|---+\\s*$)")

private fun parseBlocks(source: String): List<MdBlock> {
    val lines = source.replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<MdBlock>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        if (line.isBlank()) { i++; continue }

        if (line.trimStart().startsWith("```")) {
            val language = line.trim().removePrefix("```").trim()
            val code = mutableListOf<String>()
            i++
            while (i < lines.size && !lines[i].trimStart().startsWith("```")) code.add(lines[i++])
            if (i < lines.size) i++
            blocks.add(MdBlock.Code(language, code.joinToString("\n")))
            continue
        }

        val heading = Regex("^(#{1,6})\\s+(.+)$").find(line)
        if (heading != null) {
            blocks.add(MdBlock.Heading(heading.groupValues[1].length, heading.groupValues[2].trimEnd('#')))
            i++
            continue
        }
        // Setext 标题：下一行是一串 = 或 -，写作工具与 AI 偶尔会用这种写法。
        if (i + 1 < lines.size && lines[i + 1].isNotBlank() && Regex("^\\s*=+\\s*$").matches(lines[i + 1])) {
            blocks.add(MdBlock.Heading(1, line.trim()))
            i += 2
            continue
        }

        // 独占一行的图片：Markdown 里最常见的插图方式。
        val image = Regex("^\\s*!\\[([^\\]]*)]\\(\\s*<?([^)\\s>]+)>?(?:\\s+[\"'][^\"']*[\"'])?\\s*\\)\\s*$").find(line)
        if (image != null) {
            blocks.add(MdBlock.Image(image.groupValues[1], image.groupValues[2]))
            i++
            continue
        }

        if (Regex("^\\s*---+\\s*$").matches(line)) { blocks.add(MdBlock.Rule); i++; continue }

        if (Regex("^>\\s?").containsMatchIn(line)) {
            val quoted = mutableListOf<String>()
            while (i < lines.size && Regex("^>\\s?").containsMatchIn(lines[i])) {
                quoted.add(lines[i].replaceFirst(Regex("^>\\s?"), ""))
                i++
            }
            blocks.add(MdBlock.Quote(quoted))
            continue
        }

        // 表格：当前行含竖线，且下一行是 |---| 分隔行
        if (line.contains("|") && i + 1 < lines.size && Regex("^\\s*\\|?\\s*:?-{2,}:?\\s*(\\|\\s*:?-{2,}:?\\s*)*\\|?\\s*$").matches(lines[i + 1])) {
            val header = splitTableRow(line)
            i += 2
            val rows = mutableListOf<List<String>>()
            while (i < lines.size && lines[i].contains("|") && lines[i].isNotBlank()) {
                rows.add(splitTableRow(lines[i])); i++
            }
            blocks.add(MdBlock.Table(header, rows))
            continue
        }

        val task = Regex("^\\s*[-*+]\\s+\\[([ xX])]\\s+(.+)$").find(line)
        if (task != null) {
            blocks.add(MdBlock.Task(task.groupValues[1].lowercase() == "x", task.groupValues[2]))
            i++
            continue
        }

        val listItem = Regex("^\\s*([-*+]|\\d+[.)])\\s+(.+)$").find(line)
        if (listItem != null) {
            val ordered = listItem.groupValues[1].first().isDigit()
            while (i < lines.size) {
                val item = Regex("^\\s*([-*+]|\\d+[.)])\\s+(.+)$").find(lines[i]) ?: break
                if (item.groupValues[1].first().isDigit() != ordered) break
                val indent = lines[i].takeWhile { it == ' ' || it == '\t' }.let { prefix -> prefix.count { it == '\t' } * 2 + prefix.count { it == ' ' } }
                blocks.add(MdBlock.Item(ordered, item.groupValues[1].trimEnd('.', ')').toIntOrNull() ?: 1, item.groupValues[2], (indent / 2).coerceIn(0, 4)))
                i++
            }
            continue
        }

        val paragraph = mutableListOf(line)
        i++
        while (i < lines.size && lines[i].isNotBlank() && !blockStart.containsMatchIn(lines[i])) paragraph.add(lines[i++])
        blocks.add(MdBlock.Paragraph(paragraph.joinToString("\n")))
    }
    return blocks
}


private fun splitTableRow(line: String): List<String> =
    line.trim().removePrefix("|").removeSuffix("|").split("|").map { it.trim() }

/** 裸链接：带协议、带 www、带路径或常见顶级域的域名都会被识别。 */
private val bareUrlPattern = Regex(
    """((?:https?://|www\.)[^\s<>"'`）)，。；！？、]+|(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|cn|net|org|io|co|me|app|dev|ai|shop|top|xyz|cc|tv|info|biz|live|site|online|store|club|design|art|blog|tech|link|pro|fun|wiki|space|tools|run|codes|cloud)(?:/[^\s<>"'`）)，。；！？、]*)?)""",
    RegexOption.IGNORE_CASE,
)
private val trailingPunctuation = charArrayOf('.', ',', ';', ':', '!', '?', '。', '，', '；', '：', '！', '？', ')', '）', ']', '】', '}', '>', '"', '\'')
private val topicPattern = Regex("""(^|[\s（(【\[>])(#[\p{L}\p{N}_]{1,24})""")

/** 普通文本 → 自动链接 + #话题 高亮。 */
private fun AnnotatedString.Builder.appendRichText(
    text: String,
    linkColor: Color,
    onLinkClick: (String) -> Unit,
) {
    var cursor = 0
    for (match in bareUrlPattern.findAll(text)) {
        if (match.range.first > cursor) appendTopics(text.substring(cursor, match.range.first), linkColor)
        val raw = match.value
        val shown = raw.trimEnd(*trailingPunctuation)
        if (shown.isEmpty()) {
            append(raw)
        } else {
            val href = if (shown.startsWith("http://", true) || shown.startsWith("https://", true)) shown else "https://$shown"
            withLink(
                LinkAnnotation.Clickable(
                    tag = href,
                    styles = TextLinkStyles(
                        style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                    ),
                    linkInteractionListener = { onLinkClick(href) },
                ),
            ) { append(shown) }
            if (shown.length < raw.length) append(raw.substring(shown.length))
        }
        cursor = match.range.last + 1
    }
    if (cursor < text.length) appendTopics(text.substring(cursor), linkColor)
}

private fun AnnotatedString.Builder.appendTopics(text: String, linkColor: Color) {
    if (text.isEmpty()) return
    var cursor = 0
    for (match in topicPattern.findAll(text)) {
        val prefix = match.groupValues[1]
        val tag = match.groupValues[2]
        val start = match.range.first + prefix.length
        if (start > cursor) append(text.substring(cursor, start))
        withStyle(SpanStyle(color = linkColor, fontWeight = FontWeight.SemiBold, background = linkColor.copy(alpha = .10f))) {
            append(tag)
        }
        cursor = start + tag.length
    }
    if (cursor < text.length) append(text.substring(cursor))
}

private val inlinePattern = Regex("(`[^`]+`|\\*\\*[^*]+\\*\\*|~~[^~]+~~|!\\[[^\\]]*]\\([^)]+\\)|\\*[^*]+\\*|\\[[^\\]]+\\]\\([^)]+\\)|<https?://[^>\\s]+>)")

private fun buildInline(
    text: String,
    linkColor: Color,
    codeColor: Color,
    onLinkClick: (String) -> Unit,
): AnnotatedString = buildAnnotatedString {
    var cursor = 0
    for (match in inlinePattern.findAll(text)) {
        if (match.range.first > cursor) appendRichText(text.substring(cursor, match.range.first), linkColor, onLinkClick)
        val token = match.value
        when {
            token.startsWith("`") -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = codeColor)) {
                append(token.trim('`'))
            }
            token.startsWith("**") -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                append(token.removeSurrounding("**"))
            }
            token.startsWith("~~") -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) {
                append(token.removeSurrounding("~~"))
            }
            token.startsWith("*") -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                append(token.trim('*'))
            }
            token.startsWith("![") -> {
                // 行内图片没有独立的图片位，退化为替代文字，避免把 ![](...) 原样显示。
                val alt = token.substringAfter('[').substringBefore(']')
                if (alt.isNotBlank()) withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(alt) }
            }
            token.startsWith("<") -> {
                val href = token.trim('<', '>')
                withLink(
                    LinkAnnotation.Clickable(
                        tag = href,
                        styles = TextLinkStyles(style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)),
                        linkInteractionListener = { onLinkClick(href) },
                    ),
                ) { append(href) }
            }
            else -> {
                val label = token.substringAfter('[').substringBefore(']')
                val href = token.substringAfter('(').substringBeforeLast(')').trim()
                if (href.startsWith("http://") || href.startsWith("https://")) {
                    withLink(
                        LinkAnnotation.Clickable(
                            tag = href,
                            styles = TextLinkStyles(
                                style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                            ),
                            linkInteractionListener = { onLinkClick(href) },
                        ),
                    ) { append(label) }
                } else {
                    append(label)
                }
            }
        }
        cursor = match.range.last + 1
    }
    if (cursor < text.length) appendRichText(text.substring(cursor), linkColor, onLinkClick)
}

/** 目录条目：只保留可导航的 H1–H3，附带它在正文里的序号，供滚动定位使用。 */
data class MdHeading(val level: Int, val text: String, val ordinal: Int)

/** 目录提取直接复用正文解析结果，不做字符串截取，避免把代码块里的 # 当成标题。 */
fun markdownHeadings(source: String): List<MdHeading> =
    parseBlocks(source).mapNotNull { it as? MdBlock.Heading }
        .filter { it.level in 1..3 && it.text.isNotBlank() }
        .mapIndexed { index, heading -> MdHeading(heading.level, heading.text, index) }

@Composable
fun HeikaMarkdown(
    source: String,
    modifier: Modifier = Modifier,
    baseSize: TextUnit = HeikaReadingType.body,
    palette: HeikaReadingPalette = heikaReadingPalette(),
    onLinkClick: (String) -> Unit = {},
    /** 标题落位回调：ordinal 与 [markdownHeadings] 的顺序一致，offset 是相对正文顶部的像素。 */
    onHeadingPositioned: ((ordinal: Int, offsetY: Float) -> Unit)? = null,
) {
    val blocks = remember(source) { parseBlocks(source) }
    val linkColor = palette.link
    val codeColor = palette.link
    val bodyColor = palette.body
    var previewImage by remember { mutableStateOf<String?>(null) }
    var headingOrdinal by remember(source) { mutableStateOf(0) }

    previewImage?.let { url ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { previewImage = null }) {
            Box(
                Modifier.fillMaxWidth().heightIn(max = 640.dp).clip(RoundedCornerShape(12.dp))
                    .background(Color.Black).clickable { previewImage = null },
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = url,
                    contentDescription = "图片预览",
                    imageLoader = LocalHeikaImageLoader.current,
                    modifier = Modifier.fillMaxWidth(),
                    contentScale = ContentScale.Fit,
                )
            }
        }
    }

    Column(modifier = modifier) {
        blocks.forEachIndexed { index, block ->
            val heading = block as? MdBlock.Heading
            val gap = when {
                heading != null -> HeikaReadingSpacing.headingTop
                block is MdBlock.Item -> HeikaReadingSpacing.listItem
                block is MdBlock.Paragraph -> HeikaReadingSpacing.paragraph
                block is MdBlock.Rule -> 18.dp
                else -> 14.dp
            }
            if (index > 0) Spacer(Modifier.height(gap))
            when (block) {
                is MdBlock.Heading -> {
                    val ordinal = headingOrdinal++
                    val color = when (block.level) {
                        1, 2 -> palette.heading1
                        3 -> palette.heading2
                        else -> palette.heading3
                    }
                    Text(
                        text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                        color = color,
                        fontSize = baseSize * HeikaReadingType.heading(block.level),
                        fontWeight = if (block.level <= 2) FontWeight.SemiBold else FontWeight.Medium,
                        lineHeight = (baseSize.value * HeikaReadingType.headingLineHeight(block.level)).sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(
                                if (onHeadingPositioned != null) Modifier.onGloballyPositioned { coords ->
                                    onHeadingPositioned(ordinal, coords.positionInParent().y)
                                } else Modifier,
                            ),
                    )
                }
                is MdBlock.Paragraph -> Text(
                    text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                    color = bodyColor,
                    fontSize = baseSize,
                    lineHeight = (baseSize.value * HeikaReadingType.bodyLineHeight).sp,
                )
                is MdBlock.Quote -> Row(
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(palette.quoteBackground)
                        .padding(end = 12.dp, top = 10.dp, bottom = 10.dp),
                ) {
                    Box(
                        Modifier
                            .width(3.dp)
                            .height((18 + block.lines.size * 20).dp)
                            .background(palette.accent.copy(alpha = 0.72f), RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(11.dp))
                    Text(
                        text = buildInline(block.lines.joinToString("\n"), linkColor, codeColor, onLinkClick),
                        color = palette.body,
                        fontSize = baseSize * .96f,
                        lineHeight = (baseSize.value * 1.72f).sp,
                        modifier = Modifier.weight(1f),
                    )
                }
                is MdBlock.Item -> Row(Modifier.fillMaxWidth().padding(start = (block.depth * 16).dp)) {
                    Text(
                        text = if (block.ordered) "${block.index}." else if (block.depth == 0) "·" else "◦",
                        color = palette.muted,
                        fontSize = baseSize,
                        lineHeight = (baseSize.value * HeikaReadingType.bodyLineHeight).sp,
                        modifier = Modifier.width(if (block.ordered) 26.dp else 16.dp),
                    )
                    Text(
                        text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                        color = bodyColor,
                        fontSize = baseSize,
                        lineHeight = (baseSize.value * HeikaReadingType.bodyLineHeight).sp,
                        modifier = Modifier.weight(1f),
                    )
                }
                is MdBlock.Code -> if (block.language.equals("mermaid", true)) {
                    MermaidBlock(block.code, baseSize)
                } else {
                    MdCodeBlock(block, baseSize, palette)
                }
                is MdBlock.Image -> MdImage(block, palette, onClick = { previewImage = it })
                is MdBlock.Table -> MdTable(block, baseSize, palette, onLinkClick)
                is MdBlock.Task -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Text(
                        text = if (block.checked) "☑" else "☐",
                        color = if (block.checked) palette.accent else palette.muted,
                        fontSize = baseSize,
                        modifier = Modifier.width(24.dp),
                    )
                    Text(
                        text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                        color = if (block.checked) palette.secondary else bodyColor,
                        fontSize = baseSize,
                        lineHeight = (baseSize.value * HeikaReadingType.bodyLineHeight).sp,
                        modifier = Modifier.weight(1f),
                    )
                }
                MdBlock.Rule -> HorizontalDivider(color = palette.line)
            }
        }
    }
}

/** 正文插图：按宽度铺满、限制最大高度，点击可全屏查看。 */
@Composable
private fun MdImage(block: MdBlock.Image, palette: HeikaReadingPalette, onClick: (String) -> Unit) {
    val url = if (block.url.startsWith("/")) BuildConfig.API_BASE_URL + block.url else block.url
    // 正文图片过去是解码完直接"啪"地出现；这里统一 180ms 叠化，
    // 内存命中时 coil 不会重复播，只在首次落位时淡入一次。
    val request = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
        .data(url)
        .crossfade(180)
        .build()
    Column(Modifier.fillMaxWidth()) {
        AsyncImage(
            model = request,
            contentDescription = block.alt.ifBlank { "正文图片" },
            imageLoader = LocalHeikaImageLoader.current,
            modifier = Modifier.fillMaxWidth().heightIn(min = 80.dp, max = 460.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(palette.field)
                .clickable { onClick(url) },
            contentScale = ContentScale.Fit,
        )
        if (block.alt.isNotBlank()) {
            Text(
                block.alt,
                Modifier.padding(top = 5.dp),
                color = palette.muted,
                fontSize = 12.sp,
                lineHeight = 17.sp,
            )
        }
    }
}

/** 代码块：语言标识 + 复制 + 横向滚动，长行不再被硬换行。 */
@Composable
private fun MdCodeBlock(
    block: MdBlock.Code,
    baseSize: TextUnit,
    palette: HeikaReadingPalette,
) {
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape)
            .background(palette.codeBackground)
            .border(1.dp, palette.codeBorder, shape),
    ) {
        Row(
            Modifier.fillMaxWidth().background(palette.tableHeader).padding(start = 12.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                block.language.ifBlank { "text" }.lowercase(),
                modifier = Modifier.weight(1f).padding(vertical = 7.dp),
                color = palette.muted,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
            )
            Text(
                "复制",
                Modifier.clip(RoundedCornerShape(999.dp)).clickable {
                    clipboard.setText(AnnotatedString(block.code))
                    HeikaNoticeBus.show("代码已复制", HeikaNoticeKind.SUCCESS)
                }.padding(horizontal = 9.dp, vertical = 5.dp),
                color = palette.accent,
                fontSize = 11.sp,
            )
        }
        Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 11.dp)) {
            Text(
                text = block.code,
                color = palette.body,
                fontSize = baseSize * 0.86f,
                lineHeight = (baseSize.value * 1.55f).sp,
                fontFamily = FontFamily.Monospace,
                softWrap = false,
            )
        }
    }
}

/** 表格：首行表头，行列自适应宽度，单元格内仍可识别链接与话题。 */
@Composable
private fun MdTable(
    block: MdBlock.Table,
    baseSize: TextUnit,
    palette: HeikaReadingPalette,
    onLinkClick: (String) -> Unit,
) {
    val border = palette.line
    val headerBackground = palette.tableHeader
    val linkColor = palette.link
    val codeColor = palette.link
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .border(1.dp, border, RoundedCornerShape(10.dp)),
    ) {
        Row(Modifier.fillMaxWidth().background(headerBackground)) {
            block.header.forEachIndexed { index, cell ->
                Text(
                    text = buildInline(cell, linkColor, codeColor, onLinkClick),
                    modifier = Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 9.dp),
                    color = palette.heading2,
                    fontSize = baseSize * 0.9f,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = (baseSize.value * 1.45f).sp,
                )
                if (index < block.header.lastIndex) Box(Modifier.width(1.dp).height(IntrinsicSize.Min).background(border))
            }
        }
        block.rows.forEachIndexed { rowIndex, row ->
            HorizontalDivider(color = border)
            Row(Modifier.fillMaxWidth()) {
                block.header.indices.forEach { column ->
                    Text(
                        text = buildInline(row.getOrElse(column) { "" }, linkColor, codeColor, onLinkClick),
                        modifier = Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 9.dp),
                        color = palette.body,
                        fontSize = baseSize * 0.88f,
                        lineHeight = (baseSize.value * 1.5f).sp,
                    )
                    if (column < block.header.lastIndex) Box(Modifier.width(1.dp).height(IntrinsicSize.Min).background(border))
                }
            }
            if (rowIndex == block.rows.lastIndex) Unit
        }
    }
}

/**
 * 流程图：用 WebView 渲染 mermaid，脚本按需从 CDN 加载。
 * 图形本身是 SVG，天然支持缩放与深色主题；渲染失败时退回显示源码。
 */
@Composable
private fun MermaidBlock(code: String, baseSize: TextUnit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val dark = isSystemInDarkTheme()
    val html = remember(code, dark) {
        val escaped = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        """
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          html,body{margin:0;padding:0;background:transparent;}
          #out{display:flex;justify-content:center;padding:6px 2px;}
          #out svg{max-width:100%;height:auto;}
          #err{color:${if (dark) "#d9c9a8" else "#6b5b45"};font:12px -apple-system,sans-serif;padding:10px;}
        </style></head>
        <body><div id="out"></div><div id="err"></div>
        <pre id="src" style="display:none">$escaped</pre>
        <script type="module">
          const src = document.getElementById('src').textContent;
          try {
            const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
            mermaid.initialize({ startOnLoad:false, securityLevel:'strict', theme:'${if (dark) "dark" else "neutral"}' });
            const { svg } = await mermaid.render('heika-mermaid', src);
            document.getElementById('out').innerHTML = svg;
            window.HeikaHeight && window.HeikaHeight(document.body.scrollHeight);
          } catch (e) {
            document.getElementById('err').textContent = '流程图渲染失败，已按源码显示';
          }
        </script></body></html>
        """.trimIndent()
    }
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .3f), RoundedCornerShape(10.dp)),
    ) {
        androidx.compose.ui.viewinterop.AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                    settings.javaScriptEnabled = true
                    settings.loadWithOverviewMode = true
                    settings.useWideViewPort = true
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
                }
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 420.dp).padding(6.dp),
            update = { view -> if (view.tag != html) { view.tag = html; view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null) } },
        )
    }
}
