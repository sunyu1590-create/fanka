package com.heika.nativeapp.feature.exploration

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import java.time.YearMonth
import java.util.Locale

@Composable
fun ExplorationCenterScreen(
    onBack: () -> Unit,
    onCalendar: () -> Unit,
    onCoExplore: () -> Unit,
    onStoryChains: () -> Unit,
    viewModel: ExplorationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("探索中心", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(Icons.Outlined.Refresh, contentDescription = "刷新探索数据", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, top = 6.dp, end = 18.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(19.dp),
        ) {
            item {
                val progress = ExplorationLogic.progression(state.experience)
                val animatedProgress by animateFloatAsState(
                    targetValue = progress.percent / 100f,
                    animationSpec = tween(HeikaMotion.rating, easing = HeikaMotion.standard),
                    label = "exploration-level-progress",
                )
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 15.dp, vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("LV.${progress.current.level}", color = MaterialTheme.colorScheme.primary, fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
                        Text(progress.current.reward, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 10.dp).weight(1f))
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${state.streak} 天", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text("连续探索", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                    }
                    LinearProgressIndicator(
                        progress = { animatedProgress },
                        modifier = Modifier.fillMaxWidth().padding(top = 11.dp).height(4.dp).clip(CircleShape),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${state.experience} EXP", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.weight(1f))
                        Text(progress.next?.let { "距 LV.${it.level} 还差 ${progress.remaining}" } ?: "当前最高等级", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("今日任务", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        state.serverDate?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp)) }
                    }
                    if (state.refreshing) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                }
            }
            if (state.loading && state.missions.isEmpty()) item { MissionSkeleton() }
            state.error?.let { message -> item { InlineError(message, onRetry = { viewModel.load(force = true) }) } }
            state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
            items(state.missions, key = { it.key }) { mission ->
                val canClaim = ExplorationLogic.canClaim(mission.progress, mission.target, mission.claimed, state.busyMission != null)
                Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(mission.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(mission.description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
                        }
                        TextButton(onClick = { viewModel.claimMission(mission.key) }, enabled = canClaim) {
                            Text(when { mission.claimed -> "已领取"; state.busyMission == mission.key -> "领取中"; else -> if (canClaim) "领取" else "${mission.progress.coerceAtMost(mission.target)}/${mission.target}" }, fontSize = 11.sp)
                        }
                    }
                    LinearProgressIndicator(
                        progress = { (mission.progress.toFloat() / mission.target.coerceAtLeast(1)).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(3.dp).clip(CircleShape),
                        color = if (mission.claimed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                    Text("+${mission.points} EXP", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, modifier = Modifier.align(Alignment.End).padding(top = 3.dp))
                }
            }
            item { Text("等级奖励", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
            items(ExplorationLogic.levels, key = { "level-${it.level}" }) { level ->
                val unlocked = state.experience >= level.threshold
                val claimed = level.level in state.claimedLevels
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${level.level.toString().padStart(2, '0')}", color = if (unlocked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(34.dp))
                    Column(Modifier.weight(1f)) {
                        Text(level.reward, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text("${level.threshold} EXP · ${level.description}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    }
                    when {
                        claimed -> Text("已领取", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        unlocked -> TextButton(onClick = { viewModel.claimLevel(level.level) }, enabled = state.busyLevel == null) { Text(if (state.busyLevel == level.level) "领取中" else "领取", fontSize = 11.sp) }
                        else -> Text("未解锁", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
            }
            item {
                Text("探索", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Column(Modifier.padding(top = 4.dp)) {
                    ExplorationActionRow("探索日历", "翻卡记录", Icons.Outlined.CalendarMonth, onCalendar)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    ExplorationActionRow("双人探索", "和伙伴共同揭晓", Icons.Outlined.Groups, onCoExplore)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    ExplorationActionRow("故事接龙", "续写社区故事", Icons.Outlined.AutoAwesome, onStoryChains)
                }
            }
            if (state.events.isNotEmpty()) item {
                Text("最近成长记录", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Column(Modifier.padding(top = 3.dp)) {
                    state.events.take(8).forEachIndexed { index, event ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(eventLabel(event.type), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.weight(1f))
                            Text("+${event.points} EXP", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                            Text(event.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(start = 8.dp))
                        }
                        if (index < state.events.take(8).lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    }
                }
            }
        }
    }
}

@Composable
fun ExplorationCalendarScreen(onBack: () -> Unit, onPost: (CalendarRecord) -> Unit, viewModel: ExplorationCalendarViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(viewModel) { viewModel.load(month = null) }
    val yearMonth = remember(state.month) { runCatching { YearMonth.parse(state.month) }.getOrElse { YearMonth.now() } }
    val selectedDay = state.selectedDate
    val metricsUnavailable = state.records.isEmpty() && state.counts.isEmpty() && (state.loading || state.error != null)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("探索日历", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(refresh = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(Icons.Outlined.Refresh, "刷新", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.IconButton(onClick = { viewModel.shiftMonth(-1) }) { androidx.compose.material3.Icon(Icons.Outlined.ChevronLeft, "上个月") }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${yearMonth.year}年${yearMonth.monthValue}月", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Text("${if (metricsUnavailable) "—" else state.streak.toString()} 天连续探索 · ${state.timeZone}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                    androidx.compose.material3.IconButton(onClick = { viewModel.shiftMonth(1) }, enabled = state.month?.let { it < (state.today?.take(7) ?: it) } ?: false) {
                        androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, "下个月")
                    }
                }
            }
            item {
                val unique = state.records.distinctBy { it.postId }
                val activeDays = state.counts.size
                val favoriteTag = unique.groupingBy { it.tag }.eachCount().maxByOrNull { it.value }?.key
                val rareCount = unique.count { it.rarityTier == "S" || it.rarityTier == "SS" || it.rarityTier == "SSS" }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(13.dp)) {
                    Text(if (state.month == state.today?.take(7)) "本月探索月报" else "${yearMonth.monthValue}月探索月报", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Row(Modifier.fillMaxWidth().padding(top = 11.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        MonthMetric(if (metricsUnavailable) "—" else "${unique.size}", "张卡片")
                        MonthMetric(if (metricsUnavailable) "—" else "$activeDays", "探索日")
                        MonthMetric(if (metricsUnavailable) "—" else "${state.totalRecords}", "次发现")
                        MonthMetric(if (metricsUnavailable) "—" else "$rareCount", "稀有卡")
                    }
                    Text(
                        when {
                            metricsUnavailable -> "月报数据暂不可用"
                            favoriteTag != null -> "该月最常探索 · #$favoriteTag"
                            else -> "该月暂无探索记录"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    TextButton(
                        enabled = !metricsUnavailable,
                        onClick = {
                            val summary = "${yearMonth.year}年${yearMonth.monthValue}月，我在黑卡探索了 ${unique.size} 张内容，点亮 $activeDays 天，发现稀有卡 $rareCount 张${favoriteTag?.let { "，最常探索「$it」" }.orEmpty()}。"
                            shareText(context, "我的黑卡月度探索", summary)
                        },
                        modifier = Modifier.align(Alignment.End),
                    ) { androidx.compose.material3.Icon(Icons.Outlined.Share, null); Text("分享月报") }
                }
            }
            state.error?.let { message -> item { InlineError(message) { viewModel.load(refresh = true) } } }
            item {
                AnimatedContent(
                    targetState = yearMonth,
                    transitionSpec = {
                        (fadeIn(tween(HeikaMotion.transition)) + slideInHorizontally(tween(HeikaMotion.transition)) { it / 12 }) togetherWith
                            (fadeOut(tween(HeikaMotion.transition)) + slideOutHorizontally(tween(HeikaMotion.transition)) { -it / 12 }) using SizeTransform(clip = false)
                    },
                    label = "exploration-calendar-month",
                ) { month ->
                    val monthCells = remember(month) { ExplorationLogic.calendarCellDates(month) }
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { listOf("一", "二", "三", "四", "五", "六", "日").forEach { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center) } }
                        monthCells.chunked(7).forEach { week ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                week.forEach { day ->
                                    if (day == null) Spacer(Modifier.weight(1f).aspectRatio(1f)) else {
                                        val date = "%04d-%02d-%02d".format(Locale.ROOT, month.year, month.monthValue, day)
                                        val count = state.counts[date] ?: 0
                                        val isSelected = selectedDay == date
                                        Box(
                                            Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(HeikaRadii.control))
                                                .background(if (count > 0) MaterialTheme.colorScheme.primary.copy(alpha = (0.14f + count * 0.13f).coerceAtMost(0.65f)) else MaterialTheme.colorScheme.surface)
                                                .then(if (isSelected) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(HeikaRadii.control)) else Modifier)
                                                .clickable { viewModel.selectDate(date) },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                Text(day.toString(), color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                                                if (count > 0) Text("• $count", color = MaterialTheme.colorScheme.primary, fontSize = 8.sp, lineHeight = 9.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item {
                Text(selectedDay ?: "选择日期", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                val dayRecords = state.records.filter { it.date == selectedDay }
                if (dayRecords.isEmpty()) Text(
                    if ((selectedDay?.let { state.counts[it] } ?: 0) > 0) "内容暂不可用" else "暂无记录",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 10.dp, bottom = 16.dp),
                )
            }
            items(state.records.filter { it.date == selectedDay }, key = { it.postId }) { record ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).clickable { onPost(record) }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!record.image.isNullOrBlank()) AsyncImage(record.image, null, Modifier.size(60.dp, 68.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                    Column(Modifier.weight(1f).padding(start = 11.dp)) {
                        Text(record.tag, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        Text(record.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                        Text("${rarityLabel(record.rarityTier)} · ${record.openedAt.replace('T', ' ').take(16)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                    androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (state.loading && state.records.isEmpty()) item { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
        }
    }
}

@Composable
fun CoExploreScreen(onBack: () -> Unit, onLogin: () -> Unit, onPost: (String) -> Unit, viewModel: CoExploreViewModel = hiltViewModel(), inviteCode: String? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(viewModel, inviteCode) { viewModel.initialize(inviteCode) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("双人探索", onBack) {
            if (state.inviteCode.isNotBlank()) androidx.compose.material3.IconButton(onClick = viewModel::refresh) { androidx.compose.material3.Icon(Icons.Outlined.Refresh, "刷新房间") }
        }
        if (state.accountId == null) {
            Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("和朋友一起发现灵感", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text("登录后创建房间、选择作品并查看共同揭晓的结果。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                Button(onClick = onLogin, modifier = Modifier.padding(top = 16.dp)) { Text("登录后开始") }
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item { Text("邀请伙伴加入，双方各选一篇内容后共同揭晓。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                state.error?.let { message -> item { InlineError(message) { viewModel.refresh() } } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
                if (state.inviteCode.isBlank()) {
                    item {
                        Button(onClick = viewModel::create, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(if (state.busy) "正在创建…" else "创建双人探索") }
                    }
                    item {
                        OutlinedTextField(state.joiningCode, viewModel::setCode, Modifier.fillMaxWidth(), label = { Text("邀请码") }, singleLine = true, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters))
                        Button(onClick = { viewModel.join() }, enabled = !state.busy && state.joiningCode.length >= 6, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("加入朋友的房间") }
                    }
                } else {
                    item {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(15.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val roomStatus = when {
                                    state.expired -> "已过期"
                                    state.revealed -> "已完成"
                                    state.guestId == null -> "等待加入"
                                    state.ownPick -> "等待对方选择"
                                    else -> "双方已加入 · 正在选择"
                                }
                                AnimatedContent(roomStatus, transitionSpec = {
                                    (fadeIn(tween(HeikaMotion.control)) + slideInHorizontally(tween(HeikaMotion.control)) { it / 10 }) togetherWith
                                        (fadeOut(tween(HeikaMotion.control)) + slideOutHorizontally(tween(HeikaMotion.control)) { -it / 10 })
                                }, label = "co-explore-status") { status ->
                                    Text(status, color = if (state.expired) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                }
                                TextButton(onClick = { shareText(context, "和我一起探索黑卡", "https://moonclean.shop/?room=${state.inviteCode}") }) { androidx.compose.material3.Icon(Icons.Outlined.Share, null); Text("邀请") }
                            }
                            Text("邀请码  ${state.inviteCode}", color = MaterialTheme.colorScheme.primary, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (state.expiresAt.isBlank()) "房间有效期由服务端管理" else "有效至 ${state.expiresAt.replace('T', ' ').take(16)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.weight(1f))
                                TextButton(onClick = { copyText(context, "HEIKA 邀请码", state.inviteCode) }) { androidx.compose.material3.Icon(Icons.Outlined.ContentCopy, null); Text("复制") }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                            Text("发起者  ·  ${if (state.hostId == state.accountId) "你" else "已加入"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
                            Text("伙伴  ·  ${if (state.guestId == null) "等待加入" else if (state.guestId == state.accountId) "你已加入" else "已加入"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
                            if (!state.expired && !state.revealed) TextButton(onClick = viewModel::refresh, modifier = Modifier.align(Alignment.End)) { androidx.compose.material3.Icon(Icons.Outlined.Refresh, null); Text("刷新") }
                        }
                    }
                    if (state.revealed) {
                        item { Text("彼此的灵感已揭晓", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                        items(state.picks, key = { it.userId }) { pick ->
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable { pick.postId?.let(onPost) }.padding(12.dp)) {
                                if (pick.image != null) AsyncImage(pick.image, null, Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(9.dp)), contentScale = ContentScale.Crop)
                                Text("${pick.nickname} 分享了", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 9.dp))
                                Text(pick.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 4.dp))
                                if (pick.note.isNotBlank()) Text(pick.note, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
                            }
                        }
                    } else if (state.ownPick) {
                        item {
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("✦", color = MaterialTheme.colorScheme.primary, fontSize = 25.sp)
                                Text("你的选择已锁定", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                Text("朋友完成选择后，双方内容会一起揭晓。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
                            }
                        }
                    } else {
                        item {
                            Text(state.prompt, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            if (state.guestId == null) Text("另一位探索者加入后即可选内容。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        items(state.candidates.take(12), key = { it.cloudId }) { post ->
                            CandidatePostRow(post, selected = state.selectedPostId == post.cloudId, enabled = state.guestId != null && !state.busy, onClick = { viewModel.selectPost(post.cloudId) })
                        }
                        item {
                            OutlinedTextField(state.note, viewModel::setNote, Modifier.fillMaxWidth(), label = { Text("分享的话（选填）") }, supportingText = { Text("最多 180 字") }, maxLines = 4)
                            Button(onClick = viewModel::lockSelection, enabled = !state.busy && state.guestId != null && state.selectedPostId != null, modifier = Modifier.fillMaxWidth().padding(top = 9.dp)) {
                                Text(if (state.busy) "正在锁定…" else "锁定我的选择")
                            }
                        }
                    }
                }
                if (state.loading) item { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
            }
        }
    }
}

@Composable
fun StoryChainListScreen(onBack: () -> Unit, onOpen: (String) -> Unit, viewModel: ExplorationChainsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var title by rememberSaveable { mutableStateOf("") }
    var prompt by rememberSaveable { mutableStateOf("") }
    var firstEntry by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current
    LaunchedEffect(viewModel) { viewModel.load() }
    LaunchedEffect(state.createdChainId) { state.createdChainId?.let { viewModel.clearCreatedId(); onOpen(it) } }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("故事接龙", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) { androidx.compose.material3.Icon(Icons.Outlined.Refresh, "刷新") }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            state.error?.let { message -> item { InlineError(message) { viewModel.load(force = true) } } }
            state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(13.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("发起一个新故事", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("选择起始作品", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        items(state.candidates.take(15), key = { it.cloudId }) { post ->
                            val selected = state.selectedPostId == post.cloudId
                            Surface(onClick = { viewModel.selectPost(post.cloudId) }, shape = RoundedCornerShape(9.dp), color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant) {
                                Row(Modifier.width(190.dp).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (!post.thumbnail.isNullOrBlank()) AsyncImage(post.thumbnail, null, Modifier.size(45.dp).clip(RoundedCornerShape(7.dp)), contentScale = ContentScale.Crop)
                                    Column(Modifier.weight(1f).padding(start = 8.dp)) {
                                        Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        Text(post.tag, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 3.dp))
                                    }
                                }
                            }
                        }
                    }
                    OutlinedTextField(title, { title = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("接龙标题（4–100 字）") }, singleLine = true)
                    OutlinedTextField(prompt, { prompt = it.take(220) }, Modifier.fillMaxWidth(), label = { Text("故事引子（8–220 字）") }, minLines = 2, maxLines = 3)
                    OutlinedTextField(firstEntry, { firstEntry = it.take(600) }, Modifier.fillMaxWidth(), label = { Text("第一段（8–600 字）") }, minLines = 3, maxLines = 5)
                    Button(
                        onClick = { viewModel.create(state.selectedPostId.orEmpty(), title.trim(), prompt.trim(), firstEntry.trim()) },
                        enabled = !state.busy && state.selectedPostId != null && title.trim().length in 4..100 && prompt.trim().length in 8..220 && firstEntry.trim().length in 8..600,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (state.busy) "正在发起…" else "发布并邀请续写") }
                }
            }
            item { Text("接龙中的故事", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 5.dp)) }
            if (state.loading && state.items.isEmpty()) item { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
            if (!state.loading && state.items.isEmpty()) item { Text("暂无内容", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(vertical = 20.dp)) }
            items(state.items, key = { it.id }) { chain ->
                Column(Modifier.fillMaxWidth().animateItem().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable { onOpen(chain.id) }.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${chain.seedTag.ifBlank { "探索" }} · ${chain.ownerName}", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, modifier = Modifier.weight(1f))
                        Text(if (chain.status == "active") "进行中" else "已结束", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                    Text(chain.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 7.dp))
                    Text(chain.prompt, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                    Text("${chain.entries.size} 段续写 · 打开故事", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
                    TextButton(onClick = { shareText(context, chain.title, "https://moonclean.shop/?chain=${chain.id}") }) { androidx.compose.material3.Icon(Icons.Outlined.Share, null); Text("分享接龙") }
                }
            }
        }
    }
}

@Composable
fun StoryChainDetailScreen(chainId: String, onBack: () -> Unit, onSeedPost: (String) -> Unit, viewModel: ExplorationChainsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by rememberSaveable(chainId) { mutableStateOf("") }
    var showCloseConfirm by rememberSaveable(chainId) { mutableStateOf(false) }
    val context = LocalContext.current
    val chain = state.items.firstOrNull { it.id == chainId }
    LaunchedEffect(viewModel, chainId, state.items.isEmpty()) { if (state.items.none { it.id == chainId }) viewModel.load() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("故事内容", onBack) { androidx.compose.material3.IconButton(onClick = { shareText(context, chain?.title ?: "黑卡故事接龙", "https://moonclean.shop/?chain=$chainId") }) { androidx.compose.material3.Icon(Icons.Outlined.Share, "分享接龙") } }
        if (chain == null && state.loading) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (chain == null) Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            InlineError(state.error ?: "接龙暂时不可用") { viewModel.load(force = true) }
        } else {
            val ownEntry = chain.entries.any { it.userId == state.accountId }
            LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                state.error?.let { message -> item { InlineError(message) { viewModel.load(force = true) } } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
                item {
                    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(13.dp)).clickable { onSeedPost(chain.seedPostId) }.padding(14.dp)) {
                        Text("${chain.seedTag.ifBlank { "探索" }} · ${chain.ownerName} 发起 · ${if (chain.status == "active") "进行中" else "已结束"}", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        if (!chain.seedImage.isNullOrBlank()) AsyncImage(chain.seedImage, null, Modifier.fillMaxWidth().padding(top = 10.dp).height(190.dp), contentScale = ContentScale.Crop)
                        Text(chain.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
                        Text(chain.prompt, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 7.dp))
                        Text("查看起始作品 ›", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, modifier = Modifier.padding(top = 9.dp).clickable { onSeedPost(chain.seedPostId) })
                    }
                }
                item { Text("故事进展 · ${chain.entries.size} 段", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
                items(chain.entries, key = { it.id }) { entry ->
                    Row(Modifier.fillMaxWidth().animateItem(), verticalAlignment = Alignment.Top) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(25.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) { Text("${chain.entries.indexOf(entry) + 1}", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp) }
                            if (chain.entries.lastOrNull()?.id != entry.id) Box(Modifier.width(1.dp).height(58.dp).background(MaterialTheme.colorScheme.outlineVariant))
                        }
                        Column(Modifier.weight(1f).padding(start = 11.dp, bottom = 13.dp)) {
                            Text(entry.nickname, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                            Text(entry.content, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 5.dp))
                            Text(entry.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 5.dp))
                        }
                    }
                }
                if (chain.status == "active" && chain.ownerId == state.accountId) item {
                    TextButton(onClick = { showCloseConfirm = true }, enabled = !state.busy) { Text("结束接龙") }
                }
                if (chain.status == "active" && !ownEntry && chain.ownerId != state.accountId) item {
                    OutlinedTextField(draft, { draft = it.take(600) }, Modifier.fillMaxWidth(), label = { Text("写下下一段（至少 8 字）") }, minLines = 4, maxLines = 8)
                    Button(onClick = { viewModel.contribute(chain.id, draft.trim()) }, enabled = !state.busy && draft.trim().length in 8..600, modifier = Modifier.fillMaxWidth().padding(top = 7.dp)) { Text(if (state.busy) "正在续写…" else "接着写") }
                } else if (ownEntry) item { Text("你已经为这个故事续写过。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
                else if (chain.status != "active") item { Text("这个接龙已结束，历史内容仍可查看。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
            }
        }
    }
    if (showCloseConfirm && chain != null) AlertDialog(
        onDismissRequest = { showCloseConfirm = false },
        title = { Text("结束这个接龙？") },
        text = { Text("结束后其他探索者将不能继续参与，已有记录会保留。") },
        confirmButton = { TextButton(onClick = { showCloseConfirm = false; viewModel.close(chain.id) }) { Text("结束接龙") } },
        dismissButton = { TextButton(onClick = { showCloseConfirm = false }) { Text("取消") } },
    )
}

@Composable
private fun CandidatePostRow(post: HeikaPost, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surface).clickable(enabled = enabled, onClick = onClick).padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
        if (!post.thumbnail.isNullOrBlank()) AsyncImage(post.thumbnail, null, Modifier.size(55.dp, 62.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(post.tag, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        }
        if (selected) Text("✓", color = MaterialTheme.colorScheme.primary, fontSize = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun MissionSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(3) { Box(Modifier.fillMaxWidth().height(66.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface)) }
    }
}

@Composable
private fun MonthMetric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = MaterialTheme.colorScheme.primary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 2.dp))
    }
}

private fun rarityLabel(tier: String): String = when (tier) {
    "pending" -> "待评级"
    "ordinary" -> "普通黑卡"
    else -> tier
}

@Composable
private fun InlineError(message: String, onRetry: () -> Unit) {
    val shape = RoundedCornerShape(HeikaRadii.control)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f), shape).padding(start = 12.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, modifier = Modifier.weight(1f))
        TextButton(onClick = onRetry) { Text("重试") }
    }
}

@Composable
private fun ExplorationActionRow(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(vertical = 13.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.material3.Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f).padding(horizontal = 11.dp)) {
            Text(title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
        }
        androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun eventLabel(type: String): String = when (type) {
    "flip" -> "翻开卡片"
    "rating" -> "内容评分"
    "mission" -> "创作者任务"
    "daily_mission" -> "每日探索任务"
    else -> "成长记录"
}

private fun copyText(context: Context, label: String, value: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
    android.widget.Toast.makeText(context, "已复制", android.widget.Toast.LENGTH_SHORT).show()
}

private fun shareText(context: Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_SUBJECT, title); putExtra(Intent.EXTRA_TEXT, text) }
    runCatching { context.startActivity(Intent.createChooser(intent, title)) }
}
