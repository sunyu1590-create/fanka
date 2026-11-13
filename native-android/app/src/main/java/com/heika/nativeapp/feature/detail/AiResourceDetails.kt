package com.heika.nativeapp.feature.detail

import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject

private val aiFieldLabels = mapOf(
    "functionality" to "功能说明", "platforms" to "兼容平台", "run_mode" to "运行方式", "use_cases" to "适用场景",
    "tutorial" to "使用教程", "environments" to "兼容环境", "installation" to "安装步骤", "configuration" to "配置内容",
    "example" to "使用示例", "model" to "适用模型", "scenario" to "应用场景", "prompt" to "完整提示词",
    "variables" to "可替换变量", "pricing" to "价格信息", "difficulty" to "难度", "requirements" to "准备条件",
    "steps" to "实战步骤", "source_url" to "资源来源", "changelog" to "更新记录", "version" to "版本",
)
private val copyableAiFields = setOf("prompt", "installation", "configuration", "example", "steps", "tutorial")
private val feedbackKinds = listOf("broken_link" to "链接失效", "outdated" to "内容过时", "unsafe" to "安全风险", "other" to "其他问题")

@Composable
fun AiResourceDetails(
    contentType: String,
    resourceData: JSONObject,
    versions: List<JSONObject>,
    versionsLoading: Boolean,
    versionsError: String?,
    feedbackSending: Boolean,
    feedbackSubmitted: Boolean,
    onRetryVersions: () -> Unit,
    onSubmitFeedback: (String, String) -> Unit,
) {
    val context = LocalContext.current
    var versionsExpanded by remember { mutableStateOf(false) }
    var feedbackOpen by remember { mutableStateOf(false) }
    var selectedKind by remember { mutableStateOf("broken_link") }
    var details by remember { mutableStateOf("") }
    var expandedVersion by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(feedbackSubmitted) { if (feedbackSubmitted) { feedbackOpen = false; details = "" } }
    val entries = remember(resourceData.toString()) {
        resourceData.keys().asSequence().mapNotNull { key ->
            val value = resourceData.opt(key)
            val text = when (value) {
                is JSONArray -> buildList { for (index in 0 until value.length()) add(value.optString(index)) }.filter(String::isNotBlank).joinToString("\n")
                JSONObject.NULL, null -> ""
                else -> value.toString().trim()
            }
            text.takeIf(String::isNotBlank)?.let { key to it }
        }.toList()
    }
    val typeLabel = when (contentType) {
        "agent" -> "Agent"; "skill" -> "Skill"; "prompt" -> "Prompt"; "ai_tool" -> "AI 工具"; "tutorial" -> "实战教程"; else -> "AI 知识"
    }

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("$typeLabel · 结构化资源", color = MaterialTheme.colorScheme.primary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        entries.forEach { (key, value) ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).padding(vertical = 7.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(aiFieldLabels[key] ?: key.replace('_', ' '), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                val url = if (key.endsWith("_url")) safeExternalUrl(value) else null
                if (url != null) {
                    TextButton(onClick = {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                            .onFailure { HeikaNoticeBus.show("无法打开此资源链接", HeikaNoticeKind.ERROR) }
                    }) { Text("打开资源链接 ↗", color = MaterialTheme.colorScheme.primary) }
                } else {
                    Text(value, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, lineHeight = 21.sp)
                    if (key in copyableAiFields) {
                        TextButton(onClick = {
                            val clipboard = context.getSystemService(ClipboardManager::class.java)
                            clipboard?.setPrimaryClip(ClipData.newPlainText(aiFieldLabels[key] ?: key, value))
                        HeikaNoticeBus.show(if (clipboard != null) "已复制到剪贴板" else "无法访问系统剪贴板", if (clipboard != null) HeikaNoticeKind.SUCCESS else HeikaNoticeKind.ERROR)
                        }) { Text("复制") }
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("版本记录${versions.takeIf { it.isNotEmpty() }?.let { " · ${it.size}" }.orEmpty()}", Modifier.weight(1f).clickable { versionsExpanded = !versionsExpanded }, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            if (versionsLoading) Text("加载中…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            else Text(if (versionsExpanded) "收起" else "查看", Modifier.clickable { versionsExpanded = !versionsExpanded }, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
        }
        if (versionsError != null) {
            Row {
                Text(versionsError, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                Text("重试", Modifier.clickable(onClick = onRetryVersions), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
            }
        }
        if (versionsExpanded && versions.isEmpty() && !versionsLoading && versionsError == null) {
            Text("暂无已发布的版本记录", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        }
        if (versionsExpanded) versions.forEach { version ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(version.optString("version_label").ifBlank { "未标注版本" }, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text(version.optString("changelog").ifBlank { "资源更新" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
                Text(version.optString("created_at").take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                val id = version.optString("id")
                val payload = version.optJSONObject("payload")
                if (payload != null) {
                    Text(if (expandedVersion == id) "收起版本内容" else "查看版本内容", Modifier.clickable { expandedVersion = if (expandedVersion == id) null else id }, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    if (expandedVersion == id) {
                        payload.optString("title").takeIf(String::isNotBlank)?.let { Text(it, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium) }
                        payload.optString("body").takeIf(String::isNotBlank)?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 18.sp) }
                        payload.optJSONObject("resourceData")?.let { data ->
                            data.keys().asSequence().forEach { key ->
                                Text("${aiFieldLabels[key] ?: key}: ${data.opt(key)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                        }
                    }
                }
            }
        }
        if (!feedbackSubmitted) {
            TextButton(onClick = { feedbackOpen = true }) { Text("报告资源失效或纠错") }
        } else Text("反馈已提交", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
    }

    if (feedbackOpen) HeikaAlertDialog(
        onDismissRequest = { if (!feedbackSending) feedbackOpen = false },
        title = { Text("AI 资源反馈") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                feedbackKinds.forEach { (kind, label) ->
                    Text("${if (selectedKind == kind) "●" else "○"}  $label", Modifier.fillMaxWidth().clickable { selectedKind = kind }.padding(vertical = 5.dp), color = if (selectedKind == kind) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                }
                OutlinedTextField(value = details, onValueChange = { details = it.take(1000) }, label = { Text("补充说明") }, supportingText = { Text("至少 3 个字") })
            }
        },
        confirmButton = { Button(enabled = !feedbackSending && details.trim().length >= 3, onClick = { onSubmitFeedback(selectedKind, details) }) { Text(if (feedbackSending) "提交中…" else "提交反馈") } },
        dismissButton = { TextButton(onClick = { feedbackOpen = false }, enabled = !feedbackSending) { Text("取消") } },
    )
}

private fun safeExternalUrl(raw: String): String? = runCatching {
    val uri = Uri.parse(raw.trim())
    val host = uri.host?.lowercase()?.removeSuffix(".") ?: return null
    if (uri.scheme != "https" || uri.userInfo != null || host.isBlank() || host == "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.matches(Regex("(?:\\d{1,3}\\.){3}\\d{1,3}"))) return null
    if (uri.port !in setOf(-1, 443)) return null
    uri.toString()
}.getOrNull()
