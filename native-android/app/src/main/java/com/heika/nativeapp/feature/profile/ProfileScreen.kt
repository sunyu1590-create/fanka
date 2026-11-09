package com.heika.nativeapp.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader

@Composable
fun ProfileScreen(
    userId: String?,
    onBack: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    onDraft: (HeikaPost) -> Unit,
    onSettings: () -> Unit,
    onMembership: () -> Unit,
    onMessage: (String) -> Unit,
    onLogin: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selected by remember(userId) { mutableStateOf("作品") }
    var nickname by remember(state.profile?.id) { mutableStateOf(state.profile?.nickname.orEmpty()) }
    var bio by remember(state.profile?.id) { mutableStateOf(state.profile?.bio.orEmpty()) }
    LaunchedEffect(userId) { viewModel.load(userId) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader(if (userId == null) "我的" else "用户主页", onBack, trailing = if (userId == null) ({
            Text("设置", Modifier.clickable(onClick = onSettings).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
        }) else null)
        if (state.loading && state.profile == null) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        } else if (state.profile == null) {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(state.error ?: "主页暂不可用", color = MaterialTheme.colorScheme.onSurfaceVariant)
                val needsLogin = state.error?.contains("登录") == true
                Button(onClick = {
                    if (needsLogin) onLogin() else viewModel.load(userId)
                    Unit
                }) { Text(if (needsLogin) "登录" else "重试") }
            }
        } else {
            val profile = state.profile!!
            LazyColumn(contentPadding = PaddingValues(start = 20.dp, top = 7.dp, end = 20.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        AsyncImage(model = profile.avatar, contentDescription = "${profile.nickname}头像", contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface))
                        Column(Modifier.weight(1f)) {
                            Text(profile.nickname, color = MaterialTheme.colorScheme.onBackground, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                            Text(profile.bio.ifBlank { "分享值得留下的发现。" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                            Text("HEIKA ID · ${profile.id.take(8).uppercase()}", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .75f), fontSize = 9.sp, modifier = Modifier.padding(top = 7.dp))
                        }
                        if (userId == null) Text("${profile.tier.uppercase()} 会员", Modifier.clickable(onClick = onMembership).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface).padding(10.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    }
                }
                if (state.own) {
                    item {
                        OutlinedTextField(value = nickname, onValueChange = { nickname = it.take(24) }, label = { Text("昵称") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                    item {
                        OutlinedTextField(value = bio, onValueChange = { bio = it.take(80) }, label = { Text("简介") }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 3)
                    }
                    item {
                        Button(onClick = { viewModel.updateProfile(nickname, bio) }, enabled = !state.saving && nickname.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(if (state.saving) "保存中…" else "保存资料") }
                    }
                } else {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            Button(onClick = viewModel::toggleFollow, modifier = Modifier.weight(1f)) { Text(if (state.following) "已关注 · ${state.followerCount}" else "关注 · ${state.followerCount}") }
                            Button(onClick = { onMessage(profile.id) }, modifier = Modifier.weight(1f)) { Text("发私信") }
                        }
                    }
                }
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) } }
                item {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(4.dp)) {
                        buildList {
                            add("作品" to state.posts.size)
                            add("收藏" to state.bookmarks.size)
                            if (state.own) add("草稿" to state.drafts.size)
                        }.forEach { (label, count) ->
                            Column(Modifier.weight(1f).clickable { selected = label }.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(label, color = if (selected == label) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = if (selected == label) FontWeight.SemiBold else FontWeight.Normal)
                                Text("$count", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            }
                        }
                    }
                }
                val posts = when (selected) { "草稿" -> state.drafts; "收藏" -> state.bookmarks; else -> state.posts }
                if (posts.isEmpty()) item {
                    Text(
                        when (selected) { "作品" -> "还没有公开作品。"; "草稿" -> "还没有未完成的草稿。"; else -> "还没有可见收藏。" },
                        Modifier.padding(vertical = 22.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp,
                    )
                }
                items(posts, key = { "${selected}:${it.id}:${it.cloudId}" }) { post ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).clickable { if (selected == "草稿") onDraft(post) else onPost(post) }.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (post.thumbnail != null) AsyncImage(model = post.thumbnail, contentDescription = post.title, contentScale = ContentScale.Crop, modifier = Modifier.size(82.dp).clip(RoundedCornerShape(10.dp)))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(post.tag, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                            Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(post.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}
