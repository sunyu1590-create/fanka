package com.heika.nativeapp.feature.search

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.heika.nativeapp.ui.FilterChip

@Composable
fun SearchScreen(onBack: () -> Unit, onPost: (HeikaPost) -> Unit, onProfile: (String) -> Unit, viewModel: SearchViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("搜索", onBack)
        Row(Modifier.fillMaxWidth().padding(horizontal = 17.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = state.query, onValueChange = viewModel::setQuery, modifier = Modifier.weight(1f), placeholder = { Text("搜索标题、正文或用户") }, singleLine = true)
            Button(onClick = viewModel::search, enabled = state.query.isNotBlank() && !state.loading) { Icon(Icons.Outlined.Search, "搜索") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip("内容", state.kind == "content", { viewModel.setKind("content") })
            FilterChip("用户", state.kind == "people", { viewModel.setKind("people") })
        }
        state.error?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 7.dp), color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
        if (state.loading) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        else if (state.kind == "people") {
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                items(state.people, key = { it.id }) { person ->
                    Row(Modifier.fillMaxWidth().clickable { onProfile(person.id) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        if (person.avatar != null) AsyncImage(person.avatar, "${person.name}头像", Modifier.size(44.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                        else Text(person.name.take(1), Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface).padding(top = 11.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column {
                            Text(person.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text(person.bio.ifBlank { "黑卡用户" }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (state.people.isEmpty() && state.query.isNotBlank()) item { Text("没有找到匹配用户。", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 5.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.posts, key = { "${it.id}:${it.cloudId}" }) { post ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable { onPost(post) }.padding(9.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        post.thumbnail?.let { AsyncImage(it, post.title, Modifier.size(80.dp).clip(RoundedCornerShape(9.dp)), contentScale = ContentScale.Crop) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(post.tag, color = MaterialTheme.colorScheme.primary, fontSize = 9.sp)
                            Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(post.body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (state.posts.isEmpty() && state.query.isNotBlank()) item { Text("没有找到相关内容。", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
            }
        }
    }
}
