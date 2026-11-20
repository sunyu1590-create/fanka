package com.heika.nativeapp.feature.publish

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import com.heika.nativeapp.ui.HeikaAlertDialog

import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.VideoView
import android.widget.MediaController
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaMarkdown
import com.heika.nativeapp.ui.FilterChip
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.heika.nativeapp.ui.HeikaPulseDot
import com.heika.nativeapp.ui.HeikaPulsePage

@Composable
fun PublishScreen(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onPublished: (HeikaPost) -> Unit,
    draftId: Int? = null,
    channel: String = "community",
    viewModel: PublishViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showVideoBeta by remember { mutableStateOf(false) }
    var selectedVideo by remember { mutableStateOf<Uri?>(null) }
    var bodyPreview by remember { mutableStateOf(false) }
    var topicDraft by remember { mutableStateOf("") }
    var aiAssistantOpen by remember { mutableStateOf(false) }
    var aiMode by remember { mutableStateOf("polish") }
    var aiPrompt by remember { mutableStateOf("") }
    var aiOutput by remember { mutableStateOf("") }
    var aiBusy by remember { mutableStateOf(false) }
    var aiMessages by remember { mutableStateOf(emptyList<Pair<String, String>>()) }
    var aiPreApply by remember { mutableStateOf<Pair<String, String>?>(null) }
    val publishListState = rememberLazyListState()
    LaunchedEffect(draftId, channel) { viewModel.configureChannel(channel); viewModel.resumeDraft(draftId); viewModel.loadTopicSuggestions() }
    LaunchedEffect(state.notice) {
        state.notice?.let { message ->
            HeikaNoticeBus.show(message, if (message.contains("失败")) HeikaNoticeKind.ERROR else HeikaNoticeKind.SUCCESS)
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let { message -> HeikaNoticeBus.show(message, HeikaNoticeKind.ERROR) }
    }
    BackHandler(enabled = showVideoBeta || (!state.loading && !state.publishing)) {
        if (showVideoBeta) showVideoBeta = false else viewModel.saveDraft(onBack)
    }
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        selectedVideo = uri
        if (uri != null) HeikaNoticeBus.show("已选择视频", HeikaNoticeKind.SUCCESS)
    }
    val attachmentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult
        scope.launch(HeikaCoroutineGuard) {
            for (uri in uris.take(3)) {
                runCatching { readAttachment(context, uri) }
                    .onSuccess { (name, mime, bytes) -> viewModel.addAttachment(name, mime, bytes) }
                    .onFailure { HeikaNoticeBus.show(it.message ?: "无法读取所选文件", HeikaNoticeKind.ERROR) }
            }
        }
    }
    LaunchedEffect(state.channel) { viewModel.refreshAttachmentQuota() }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia((9 - state.images.size).coerceAtLeast(1))) { uris ->
        scope.launch(HeikaCoroutineGuard) {
            for (uri in uris) {
                runCatching { prepareImage(context, uri) }
                    .onSuccess { (name, mime, bytes) -> viewModel.addImage(name, mime, bytes) }
                    .onFailure { viewModel.reportError(it.message ?: "无法读取所选图片") }
            }
            if (uris.isNotEmpty()) HeikaNoticeBus.show("已选择 ${uris.size} 张图片", HeikaNoticeKind.SUCCESS)
        }
    }
    LaunchedEffect(state.publishedPost) {
        state.publishedPost?.let { data ->
            val post = runCatching { HeikaPost.from(data) }.getOrNull()
            if (post != null) onPublished(post)
        }
    }
    if (showVideoBeta) {
        VideoBetaScreen(
            selectedVideo = selectedVideo,
            onBack = { showVideoBeta = false },
            onChooseVideo = { videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
        )
    } else Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(if (state.revisionMode) "修改作品" else "发布内容", onBack = { viewModel.saveDraft(onBack) }, trailing = {
            if (state.revisionMode) {
                Text(if (state.saving) "保存中" else "保存修改", Modifier.clickable { viewModel.saveDraft() }.padding(8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            } else {
                androidx.compose.material3.TextButton(
                    onClick = viewModel::deleteLocalDraft,
                    enabled = !state.saving && !state.publishing,
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                ) {
                    Icon(HeikaIcons.Delete, contentDescription = null, modifier = Modifier.size(15.dp))
                    Text("删除草稿", fontSize = 10.sp)
                }
            }
        })
        if (!state.loading && state.error != "登录后可以发布内容") {
            // 标题或正文停下 1.2 秒后自动判断去向；判断只改分类，不动内容。
            LaunchedEffect(state.title, state.body) {
                if (state.title.isBlank() && state.body.isBlank()) return@LaunchedEffect
                delay(1200)
                if (!state.revisionMode) viewModel.detectRoute()
            }
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp).clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surface).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("发布去向", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Text(
                        if (state.revisionMode) "沿用原分类" else if (state.routeChecking) "AI 正在判断…" else "AI 已判断",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 10.sp,
                    )
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(
                        if (state.channel == "ai") HeikaIcons.Robot else HeikaIcons.Discovery,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Column(Modifier.weight(1f)) {
                        Text(routeLabel(state), color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            state.routeReason.ifBlank { "写完标题和正文会自动判断；AI 内容类型也由 AI 定。" },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 10.sp,
                            lineHeight = 15.sp,
                        )
                    }
                    if (!state.revisionMode) {
                        TextButton(enabled = !state.routeChecking, onClick = { viewModel.detectRoute(true) }) {
                            Text(if (state.routeChecking) "判断中" else "重新判断", fontSize = 10.sp)
                        }
                    }
                }
            }
        }
        if (state.error == "登录后可以发布内容") {
            Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("登录后可以发布内容", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onLogin) { Text("登录") }
            }
        } else if (state.loading) {
            HeikaPulsePage(cards = 3, cardHeight = 92.dp)
        } else {
            androidx.compose.foundation.lazy.LazyColumn(
                state = publishListState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 19.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    OutlinedTextField(value = state.title, onValueChange = { viewModel.edit(title = it) }, modifier = Modifier.fillMaxWidth(), label = { Text("标题") }, placeholder = { Text("给这次发现一个标题") }, singleLine = true, supportingText = { Text("${state.title.length}/80") })
                }
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("正文", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.weight(1f))
                            FilterChip("写作", !bodyPreview, { bodyPreview = false })
                            Spacer(Modifier.size(6.dp))
                            FilterChip("预览", bodyPreview, { bodyPreview = true })
                        }
                        if (bodyPreview) {
                            if (state.body.isBlank()) {
                                Text("还没有正文，切回「写作」开始输入。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp))
                            } else {
                                HeikaMarkdown(
                                    source = state.body,
                                    baseSize = 14.sp,
                                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                                )
                            }
                        } else {
                            // 格式工具常驻在正文上方：手机上不必先把光标停在正文才出现。
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf(
                                    "粗体" to "**", "小标题" to "\n## ", "引用" to "\n> ",
                                    "列表" to "\n- ", "链接" to "[链接](https://)", "代码" to "`", "分割线" to "\n\n---\n\n",
                                ).forEach { (label, token) ->
                                    Text(
                                        label,
                                        Modifier
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(MaterialTheme.colorScheme.background)
                                            .clickable {
                                                val separator = if (state.body.isEmpty() || state.body.endsWith("\n")) "" else "\n"
                                                viewModel.edit(body = (state.body + separator + token).take(5000))
                                            }
                                            .padding(horizontal = 11.dp, vertical = 6.dp),
                                        color = MaterialTheme.colorScheme.onSurface,
                                        fontSize = 11.sp,
                                    )
                                }
                            }
                            BasicTextField(
                                value = state.body,
                                onValueChange = { viewModel.edit(body = it) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 176.dp, max = 300.dp).padding(top = 12.dp),
                                textStyle = androidx.compose.ui.text.TextStyle(color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 23.sp),
                                decorationBox = { inner ->
                                    if (state.body.isEmpty()) Text("支持 Markdown：**加粗**、## 小标题、> 引用、- 列表、[链接](https://)", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .72f), fontSize = 13.sp, lineHeight = 20.sp)
                                    inner()
                                },
                            )
                        }
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("站外链接会先跳到风险提示页", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .8f), fontSize = 9.sp, modifier = Modifier.weight(1f))
                            Text("${state.body.length}/5000", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                        }
                    }
                }
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("附件", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text("图片、PDF、文档、Markdown、JSON、YAML、压缩包 · 最多 3 个", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
                            }
                            Text(
                                state.attachmentQuota?.let { "今日剩余 $it/20" } ?: "名额查询中",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 10.sp,
                            )
                        }
                        state.attachments.forEach { item ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.background).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(item.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                    Text(friendlySize(item.size), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp))
                                }
                                val previewable = item.mime.startsWith("image/") || item.mime.startsWith("text/") || item.mime == "application/pdf" || item.mime == "application/json"
                                if (previewable) TextButton(onClick = {
                                    scope.launch(HeikaCoroutineGuard) {
                                        runCatching {
                                            val url = viewModel.attachmentPreviewUrl(item)
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                        }.onFailure { HeikaNoticeBus.show(it.message ?: "当前设备无法预览此附件", HeikaNoticeKind.ERROR) }
                                    }
                                }) { Text("预览", color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp) }
                                TextButton(onClick = { viewModel.removeAttachment(item.path) }) { Text("移除", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                            }
                        }
                        if (state.attachments.size < 3) {
                            OutlinedButton(
                                onClick = { attachmentPicker.launch(arrayOf("*/*")) },
                                enabled = !state.attachmentBusy,
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                            ) { Text(if (state.attachmentBusy) "上传中…" else "添加附件", fontSize = 12.sp) }
                        }
                        if (state.attachmentBusy) {
                            LinearProgressIndicator(
                                progress = { ((state.attachmentProgress ?: 0).coerceIn(0, 100)) / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text("附件上传 ${state.attachmentProgress ?: 0}%", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        state.attachmentError?.let { message ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(message, color = MaterialTheme.colorScheme.error, fontSize = 11.sp, modifier = Modifier.weight(1f))
                                if (state.attachmentRetryAvailable) TextButton(onClick = { viewModel.retryAttachmentUpload() }, enabled = !state.attachmentBusy) {
                                    Text("重试", color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("AI 创作助手", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text(if (aiAssistantOpen) "当前正文会作为上下文；确认后才会写入" else "多轮润色、标题建议、续写与话题推荐", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                            }
                            TextButton(onClick = { aiAssistantOpen = !aiAssistantOpen }) { Text(if (aiAssistantOpen) "收起" else "开始") }
                        }
                        if (aiAssistantOpen) {
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("polish" to "润色", "title" to "标题", "continue" to "续写", "outline" to "提纲", "topics" to "话题").forEach { (mode, label) ->
                                    FilterChip(label, aiMode == mode, { aiMode = mode; aiOutput = ""; aiMessages = emptyList(); aiPreApply = null })
                                }
                            }
                            aiMessages.dropLast(2).forEach { (role, message) ->
                                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.background).padding(9.dp)) {
                                    Text(if (role == "user") "你的要求" else "AI 修改结果", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                                    Text(message, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 4.dp))
                                }
                            }
                            aiMessages.lastOrNull { it.first == "user" }?.let { (_, message) ->
                                if (aiOutput.isNotBlank()) Text("本轮要求：$message", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                            OutlinedTextField(value = aiPrompt, onValueChange = { aiPrompt = it.take(2000) }, modifier = Modifier.fillMaxWidth(), label = { Text("你希望怎么修改") }, placeholder = { Text("例如：保留原意，语气更自然；补充一个具体步骤。") }, minLines = 2, maxLines = 5)
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                                OutlinedButton(onClick = { aiMode = "polish"; aiPrompt = "请从当前正文开始，保留原意和事实，给出一版润色结果。"; aiOutput = "" }) { Text("从当前正文开始润色", fontSize = 10.sp) }
                                TextButton(onClick = { aiMessages = emptyList(); aiOutput = ""; aiPrompt = ""; aiPreApply = null }) { Text("清空对话", fontSize = 10.sp) }
                            }
                            Button(onClick = {
                                if (aiBusy) return@Button
                                val prompt = aiPrompt.trim()
                                aiBusy = true
                                scope.launch(HeikaCoroutineGuard) {
                                    try {
                                        val result = viewModel.generateAiWorkbench(aiMode, prompt, aiMessages)
                                        val userMessage = prompt.ifBlank { "请根据当前稿件完成${mapOf("polish" to "润色", "title" to "标题建议", "continue" to "续写", "outline" to "提纲整理", "markdown" to "Markdown 优化", "topics" to "话题推荐")[aiMode]}。" }
                                        aiOutput = result
                                        aiMessages = (aiMessages + listOf("user" to userMessage, "assistant" to result)).takeLast(12)
                                        aiPrompt = ""
                                    } catch (error: Exception) {
                                        HeikaNoticeBus.show(error.message ?: "AI 请求失败，请重试", HeikaNoticeKind.ERROR)
                                    } finally { aiBusy = false }
                                }
                            }, enabled = !aiBusy && (state.title.isNotBlank() || state.body.isNotBlank() || aiPrompt.isNotBlank()), modifier = Modifier.fillMaxWidth()) {
                                if (aiBusy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(HeikaIcons.Robot, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.size(7.dp)); Text(if (aiBusy) "正在整理…" else if (aiMessages.isNotEmpty()) "继续修改" else "生成建议")
                            }
                            if (aiOutput.isNotBlank()) {
                                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.background).padding(11.dp)) {
                                    Text("生成结果 · 尚未写入正文", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                                    HeikaMarkdown(aiOutput, modifier = Modifier.padding(top = 7.dp), baseSize = 12.sp)
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    OutlinedButton(onClick = {
                                        if (aiPreApply == null) aiPreApply = state.title to state.body
                                        when (aiMode) {
                                            "title" -> viewModel.edit(title = aiOutput.lines().firstOrNull()?.replace(Regex("^[#*\\-0-9.、)） ]+"), "")?.take(80) ?: state.title)
                                            "polish", "markdown" -> viewModel.edit(body = aiOutput.trim())
                                            "continue", "outline" -> viewModel.edit(body = listOf(state.body.trim(), aiOutput.trim()).filter(String::isNotEmpty).joinToString("\n\n"))
                                            "topics" -> aiOutput.split(Regex("[\\s,，]+" )).map { it.trim().removePrefix("#") }.filter { it.length in 2..20 }.take(5).forEach(viewModel::addTopic)
                                        }
                                        HeikaNoticeBus.show("已将建议放入编辑区", HeikaNoticeKind.SUCCESS)
                                    }, modifier = Modifier.weight(1f)) { Text(if (aiMode == "title") "使用首条标题" else "使用此版本", fontSize = 10.sp) }
                                    OutlinedButton(onClick = {
                                        (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("AI 生成结果", aiOutput))
                                        HeikaNoticeBus.show("已复制", HeikaNoticeKind.SUCCESS)
                                    }) { Text("复制", fontSize = 10.sp) }
                                    if (aiPreApply != null) TextButton(onClick = { aiPreApply?.let { (oldTitle, oldBody) -> viewModel.edit(title = oldTitle, body = oldBody) }; aiPreApply = null }) { Text("撤回", fontSize = 10.sp) }
                                }
                            }
                        }
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("图片与视频", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ComposerMediaCard(
                                icon = HeikaIcons.Image,
                                title = "图片",
                                detail = if (state.images.isEmpty()) "最多 9 张 · JPG / PNG" else "已选 ${state.images.size}/9 · 继续添加",
                                selected = state.images.isNotEmpty(),
                                modifier = Modifier.weight(1f),
                                onClick = { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                            )
                            ComposerMediaCard(
                                icon = HeikaIcons.Video,
                                title = "视频 Beta",
                                detail = "MP4 / WebM · 50 MB",
                                selected = false,
                                modifier = Modifier.weight(1f),
                                onClick = { showVideoBeta = true },
                            )
                        }
                        if (state.images.isNotEmpty()) {
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                state.images.forEach { image ->
                                    androidx.compose.foundation.layout.Box(Modifier.size(width = 124.dp, height = 158.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface)) {
                                        AsyncImage(model = image.preview, contentDescription = image.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                                        IconButton(onClick = { viewModel.removeImage(image.key) }, modifier = Modifier.align(Alignment.TopEnd).size(40.dp)) { Icon(HeikaIcons.Close, "移除图片", tint = MaterialTheme.colorScheme.onBackground) }
                                        if (image.progress) HeikaPulseDot(Modifier.align(Alignment.Center), size = 22.dp)
                                        Text(
                                            if (state.images.firstOrNull()?.key == image.key) "封面" else "设为封面",
                                            Modifier.align(Alignment.TopStart).padding(6.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surface).clickable {
                                                if (state.images.firstOrNull()?.key != image.key) {
                                                    viewModel.setCover(image.key)
                                                    HeikaNoticeBus.showSelection("已将该图片设为封面")
                                                }
                                            }.padding(horizontal = 7.dp, vertical = 5.dp),
                                            color = MaterialTheme.colorScheme.onSurface, fontSize = 10.sp,
                                        )
                                        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(MaterialTheme.colorScheme.surface.copy(alpha = .94f)), horizontalAlignment = Alignment.CenterHorizontally) {
                                            if (image.error != null) {
                                                if (image.localFilePath != null) TextButton(onClick = { viewModel.retryUpload(image.key) }, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) { Text("重试上传", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                                                else Text(image.error, color = MaterialTheme.colorScheme.error, fontSize = 9.sp, maxLines = 2)
                                            }
                                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                                                IconButton(onClick = { viewModel.moveImage(image.key, -1) }, modifier = Modifier.size(40.dp)) { Icon(HeikaIcons.Back, "图片前移", tint = MaterialTheme.colorScheme.onBackground) }
                                                IconButton(onClick = { viewModel.moveImage(image.key, 1) }, modifier = Modifier.size(40.dp)) { Icon(HeikaIcons.Forward, "图片后移", tint = MaterialTheme.colorScheme.onBackground) }
                                            }
                                        }
                                    }
                                }
                                if (state.images.size < 9) Column(
                                    Modifier.size(width = 124.dp, height = 158.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                                        .clickable { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Icon(HeikaIcons.Add, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
                                    Text("添加图片", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                                }
                            }
                        }
                        if (state.pendingDeletePaths.isNotEmpty()) TextButton(onClick = viewModel::retryRemovedImageCleanup) { Text("重试清理已移除图片（${state.pendingDeletePaths.size}）", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("分类", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            state.categories.forEach { category -> FilterChip(category.name, category.name == state.category, {
                                if (category.name != state.category) {
                                    viewModel.edit(category = category.name)
                                    HeikaNoticeBus.showSelection("内容分类：${category.name}")
                                }
                            }) }
                        }
                    }
                }
                if (state.channel == "ai") {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("资源类型", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                state.aiResourceTypes.ifEmpty { listOf(
                                    com.heika.nativeapp.data.AiResourceType("knowledge_article", "AI 知识", "模型知识与使用技巧。"),
                                    com.heika.nativeapp.data.AiResourceType("agent", "Agent", "智能体与自动化任务。"),
                                    com.heika.nativeapp.data.AiResourceType("skill", "Skills", "技能插件与能力扩展。"),
                                    com.heika.nativeapp.data.AiResourceType("prompt", "Prompt", "提示词与实用模板。"),
                                    com.heika.nativeapp.data.AiResourceType("ai_tool", "AI 工具", "应用与效率工具。"),
                                    com.heika.nativeapp.data.AiResourceType("tutorial", "案例实践", "真实场景与操作教程。"),
                                ) }.forEach { type ->
                                    val key = type.id
                                    val label = type.label
                                    FilterChip(label, state.contentType == key, {
                                        if (state.contentType != key) {
                                            viewModel.setAiContentType(key)
                                            HeikaNoticeBus.showSelection("AI 资源类型：$label")
                                        }
                                    })
                                }
                            }
                        }
                    }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("使用场景 · 可多选", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                AiResourceRules.usageScenarios.forEach { (key, label) ->
                                    FilterChip(label, key in state.usageScenarios, {
                                        val adding = key !in state.usageScenarios
                                        viewModel.toggleAiUsageScenario(key)
                                        HeikaNoticeBus.showSelection(if (adding) "已添加场景：$label" else "已移除场景：$label")
                                    })
                                }
                            }
                        }
                    }
                    aiResourceFields(state.contentType).forEach { field ->
                        item(key = "ai-resource-${field.first}") {
                            OutlinedTextField(
                                value = state.resourceData[field.first].orEmpty(),
                                onValueChange = { viewModel.editAiField(field.first, it) },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text(field.second + if (field.third) " · 必填" else "") },
                                placeholder = { Text(if (field.first in setOf("platforms", "environments", "use_cases", "variables")) "每行一项" else "填写${field.second.lowercase()}") },
                                minLines = if (field.first in setOf("prompt", "installation", "steps", "functionality", "scenario")) 3 else 1,
                                maxLines = 8,
                            )
                        }
                    }
                }
                item {
                    val topics = viewModel.currentTopics()
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("话题", color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text("${topics.size}/5", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        Text("正文里写 #话题 也会自动高亮；新建话题即时生效，不需要审核。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 15.sp)
                        if (topics.isNotEmpty()) {
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                topics.forEach { topic ->
                                    Row(
                                        Modifier.clip(RoundedCornerShape(999.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).clickable { viewModel.removeTopic(topic) }.padding(start = 11.dp, end = 7.dp, top = 6.dp, bottom = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Text("#$topic", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                        Icon(HeikaIcons.Close, "移除话题", tint = MaterialTheme.colorScheme.primary.copy(alpha = .7f), modifier = Modifier.size(12.dp))
                                    }
                                }
                            }
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = topicDraft,
                                onValueChange = { topicDraft = it.take(24) },
                                modifier = Modifier.weight(1f),
                                label = { Text("添加自己的话题") },
                                placeholder = { Text("例如：深夜食堂") },
                                singleLine = true,
                            )
                            Button(
                                enabled = topicDraft.isNotBlank() && topics.size < 5,
                                onClick = { viewModel.addTopic(topicDraft); topicDraft = "" },
                            ) { Text("添加") }
                        }
                        if (state.topicSuggestions.isNotEmpty()) {
                            Text("热门话题", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                state.topicSuggestions.forEach { topic ->
                                    FilterChip(topic, topic in topics, {
                                        if (topic in topics) viewModel.removeTopic(topic) else viewModel.addTopic(topic)
                                    })
                                }
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 17.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (state.saving) "正在保存到本机" else "草稿自动保存到本机", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                OutlinedButton(
                    onClick = {
                        aiAssistantOpen = true
                        aiMode = "markdown"
                        aiOutput = ""; aiMessages = emptyList(); aiPreApply = null
                        if (state.body.isBlank()) {
                            HeikaNoticeBus.show("先写下正文，再做 Markdown 优化", HeikaNoticeKind.ERROR)
                        } else if (!aiBusy) {
                            aiBusy = true
                            scope.launch(HeikaCoroutineGuard) {
                                try {
                                    aiOutput = viewModel.generateAiWorkbench("markdown", "", emptyList())
                                } catch (error: Exception) {
                                    HeikaNoticeBus.show(error.message ?: "Markdown 优化失败，请重试", HeikaNoticeKind.ERROR)
                                } finally { aiBusy = false }
                            }
                        }
                    },
                    enabled = !state.publishing && !aiBusy,
                    shape = RoundedCornerShape(999.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    modifier = Modifier.padding(end = 8.dp),
                ) { Text(if (aiBusy && aiMode == "markdown") "优化中…" else "Markdown 优化", fontSize = 11.sp) }
                Button(
                    onClick = viewModel::publish,
                    enabled = !state.publishing && !state.saving && !state.attachmentBusy && state.categories.isNotEmpty(),
                    shape = RoundedCornerShape(999.dp),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
                ) {
                    if (state.publishing) HeikaPulseDot(size = 17.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else {
                        Icon(HeikaIcons.ArrowUpRight, null, modifier = Modifier.size(17.dp))
                        Spacer(Modifier.size(6.dp))
                        Text(if (state.revisionMode) "提交修改" else "发布", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
    if (state.showLeaveDialog) {
        HeikaAlertDialog(
            onDismissRequest = viewModel::continueEditing,
            title = { Text("暂时无法同步到服务器") },
            text = { Text("当前内容和未完成图片已保存在此设备。可以离开后稍后继续，也可以留在页面重试同步。") },
            confirmButton = { TextButton(onClick = { viewModel.leaveWithLocalCopy(onBack) }) { Text("保留本机副本并离开") } },
            dismissButton = { TextButton(onClick = viewModel::continueEditing) { Text("继续编辑") } },
        )
    }
}

@Composable
private fun VideoBetaScreen(selectedVideo: Uri?, onBack: () -> Unit, onChooseVideo: () -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("视频发布 Beta", onBack)
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("视频发布", color = MaterialTheme.colorScheme.onBackground, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Text("当前版本可选择和预览本机视频；上传与发布接口尚未开放。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
            if (selectedVideo == null) {
                Column(Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onChooseVideo), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(HeikaIcons.Video, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp))
                    Text("选择视频", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 10.dp))
                    Text("使用系统媒体选择器", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                }
            } else {
                AndroidView(
                    factory = { viewContext -> VideoView(viewContext).apply {
                        setMediaController(MediaController(viewContext).also { controller -> controller.setAnchorView(this) })
                        tag = selectedVideo
                        setVideoURI(selectedVideo)
                    } },
                    update = { view -> if (view.tag != selectedVideo) { view.tag = selectedVideo; view.setVideoURI(selectedVideo) } },
                    modifier = Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(12.dp)),
                )
                val name = remember(selectedVideo) {
                    context.contentResolver.query(selectedVideo, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) cursor.getString(0) else null
                    } ?: "已选择视频"
                }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(HeikaIcons.Video, null, tint = MaterialTheme.colorScheme.primary)
                    Text(name, Modifier.weight(1f).padding(start = 10.dp), color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, maxLines = 2)
                    TextButton(onClick = onChooseVideo) { Text("更换") }
                }
            }
        }
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Beta 预览 · 暂不能发布", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            Button(onClick = {}, enabled = false) { Text("上传功能筹备中") }
        }
    }
}

private fun aiResourceFields(type: String): List<Triple<String, String, Boolean>> {
    val required = when (type) {
        "agent" -> listOf("functionality", "platforms", "run_mode", "source_url", "version")
        "skill" -> listOf("functionality", "environments", "installation", "version", "source_url")
        "prompt" -> listOf("model", "scenario", "prompt")
        "ai_tool" -> listOf("functionality", "platforms", "source_url")
        "tutorial" -> listOf("difficulty", "requirements", "steps")
        else -> emptyList()
    }
    val optional = when (type) {
        "agent" -> listOf("use_cases", "tutorial")
        "skill" -> listOf("configuration", "example", "use_cases")
        "prompt" -> listOf("variables", "use_cases", "example")
        "ai_tool" -> listOf("use_cases", "pricing", "version")
        "tutorial" -> listOf("use_cases", "example")
        else -> emptyList()
    }
    val labels = mapOf(
        "functionality" to "功能说明", "platforms" to "兼容平台", "run_mode" to "运行方式", "use_cases" to "适用场景",
        "environments" to "兼容环境", "installation" to "安装步骤", "configuration" to "配置内容", "example" to "使用示例",
        "model" to "适用模型", "scenario" to "应用场景", "prompt" to "完整 Prompt", "variables" to "可替换变量",
        "version" to "版本", "source_url" to "资源链接", "difficulty" to "难度", "requirements" to "准备条件", "steps" to "使用步骤", "pricing" to "价格信息",
    )
    return (required + optional).distinct().map { Triple(it, labels[it] ?: it, it in required) }
}

private suspend fun prepareImage(context: Context, uri: Uri): Triple<String, String, ByteArray> = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: "image/jpeg"
    require(mime in setOf("image/jpeg", "image/png", "image/webp")) { "仅支持 JPG、PNG、WebP 图片" }
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "heika-image.jpg"
    val input = resolver.openInputStream(uri) ?: error("无法读取图片")
    val source = input.use { stream ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(32 * 1024)
        while (output.size() <= 4 * 1024 * 1024) {
            val read = stream.read(buffer, 0, minOf(buffer.size, 4 * 1024 * 1024 + 1 - output.size()))
            if (read < 0) break
            output.write(buffer, 0, read)
        }
        output.toByteArray()
    }
    if (source.size <= 4 * 1024 * 1024) return@withContext Triple(name, mime, source)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2200) sample *= 2
    val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: error("图片解码失败")
    var result = ByteArray(0)
    try {
        for (quality in listOf(90, 84, 78, 72, 66)) {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
            result = output.toByteArray()
            if (result.size <= 4 * 1024 * 1024) break
        }
    } finally { bitmap.recycle() }
    require(result.size <= 4 * 1024 * 1024) { "图片压缩后仍超过 4 MB，请选择较小的图片" }
    Triple(name.substringBeforeLast('.') + ".jpg", "image/jpeg", result)
}

/** 读取用户选中的附件：显示名、MIME 与实际字节。 */
private fun readAttachment(context: Context, uri: Uri): Triple<String, String, ByteArray> {
    val resolver = context.contentResolver
    var name = "附件"
    var size = 0L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            name = cursor.getString(0) ?: name
            size = if (cursor.isNull(1)) 0L else cursor.getLong(1)
        }
    }
    if (size > 30L * 1024 * 1024) throw IllegalStateException("「$name」超过单个 30 MB 的限制")
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IllegalStateException("无法读取该文件")
    if (bytes.isEmpty()) throw IllegalStateException("该文件是空的")
    if (bytes.size > 30 * 1024 * 1024) throw IllegalStateException("「$name」超过单个 30 MB 的限制")
    val mime = resolver.getType(uri) ?: "application/octet-stream"
    return Triple(name, mime, bytes)
}

private fun friendlySize(bytes: Long): String = when {
    bytes >= 1024L * 1024 -> String.format("%.1f MB", bytes / 1024.0 / 1024.0)
    bytes >= 1024 -> "${bytes / 1024} KB"
    else -> "$bytes B"
}

private fun routeLabel(state: PublishState): String {
    if (state.channel != "ai") return "社区精选 · ${state.category.ifBlank { "生活" }}"
    val label = when (state.contentType) {
        "agent" -> "Agent 智能体"
        "skill" -> "Skills 技能"
        "prompt" -> "Prompt 提示词"
        "ai_tool" -> "AI 工具"
        "tutorial" -> "实战教程"
        else -> "AI 知识文章"
    }
    return "AI 空间 · $label"
}

/** 图片与视频入口必须等宽等高：原来一个是整块空态、一个是小按钮，视觉上明显失衡。 */
@Composable
private fun ComposerMediaCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    detail: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier
            .height(92.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = .10f) else MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
        Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
        Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, modifier = Modifier.padding(top = 3.dp))
    }
}
