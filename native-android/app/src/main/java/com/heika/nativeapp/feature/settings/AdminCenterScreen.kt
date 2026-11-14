package com.heika.nativeapp.feature.settings

import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaGlassDialog

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import androidx.lifecycle.viewModelScope
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

@Composable
fun AdminCenterScreen(onBack: () -> Unit, viewModel: AdminCenterViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var keywordDraft by remember { mutableStateOf("") }
    var pendingKeywordDelete by remember { mutableStateOf<JSONObject?>(null) }
    var pendingAiKeyDelete by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(if (state.section == "overview") "管理员中心" else adminSectionTitle(state.section), { if (state.section == "overview") onBack() else viewModel.select("overview") }, trailing = { IconButton(onClick = viewModel::refresh) { Icon(HeikaIcons.Retry, "刷新") } })
        if (state.section == "overview") {
            AdminOverview(state = state, onSelect = viewModel::select, onRefresh = viewModel::refresh)
        } else {
            Row(Modifier.fillMaxWidth().clickable { viewModel.select("overview") }.padding(horizontal = 18.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(HeikaIcons.Back, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Text("管理台", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(adminSectionTitle(state.section), color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
            state.error?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
            state.notice?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
            if (state.loading && state.items.isEmpty() && state.section !in adminConfigSections) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            else if (state.items.isEmpty() && state.section !in adminConfigSections) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (state.error == null) "暂无待处理事项" else "无法读取管理队列", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (state.error != null) TextButton(onClick = viewModel::refresh) { Text("重试") }
            } else if (state.section in adminConfigSections) AdminConfigPanel(state, viewModel, onPendingAiKeyDelete = { pendingAiKeyDelete = true })
            else if (state.section == "audit") LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
            items(state.items, key = { it.optString("id") }) { item ->
                Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(item.optString("action"), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("${item.optString("actor", "管理员")} · ${item.optString("target_type")} · ${item.optString("target_id")}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    item.optString("reason").takeIf(String::isNotBlank)?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                    Text(item.optString("created_at"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
            }
            } else if (state.section == "keywords") LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = keywordDraft, onValueChange = { keywordDraft = it.take(80) }, modifier = Modifier.weight(1f), label = { Text("新增拦截词") }, singleLine = true)
                    Button(enabled = keywordDraft.isNotBlank() && state.saving == null, onClick = { viewModel.addKeyword(keywordDraft) { keywordDraft = "" } }) { Text("添加") }
                }
                Text("作用于作品、评论、私信和公开资料。规则由服务端执行。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
            items(state.items, key = { it.optString("id") }) { item ->
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp)).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(item.optString("keyword"), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text((item.optJSONArray("scopes")?.let { scopes -> (0 until scopes.length()).joinToString(" · ") { scopes.optString(it) } } ?: "全部范围"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                    androidx.compose.material3.Switch(checked = item.optBoolean("enabled"), enabled = state.saving != item.optString("id"), onCheckedChange = { viewModel.setKeywordEnabled(item.optString("id"), it) })
                    TextButton(enabled = state.saving == null, onClick = { pendingKeywordDelete = item }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
            } else LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
            items(state.items, key = { it.optString("id") }) { item ->
                AdminQueueItem(
                    item, state.section, state.saving == item.optString("id"),
                    onAction = { publish, note -> viewModel.process(item.optString("id"), publish, note) },
                    onUserRole = viewModel::setUserRole,
                    onUserMembership = viewModel::setUserMembership,
                )
            }
        }
        }
    }
    pendingKeywordDelete?.let { rule ->
        HeikaGlassDialog(
            title = "删除关键词规则？",
            message = "“${rule.optString("keyword")}”将不再被服务端拦截。",
            confirmText = "删除",
            destructive = true,
            loading = state.saving != null,
            onConfirm = { viewModel.deleteKeyword(rule.optString("id")); pendingKeywordDelete = null },
            onCancel = { pendingKeywordDelete = null },
        )
    }
    if (pendingAiKeyDelete) HeikaGlassDialog(
        title = "删除 AI 密钥？",
        message = "删除后，依赖该密钥的 AI 工作台将暂停服务。",
        confirmText = "删除",
        destructive = true,
        loading = state.saving != null,
        onConfirm = { pendingAiKeyDelete = false; viewModel.deleteAiKey() },
        onCancel = { pendingAiKeyDelete = false },
    )
}

private data class AdminModuleSpec(val key: String, val title: String, val detail: String, val iconRes: Int, val countKey: String? = null)
private data class AdminModuleGroup(val title: String, val modules: List<AdminModuleSpec>)

private val adminModuleGroups = listOf(
    AdminModuleGroup("审核与举报", listOf(
        AdminModuleSpec("posts", "作品审核", "新投稿与已发布作品的修改", com.heika.nativeapp.ui.HeikaIconRes.Content, "pending"),
        AdminModuleSpec("reports", "内容举报", "查看并处理作品与评论举报", com.heika.nativeapp.ui.HeikaIconRes.Report),
        AdminModuleSpec("dm-reports", "私信举报", "处理用户提交的私信举报", com.heika.nativeapp.ui.HeikaIconRes.Comment),
        AdminModuleSpec("appeals", "申诉处理", "复核内容、账号与举报申诉", com.heika.nativeapp.ui.HeikaIconRes.Shield),
    )),
    AdminModuleGroup("社区治理", listOf(
        AdminModuleSpec("comments", "评论管理", "搜索、隐藏或恢复评论", com.heika.nativeapp.ui.HeikaIconRes.Comment),
        AdminModuleSpec("keywords", "关键词规则", "管理发布与互动拦截规则", com.heika.nativeapp.ui.HeikaIconRes.Tag),
        AdminModuleSpec("topic-events", "话题共创", "创建和管理社区共创活动", com.heika.nativeapp.ui.HeikaIconRes.CoExplore),
        AdminModuleSpec("audit", "操作记录", "查看管理员处理历史", com.heika.nativeapp.ui.HeikaIconRes.Gavel),
    )),
    AdminModuleGroup("账号与工具", listOf(
        AdminModuleSpec("users", "账号管理", "角色、会员与社区发言限制", com.heika.nativeapp.ui.HeikaIconRes.BusinessUser),
        AdminModuleSpec("user-feedback", "用户反馈", "查看并处理用户意见", com.heika.nativeapp.ui.HeikaIconRes.Warning),
    )),
    AdminModuleGroup("AI 内容运营", listOf(
        AdminModuleSpec("ai", "AI 资源审核", "审核 AI 专区内容", com.heika.nativeapp.ui.HeikaIconRes.Robot),
        AdminModuleSpec("ai-resource-types", "AI 资源类型", "管理类型目录与展示状态", com.heika.nativeapp.ui.HeikaIconRes.Blocks),
        AdminModuleSpec("ai-feedback", "AI 资源反馈", "处理资源失效与内容反馈", com.heika.nativeapp.ui.HeikaIconRes.Warning),
        AdminModuleSpec("categories", "分类管理", "维护社区与 AI 分类", com.heika.nativeapp.ui.HeikaIconRes.Tag),
        AdminModuleSpec("ai-settings", "AI 工作台", "配置服务端 AI 能力", com.heika.nativeapp.ui.HeikaIconRes.Settings),
    )),
    AdminModuleGroup("运营配置", listOf(
        AdminModuleSpec("recommendation-settings", "推荐配置", "设置每日内容来源配比", com.heika.nativeapp.ui.HeikaIconRes.Settings),
        AdminModuleSpec("exploration-ad", "发现页广告位", "管理精选信息流顶部的图文推广入口", com.heika.nativeapp.ui.HeikaIconRes.Image),
    )),
)

private val adminSectionNames = mapOf(
    "reports" to "内容举报", "dm-reports" to "私信举报", "posts" to "作品审核", "ai" to "AI 资源审核",
    "ai-feedback" to "AI 资源反馈", "comments" to "评论管理", "appeals" to "申诉处理", "users" to "账号管理",
    "user-feedback" to "用户反馈", "keywords" to "关键词规则", "audit" to "操作记录", "categories" to "分类管理",
    "topic-events" to "话题共创", "recommendation-settings" to "推荐配置", "ai-settings" to "AI 工作台", "ai-resource-types" to "AI 资源类型", "exploration-ad" to "发现页广告位",
)
private fun adminSectionTitle(key: String) = adminSectionNames[key] ?: "管理员中心"

@Composable
private fun AiResourceTypeAdminRow(item: JSONObject, state: AdminCenterState, viewModel: AdminCenterViewModel) {
    var label by remember(item) { mutableStateOf(item.optString("label")) }
    var description by remember(item) { mutableStateOf(item.optString("description")) }
    var enabled by remember(item) { mutableStateOf(item.optBoolean("enabled")) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(item.optString("resource_type"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                Text("${item.optInt("content_count")} 篇关联资源", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            }
            androidx.compose.material3.Switch(checked = enabled, enabled = state.saving == null, onCheckedChange = { enabled = it })
        }
        OutlinedTextField(label, { label = it.take(24) }, Modifier.fillMaxWidth(), label = { Text("展示名称") }, singleLine = true)
        OutlinedTextField(description, { description = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("说明") }, minLines = 2, maxLines = 3)
        Button(
            enabled = state.saving == null && label.trim().isNotEmpty(),
            onClick = { viewModel.updateAiResourceType(item.optString("resource_type"), label, description, enabled, item.optInt("sort_order")) },
        ) { Text(if (state.saving == "ai-type-${item.optString("resource_type")}") "保存中…" else "保存类型设置") }
    }
}

@Composable
private fun AdminOverview(state: AdminCenterState, onSelect: (String) -> Unit, onRefresh: () -> Unit) {
    val overview = state.overview
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 14.dp),
    ) {
        item {
            Text("管理后台", color = MaterialTheme.colorScheme.onBackground, fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
            Text("按工作模块进入审核与管理，待处理事项优先显示。", Modifier.padding(top = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }
        if (state.loading && overview == null) item {
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }
        }
        if (state.error != null) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp)) {
                Text("概览加载失败", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                Text("请检查管理员权限或网络连接。", Modifier.padding(top = 3.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                TextButton(onClick = onRefresh) { Text("重试") }
            }
        }
        if (overview != null) {
            val metrics = listOf(
                "usersToday" to "今日新增用户", "postsToday" to "今日发布作品", "pending" to "待审核内容",
                "pendingReports" to "待处理举报", "aiResources" to "已发布 AI 资源", "views" to "累计阅读量", "likes" to "累计点赞",
                "saves" to "累计收藏", "comments" to "可见评论",
            )
            items(metrics.chunked(2)) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (key, label) ->
                        val value = overview.opt(key)
                        AdminMetric(label, if (value == null || value == JSONObject.NULL) "—" else value.toString(), Modifier.weight(1f))
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("管理模块", color = MaterialTheme.colorScheme.onBackground, fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
                    Text("按职责分组", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
                TextButton(onClick = onRefresh) { Icon(HeikaIcons.Retry, null, modifier = Modifier.size(16.dp)); Text("刷新", Modifier.padding(start = 5.dp)) }
            }
        }
        adminModuleGroups.forEach { group ->
            item(key = "group-${group.title}") {
                Text(group.title, Modifier.padding(top = 4.dp, bottom = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
            items(group.modules, key = { "module-${it.key}" }) { module ->
                AdminModuleRow(module, overview, onClick = { onSelect(module.key) })
            }
        }
    }
}

@Composable
private fun AdminMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(value, color = MaterialTheme.colorScheme.onSurface, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun AdminModuleRow(module: AdminModuleSpec, overview: JSONObject?, onClick: () -> Unit) {
    val count = module.countKey?.let { key -> overview?.optInt(key)?.takeIf { overview.has(key) } }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(androidx.compose.ui.res.painterResource(module.iconRes), null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(9.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(module.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(module.detail, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            if (count != null) Text(if (count == 0) "暂无待处理" else "$count 项待处理", color = if (count == 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary, fontSize = 11.sp)
        }
        Icon(HeikaIcons.Forward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

private val adminConfigSections = setOf("categories", "topic-events", "recommendation-settings", "ai-settings", "ai-resource-types", "exploration-ad")

@Composable
private fun AdminConfigPanel(state: AdminCenterState, viewModel: AdminCenterViewModel, onPendingAiKeyDelete: () -> Unit) {
    val context = LocalContext.current
    val uploadScope = rememberCoroutineScope()
    var categoryName by remember { mutableStateOf("") }
    var topicName by remember { mutableStateOf("") }
    var eventTitle by remember { mutableStateOf("") }
    var eventDescription by remember { mutableStateOf("") }
    var eventStarts by remember { mutableStateOf(java.time.Instant.now().toString()) }
    var eventEnds by remember { mutableStateOf(java.time.Instant.now().plusSeconds(30L * 24 * 60 * 60).toString()) }
    var aiKey by remember { mutableStateOf("") }
    val meta = state.metadata ?: JSONObject()
    val topics = meta.optJSONArray("topics")
    var adEnabled by remember(meta) { mutableStateOf(meta.optBoolean("enabled", false)) }
    var adKind by remember(meta) { mutableStateOf(meta.optString("kind", "text")) }
    var adTitle by remember(meta) { mutableStateOf(meta.optString("title")) }
    var adBody by remember(meta) { mutableStateOf(meta.optString("body")) }
    var adImageUrl by remember(meta) { mutableStateOf(meta.optString("image_url").takeUnless { it == "null" }.orEmpty()) }
    var adImagePickerNotice by remember { mutableStateOf<String?>(null) }
    var adPostRef by remember(meta) {
        mutableStateOf(meta.optString("post_client_id").takeUnless { it == "null" || it.isBlank() } ?: meta.optString("post_id").takeUnless { it == "null" }.orEmpty())
    }
    var settingsDraft by remember(meta) {
        mutableStateOf(listOf("interest_slots", "adjacent_slots", "curated_slots", "surprise_slots").associateWith { meta.optInt(it).toString() })
    }
    val adImagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) uploadScope.launch {
            val picked = withContext(Dispatchers.IO) { readAdImage(context, uri, 4 * 1024 * 1024) }
            val mimeType = picked?.first
            val bytes = picked?.second
            if (mimeType == null || bytes == null || bytes.isEmpty()) {
                adImagePickerNotice = "图片无法读取，或文件超过 4 MB。请选择 JPG、PNG 或 WebP。"
            } else if (mimeType !in setOf("image/jpeg", "image/png", "image/webp")) {
                adImagePickerNotice = "只支持 JPG、PNG 或 WebP 图片。"
            } else {
                adImagePickerNotice = null
                val extension = when (mimeType) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
                viewModel.uploadExplorationAdImage("ad-cover.$extension", mimeType, bytes) { url ->
                    adImageUrl = url
                    adImagePickerNotice = "图片已上传，保存广告位后生效。"
                }
            }
        }
    }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 10.dp)) {
        if (state.loading && state.metadata == null) item { CircularProgressIndicator(Modifier.padding(16.dp)) }
        when (state.section) {
            "categories" -> item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(categoryName, { categoryName = it.take(32) }, Modifier.weight(1f), label = { Text("新增社区分类") }, singleLine = true)
                    Button(enabled = categoryName.trim().length >= 2 && state.saving == null, onClick = { viewModel.createCategory(categoryName) { categoryName = "" } }) { Text("添加") }
                }
                Text("分类 ID 与内容关联由服务端维护。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
            "topic-events" -> item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("选择话题", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    if (topics != null) (0 until topics.length()).forEach { index ->
                        val topic = topics.optJSONObject(index) ?: return@forEach
                        TextButton(onClick = { topicName = topic.optString("name") }) {
                            if (topicName == topic.optString("name")) Icon(HeikaIcons.Check, null, modifier = Modifier.size(17.dp))
                            Text(topic.optString("name"))
                        }
                    }
                    OutlinedTextField(eventTitle, { eventTitle = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("活动标题") }, singleLine = true)
                    OutlinedTextField(eventDescription, { eventDescription = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("活动说明") }, minLines = 2, maxLines = 4)
                    OutlinedTextField(eventStarts, { eventStarts = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("开始时间（ISO 8601）") }, singleLine = true)
                    OutlinedTextField(eventEnds, { eventEnds = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("结束时间（ISO 8601）") }, singleLine = true)
                    Button(enabled = topicName.isNotBlank() && eventTitle.length >= 4 && eventDescription.length >= 8 && state.saving == null, onClick = { viewModel.createTopicEvent(topicName, eventTitle, eventDescription, eventStarts, eventEnds) { eventTitle = ""; eventDescription = "" } }) { Text("创建活动") }
                }
            }
            "recommendation-settings" -> item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("每日五张卡的来源配比", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    listOf("interest_slots" to "兴趣", "adjacent_slots" to "相邻", "curated_slots" to "精选", "surprise_slots" to "惊喜").forEach { (key, title) ->
                        OutlinedTextField(settingsDraft[key].orEmpty(), { value -> settingsDraft = settingsDraft + (key to value.filter(Char::isDigit).take(1)) }, Modifier.fillMaxWidth(), label = { Text(title) }, singleLine = true)
                    }
                    Button(enabled = state.saving == null && settingsDraft.values.all(String::isNotBlank), onClick = { viewModel.saveRecommendationSettings(settingsDraft.mapValues { it.value.toIntOrNull() ?: -1 }) }) { Text("保存配置") }
                }
            }
            "ai-resource-types" -> item {
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("资源类型编号固定，用于历史内容与外部链接。停用只隐藏新入口，不删除既有资源。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp)
                }
            }
            "exploration-ad" -> item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("发现页广告位", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(11.dp)).padding(horizontal = 13.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("展示广告位", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text("启用后显示在发现页精选信息流顶部", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        androidx.compose.material3.Switch(checked = adEnabled, enabled = state.saving == null, onCheckedChange = { adEnabled = it })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("内容形式", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        TextButton(onClick = { adKind = "text" }) { Text("文字", color = if (adKind == "text") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                        TextButton(onClick = { adKind = "image" }) { Text("图片 + 文字", color = if (adKind == "image") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    OutlinedTextField(adTitle, { adTitle = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("标题（最多 80 字）") }, singleLine = true)
                    OutlinedTextField(adBody, { adBody = it.take(300) }, Modifier.fillMaxWidth(), label = { Text("说明（可选，最多 300 字）") }, minLines = 2, maxLines = 4)
                    if (adKind == "image") {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(enabled = state.saving == null, onClick = { adImagePicker.launch("image/*") }) {
                                Text(if (state.saving == "exploration-ad-image") "上传中…" else if (adImageUrl.isBlank()) "选择并上传图片" else "更换图片")
                            }
                            if (adImageUrl.isNotBlank()) TextButton(enabled = state.saving == null, onClick = { adImageUrl = "" }) { Text("移除") }
                            Text("最大 4 MB", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        adImagePickerNotice?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
                        if (adImageUrl.startsWith("https://")) AsyncImage(
                            model = ImageRequest.Builder(context).data(adImageUrl).crossfade(true).build(),
                            contentDescription = "广告图片预览",
                            imageLoader = LocalHeikaImageLoader.current,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxWidth().height(164.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    }
                    OutlinedTextField(adPostRef, { adPostRef = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("目标作品 client_id 或 UUID") }, singleLine = true)
                    var adPostSearch by remember { mutableStateOf("") }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(adPostSearch, { adPostSearch = it.take(60) }, Modifier.weight(1f), label = { Text("按作品标题查找") }, singleLine = true)
                        Button(enabled = state.saving == null && !state.adPostsLoading && adPostSearch.trim().length >= 2, onClick = { viewModel.searchExplorationAdPosts(adPostSearch) }) { Text(if (state.adPostsLoading) "搜索中" else "搜索") }
                    }
                    state.adPosts.take(8).forEach { candidate ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surface).clickable { adPostRef = candidate.optLong("client_id").takeIf { it > 0 }?.toString() ?: candidate.optString("id") }.padding(horizontal = 11.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f)) {
                                Text(candidate.optString("title"), color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, maxLines = 1)
                                Text("${candidate.optString("author")} · ${candidate.optString("client_id")}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                            }
                            Text("选择", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        }
                    }
                    Text("图片由管理员直接上传；广告只跳转到已发布作品，服务端会校验作品状态和管理员权限。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    Button(
                        enabled = state.saving == null && (!adEnabled || (adTitle.isNotBlank() && adPostRef.isNotBlank() && (adKind != "image" || adImageUrl.startsWith("https://")))),
                        onClick = {
                            val payload = JSONObject()
                                .put("enabled", adEnabled)
                                .put("kind", adKind)
                                .put("title", adTitle.trim())
                                .put("body", adBody.trim())
                                .put("image_url", if (adKind == "image") adImageUrl.trim() else JSONObject.NULL)
                                .put("post_ref", adPostRef.trim())
                            viewModel.saveExplorationAd(payload)
                        },
                    ) { Text(if (state.saving == "exploration-ad") "保存中…" else "保存广告位") }
                }
            }
            "ai-settings" -> item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (meta.optBoolean("configured")) "已配置：${meta.optString("masked")}" else "尚未配置 AI 密钥", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    OutlinedTextField(aiKey, { aiKey = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("DeepSeek API 密钥") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = aiKey.trim().length >= 16 && state.saving == null, onClick = { viewModel.saveAiKey(aiKey) { aiKey = "" } }) { Text("加密保存") }
                        if (meta.optBoolean("configured")) TextButton(enabled = state.saving == null, onClick = onPendingAiKeyDelete) { Text("删除密钥", color = MaterialTheme.colorScheme.error) }
                    }
                    Text("密钥只发送到服务端加密存储，不保存在本机。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
        }
        items(state.items, key = { "${state.section}-${it.optString("id")}" }) { item ->
            when (state.section) {
                "categories" -> Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(item.optString("name"), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp); Text("${item.optString("channel")} · ${item.optString("kind")}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
                    androidx.compose.material3.Switch(item.optBoolean("active"), enabled = state.saving == null, onCheckedChange = { viewModel.setCategoryActive(item.optInt("id"), it) })
                }
                "ai-resource-types" -> AiResourceTypeAdminRow(item, state, viewModel)
                "topic-events" -> Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(item.optString("title"), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp); Text("${item.optString("description")}\n${item.optString("starts_at")} — ${item.optString("ends_at")}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
                    androidx.compose.material3.Switch(item.optBoolean("is_active"), enabled = state.saving == null, onCheckedChange = { viewModel.setTopicEventActive(item, it) })
                }
            }
        }
    }
}

@Composable
private fun AdminQueueItem(
    item: JSONObject,
    section: String,
    saving: Boolean,
    onAction: (Boolean, String) -> Unit,
    onUserRole: (String, String) -> Unit,
    onUserMembership: (String, String) -> Unit,
) {
    var note by remember(item.optString("id")) { mutableStateOf("") }
    var roleMenuOpen by remember { mutableStateOf(false) }
    var membershipMenuOpen by remember { mutableStateOf(false) }
    var pendingUserUpdate by remember { mutableStateOf<Pair<String, String>?>(null) }
    val target = item.optJSONObject("target")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(when (section) { "reports", "dm-reports" -> item.optString("reason", "举报"); "users" -> item.optString("nickname", "探索者"); "ai-feedback" -> item.optString("kind", "资源反馈"); "user-feedback" -> item.optString("category", "用户反馈"); else -> item.optString("title", item.optString("post_title", "待审核内容")) }, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(when (section) { "users" -> "${item.optString("role")} · ${item.optString("membership_tier")}"; "comments" -> item.optString("body"); "ai-feedback" -> item.optString("details"); "user-feedback" -> item.optString("message"); else -> target?.optString("title").orEmpty().ifBlank { item.optString("body") }.ifBlank { item.optString("status") } }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
        if (section == "reports") Text("对象：${target?.optString("type").orEmpty()} · ${target?.optString("status").orEmpty()}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        if (section == "users") Text(if (item.optJSONObject("community_restriction")?.optBoolean("active") == true) "已限制发言" else "正常", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        if (section == "users") Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box {
                TextButton(enabled = !saving, onClick = { roleMenuOpen = true }) { Text("调整角色") }
                androidx.compose.material3.DropdownMenu(roleMenuOpen, { roleMenuOpen = false }) {
                    listOf("member" to "普通用户", "reviewer" to "审核员", "content_manager" to "内容管理员", "admin" to "管理员").forEach { (role, label) ->
                        androidx.compose.material3.DropdownMenuItem(text = { Text(label) }, onClick = { roleMenuOpen = false; pendingUserUpdate = Pair("role", role) })
                    }
                }
            }
            Box {
                TextButton(enabled = !saving, onClick = { membershipMenuOpen = true }) { Text("调整会员") }
                androidx.compose.material3.DropdownMenu(membershipMenuOpen, { membershipMenuOpen = false }) {
                    listOf("free" to "Free", "plus" to "Plus", "pro" to "Pro").forEach { (tier, label) ->
                        androidx.compose.material3.DropdownMenuItem(text = { Text(label) }, onClick = { membershipMenuOpen = false; pendingUserUpdate = Pair("membership", tier) })
                    }
                }
            }
        }
        OutlinedTextField(value = note, onValueChange = { note = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text("处理说明（至少 3 字）") }, maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !saving && (note.trim().length >= 3 || section == "comments" || section == "user-feedback"), onClick = { onAction(true, note) }) { Text(if (saving) "处理中…" else when (section) { "reports", "dm-reports" -> "标记已处理"; "user-feedback" -> "标记已解决"; "appeals" -> "接受申诉"; "users" -> "限制发言"; "comments" -> "恢复显示"; else -> "通过" }) }
            TextButton(enabled = !saving && (note.trim().length >= 3 || section == "user-feedback"), onClick = { onAction(false, note) }) { Text(when (section) { "reports", "dm-reports" -> "驳回"; "user-feedback" -> "忽略反馈"; "appeals" -> "驳回申诉"; "users" -> "解除限制"; "comments" -> "隐藏"; else -> "驳回" }) }
        }
    }
    pendingUserUpdate?.let { (kind, value) ->
        val label = when (kind to value) {
            "role" to "member" -> "普通用户"; "role" to "reviewer" -> "审核员"; "role" to "content_manager" -> "内容管理员"; "role" to "admin" -> "管理员"
            "membership" to "plus" -> "Plus"; "membership" to "pro" -> "Pro"; else -> "Free"
        }
        HeikaGlassDialog(
            title = if (kind == "role") "更新账号角色？" else "更新会员等级？",
            message = "${item.optString("nickname", "该账号")}将设置为 $label。服务端会执行权限检查并记录操作。",
            confirmText = "确认",
            dismissible = !saving,
            loading = saving,
            onConfirm = { if (kind == "role") onUserRole(item.optString("id"), value) else onUserMembership(item.optString("id"), value); pendingUserUpdate = null },
            onCancel = { pendingUserUpdate = null },
        )
    }
}

data class AdminCenterState(
    val section: String = "overview",
    val items: List<JSONObject> = emptyList(),
    val metadata: JSONObject? = null,
    val overview: JSONObject? = null,
    val loading: Boolean = true,
    val saving: String? = null,
    val error: String? = null,
    val notice: String? = null,
    val adPosts: List<JSONObject> = emptyList(),
    val adPostsLoading: Boolean = false,
)

@dagger.hilt.android.lifecycle.HiltViewModel
class AdminCenterViewModel @javax.inject.Inject constructor(private val repository: HeikaRepository) : androidx.lifecycle.ViewModel() {
    private val mutableState = kotlinx.coroutines.flow.MutableStateFlow(AdminCenterState())
    val state = mutableState.asStateFlow()
    private var generation = 0
    private var adPostsGeneration = 0

    init { refresh() }
    fun select(section: String) { if (section in setOf("overview", "reports", "dm-reports", "posts", "ai", "ai-feedback", "comments", "appeals", "users", "user-feedback", "keywords", "audit", "categories", "topic-events", "recommendation-settings", "ai-settings", "ai-resource-types", "exploration-ad") && section != mutableState.value.section) { mutableState.value = mutableState.value.copy(section = section, items = emptyList(), metadata = null); refresh() } }
    fun refresh() = viewModelScope.launch {
        val requestId = ++generation
        mutableState.value = mutableState.value.copy(loading = true, error = null, notice = null)
        try {
            val overview = repository.adminOverview() // server authorization is checked on every admin request
            if (mutableState.value.section == "overview") {
                if (requestId == generation) mutableState.value = mutableState.value.copy(overview = overview, loading = false)
                return@launch
            }
            val result = when (mutableState.value.section) {
                "posts" -> repository.adminPosts(); "ai" -> repository.adminAiQueue(); "ai-feedback" -> repository.adminAiFeedback(); "comments" -> repository.adminComments()
                "dm-reports" -> repository.adminMessageReports(); "appeals" -> repository.adminAppeals(); "users" -> repository.adminUsers()
                "user-feedback" -> repository.adminUserFeedback(); "keywords" -> repository.adminKeywordRules(); "audit" -> repository.adminAudit()
                "categories" -> repository.adminCategories(); "topic-events" -> repository.adminTopicEvents(); "ai-resource-types" -> repository.adminAiResourceTypes()
                "recommendation-settings" -> repository.adminRecommendationSettings(); "ai-settings" -> repository.adminAiSettings(); "exploration-ad" -> repository.adminExplorationAd()
                else -> repository.adminReports()
            }
            if (requestId == generation) mutableState.value = mutableState.value.copy(overview = overview, items = (result.optJSONArray("items") ?: JSONArray()).toJSONObjectList(), metadata = result, loading = false)
        } catch (error: Exception) {
            if (requestId == generation) mutableState.value = mutableState.value.copy(loading = false, error = "管理员权限不足或队列加载失败，请重试")
        }
    }
    fun process(id: String, accepted: Boolean, note: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, error = null)
        try {
            when (mutableState.value.section) {
                "posts" -> repository.reviewAdminPost(id, accepted, note)
                "ai" -> repository.reviewAdminAi(id, accepted, note)
                "ai-feedback" -> repository.handleAdminAiFeedback(id, accepted, note)
                "user-feedback" -> repository.handleAdminUserFeedback(id, accepted, note)
                "comments" -> repository.setAdminCommentVisible(id, accepted, note)
                "dm-reports" -> repository.handleAdminMessageReport(id, accepted, note)
                "appeals" -> repository.reviewAdminAppeal(id, accepted, note)
                "users" -> repository.setAdminUserRestriction(id, accepted, note.ifBlank { "解除社区发言限制" })
                else -> repository.reviewAdminReport(id, accepted, note)
            }
            mutableState.value = mutableState.value.copy(saving = null, notice = if (accepted) "处理已保存" else "已拒绝")
            refresh()
        } catch (error: Exception) {
            mutableState.value = mutableState.value.copy(saving = null, error = "处理失败，请刷新后重试")
        }
    }

    fun addKeyword(keyword: String, onAdded: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "new-keyword", error = null)
        try { repository.createAdminKeywordRule(keyword); mutableState.value = mutableState.value.copy(saving = null, notice = "规则已添加"); onAdded(); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "添加规则失败，请检查内容或权限") }
    }

    fun setKeywordEnabled(id: String, enabled: Boolean) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, error = null)
        try { repository.setAdminKeywordEnabled(id, enabled); mutableState.value = mutableState.value.copy(saving = null, notice = if (enabled) "规则已启用" else "规则已暂停"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "更新规则失败，请重试") }
    }

    fun deleteKeyword(id: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, error = null)
        try { repository.deleteAdminKeywordRule(id); mutableState.value = mutableState.value.copy(saving = null, notice = "规则已删除"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "删除规则失败，请重试") }
    }

    fun createCategory(name: String, onCreated: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "category", error = null)
        try { repository.createAdminCategory(name); mutableState.value = mutableState.value.copy(saving = null, notice = "分类已创建"); onCreated(); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "分类创建失败，请检查名称或权限") }
    }

    fun setCategoryActive(id: Int, active: Boolean) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id.toString(), error = null)
        try { repository.setAdminCategoryActive(id, active); mutableState.value = mutableState.value.copy(saving = null, notice = "分类设置已保存"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "分类设置保存失败，请重试") }
    }

    fun updateAiResourceType(resourceType: String, label: String, description: String, enabled: Boolean, sortOrder: Int) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        val key = "ai-type-$resourceType"
        mutableState.value = mutableState.value.copy(saving = key, error = null, notice = null)
        try {
            repository.updateAdminAiResourceType(resourceType, label, description, enabled, sortOrder)
            mutableState.value = mutableState.value.copy(saving = null, notice = "AI 资源类型设置已保存")
            refresh()
        } catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "AI 资源类型保存失败，请确认权限与名称") }
    }

    fun createTopicEvent(topic: String, title: String, description: String, starts: String, ends: String, onCreated: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "topic-event", error = null)
        try {
            val payload = JSONObject().put("topic", topic).put("title", title.trim()).put("description", description.trim()).put("starts_at", starts).put("ends_at", ends).put("is_active", true)
            repository.saveAdminTopicEvent(payload)
            mutableState.value = mutableState.value.copy(saving = null, notice = "话题活动已创建")
            onCreated(); refresh()
        } catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "创建失败，请检查话题与时间格式") }
    }

    fun setTopicEventActive(event: JSONObject, active: Boolean) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        val topics = mutableState.value.metadata?.optJSONArray("topics") ?: JSONArray()
        val topicId = event.optInt("topic_id")
        val topic = (0 until topics.length()).mapNotNull { topics.optJSONObject(it) }.firstOrNull { it.optInt("id") == topicId }?.optString("name").orEmpty()
        if (topic.isBlank()) { mutableState.value = mutableState.value.copy(error = "活动话题不可用，请刷新"); return@launch }
        mutableState.value = mutableState.value.copy(saving = event.optString("id"), error = null)
        try {
            val payload = JSONObject().put("id", event.optString("id")).put("topic", topic).put("title", event.optString("title")).put("description", event.optString("description")).put("starts_at", event.optString("starts_at")).put("ends_at", event.optString("ends_at")).put("is_active", active)
            repository.saveAdminTopicEvent(payload)
            mutableState.value = mutableState.value.copy(saving = null, notice = if (active) "活动已上线" else "活动已下线")
            refresh()
        } catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "活动设置失败，请重试") }
    }

    fun saveRecommendationSettings(values: Map<String, Int>) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        if (values.values.any { it < 0 } || values.values.sum() != 5) { mutableState.value = mutableState.value.copy(error = "四类数量必须合计为 5"); return@launch }
        mutableState.value = mutableState.value.copy(saving = "recommendations", error = null)
        try { repository.saveAdminRecommendationSettings(JSONObject(values)); mutableState.value = mutableState.value.copy(saving = null, notice = "推荐配置已保存"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "保存失败，请检查管理员权限") }
    }

    fun saveExplorationAd(payload: JSONObject) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "exploration-ad", error = null, notice = null)
        try {
            repository.saveAdminExplorationAd(payload)
            mutableState.value = mutableState.value.copy(saving = null, notice = if (payload.optBoolean("enabled")) "广告位已保存并启用" else "广告位已保存并关闭")
            refresh()
        } catch (_: Exception) {
            mutableState.value = mutableState.value.copy(saving = null, error = "广告位保存失败，请检查作品编号和管理员权限")
        }
    }

    fun uploadExplorationAdImage(fileName: String, mimeType: String, bytes: ByteArray, onUploaded: (String) -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "exploration-ad-image", error = null, notice = null)
        try {
            val result = repository.uploadAdminExplorationAdImage(fileName, mimeType, bytes)
            val url = result.optString("image_url").takeIf { it.startsWith("https://") }
                ?: throw IllegalStateException("服务器没有返回有效图片地址")
            mutableState.value = mutableState.value.copy(saving = null, notice = "广告图片上传完成")
            onUploaded(url)
        } catch (error: Exception) {
            mutableState.value = mutableState.value.copy(saving = null, error = error.message ?: "广告图片上传失败，请重试")
        }
    }

    fun searchExplorationAdPosts(query: String) = viewModelScope.launch {
        if (mutableState.value.saving != null || mutableState.value.adPostsLoading) return@launch
        val requestId = ++adPostsGeneration
        mutableState.value = mutableState.value.copy(adPostsLoading = true, error = null)
        try {
            val result = repository.adminExplorationAdPosts(query)
            if (requestId == adPostsGeneration && mutableState.value.section == "exploration-ad") {
                mutableState.value = mutableState.value.copy(adPosts = (result.optJSONArray("items") ?: JSONArray()).toJSONObjectList(), adPostsLoading = false)
            }
        } catch (_: Exception) {
            if (requestId == adPostsGeneration) mutableState.value = mutableState.value.copy(adPosts = emptyList(), adPostsLoading = false, error = "作品搜索失败，请重试")
        }
    }

    fun saveAiKey(key: String, onSaved: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "ai-key", error = null)
        try { repository.saveAdminAiKey(key); mutableState.value = mutableState.value.copy(saving = null, notice = "AI 密钥已加密保存"); onSaved(); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "保存失败，请检查密钥格式或管理员权限") }
    }

    fun deleteAiKey() = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "ai-key", error = null)
        try { repository.deleteAdminAiKey(); mutableState.value = mutableState.value.copy(saving = null, notice = "AI 密钥已删除"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "删除 AI 密钥失败，请重试") }
    }

    fun setUserRole(id: String, role: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, error = null)
        try { repository.setAdminUserRole(id, role); mutableState.value = mutableState.value.copy(saving = null, notice = "账号角色已更新"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "角色更新失败，请确认管理员权限") }
    }

    fun setUserMembership(id: String, tier: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, error = null)
        try { repository.setAdminUserMembership(id, tier); mutableState.value = mutableState.value.copy(saving = null, notice = "会员等级已更新"); refresh() }
        catch (_: Exception) { mutableState.value = mutableState.value.copy(saving = null, error = "会员等级更新失败，请重试") }
    }
}

private fun JSONArray.toJSONObjectList(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

private fun readAdImage(context: Context, uri: Uri, maximumBytes: Int): Pair<String, ByteArray?>? {
    val mimeType = context.contentResolver.getType(uri) ?: return null
    val input = context.contentResolver.openInputStream(uri) ?: return null
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    input.use {
        while (true) {
            val read = it.read(buffer)
            if (read < 0) break
            if (output.size() + read > maximumBytes) return mimeType to null
            output.write(buffer, 0, read)
        }
    }
    return mimeType to output.toByteArray()
}
