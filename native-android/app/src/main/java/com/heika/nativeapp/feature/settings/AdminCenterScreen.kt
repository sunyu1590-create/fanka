package com.heika.nativeapp.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaIcons
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun AdminCenterScreen(onBack: () -> Unit, viewModel: AdminCenterViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var keywordDraft by remember { mutableStateOf("") }
    var pendingKeywordDelete by remember { mutableStateOf<JSONObject?>(null) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("管理员中心", onBack, trailing = { androidx.compose.material3.IconButton(onClick = viewModel::refresh) { androidx.compose.material3.Icon(HeikaIcons.Retry, "刷新") } })
        Row(Modifier.fillMaxWidth().horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            listOf("reports" to "举报处理", "dm-reports" to "私信举报", "posts" to "内容审核", "ai" to "AI 审核", "ai-feedback" to "AI 反馈", "comments" to "评论", "appeals" to "申诉", "users" to "用户治理", "user-feedback" to "用户反馈", "keywords" to "关键词规则", "audit" to "操作记录").forEach { (key, title) ->
                Text(title, Modifier.clickable { viewModel.select(key) }.padding(vertical = 12.dp), color = if (state.section == key) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, fontWeight = if (state.section == key) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
        state.error?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        state.notice?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
        if (state.loading && state.items.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        else if (state.items.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(if (state.error == null) "暂无待处理事项" else "无法读取管理队列", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (state.error != null) TextButton(onClick = viewModel::refresh) { Text("重试") }
        } else if (state.section == "audit") LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
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
                AdminQueueItem(item, state.section, state.saving == item.optString("id"), onAction = { publish, note -> viewModel.process(item.optString("id"), publish, note) })
            }
        }
    }
    pendingKeywordDelete?.let { rule ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pendingKeywordDelete = null },
            title = { Text("删除关键词规则？") },
            text = { Text("“${rule.optString("keyword")}”将不再被服务端拦截。") },
            confirmButton = { TextButton(enabled = state.saving == null, onClick = { viewModel.deleteKeyword(rule.optString("id")); pendingKeywordDelete = null }) { Text("删除") } },
            dismissButton = { TextButton(onClick = { pendingKeywordDelete = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun AdminQueueItem(item: JSONObject, section: String, saving: Boolean, onAction: (Boolean, String) -> Unit) {
    var note by remember(item.optString("id")) { mutableStateOf("") }
    val target = item.optJSONObject("target")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(when (section) { "reports", "dm-reports" -> item.optString("reason", "举报"); "users" -> item.optString("nickname", "探索者"); "ai-feedback" -> item.optString("kind", "资源反馈"); "user-feedback" -> item.optString("category", "用户反馈"); else -> item.optString("title", item.optString("post_title", "待审核内容")) }, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(when (section) { "users" -> "${item.optString("role")} · ${item.optString("membership_tier")}"; "comments" -> item.optString("body"); "ai-feedback" -> item.optString("details"); "user-feedback" -> item.optString("message"); else -> target?.optString("title").orEmpty().ifBlank { item.optString("body") }.ifBlank { item.optString("status") } }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
        if (section == "reports") Text("对象：${target?.optString("type").orEmpty()} · ${target?.optString("status").orEmpty()}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        if (section == "users") Text(if (item.optJSONObject("community_restriction")?.optBoolean("active") == true) "已限制发言" else "正常", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        OutlinedTextField(value = note, onValueChange = { note = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text("处理说明（至少 3 字）") }, maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !saving && (note.trim().length >= 3 || section == "comments" || section == "user-feedback"), onClick = { onAction(true, note) }) { Text(if (saving) "处理中…" else when (section) { "reports", "dm-reports" -> "标记已处理"; "user-feedback" -> "标记已解决"; "appeals" -> "接受申诉"; "users" -> "限制发言"; "comments" -> "恢复显示"; else -> "通过" }) }
            TextButton(enabled = !saving && (note.trim().length >= 3 || section == "user-feedback"), onClick = { onAction(false, note) }) { Text(when (section) { "reports", "dm-reports" -> "驳回"; "user-feedback" -> "忽略反馈"; "appeals" -> "驳回申诉"; "users" -> "解除限制"; "comments" -> "隐藏"; else -> "驳回" }) }
        }
    }
}

data class AdminCenterState(
    val section: String = "reports",
    val items: List<JSONObject> = emptyList(),
    val loading: Boolean = true,
    val saving: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

@dagger.hilt.android.lifecycle.HiltViewModel
class AdminCenterViewModel @javax.inject.Inject constructor(private val repository: HeikaRepository) : androidx.lifecycle.ViewModel() {
    private val mutableState = kotlinx.coroutines.flow.MutableStateFlow(AdminCenterState())
    val state = mutableState.asStateFlow()
    private var generation = 0

    init { refresh() }
    fun select(section: String) { if (section in setOf("reports", "dm-reports", "posts", "ai", "ai-feedback", "comments", "appeals", "users", "user-feedback", "keywords", "audit") && section != mutableState.value.section) { mutableState.value = mutableState.value.copy(section = section, items = emptyList()); refresh() } }
    fun refresh() = viewModelScope.launch {
        val requestId = ++generation
        mutableState.value = mutableState.value.copy(loading = true, error = null, notice = null)
        try {
            repository.adminOverview() // server authorization is checked on every admin request
            val result = when (mutableState.value.section) { "posts" -> repository.adminPosts(); "ai" -> repository.adminAiQueue(); "ai-feedback" -> repository.adminAiFeedback(); "comments" -> repository.adminComments(); "dm-reports" -> repository.adminMessageReports(); "appeals" -> repository.adminAppeals(); "users" -> repository.adminUsers(); "user-feedback" -> repository.adminUserFeedback(); "keywords" -> repository.adminKeywordRules(); "audit" -> repository.adminAudit(); else -> repository.adminReports() }
            if (requestId == generation) mutableState.value = mutableState.value.copy(items = (result.optJSONArray("items") ?: JSONArray()).toJSONObjectList(), loading = false)
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
}

private fun JSONArray.toJSONObjectList(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
