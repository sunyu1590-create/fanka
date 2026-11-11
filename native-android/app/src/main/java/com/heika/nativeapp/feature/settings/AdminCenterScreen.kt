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
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("管理员中心", onBack, trailing = { androidx.compose.material3.IconButton(onClick = viewModel::refresh) { androidx.compose.material3.Icon(HeikaIcons.Retry, "刷新") } })
        Row(Modifier.fillMaxWidth().horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            listOf("reports" to "举报处理", "posts" to "内容审核", "ai" to "AI 审核", "ai-feedback" to "AI 反馈", "comments" to "评论", "appeals" to "申诉", "users" to "用户治理").forEach { (key, title) ->
                Text(title, Modifier.clickable { viewModel.select(key) }.padding(vertical = 12.dp), color = if (state.section == key) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, fontWeight = if (state.section == key) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
        state.error?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        state.notice?.let { Text(it, Modifier.padding(horizontal = 18.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
        if (state.loading && state.items.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        else if (state.items.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(if (state.error == null) "暂无待处理事项" else "无法读取管理队列", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (state.error != null) TextButton(onClick = viewModel::refresh) { Text("重试") }
        } else LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 8.dp)) {
            items(state.items, key = { it.optString("id") }) { item ->
                AdminQueueItem(item, state.section, state.saving == item.optString("id"), onAction = { publish, note -> viewModel.process(item.optString("id"), publish, note) })
            }
        }
    }
}

@Composable
private fun AdminQueueItem(item: JSONObject, section: String, saving: Boolean, onAction: (Boolean, String) -> Unit) {
    var note by remember(item.optString("id")) { mutableStateOf("") }
    val target = item.optJSONObject("target")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(when (section) { "reports" -> item.optString("reason", "举报"); "users" -> item.optString("nickname", "探索者"); "ai-feedback" -> item.optString("kind", "资源反馈"); else -> item.optString("title", item.optString("post_title", "待审核内容")) }, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(when (section) { "users" -> "${item.optString("role")} · ${item.optString("membership_tier")}"; "comments" -> item.optString("body"); "ai-feedback" -> item.optString("details"); else -> target?.optString("title").orEmpty().ifBlank { item.optString("body") }.ifBlank { item.optString("status") } }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
        if (section == "reports") Text("对象：${target?.optString("type").orEmpty()} · ${target?.optString("status").orEmpty()}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        if (section == "users") Text(if (item.optJSONObject("community_restriction")?.optBoolean("active") == true) "已限制发言" else "正常", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        OutlinedTextField(value = note, onValueChange = { note = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text("处理说明（至少 3 字）") }, maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !saving && (note.trim().length >= 3 || section == "comments"), onClick = { onAction(true, note) }) { Text(if (saving) "处理中…" else when (section) { "reports" -> "标记已处理"; "appeals" -> "接受申诉"; "users" -> "限制发言"; "comments" -> "恢复显示"; else -> "通过" }) }
            TextButton(enabled = !saving, onClick = { onAction(false, note) }) { Text(when (section) { "reports" -> "驳回"; "appeals" -> "驳回申诉"; "users" -> "解除限制"; "comments" -> "隐藏"; else -> "驳回" }) }
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
    fun select(section: String) { if (section in setOf("reports", "posts", "ai", "ai-feedback", "comments", "appeals", "users") && section != mutableState.value.section) { mutableState.value = mutableState.value.copy(section = section, items = emptyList()); refresh() } }
    fun refresh() = viewModelScope.launch {
        val requestId = ++generation
        mutableState.value = mutableState.value.copy(loading = true, error = null, notice = null)
        try {
            repository.adminOverview() // server authorization is checked on every admin request
            val result = when (mutableState.value.section) { "posts" -> repository.adminPosts(); "ai" -> repository.adminAiQueue(); "ai-feedback" -> repository.adminAiFeedback(); "comments" -> repository.adminComments(); "appeals" -> repository.adminAppeals(); "users" -> repository.adminUsers(); else -> repository.adminReports() }
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
                "comments" -> repository.setAdminCommentVisible(id, accepted, note)
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
}

private fun JSONArray.toJSONObjectList(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
