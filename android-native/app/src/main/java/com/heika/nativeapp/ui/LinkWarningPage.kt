package com.heika.nativeapp.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 站外链接提示页。
 *
 * 与网页端 /link-warning 一致：整页说明风险，而不是弹一个对话框。
 * 整页能放下的信息更多，也不会出现"点错就跳走"的误触。
 * 内容统一收在一张圆角卡片里，和站内的设置分组、弹窗是同一套视觉语言。
 */
@Composable
fun LinkWarningPage(
    url: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val target = remember(url) { runCatching { Uri.parse(url.trim()) }.getOrNull() }
    val host = target?.host.orEmpty()
    val path = remember(target) {
        val raw = target?.encodedPath.orEmpty().ifBlank { "/" }
        runCatching { Uri.decode(raw) }.getOrDefault(raw).take(80)
    }
    val valid = target != null && (target.scheme == "http" || target.scheme == "https") && host.isNotBlank()
    val shape = RoundedCornerShape(HeikaRadii.dialog)

    BackHandler(enabled = true) { onDismiss() }

    Column(
        modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
    ) {
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onDismiss, modifier = Modifier.size(44.dp)) {
                Icon(HeikaIcons.Back, "返回", tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(20.dp))
            }
            Text("外部链接提示", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                Modifier.fillMaxWidth()
                    .clip(shape)
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .42f), shape)
                    .padding(horizontal = 18.dp, vertical = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(52.dp).clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(HeikaIcons.Shield, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(25.dp))
                }
                Spacer(Modifier.height(14.dp))
                Text(
                    if (valid) "你正在离开黑卡" else "这个链接打不开",
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    if (valid) "接下来要打开的是站外地址，它不属于黑卡，也不受黑卡管理。"
                    else "这个地址无效，或者不是可以打开的站外链接。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.5.sp,
                    lineHeight = 20.sp,
                )
                if (valid) {
                    Spacer(Modifier.height(16.dp))
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface))
                            .background(MaterialTheme.colorScheme.background.copy(alpha = .72f))
                            .padding(horizontal = 13.dp, vertical = 11.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(host, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(path, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(16.dp))
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        listOf(
                            "站外页面可能要求你登录、付款或下载文件，请先确认来源可信。",
                            "不要在任何站外页面输入黑卡账号、密码或恢复码。",
                            "下载可执行文件前请自行确认安全性，尤其是安装包与脚本。",
                        ).forEach { line ->
                            Row(Modifier.fillMaxWidth()) {
                                Text("·", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp, modifier = Modifier.width(12.dp))
                                Text(line, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.5.sp, lineHeight = 19.sp, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "继续访问即表示你理解并自行承担由此产生的风险，黑卡不对站外内容负责。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .82f),
                        fontSize = 10.5.sp,
                        lineHeight = 17.sp,
                    )
                }
                Spacer(Modifier.height(18.dp))
                if (valid) {
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(HeikaRadii.control))
                            .background(MaterialTheme.colorScheme.primary).clickable {
                                onDismiss()
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, target)) }
                                    .onFailure { HeikaNoticeBus.show("没有能打开该链接的应用", HeikaNoticeKind.ERROR) }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("继续访问", color = MaterialTheme.colorScheme.onPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(9.dp))
                }
                Box(
                    Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(HeikaRadii.control))
                        .background(MaterialTheme.colorScheme.background.copy(alpha = .72f)).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("返回黑卡", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}
