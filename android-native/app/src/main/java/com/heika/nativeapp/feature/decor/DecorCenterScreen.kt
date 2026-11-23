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
import androidx.compose.foundation.layout.fillMaxHeight
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

/** 三个主入口：发现装扮 / 我的装扮 / 创作工坊，二级内容用分段控件承载。 */
private val TABS = listOf(
    "discover" to "发现装扮",
    "mine" to "我的装扮",
    "studio" to "创作工坊",
)

private val DISCOVER_SECTIONS = listOf("official" to "官方精选", "community" to "玩家工坊")
private val MINE_SECTIONS = listOf("active" to "正在使用", "favorite" to "我的收藏", "submissions" to "我的投稿")

private fun resolveTab(initial: String) = when (initial) {
    "studio", "bottom", "card" -> "studio"
    "mine", "submissions" -> "mine"
    else -> "discover"
}

private fun resolveDiscover(initial: String) = if (initial == "community") "community" else "official"

private fun resolveMine(initial: String) = if (initial == "submissions") "submissions" else "active"

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
    val favorites by viewModel.favorites.collectAsState()
    val applied by viewModel.applied.collectAsState()
    val busy by viewModel.busy.collectAsState()
    var tab by remember { mutableStateOf(resolveTab(initialTab)) }
    var discoverSection by remember { mutableStateOf(resolveDiscover(initialTab)) }
    var mineSection by remember { mutableStateOf(resolveMine(initialTab)) }
    var detail by remember { mutableStateOf<DecorThemeItem?>(null) }
    var submitOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.load("official")
        viewModel.load("mine")
        viewModel.notice.collect { HeikaNoticeBus.showSelection(it) }
    }
    LaunchedEffect(discoverSection) { viewModel.load(discoverSection) }
    LaunchedEffect(mineSection) {
        if (mineSection == "favorite") viewModel.load("favorites")
        if (mineSection == "submissions") viewModel.load("mine")
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
                        }
                        .padding(horizontal = 13.dp, vertical = 7.dp),
                ) {
                    Text(label, color = if (active) Color(0xFF17130A) else Color(0xFFB9BCC4), fontSize = 11.5.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                }
            }
        }

        Box(Modifier.weight(1f)) {
            when (tab) {
                "discover" -> Column(Modifier.fillMaxSize()) {
                    SegmentedRow(DISCOVER_SECTIONS, discoverSection) { discoverSection = it; detail = null }
                    if (discoverSection == "official") {
                        ThemeList(official, emptyMessage = "暂无官方预设", onOpen = { detail = it }, onFavorite = { viewModel.toggleFavorite(it) }, modifier = Modifier.weight(1f))
                    } else {
                        ThemeList(community, emptyMessage = "玩家工坊暂时空空的，投稿你的第一套装扮吧", onOpen = { detail = it }, onFavorite = { viewModel.toggleFavorite(it) }, modifier = Modifier.weight(1f))
                    }
                }
                "mine" -> Column(Modifier.fillMaxSize()) {
                    SegmentedRow(MINE_SECTIONS, mineSection) { mineSection = it; detail = null }
                    when (mineSection) {
                        "active" -> ActiveDecorPanel(
                            config = applied,
                            onEdit = { tab = "studio" },
                            onDiscover = { tab = "discover"; discoverSection = "official" },
                            modifier = Modifier.weight(1f),
                        )
                        "favorite" -> ThemeList(favorites, emptyMessage = "还没有收藏主题。在发现装扮里点收藏，就会出现在这里", onOpen = { detail = it }, onFavorite = { viewModel.toggleFavorite(it) }, modifier = Modifier.weight(1f))
                        else -> ThemeList(
                            mine,
                            emptyMessage = "还没有投稿。到创作工坊调好装扮后投稿，通过审核就能上架",
                            onOpen = { detail = it },
                            onFavorite = { viewModel.toggleFavorite(it) },
                            onWithdraw = { viewModel.withdraw(it) },
                            showStatus = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                else -> Column(Modifier.fillMaxSize()) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("创作工坊", color = Color(0xFFF2E7C8), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
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
                        tab = "mine"
                        mineSection = "submissions"
                    }
                }
            },
        )
    }
}

/** 二级分段控件：官方精选 / 玩家工坊，正在使用 / 收藏 / 投稿。 */
@Composable
private fun SegmentedRow(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0x0FFFFFFF))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEach { (id, label) ->
            val active = selected == id
            Box(
                Modifier
                    .weight(1f)
                    .height(32.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (active) Color(0xFF20242A) else Color.Transparent)
                    .clickable { onSelect(id) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (active) Color(0xFFF2F0EA) else Color(0xFF8E9099),
                    fontSize = 11.5.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                )
            }
        }
    }
}

/** 「正在使用」：只读展示账号当前生效的装扮，改动从创作工坊发起。 */
@Composable
private fun ActiveDecorPanel(
    config: com.heika.nativeapp.data.DecorConfig,
    onEdit: () -> Unit,
    onDiscover: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF14161A))
                .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(16.dp))
                .padding(14.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                DecorCardBackPreview(config, dark = true, modifier = Modifier.fillMaxWidth())
                DecorBarPreview(config, dark = true, modifier = Modifier.fillMaxWidth())
            }
        }
        Text(
            "这是账号当前生效的装扮，其他登录设备读到的也是它。调整会先进草稿，确认后才同步。",
            color = Color(0xFF8E9099),
            fontSize = 11.5.sp,
            lineHeight = 17.sp,
            modifier = Modifier.padding(top = 12.dp, bottom = 14.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionPill("继续调整", primary = true, modifier = Modifier.weight(1f), onClick = onEdit)
            ActionPill("换个主题", primary = false, modifier = Modifier.weight(1f), onClick = onDiscover)
        }
    }
}

@Composable
private fun ActionPill(label: String, primary: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (primary) Color(0xFFC9A961) else Color(0x14FFFFFF))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (primary) Color(0xFF17130A) else Color(0xFFF2F0EA),
            fontSize = 12.5.sp,
            fontWeight = if (primary) FontWeight.SemiBold else FontWeight.Normal,
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
    modifier: Modifier = Modifier,
) {
    if (state.loading) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
        modifier.fillMaxSize(),
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
    // 缩略图直接用这套主题的配置渲染，和实际应用后的底栏/卡背一致。
    val previewConfig = remember(item.id, item.config.toString()) {
        runCatching {
            val cfg = item.config
            val resolved = when {
                cfg.optJSONObject("bottomBar") != null || cfg.optJSONObject("card") != null -> cfg
                cfg.has("preset") -> com.heika.nativeapp.data.OfficialDecorPresets.resolveToJson(cfg.optString("preset")) ?: cfg
                else -> cfg
            }
            com.heika.nativeapp.data.DecorConfig.fromSettings(resolved)
        }.getOrDefault(com.heika.nativeapp.data.DecorConfig.DEFAULT)
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF14161A))
            .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(14.dp))
            .clickable { onOpen(item) }
            .padding(13.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(92.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF0B0D0F)),
            contentAlignment = Alignment.Center,
        ) {
            if (item.kind == "card") {
                DecorCardBackPreview(previewConfig, dark = true, modifier = Modifier.fillMaxHeight().padding(vertical = 6.dp))
            } else {
                DecorBarPreview(previewConfig, dark = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 9.dp)) {
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
        val cfg = item.config
        val resolved = when {
            // config 含 bottomBar/card 子对象 → 直接解析
            cfg.optJSONObject("bottomBar") != null || cfg.optJSONObject("card") != null -> cfg
            // 官方主题 DB 可能只存 {"preset":"slug"} 标识 → 用内置预设解析
            cfg.has("preset") -> com.heika.nativeapp.data.OfficialDecorPresets.resolveToJson(cfg.optString("preset")) ?: cfg
            else -> cfg
        }
        runCatching {
            com.heika.nativeapp.data.DecorConfig.fromSettings(resolved)
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
