package com.heika.nativeapp.feature.profile

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import com.heika.nativeapp.ui.HeikaAlertDialog

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.rememberScrollState
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
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.ui.BackHeader
import androidx.compose.ui.zIndex
import androidx.compose.foundation.layout.offset
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaAvatar
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaGlassDialog
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import com.heika.nativeapp.ui.HeikaPulsePage
import com.heika.nativeapp.ui.HeikaPulseRow

@Composable
fun ManageWorksScreen(
    onBack: () -> Unit,
    onEdit: (HeikaPost) -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var deleteTarget by remember { mutableStateOf<HeikaPost?>(null) }
    LaunchedEffect(Unit) { if (state.profile == null) viewModel.load(null) }
    val allWorks = state.posts + state.drafts

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("作品管理", onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 110.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Text("删除操作会同步移除作品及其关联图片。草稿和审核中的作品可以继续编辑。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(bottom = 7.dp))
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp, modifier = Modifier.padding(bottom = 6.dp)) }
                state.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, modifier = Modifier.padding(bottom = 6.dp)) }
            }
            items(allWorks.size, key = { allWorks[it].cloudId.ifBlank { allWorks[it].id.toString() } }) { index ->
                val post = allWorks[index]
                val status = runCatching { JSONObject(post.rawJson).optString("status") }.getOrDefault("")
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(post.title.ifBlank { "未命名内容" }, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2)
                        Text(when (status) { "draft" -> "草稿"; "pending_review" -> "审核中"; else -> "已发布" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                    // 已发布作品也可编辑：编辑器会进入“修改作品”模式，提交后按站点规则送审。
                    TextButton(onClick = { onEdit(post) }, enabled = !state.saving) { Text("编辑") }
                    TextButton(onClick = { deleteTarget = post }, enabled = !state.saving) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (allWorks.isEmpty() && !state.loading) item { Text("暂无可管理的作品", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(vertical = 26.dp)) }
            if (state.loading) item { HeikaPulseRow(Modifier.padding(vertical = 8.dp), height = 56.dp) }
        }
    }
    deleteTarget?.let { post ->
        HeikaGlassDialog(
            title = "删除这篇作品？",
            message = "“${post.title.ifBlank { "未命名内容" }}”将从账号中删除。此操作不可撤销。",
            confirmText = "删除",
            destructive = true,
            loading = state.saving,
            onConfirm = { viewModel.deleteOwnPost(post); deleteTarget = null },
            onCancel = { deleteTarget = null },
        )
    }
}
