package com.heika.nativeapp.feature.publish

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.FilterChip
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
    LaunchedEffect(draftId, channel) { viewModel.configureChannel(channel); viewModel.resumeDraft(draftId) }
    BackHandler(enabled = !state.loading && !state.publishing) { viewModel.saveDraft(onBack) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia((9 - state.images.size).coerceAtLeast(1))) { uris ->
        scope.launch {
            for (uri in uris) {
                runCatching { prepareImage(context, uri) }
                    .onSuccess { (name, mime, bytes) -> viewModel.addImage(name, mime, bytes) }
                    .onFailure { viewModel.reportError(it.message ?: "无法读取所选图片") }
            }
        }
    }
    LaunchedEffect(state.publishedPost) {
        state.publishedPost?.let { data ->
            val post = runCatching { HeikaPost.from(data) }.getOrNull()
            if (post != null) onPublished(post)
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(if (state.revisionMode) "修改作品" else "发布内容", onBack = { viewModel.saveDraft(onBack) }, trailing = {
            Text(if (state.saving) "保存中" else if (state.revisionMode) "保存修改" else "草稿", Modifier.clickable { viewModel.saveDraft() }.padding(8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        })
        if (!state.loading && state.error != "登录后可以发布内容") {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                FilterChip("社区作品", state.channel == "community", { viewModel.switchChannel("community") })
                FilterChip("AI 资源", state.channel == "ai", { viewModel.switchChannel("ai") })
            }
        }
        if (state.error == "登录后可以发布内容") {
            Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("登录后可以发布内容", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onLogin) { Text("登录") }
            }
        } else if (state.loading) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        } else {
            androidx.compose.foundation.lazy.LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 19.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    OutlinedTextField(value = state.title, onValueChange = { viewModel.edit(title = it) }, modifier = Modifier.fillMaxWidth(), label = { Text("标题") }, placeholder = { Text("给这次发现一个标题") }, singleLine = true, supportingText = { Text("${state.title.length}/80") })
                }
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp)) {
                        Text("正文", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        BasicTextField(
                            value = state.body,
                            onValueChange = { viewModel.edit(body = it) },
                            modifier = Modifier.fillMaxWidth().height(220.dp).padding(top = 12.dp),
                            textStyle = androidx.compose.ui.text.TextStyle(color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 23.sp),
                            decorationBox = { inner ->
                                if (state.body.isEmpty()) Text("分享内容、观点或使用体验…", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .72f), fontSize = 13.sp)
                                inner()
                            },
                        )
                        Text("${state.body.length}/5000", Modifier.align(Alignment.End), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("分类", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            state.categories.forEach { category -> FilterChip(category.name, category.name == state.category, { viewModel.edit(category = category.name) }) }
                        }
                    }
                }
                if (state.channel == "ai") {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("资源类型", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                listOf("knowledge_article" to "AI 知识", "agent" to "Agent", "skill" to "Skill", "prompt" to "Prompt", "ai_tool" to "AI 工具", "tutorial" to "教程").forEach { (type, label) ->
                                    FilterChip(label, state.contentType == type, { viewModel.setAiContentType(type) })
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
                    OutlinedTextField(value = state.topicText, onValueChange = { viewModel.edit(topicText = it) }, modifier = Modifier.fillMaxWidth(), label = { Text("话题") }, placeholder = { Text("以空格分隔，最多 5 个") }, supportingText = { Text("使用网站已收录的话题名称") })
                }
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("图片 ${state.images.size}/9", color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        TextButton(enabled = state.images.size < 9, onClick = { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                            Icon(Icons.Outlined.PhotoLibrary, null); Text("选择图片")
                        }
                    }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        state.images.forEach { image ->
                            androidx.compose.foundation.layout.Box(Modifier.size(94.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface)) {
                                AsyncImage(model = image.preview, contentDescription = image.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                                IconButton(onClick = { viewModel.removeImage(image.key) }, modifier = Modifier.align(Alignment.TopEnd).size(29.dp)) { Icon(Icons.Outlined.Close, "移除图片", tint = MaterialTheme.colorScheme.onBackground) }
                                if (image.progress) CircularProgressIndicator(Modifier.align(Alignment.Center).size(20.dp), strokeWidth = 2.dp)
                                Text(
                                    if (state.images.firstOrNull()?.key == image.key) "封面" else "设为封面",
                                    Modifier.align(Alignment.TopStart).padding(4.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = .88f)).clickable { viewModel.setCover(image.key) }.padding(horizontal = 5.dp, vertical = 3.dp),
                                    color = MaterialTheme.colorScheme.onSurface, fontSize = 8.sp,
                                )
                                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                                    if (image.error != null) {
                                        if (image.localFilePath != null) {
                                            TextButton(onClick = { viewModel.retryUpload(image.key) }, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) { Text("重试上传", color = MaterialTheme.colorScheme.error, fontSize = 9.sp) }
                                        } else {
                                            Text(image.error, color = MaterialTheme.colorScheme.error, fontSize = 8.sp, maxLines = 2)
                                        }
                                    }
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        IconButton(onClick = { viewModel.moveImage(image.key, -1) }, modifier = Modifier.size(30.dp)) { Icon(Icons.Outlined.ChevronLeft, "图片前移", tint = MaterialTheme.colorScheme.onBackground) }
                                        IconButton(onClick = { viewModel.moveImage(image.key, 1) }, modifier = Modifier.size(30.dp)) { Icon(Icons.Outlined.ChevronRight, "图片后移", tint = MaterialTheme.colorScheme.onBackground) }
                                    }
                                }
                            }
                        }
                    }
                    if (state.pendingDeletePaths.isNotEmpty()) {
                        TextButton(onClick = viewModel::retryRemovedImageCleanup) { Text("重试清理已移除图片（${state.pendingDeletePaths.size}）", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                    }
                }
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) } }
            }
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 17.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (state.saving) "正在保存草稿" else "草稿自动保存", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Button(onClick = viewModel::publish, enabled = !state.publishing && !state.saving && state.categories.isNotEmpty()) {
                    if (state.publishing) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else { Icon(Icons.Outlined.Send, null); Text(if (state.revisionMode) "提交修改" else "提交") }
                }
            }
        }
    }
    if (state.showLeaveDialog) {
        AlertDialog(
            onDismissRequest = viewModel::continueEditing,
            title = { Text("暂时无法同步到服务器") },
            text = { Text("当前内容和未完成图片已保存在此设备。可以离开后稍后继续，也可以留在页面重试同步。") },
            confirmButton = { TextButton(onClick = { viewModel.leaveWithLocalCopy(onBack) }) { Text("保留本机副本并离开") } },
            dismissButton = { TextButton(onClick = viewModel::continueEditing) { Text("继续编辑") } },
        )
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
