package com.heika.nativeapp.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.heika.nativeapp.R
import com.heika.nativeapp.data.HeikaPost
import dev.chrisbanes.haze.HazeState

/**
 * 原生分享面板。
 *
 * 2026-11-25 实心化：此前底板是 Solid Glass（半透明 + 模糊），正文和封面图会直接
 * 透过面板，标题根本读不清。现在面板本身完全不透明，模糊只作为面板关闭后的
 * 背景过渡保留（由调用方的遮罩承担），面板内部不再有透光。
 *
 * 结构固定为：拖动指示器 → 标题与关闭 → 作品预览 → 分享渠道 → 系统分享/复制。
 */
@Composable
fun NativeShareSheet(
    post: HeikaPost,
    hazeState: HazeState?,
    onDismiss: () -> Unit,
    onRecord: (String) -> Unit,
) {
    val context = LocalContext.current
    val palette = heikaReadingPalette()
    val url = if (post.channel == "ai") {
        "https://moonclean.shop/?aiPost=${post.id}&cloudId=${Uri.encode(post.cloudId)}"
    } else {
        "https://moonclean.shop/?post=${post.id}"
    }
    val cleanTitle = post.title.trim().trimEnd('。', '！', '？', '!', '?', '，', ',')
    val source = (post.aiSummary ?: post.body).replace(Regex("[#>*_`\\[\\]()]"), " ").replace(Regex("\\s+"), " ").trim()
    val firstSentence = source.split('。', '！', '？', '；', '\n').firstOrNull { it.isNotBlank() }?.trim().orEmpty()
    val blurb = when {
        firstSentence.isEmpty() -> "${post.title.take(18)}，值得花两分钟读完"
        firstSentence.length <= 18 -> firstSentence.trimEnd('｜', '|', '，', ',', '、', ' ')
        else -> firstSentence.take(18).trimEnd('｜', '|', '，', ',', '、', ' ')
    }
    val text = "《$cleanTitle》\n$blurb\n这是黑卡的链接，打开后可以进入黑卡探索更多内容：\n$url"

    fun copyText(platform: String, message: String) {
        val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        manager.setPrimaryClip(ClipData.newPlainText("HEIKA 分享文案", text))
        onRecord(platform)
        HeikaNoticeBus.show(message)
    }

    fun sendTo(platform: String, packageName: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "《$cleanTitle》")
            putExtra(Intent.EXTRA_TEXT, text)
            setPackage(packageName)
        }
        try {
            context.startActivity(intent)
            onRecord(platform)
            onDismiss()
        } catch (_: ActivityNotFoundException) {
            copyText(platform, "未安装对应应用，分享文案已复制")
        } catch (_: SecurityException) {
            copyText(platform, "系统限制了直接分享，文案已复制")
        }
    }

    fun systemShare() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "《$cleanTitle》")
            putExtra(Intent.EXTRA_TEXT, text)
        }
        runCatching { context.startActivity(Intent.createChooser(intent, "分享到")) }
            .onSuccess { onRecord("system"); onDismiss() }
            .onFailure { copyText("system", "系统分享不可用，文案已复制") }
    }

    val items = listOf(
        ShareItem("wechat", "微信", Color(0xFF07C160), R.drawable.ic_brand_wechat) { sendTo("wechat", "com.tencent.mm") },
        ShareItem("moments", "朋友圈", Color(0xFF12B45A), R.drawable.ic_brand_moments) { copyText("moments", "文案已复制，去朋友圈粘贴发布") },
        ShareItem("telegram", "Telegram", Color(0xFF229ED9), R.drawable.ic_brand_telegram) { sendTo("telegram", "org.telegram.messenger") },
        ShareItem("x", "X", Color(0xFF14171A), R.drawable.ic_brand_x) { sendTo("x", "com.twitter.android") },
        ShareItem("qq", "QQ", Color(0xFF12B7F5), R.drawable.ic_brand_qq) { sendTo("qq", "com.tencent.mobileqq") },
    )

    val scrim = remember { MutableInteractionSource() }
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = .42f))
            .clickable(interactionSource = scrim, indication = null, onClick = onDismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 10.dp, vertical = 10.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(palette.panel)
                .border(.8.dp, palette.line, RoundedCornerShape(22.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.width(38.dp).height(4.dp).clip(RoundedCornerShape(999.dp)).background(palette.line))
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("分享作品", color = palette.title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("选择一个去处，文案与链接会一起带过去。", color = palette.muted, fontSize = 11.sp)
                }
                Box(
                    Modifier.size(32.dp).clip(RoundedCornerShape(50))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(HeikaIcons.Close, contentDescription = "关闭分享面板", tint = palette.muted, modifier = Modifier.size(17.dp))
                }
            }
            // 作品预览：有封面才显示缩略图，没有就只用文字块，不留空白框。
            Row(
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.field)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val thumb = post.thumbnail ?: post.images.firstOrNull()
                if (!thumb.isNullOrBlank()) {
                    AsyncImage(
                        model = thumb,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(46.dp, 58.dp).clip(RoundedCornerShape(8.dp)),
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(post.title, color = palette.title, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 18.sp)
                    Text(post.author, color = palette.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("黑卡 HEIKA · 内容社区", color = palette.accent, fontSize = 10.sp)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                items.forEach { item ->
                    Column(
                        Modifier
                            .weight(1f)
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = item.onClick),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            Modifier.size(46.dp).background(item.color, RoundedCornerShape(14.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                painter = painterResource(item.icon),
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                                colorFilter = ColorFilter.tint(Color.White),
                            )
                        }
                        Text(item.label, color = palette.secondary, fontSize = 10.sp, maxLines = 1)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ShareSecondaryButton("系统分享", palette, Modifier.weight(1f)) { systemShare() }
                ShareSecondaryButton("复制文案与链接", palette, Modifier.weight(1f)) { copyText("copy", "分享文案已复制") }
            }
        }
    }
}

private data class ShareItem(
    val id: String,
    val label: String,
    val color: Color,
    val icon: Int,
    val onClick: () -> Unit,
)

@Composable
private fun ShareSecondaryButton(
    label: String,
    palette: HeikaReadingPalette,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .background(palette.field, RoundedCornerShape(12.dp))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = palette.title, fontSize = 12.sp)
    }
}
