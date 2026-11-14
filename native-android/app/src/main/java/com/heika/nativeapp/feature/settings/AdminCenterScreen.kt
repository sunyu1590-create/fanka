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
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
    var pendingCodeDisable by remember { mutableStateOf<JSONObject?>(null) }
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
            if (state.section == "membership-support") AdminMembershipPanel(state, viewModel, onDisableCode = { pendingCodeDisable = it })
            else if (state.loading && state.items.isEmpty() && state.section !in adminConfigSections) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
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
    pendingCodeDisable?.let { code -> HeikaGlassDialog(
        title = "停用这张卡密？",
        message = "将停用末四位 ${code.optString("code_suffix")} 的未兑换卡密。已兑换卡密不会被修改。",
        confirmText = "停用卡密",
        destructive = true,
        loading = state.saving != null,
        onConfirm = { viewModel.disableMembershipCode(code.optString("id")); pendingCodeDisable = null },
        onCancel = { pendingCodeDisable = null },
    ) }
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
        AdminModuleSpec("membership-support", "会员与赞助", "卡密批次、会员状态、订单人工复核", com.heika.nativeapp.ui.HeikaIconRes.Medal),
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
    "topic-events" to "话题共创", "recommendation-settings" to "推荐配置", "ai-settings" to "AI 工作台", "ai-resource-types" to "AI 资源类型", "exploration-ad" to "发现页广告位", "membership-support" to "会员与赞助",
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
private fun AdminMembershipPanel(state: AdminCenterState, viewModel: AdminCenterViewModel, onDisableCode: (JSONObject) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var fileName by remember { mutableStateOf("HEIKA-membership-codes.txt") }
    val saveCodes = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        val text = state.generatedCodeText
        if (uri != null && !text.isNullOrBlank()) scope.launch(Dispatchers.IO) {
            runCatching { context.contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use { it.write(text) } ?: error("无法创建文件") }
                .onSuccess { viewModel.clearGeneratedMembershipCodes() }
                .onFailure { viewModel.reportMembershipError("卡密文件保存失败，请重新保存") }
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("codes" to "卡密", "members" to "会员", "orders" to "订单复核", "plans" to "方案").forEach { (key, label) ->
                TextButton(onClick = {
                    if (state.membershipTab != key) {
                        viewModel.selectMembershipTab(key)
                        HeikaNoticeBus.showSelection("会员管理：$label")
                    }
                }) { Text(label, color = if (state.membershipTab == key) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (state.membershipTab == key) FontWeight.SemiBold else FontWeight.Normal) }
            }
        }
        state.membershipError?.let { Text(it, Modifier.padding(horizontal = 18.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        state.membershipNotice?.let { Text(it, Modifier.padding(horizontal = 18.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
        if (state.membershipLoading && state.membershipBatches.isEmpty() && state.membershipTab == "codes") {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(9.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
            item {
                val summary = state.membershipSummary
                if (summary != null) {
                    val metrics = listOf("freeUsers" to "Free", "plusUsers" to "Plus", "proUsers" to "Pro", "generatedCodes" to "已生成", "availableCodes" to "可用卡密", "redeemedCodes" to "已兑换", "disabledCodes" to "已停用", "unverifiedOrders" to "待复核订单", "verifiedSupportCents" to "已核验赞助")
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        metrics.chunked(3).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            row.forEach { (key, label) ->
                                Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface).padding(8.dp)) {
                                    val value = if (key == "verifiedSupportCents") "¥%.2f".format(summary.optLong(key) / 100.0) else summary.optString(key, "0")
                                    Text(value, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1)
                                }
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
            }
            when (state.membershipTab) {
                "codes" -> {
                    item { MembershipCodeBatchForm(state, viewModel, onSave = { tier, days, batch -> fileName = "HEIKA-${tier.uppercase()}-${days}days-${batch.take(8)}.txt"; saveCodes.launch(fileName) }) }
                    item { Text("卡密批次", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 7.dp)) }
                    if (state.membershipBatches.isEmpty()) item { Text(if (state.membershipLoading) "正在读取卡密批次…" else "暂无卡密批次", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                    items(state.membershipBatches, key = { it.optString("id") }) { batch ->
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(batch.optString("name"), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text("${batch.optString("tier").uppercase()} · ${batch.optInt("duration_days")} 天 · ${batch.optInt("code_count")} 张 · 可用 ${batch.optInt("available_count")} / 已兑 ${batch.optInt("redeemed_count")} / 停用 ${batch.optInt("disabled_count")}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Text(batch.optString("export_label").takeIf(String::isNotBlank)?.let { "分发渠道：$it" } ?: "尚未分发", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            if (batch.optInt("available_count") > 0 && batch.optString("export_ref").isNotBlank()) TextButton(enabled = state.saving == null && state.generatedCodeText.isNullOrBlank(), onClick = { viewModel.exportMembershipBatch(batch.optString("id"), batch.optString("export_label"), batch.optString("export_ref")) { fileName = "HEIKA-codes-${batch.optString("export_ref")}.txt"; saveCodes.launch(fileName) } }) { Text("重新下载本批次明文") }
                            TextButton(onClick = { viewModel.toggleMembershipBatch(batch.optString("id")) }) { Text(if (state.membershipExpandedBatch == batch.optString("id")) "收起卡密状态" else "查看卡密状态") }
                            if (state.membershipExpandedBatch == batch.optString("id")) state.membershipCodes.forEach { code ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text("•••• ${code.optString("code_suffix")} · ${code.optString("tier").uppercase()} ${code.optInt("duration_days")}天 · ${when (code.optString("status")) { "available" -> "可兑换"; "redeemed" -> "已兑换"; else -> "已停用" }}", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                    if (code.optString("status") == "available") TextButton(enabled = state.saving == null, onClick = { onDisableCode(code) }) { Text("停用", color = MaterialTheme.colorScheme.error) }
                                }
                            }
                        }
                    }
                    if (!state.generatedCodeText.isNullOrBlank()) item { TextButton(onClick = { saveCodes.launch(fileName) }) { Text("重新保存本次新生成的卡密文件") } }
                }
                "members" -> item { MembershipUserAdmin(state, viewModel) }
                "plans" -> {
                    if (state.membershipPlans.isEmpty()) item { Text("方案数据加载中或暂不可用，请刷新重试。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                    items(state.membershipPlans, key = { it.optString("tier") }) { MembershipPlanAdminRow(it, state, viewModel) }
                }
                "orders" -> {
                    item { Text("爱发电自动核验尚未接入。仅依据后台可核实的订单信息人工复核；此操作不会自动兑换会员或发放卡密。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 17.sp) }
                    item { MembershipOrderIntake(state, viewModel) }
                    if (state.membershipOrders.isEmpty()) item { Text("暂无已接收的订单记录。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                    items(state.membershipOrders, key = { it.optString("id") }) { MembershipOrderAdminRow(it, state, viewModel) }
                }
            }
        }
    }
}

@Composable
private fun MembershipOrderIntake(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    var orderId by remember { mutableStateOf("") }; var plan by remember { mutableStateOf("") }; var amount by remember { mutableStateOf("") }; var note by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text("登记平台订单", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text("只建立待复核记录，不会将订单视作已付款，也不会发放会员。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        OutlinedTextField(orderId, { orderId = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("爱发电订单号") }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("方案", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            listOf("plus", "pro", "未知").forEach { value -> TextButton(onClick = { plan = if (value == "未知") "" else value }) { Text(if (value == "未知") value else value.uppercase(), color = if ((value == "未知" && plan.isBlank()) || plan == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) } }
        }
        OutlinedTextField(amount, { amount = it.filter(Char::isDigit).take(10) }, Modifier.fillMaxWidth(), label = { Text("金额（分，可空）") }, singleLine = true)
        OutlinedTextField(note, { note = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("登记依据（如平台页面核对情况）") }, minLines = 2)
        Button(enabled = state.saving == null && orderId.trim().length >= 3 && note.trim().length >= 3, onClick = { viewModel.recordMembershipOrder(orderId, plan, amount.toLongOrNull(), note) { orderId = ""; note = "" } }) { Text("登记为待复核") }
    }
}

@Composable
private fun MembershipCodeBatchForm(state: AdminCenterState, viewModel: AdminCenterViewModel, onSave: (String, Int, String) -> Unit) {
    var name by remember { mutableStateOf("") }; var tier by remember { mutableStateOf("plus") }; var days by remember { mutableStateOf("30") }; var count by remember { mutableStateOf("10") }; var channel by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text("生成一次性卡密", color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text("卡密明文只在生成响应中返回并短暂保存在本页内存；请立即保存到安全位置。每批只能绑定一个分发渠道。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp)
        OutlinedTextField(name, { name = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("批次名称") }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("会员档位", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            listOf("plus", "pro").forEach { option -> TextButton(onClick = { tier = option }) { Text(option.uppercase(), color = if (tier == option) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (tier == option) FontWeight.SemiBold else FontWeight.Normal) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            OutlinedTextField(days, { days = it.filter(Char::isDigit).take(4) }, Modifier.weight(1f), label = { Text("有效天数（1–7300）") }, singleLine = true)
            OutlinedTextField(count, { count = it.filter(Char::isDigit).take(4) }, Modifier.weight(1f), label = { Text("数量 1–1000") }, singleLine = true)
        }
        OutlinedTextField(channel, { channel = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("唯一分发渠道") }, placeholder = { Text("例如：爱发电商品 · ${tier.uppercase()} ${days} 天") }, singleLine = true)
        val daysValue = days.toIntOrNull() ?: 0; val countValue = count.toIntOrNull() ?: 0
        Button(enabled = state.saving == null && name.isNotBlank() && tier in setOf("plus", "pro") && daysValue in 1..7300 && countValue in 1..1000 && channel.trim().length in 2..120 && state.generatedCodeText.isNullOrBlank(), onClick = { viewModel.createMembershipBatch(name, tier, daysValue, countValue, channel) { batchId -> onSave(tier, daysValue, batchId); name = "" } }, modifier = Modifier.fillMaxWidth()) { Text(if (state.saving == "membership-batch") "生成中…" else "生成卡密并保存文件") }
    }
}

@Composable
private fun MembershipUserAdmin(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    var query by remember { mutableStateOf("") }; var selected by remember { mutableStateOf<JSONObject?>(null) }; var tier by remember { mutableStateOf("plus") }; var days by remember { mutableStateOf("30") }; var reason by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(query, { query = it.take(80) }, Modifier.weight(1f), label = { Text("按昵称搜索（至少 2 字）") }, singleLine = true)
            Button(enabled = query.trim().length >= 2 && state.saving == null, onClick = { viewModel.searchMembershipUsers(query) }) { Text("搜索") }
        }
        state.membershipUsers.forEach { user ->
            TextButton(onClick = { selected = user; tier = user.optString("membership_tier", "free") }) {
                Text("${user.optString("nickname", "探索者")} · ${user.optString("membership_tier").uppercase()} · 兑换 ${user.optJSONArray("redemptions")?.length() ?: 0} 次", color = MaterialTheme.colorScheme.onSurface)
            }
        }
        selected?.let { selectedUser ->
            val user = state.membershipUsers.firstOrNull { it.optString("id") == selectedUser.optString("id") } ?: selectedUser
            Text("${user.optString("nickname")} · 权益调整", color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
            Text("仅人工补发/撤销使用；操作原因会写入管理员审计。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("调整至", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                listOf("free", "plus", "pro").forEach { option -> TextButton(onClick = { tier = option }) { Text(option.uppercase(), color = if (tier == option) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (tier == option) FontWeight.SemiBold else FontWeight.Normal) } }
            }
            if (tier != "free") OutlinedTextField(days, { days = it.filter(Char::isDigit).take(4) }, Modifier.fillMaxWidth(), label = { Text("有效天数") }, singleLine = true)
            OutlinedTextField(reason, { reason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("操作原因（至少 3 字）") }, minLines = 2)
            Button(enabled = state.saving == null && reason.trim().length >= 3 && (tier == "free" || (days.toIntOrNull() ?: 0) in 1..7300), onClick = { viewModel.adjustMembership(user.optString("id"), tier, if (tier == "free") null else days.toIntOrNull() ?: 0, reason, query) }) { Text("保存会员状态") }
            val periods = user.optJSONArray("periods") ?: JSONArray(); val redemptions = user.optJSONArray("redemptions") ?: JSONArray()
            Text("会员周期与兑换记录", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            (0 until periods.length()).forEach { index -> periods.optJSONObject(index)?.let { period ->
                Text("${period.optString("tier").uppercase()} · ${period.optString("source")} · ${period.optString("starts_at").take(10)} 至 ${period.optString("ends_at").take(10).ifBlank { "长期" }}${if (period.optString("revoked_at").isNotBlank()) " · 已撤销：${period.optString("revoke_reason")}" else ""}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            } }
            (0 until redemptions.length()).forEach { index -> redemptions.optJSONObject(index)?.let { redemption -> Text("卡密兑换 ${redemption.optString("tier").uppercase()} · ${redemption.optInt("duration_days")} 天 · ${redemption.optString("created_at").take(10)} · 到期 ${redemption.optString("expires_at").take(10)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) } }
            if (periods.length() == 0 && redemptions.length() == 0) Text("暂无会员历史。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
        if (state.membershipUsers.isEmpty()) Text("搜索用户以查看会员状态与历史。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    }
}

@Composable
private fun MembershipPlanAdminRow(plan: JSONObject, state: AdminCenterState, viewModel: AdminCenterViewModel) {
    var flips by remember(plan) { mutableStateOf(plan.optInt("daily_flips").toString()) }; var cents by remember(plan) { mutableStateOf(plan.optInt("support_price_cents").toString()) }; var days by remember(plan) { mutableStateOf(plan.optInt("duration_days", 30).toString()) }; var enabled by remember(plan) { mutableStateOf(plan.optBoolean("enabled")) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(plan.optString("display_name", plan.optString("tier").uppercase()), color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { OutlinedTextField(flips, { flips = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), label = { Text("翻卡/日") }, singleLine = true); OutlinedTextField(cents, { cents = it.filter(Char::isDigit).take(7) }, Modifier.weight(1f), label = { Text("金额（分）") }, singleLine = true) }
        if (plan.optString("tier") != "free") OutlinedTextField(days, { days = it.filter(Char::isDigit).take(4) }, Modifier.fillMaxWidth(), label = { Text("期限（天）") }, singleLine = true)
        Row(verticalAlignment = Alignment.CenterVertically) { Text("启用方案", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant); androidx.compose.material3.Switch(enabled, { enabled = it }, enabled = state.saving == null && plan.optString("tier") != "free") }
        Button(enabled = state.saving == null, onClick = { viewModel.saveMembershipPlan(plan.optString("tier"), flips.toIntOrNull() ?: 0, cents.toIntOrNull() ?: -1, if (plan.optString("tier") == "free") null else days.toIntOrNull() ?: 0, enabled) }) { Text("保存方案") }
    }
}

@Composable
private fun MembershipOrderAdminRow(order: JSONObject, state: AdminCenterState, viewModel: AdminCenterViewModel) {
    var note by remember(order) { mutableStateOf("") }
    var pendingDecision by remember(order) { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(order.optString("provider_order_id"), color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        val amountText = if (order.isNull("amount_cents")) "金额未知" else "¥%.2f".format(order.optLong("amount_cents") / 100.0)
        Text("${order.optString("plan_id").ifBlank { "未映射方案" }} · ${order.optString("payment_status")} / ${order.optString("processing_status")} · $amountText", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        order.optString("issue_note").takeIf(String::isNotBlank)?.let { Text("上次说明：$it", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
        OutlinedTextField(note, { note = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("核对依据/处理说明") }, minLines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(modifier = Modifier.weight(1f), enabled = state.saving == null && note.trim().length >= 3, onClick = { viewModel.reviewMembershipOrder(order.optString("id"), "unverified", "needs_review", note) }) { Text("标为需复核") }
            TextButton(modifier = Modifier.weight(1f), enabled = state.saving == null && note.trim().length >= 10, onClick = { pendingDecision = "paid" }) { Text("确认已付款", color = MaterialTheme.colorScheme.primary) }
        }
        Text("退款状态只更新订单记录；如已发放会员权益，请另到会员用户页人工撤销并写明原因。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 14.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(modifier = Modifier.weight(1f), enabled = state.saving == null && note.trim().length >= 3, onClick = { pendingDecision = "failed" }) { Text("标记未付款/无效", color = MaterialTheme.colorScheme.error) }
            TextButton(modifier = Modifier.weight(1f), enabled = state.saving == null && note.trim().length >= 3, onClick = { pendingDecision = "refunded" }) { Text("标记已退款", color = MaterialTheme.colorScheme.error) }
        }
    }
    pendingDecision?.let { decision ->
        val paid = decision == "paid"
        HeikaGlassDialog(
            title = when (decision) { "paid" -> "确认订单已付款？"; "refunded" -> "确认订单已退款？"; else -> "标记订单无效？" },
            message = if (paid) "将根据你填写的核验依据更新赞助统计，不会自动发放会员或卡密。" else "只更新订单状态，不会自动撤销已发放的会员权益。",
            confirmText = if (paid) "确认核验" else "确认更新",
            destructive = !paid,
            loading = state.saving == order.optString("id"),
            onConfirm = {
                pendingDecision = null
                val (payment, processing) = when (decision) { "paid" -> "paid" to "verified"; "refunded" -> "refunded" to "ignored"; else -> "failed" to "ignored" }
                viewModel.reviewMembershipOrder(order.optString("id"), payment, processing, note)
            },
            onCancel = { pendingDecision = null },
        )
    }
}

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
    val membershipTab: String = "codes",
    val membershipLoading: Boolean = false,
    val membershipSummary: JSONObject? = null,
    val membershipBatches: List<JSONObject> = emptyList(),
    val membershipPlans: List<JSONObject> = emptyList(),
    val membershipOrders: List<JSONObject> = emptyList(),
    val membershipUsers: List<JSONObject> = emptyList(),
    val membershipCodes: List<JSONObject> = emptyList(),
    val membershipExpandedBatch: String? = null,
    val generatedCodeText: String? = null,
    val membershipError: String? = null,
    val membershipNotice: String? = null,
)

@dagger.hilt.android.lifecycle.HiltViewModel
class AdminCenterViewModel @javax.inject.Inject constructor(private val repository: HeikaRepository) : androidx.lifecycle.ViewModel() {
    private val mutableState = kotlinx.coroutines.flow.MutableStateFlow(AdminCenterState())
    val state = mutableState.asStateFlow()
    private var generation = 0
    private var adPostsGeneration = 0

    init { refresh() }
    fun select(section: String) { if (section in setOf("overview", "reports", "dm-reports", "posts", "ai", "ai-feedback", "comments", "appeals", "users", "user-feedback", "keywords", "audit", "categories", "topic-events", "recommendation-settings", "ai-settings", "ai-resource-types", "exploration-ad", "membership-support") && section != mutableState.value.section) { mutableState.value = mutableState.value.copy(section = section, items = emptyList(), metadata = null); refresh() } }
    fun refresh() = viewModelScope.launch {
        val requestId = ++generation
        mutableState.value = mutableState.value.copy(loading = true, membershipLoading = mutableState.value.section == "membership-support", error = null, notice = null, membershipError = if (mutableState.value.section == "membership-support") null else mutableState.value.membershipError)
        try {
            val overview = if (mutableState.value.section == "membership-support") mutableState.value.overview else repository.adminOverview() // each data API independently enforces admin authorization
            if (mutableState.value.section == "overview") {
                if (requestId == generation) mutableState.value = mutableState.value.copy(overview = overview, loading = false)
                return@launch
            }
            if (mutableState.value.section == "membership-support") {
                val data = coroutineScope {
                    val summary = async { repository.adminMembershipSummary() }
                    val batches = async { repository.adminMembershipBatches() }
                    val plans = async { repository.adminMembershipPlans() }
                    val orders = async { repository.adminMembershipOrders() }
                    listOf(summary.await(), batches.await(), plans.await(), orders.await())
                }
                if (requestId == generation) mutableState.value = mutableState.value.copy(
                    overview = overview,
                    membershipSummary = data[0],
                    membershipBatches = (data[1].optJSONArray("items") ?: JSONArray()).toJSONObjectList(),
                    membershipPlans = (data[2].optJSONArray("items") ?: JSONArray()).toJSONObjectList(),
                    membershipOrders = (data[3].optJSONArray("items") ?: JSONArray()).toJSONObjectList(),
                    membershipLoading = false,
                    loading = false,
                    membershipError = null,
                )
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
            if (requestId == generation) mutableState.value = mutableState.value.copy(loading = false, membershipLoading = false, error = if (mutableState.value.section == "membership-support") null else "管理员权限不足或队列加载失败，请重试", membershipError = if (mutableState.value.section == "membership-support") error.message ?: "会员管理数据加载失败，请检查权限或服务端配置" else mutableState.value.membershipError)
        }
    }

    fun selectMembershipTab(tab: String) { if (tab in setOf("codes", "members", "orders", "plans")) mutableState.value = mutableState.value.copy(membershipTab = tab, membershipError = null, membershipNotice = null) }

    fun createMembershipBatch(name: String, tier: String, days: Int, count: Int, channel: String, onCreated: (String) -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-batch", membershipError = null, membershipNotice = null)
        try {
            val result = repository.createAdminMembershipBatch(name, tier, days, count, channel)
            val batch = result.optJSONObject("batch") ?: throw IllegalStateException("服务器未返回卡密批次")
            val codes = result.optJSONArray("codes") ?: throw IllegalStateException("服务器未返回卡密，请检查生成结果")
            val text = (0 until codes.length()).joinToString(separator = "\n", postfix = "\n") { codes.optString(it) }
            if (text.isBlank()) throw IllegalStateException("服务器返回的卡密为空")
            mutableState.value = mutableState.value.copy(saving = null, generatedCodeText = text, membershipNotice = result.optString("warning").ifBlank { "卡密已生成，请立即保存文件。" })
            onCreated(batch.optString("id"))
            refresh()
        } catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "卡密批次生成失败") }
    }

    fun clearGeneratedMembershipCodes() { mutableState.value = mutableState.value.copy(generatedCodeText = null, membershipNotice = "卡密文本已保存到所选位置。请妥善保管。") }
    fun reportMembershipError(message: String) { mutableState.value = mutableState.value.copy(membershipError = message) }

    fun exportMembershipBatch(batchId: String, label: String, exportRef: String, onReady: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-export", membershipError = null)
        try {
            val text = repository.exportAdminMembershipBatch(batchId, label, exportRef)
            mutableState.value = mutableState.value.copy(saving = null, generatedCodeText = text, membershipNotice = "卡密明文仅在本页内存暂存，请立即保存到安全位置。")
            onReady()
        } catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "卡密导出失败") }
    }

    fun toggleMembershipBatch(batchId: String) = viewModelScope.launch {
        if (mutableState.value.membershipExpandedBatch == batchId) { mutableState.value = mutableState.value.copy(membershipExpandedBatch = null, membershipCodes = emptyList()); return@launch }
        mutableState.value = mutableState.value.copy(saving = "membership-codes", membershipError = null)
        try {
            val result = repository.adminMembershipBatchCodes(batchId)
            mutableState.value = mutableState.value.copy(saving = null, membershipExpandedBatch = batchId, membershipCodes = (result.optJSONArray("items") ?: JSONArray()).toJSONObjectList())
        } catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "读取卡密状态失败") }
    }

    fun disableMembershipCode(codeId: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = codeId, membershipError = null)
        try {
            repository.disableAdminMembershipCode(codeId)
            val batchId = mutableState.value.membershipExpandedBatch
            val codes = if (batchId != null) runCatching { repository.adminMembershipBatchCodes(batchId) }.getOrNull() else null
            mutableState.value = mutableState.value.copy(
                saving = null,
                membershipNotice = if (codes == null && batchId != null) "卡密已停用；状态列表刷新失败，请重新打开批次核对。" else "卡密已停用",
                membershipCodes = codes?.let { (it.optJSONArray("items") ?: JSONArray()).toJSONObjectList() } ?: mutableState.value.membershipCodes,
            )
            refresh()
        }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "停用卡密失败") }
    }

    fun searchMembershipUsers(query: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-search", membershipError = null, membershipUsers = emptyList())
        try { val result = repository.adminMembershipUsers(query); mutableState.value = mutableState.value.copy(saving = null, membershipUsers = (result.optJSONArray("items") ?: JSONArray()).toJSONObjectList()) }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "搜索会员用户失败") }
    }

    fun adjustMembership(userId: String, tier: String, days: Int?, reason: String, query: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-user", membershipError = null)
        try {
            repository.adjustAdminMembership(userId, tier, days, reason)
            val refreshedUsers = runCatching { repository.adminMembershipUsers(query) }.getOrNull()
            mutableState.value = mutableState.value.copy(
                saving = null,
                membershipNotice = if (refreshedUsers == null) "会员状态已保存；历史列表未刷新，请重新搜索核对。" else "会员状态已更新并写入审计",
                membershipError = null,
                membershipUsers = refreshedUsers?.let { (it.optJSONArray("items") ?: JSONArray()).toJSONObjectList() } ?: mutableState.value.membershipUsers,
            )
            refresh()
        }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "会员调整失败") }
    }

    fun saveMembershipPlan(tier: String, flips: Int, cents: Int, days: Int?, enabled: Boolean) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-plan-$tier", membershipError = null)
        try { repository.updateAdminMembershipPlan(tier, flips, cents, days, enabled); mutableState.value = mutableState.value.copy(saving = null, membershipNotice = "$tier 方案已保存"); refresh() }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "方案保存失败") }
    }

    fun reviewMembershipOrder(id: String, paymentStatus: String, processingStatus: String, note: String) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = id, membershipError = null)
        try { repository.reviewAdminMembershipOrder(id, paymentStatus, processingStatus, note); mutableState.value = mutableState.value.copy(saving = null, membershipNotice = if (paymentStatus == "paid") "订单人工核验已记录；没有自动发放会员或卡密。" else "订单已标记为待复核"); refresh() }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "订单复核失败") }
    }

    fun recordMembershipOrder(orderId: String, planId: String, amountCents: Long?, note: String, onSaved: () -> Unit) = viewModelScope.launch {
        if (mutableState.value.saving != null) return@launch
        mutableState.value = mutableState.value.copy(saving = "membership-order", membershipError = null)
        try { repository.recordAdminMembershipOrder(orderId, planId.trim().ifBlank { null }, amountCents, note); mutableState.value = mutableState.value.copy(saving = null, membershipNotice = "订单已登记为待复核；未发放会员权益"); onSaved(); refresh() }
        catch (error: Exception) { mutableState.value = mutableState.value.copy(saving = null, membershipError = error.message ?: "订单登记失败") }
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
