package com.heika.nativeapp.feature.profile

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
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import com.heika.nativeapp.ui.HeikaAvatar
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

@Composable
fun EditProfileScreen(onBack: () -> Unit, viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val profile = state.profile
    var nickname by remember(profile?.id) { mutableStateOf(profile?.nickname.orEmpty()) }
    var bio by remember(profile?.id) { mutableStateOf(profile?.bio.orEmpty()) }
    val attributes = state.profileAttributes
    var gender by remember(profile?.id, attributes) { mutableStateOf(attributes.gender) }
    var mbti by remember(profile?.id, attributes) { mutableStateOf(attributes.mbti) }
    var birthday by remember(profile?.id, attributes) { mutableStateOf(attributes.birthday) }
    var hobbies by remember(profile?.id, attributes) { mutableStateOf(attributes.hobbies.joinToString("，")) }
    var visibility by remember(profile?.id, attributes) { mutableStateOf(attributes.visibility) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                        require(mime in setOf("image/jpeg", "image/png", "image/webp")) { "头像仅支持 JPEG、PNG 或 WebP" }
                        val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
                            val output = ByteArrayOutputStream()
                            val buffer = ByteArray(8 * 1024)
                            var total = 0
                            while (true) {
                                val read = input.read(buffer)
                                if (read < 0) break
                                total += read
                                require(total <= 2 * 1024 * 1024) { "头像图片不能超过 2 MB" }
                                output.write(buffer, 0, read)
                            }
                            output.toByteArray()
                        } ?: error("无法读取所选图片")
                        val extension = when (mime) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
                        Triple("avatar.$extension", mime, bytes)
                    }
                }
                result.onSuccess { (name, mime, bytes) -> viewModel.updateAvatar(name, mime, bytes) }
                    .onFailure { error -> viewModel.reportError(error.message ?: "无法读取所选图片") }
            }
        }
    }
    LaunchedEffect(Unit) { if (state.profile == null) viewModel.load(null) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("编辑资料", onBack)
        if (profile == null && state.loading) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        } else if (profile != null) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        HeikaAvatar(profile.avatar, profile.nickname, 88.dp, contentDescription = "个人头像", modifier = Modifier.clickable { imagePicker.launch("image/*") })
                        Text("更换头像 · JPEG / PNG / WebP，最大 2 MB", Modifier.clickable { imagePicker.launch("image/*") }.padding(10.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                    }
                }
                item { OutlinedTextField(nickname, { nickname = it.take(24) }, label = { Text("昵称") }, supportingText = { Text("1–24 个字符") }, modifier = Modifier.fillMaxWidth(), singleLine = true) }
                item { OutlinedTextField(bio, { bio = it.take(80) }, label = { Text("简介") }, supportingText = { Text("最多 80 个字符") }, modifier = Modifier.fillMaxWidth(), minLines = 3, maxLines = 4) }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("更多资料", color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Text("选择公开的资料会显示在你的个人主页。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        Text("性别", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("female" to "女", "male" to "男", "nonbinary" to "非二元", "undisclosed" to "不愿透露").forEach { (value, label) ->
                                androidx.compose.material3.FilterChip(
                                    selected = gender == value,
                                    onClick = { gender = if (gender == value) "" else value },
                                    label = { Text(label, fontSize = 11.sp) },
                                )
                            }
                        }
                        ProfileAttributeVisibility("公开性别", visibility["gender"] == true) { visibility = visibility + ("gender" to it) }
                        OutlinedTextField(
                            value = mbti,
                            onValueChange = { mbti = it.filter(Char::isLetter).uppercase().take(4) },
                            label = { Text("MBTI") },
                            supportingText = { Text("例如 INFP、ENTJ；留空表示不填写") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        ProfileAttributeVisibility("公开 MBTI", visibility["mbti"] == true) { visibility = visibility + ("mbti" to it) }
                        OutlinedTextField(
                            value = birthday,
                            onValueChange = { birthday = it.filter { char -> char.isDigit() || char == '-' }.take(10) },
                            label = { Text("生日") },
                            supportingText = { Text("格式：YYYY-MM-DD") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        ProfileAttributeVisibility("公开生日", visibility["birthday"] == true) { visibility = visibility + ("birthday" to it) }
                        OutlinedTextField(
                            value = hobbies,
                            onValueChange = { hobbies = it.take(180) },
                            label = { Text("兴趣爱好") },
                            supportingText = { Text("用逗号分隔，最多 8 项，每项不超过 20 字") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 2,
                            maxLines = 3,
                        )
                        ProfileAttributeVisibility("公开兴趣爱好", visibility["hobbies"] == true) { visibility = visibility + ("hobbies" to it) }
                    }
                }
                item { Text("HEIKA ID · ${profile.id}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
                item { state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) } }
                item { state.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) } }
                item {
                    val hobbyItems = hobbies.split(',', '，', ';', '；').map(String::trim).filter(String::isNotBlank).distinct().take(8)
                    val validMbti = mbti.isBlank() || mbti in setOf(
                        "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
                        "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
                    )
                    val details = JSONArray().apply {
                        put(JSONObject().put("attribute", "gender").put("value", gender).put("is_public", visibility["gender"] == true))
                        put(JSONObject().put("attribute", "mbti").put("value", mbti).put("is_public", visibility["mbti"] == true))
                        put(JSONObject().put("attribute", "birthday").put("value", birthday).put("is_public", visibility["birthday"] == true))
                        put(JSONObject().put("attribute", "hobbies").put("value", JSONArray(hobbyItems)).put("is_public", visibility["hobbies"] == true))
                    }
                    Button(onClick = { viewModel.updateProfile(nickname, bio, details) }, enabled = !state.saving && nickname.trim().length in 1..24 && bio.length <= 80 && validMbti, modifier = Modifier.fillMaxWidth()) { if (state.saving) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Text("保存资料") }
                }
            }
        } else {
            Text(state.error ?: "资料暂不可用", Modifier.padding(22.dp), color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun ProfileAttributeVisibility(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

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
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 10.dp, end = 20.dp, bottom = 110.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                    if (status == "draft" || status == "pending_review") {
                        TextButton(onClick = { onEdit(post) }, enabled = !state.saving) { Text("编辑") }
                    }
                    TextButton(onClick = { deleteTarget = post }, enabled = !state.saving) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (allWorks.isEmpty() && !state.loading) item { Text("暂无可管理的作品", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(vertical = 26.dp)) }
            if (state.loading) item { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
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
