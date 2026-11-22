package com.heika.nativeapp.feature.decor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.heika.nativeapp.data.DecorThemeItem
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaNoticeBus

private val TABS = listOf(
    "official" to "官方精选",
    "community" to "玩家工坊",
    "mine" to "我的装扮",
    "submissions" to "我的投稿",
    "studio" to "工作室",
)

private val STATUS_LABEL = mapOf(
    "pending" to "审核中",
    "approved" to "已上架",
    "rejected" to "需修改",
    "delisted" to "已下架",
)

/**
 * 创意工坊（需求 6.1）：官方预设 / 玩家工坊 / 我的装扮 / 我的投稿 / 工作室，
 * 全部原生实现，不再跳转网页。
 */
@Composable
fun DecorCenterScreen(
    initialTab: String = "official",
    studioKind: String = "bottom",
    onBack: () -> Unit,
) {
    val viewModel: DecorCenterViewModel = hiltViewModel()
    val official by viewModel.official.collectAsState()
    val community by viewModel.community.collectAsState()
    val mine by viewModel.mine.collectAsState()
    val busy by viewModel.busy.collectAsState()
    var tab by remember { mutableStateOf(initialTab) }
    var detail by remember { mutableStateOf<DecorThemeItem?>(null) }
    var submitOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.load("official")
        viewModel.notice.collect { HeikaNoticeBus.showSelection(it) }
    }

    Column(Modifier.fillMaxSize().background(Color(0xFF0B0D0F))) {
        BackHeader("装扮中心", onBack)

        // 标签栏
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TABS.forEach { (id, label) ->
                val active = tab == id
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) Color(0xFFC9A961) else Color(0x14FFFFFF))
                        .clickable {
                            tab = id
                            detail = null
                            if (id == "community") viewModel.load("community")
                            if (id == "mine" || id == "submissions") viewModel.load("mine")
                        }
                        .padding(horizontal = 13.dp, vertical = 7.dp),
                ) {
                    Text(label, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 11.5.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }

        Box(Modifier.weight(1f)) {
            when (tab) {
                "official" -> ThemeList(official, emptyMessage = "暂无官方预设", onOpen = { detail = it }, onFavorite = { viewModel.toggleFavorite(it) })
                "community" -> ThemeList(community, emptyMessage = "玩家工坊暂时空空的，投稿你的第一套装扮吧", onOpen = { detail = it }, onFavorite = { viewModel.toggleFavorite(it) })
                "mine" -> ThemeList(
                    mine,
                    emptyMessage = "还没有保存的装扮方案",
                    onOpen = { detail = it },
                    onFavorite = { viewModel.toggleFavorite(it) },
                    onWithdraw = { viewModel.withdraw(it) },
                )
                "submissions" -> ThemeList(
                    mine,
                    emptyMessage = "还没有投稿。到工作室调好装扮后投稿，通过审核就能上架",
                    onOpen = { detail = it },
                    onFavorite = { viewModel.toggleFavorite(it) },
                    onWithdraw = { viewModel.withdraw(it) },
                    showStatus = true,
                )
                else -> Column(Modifier.fillMaxSize()) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("工作室", color = Color(0xFFF2E7C8), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        TextButton(onClick = { submitOpen = true }) { Text("投稿当前方案", color = Color(0xFFC9A961), fontSize = 11.5.sp) }
                    }
                    DecorStudioContent(viewModel, initialKind = studioKind)
                }
            }
        }
    }

    // 主题详情（预览 + 应用）
    detail?.let { item ->
        ThemeDetailOverlay(
            item = item,
            busy = busy,
            onBack = { detail = null },
            onApply = {
                viewModel.applyTheme(item)
                detail = null
            },
            onFavorite = { viewModel.toggleFavorite(item) },
            onWithdraw = {
                viewModel.withdraw(item)
                detail = null
            },
        )
    }

    if (submitOpen) {
        SubmitThemeDialog(
            busy = busy,
            onClose = { submitOpen = false },
            onSubmit = { title, description, tags, kind ->
                viewModel.submit(title, description, tags, kind) { ok ->
                    if (ok) {
                        submitOpen = false
                        tab = "submissions"
                    }
                }
            },
        )
    }
}

@Composable
private fun ThemeList(
    state: DecorThemeListState,
    emptyMessage: String,
    onOpen: (DecorThemeItem) -> Unit,
    onFavorite: (DecorThemeItem) -> Unit,
    onWithdraw: ((DecorThemeItem) -> Unit)? = null,
    showStatus: Boolean = false,
) {
    if (state.loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Color(0xFFC9A961))
        }
        return
    }
    if (state.error != null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(state.error ?: "加载失败", color = Color(0xFFE08A72), fontSize = 12.sp)
        }
        return
    }
    if (state.items.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(emptyMessage, color = Color(0xFF8E9099), fontSize = 12.sp, modifier = Modifier.padding(28.dp))
        }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(state.items, key = { it.id }) { item ->
            ThemeCard(item, showStatus, onOpen, onFavorite, onWithdraw)
        }
    }
}

@Composable
private fun ThemeCard(
    item: DecorThemeItem,
    showStatus: Boolean,
    onOpen: (DecorThemeItem) -> Unit,
    onFavorite: (DecorThemeItem) -> Unit,
    onWithdraw: ((DecorThemeItem) -> Unit)?,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF14161A))
            .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(14.dp))
            .clickable { onOpen(item) }
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.title, color = Color(0xFFF2F0EA), fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (item.origin == "official") {
                Box(Modifier.clip(RoundedCornerShape(999.dp)).background(Color(0x1FC9A961)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    Text("官方", color = Color(0xFFC9A961), fontSize = 9.sp)
                }
            }
        }
        if (item.description.isNotBlank()) {
            Text(item.description, color = Color(0xFF8E9099), fontSize = 10.5.sp, lineHeight = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(item.authorName, color = Color(0xFF6F7178), fontSize = 10.sp)
            Text("${item.installCount} 人使用", color = Color(0xFF6F7178), fontSize = 10.sp)
            TextButton(onClick = { onFavorite(item) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp)) {
                Text(if (item.favorite) "已收藏 ${item.favoriteCount}" else "收藏 ${item.favoriteCount}", color = if (item.favorite) Color(0xFFE08A72) else Color(0xFF8E9099), fontSize = 10.sp)
            }
            Spacer(Modifier.weight(1f))
            if (showStatus) {
                val statusText = STATUS_LABEL[item.status] ?: item.status
                Text(statusText, color = when (item.status) {
                    "approved" -> Color(0xFF7FC79A)
                    "rejected" -> Color(0xFFE08A72)
                    else -> Color(0xFFE9D9AE)
                }, fontSize = 10.sp, fontWeight = FontWeight.Medium)
            }
            if (onWithdraw != null && item.mine && item.status != "approved") {
                TextButton(onClick = { onWithdraw(item) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp)) {
                    Text("撤回", color = Color(0xFFE08A72), fontSize = 10.sp)
                }
            }
        }
        if (showStatus && item.reviewNote != null) {
            Text("审核意见：${item.reviewNote}", color = Color(0xFFC9A961), fontSize = 10.sp, lineHeight = 14.sp, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

/** 主题详情：整屏预览 + 应用 / 收藏 / 撤回。 */
@Composable
private fun ThemeDetailOverlay(
    item: DecorThemeItem,
    busy: Boolean,
    onBack: () -> Unit,
    onApply: () -> Unit,
    onFavorite: () -> Unit,
    onWithdraw: () -> Unit,
) {
    // 主题配置 → DecorConfig（只用于预览展示）
    val previewConfig = remember(item.id, item.config.toString()) {
        runCatching {
            com.heika.nativeapp.data.DecorConfig.fromSettings(
                org.json.JSONObject().put("data", org.json.JSONObject().put("bottomBar", item.config.optJSONObject("bottomBar")).put("card", item.config.optJSONObject("card"))),
            )
        }.getOrDefault(com.heika.nativeapp.data.DecorConfig.DEFAULT)
    }
    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0D0F)),
    ) {
        BackHeader(item.title, onBack)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Text(item.description, color = Color(0xFF8E9099), fontSize = 11.5.sp, lineHeight = 17.sp)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(item.authorName, color = Color(0xFF6F7178), fontSize = 10.5.sp)
                Text("${item.installCount} 人使用", color = Color(0xFF6F7178), fontSize = 10.5.sp)
                Text(if (item.hasLiveVersion) "线上版本" else "仅作者预览", color = Color(0xFF6F7178), fontSize = 10.5.sp)
            }
            if (item.reviewNote != null) {
                Text("审核意见：${item.reviewNote}", color = Color(0xFFC9A961), fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
            }

            Spacer(Modifier.height(12.dp))
            if (item.kind != "card") {
                DecorGroupTitle("底栏效果")
                DecorBarPreview(previewConfig, true, Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)))
            }
            if (item.kind != "bottom") {
                DecorGroupTitle("卡片效果")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    DecorCardBackPreview(previewConfig, true, Modifier.weight(1f))
                    DecorCardContentPreview(previewConfig, true, Modifier.weight(1f))
                }
            }

            Spacer(Modifier.height(16.dp))
            val canApply = item.status == "approved" || item.mine
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (canApply) Color(0xFFC9A961) else Color(0x33C9A961))
                    .clickable(enabled = canApply && !busy, onClick = onApply),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when {
                        !canApply -> "尚未通过审核，仅作者可用"
                        item.status == "approved" -> "应用这套装扮"
                        else -> "仅自己可用（预览稿）"
                    },
                    color = if (canApply) Color(0xFF17130A) else Color(0xFF8E9099),
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = onFavorite) { Text(if (item.favorite) "取消收藏" else "收藏", color = Color(0xFFC9A961), fontSize = 11.5.sp) }
                if (item.mine && item.status != "approved") {
                    TextButton(onClick = onWithdraw) { Text("撤回投稿", color = Color(0xFFE08A72), fontSize = 11.5.sp) }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/** 投稿对话框：名称、简介、标签、类型。 */
@Composable
private fun SubmitThemeDialog(
    busy: Boolean,
    onClose: () -> Unit,
    onSubmit: (title: String, description: String, tags: List<String>, kind: String) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var tags by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("bundle") }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC000000))
            .clickable(onClick = onClose),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(22.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Color(0xFF16181D))
                .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(18.dp))
                .clickable(enabled = false) {}
                .padding(18.dp),
        ) {
            Text("投稿到玩家工坊", color = Color(0xFFF2E7C8), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            DecorSectionHint("投稿后进入审核，通过后其他用户就能使用你的方案。", Modifier.padding(top = 4.dp, bottom = 8.dp))

            OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("主题名称（2–24 字）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("简介（4–120 字）") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
            OutlinedTextField(value = tags, onValueChange = { tags = it }, label = { Text("标签（逗号分隔，最多 4 个）") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))

            Spacer(Modifier.height(10.dp))
            Text("类型", color = Color(0xFFE8E6E0), fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("bundle" to "整套", "bottom" to "底栏", "card" to "卡片").forEach { (value, label) ->
                    val active = kind == value
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (active) Color(0xFFC9A961) else Color(0x14FFFFFF))
                            .clickable { kind = value }
                            .padding(horizontal = 13.dp, vertical = 7.dp),
                    ) {
                        Text(label, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 11.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onClose) { Text("取消", color = Color(0xFF8E9099), fontSize = 12.sp) }
                TextButton(
                    enabled = !busy && title.trim().length in 2..24 && description.trim().length in 4..120,
                    onClick = {
                        val tagList = tags.split(Regex("[,，\\s]+")).filter { it.isNotBlank() }.map { it.trim() }.take(4)
                        onSubmit(title.trim(), description.trim(), tagList, kind)
                    },
                ) {
                    Text(if (busy) "提交中…" else "提交审核", color = Color(0xFFC9A961), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
