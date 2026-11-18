package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import androidx.compose.ui.unit.sp

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
    data class Item(val ordered: Boolean, val index: Int, val text: String) : MdBlock
    data class Code(val language: String, val code: String) : MdBlock
    data object Rule : MdBlock
}

private val blockStart = Regex("^(#{1,6}\\s|>\\s?|[-*+]\\s|\\d+[.)]\\s|```|---+\\s*$)")

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
            blocks.add(MdBlock.Heading(heading.groupValues[1].length, heading.groupValues[2]))
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

        val listItem = Regex("^\\s*([-*+]|\\d+[.)])\\s+(.+)$").find(line)
        if (listItem != null) {
            val ordered = listItem.groupValues[1].first().isDigit()
            while (i < lines.size) {
                val item = Regex("^\\s*([-*+]|\\d+[.)])\\s+(.+)$").find(lines[i]) ?: break
                if (item.groupValues[1].first().isDigit() != ordered) break
                blocks.add(MdBlock.Item(ordered, item.groupValues[1].trimEnd('.', ')').toIntOrNull() ?: 1, item.groupValues[2]))
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

private val inlinePattern = Regex("(`[^`]+`|\\*\\*[^*]+\\*\\*|~~[^~]+~~|\\*[^*]+\\*|\\[[^\\]]+\\]\\([^)]+\\))")

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

@Composable
fun HeikaMarkdown(
    source: String,
    modifier: Modifier = Modifier,
    baseSize: TextUnit = 15.sp,
    textColor: Color = MaterialTheme.colorScheme.onSurface,
    onLinkClick: (String) -> Unit = {},
) {
    val blocks = remember(source) { parseBlocks(source) }
    val linkColor = MaterialTheme.colorScheme.primary
    val codeColor = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)

    Column(modifier = modifier) {
        blocks.forEachIndexed { index, block ->
            if (index > 0) Spacer(Modifier.height(if (block is MdBlock.Item) 4.dp else 10.dp))
            when (block) {
                is MdBlock.Heading -> Text(
                    text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                    color = textColor,
                    fontSize = when (block.level) {
                        1 -> baseSize * 1.55f
                        2 -> baseSize * 1.32f
                        3 -> baseSize * 1.16f
                        else -> baseSize * 1.06f
                    },
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = (baseSize.value * 1.5f).sp,
                )
                is MdBlock.Paragraph -> Text(
                    text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                    color = textColor,
                    fontSize = baseSize,
                    lineHeight = (baseSize.value * 1.72f).sp,
                )
                is MdBlock.Quote -> Row(Modifier.fillMaxWidth()) {
                    Box(
                        Modifier
                            .width(3.dp)
                            .height((18 + block.lines.size * 18).dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.45f), RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(11.dp))
                    Text(
                        text = buildInline(block.lines.joinToString("\n"), linkColor, codeColor, onLinkClick),
                        color = muted,
                        fontSize = baseSize,
                        lineHeight = (baseSize.value * 1.7f).sp,
                        modifier = Modifier.weight(1f),
                    )
                }
                is MdBlock.Item -> Row(Modifier.fillMaxWidth()) {
                    Text(
                        text = if (block.ordered) "${block.index}." else "·",
                        color = muted,
                        fontSize = baseSize,
                        modifier = Modifier.width(if (block.ordered) 22.dp else 14.dp),
                    )
                    Text(
                        text = buildInline(block.text, linkColor, codeColor, onLinkClick),
                        color = textColor,
                        fontSize = baseSize,
                        lineHeight = (baseSize.value * 1.68f).sp,
                        modifier = Modifier.weight(1f),
                    )
                }
                is MdBlock.Code -> Box(
                    Modifier
                        .fillMaxWidth()
                        .background(codeBackground, RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = block.code,
                        color = textColor,
                        fontSize = baseSize * 0.86f,
                        lineHeight = (baseSize.value * 1.5f).sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
                MdBlock.Rule -> HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
            }
        }
    }
}
