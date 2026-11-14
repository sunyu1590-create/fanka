package com.heika.nativeapp.feature.exploration

import com.heika.nativeapp.ui.HeikaAlertDialog
import com.heika.nativeapp.ui.HeikaGlassDialog
import com.heika.nativeapp.ui.HeikaNoticeBus
import com.heika.nativeapp.ui.HeikaNoticeKind

import com.heika.nativeapp.ui.HeikaIcons
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
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
import androidx.compose.runtime.DisposableEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.heikaSharedPostImage
import com.heika.nativeapp.ui.sharedImageKey
import com.heika.nativeapp.ui.HeikaMotion
import com.heika.nativeapp.ui.HeikaRadii
import com.heika.nativeapp.ui.LocalHeikaImageLoader
import java.time.YearMonth
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun ExplorationCenterScreen(
    onBack: () -> Unit,
    onTasks: () -> Unit,
    onRewards: () -> Unit,
    onEvents: () -> Unit,
    onCalendar: () -> Unit,
    onCoExplore: () -> Unit,
    onStoryChains: () -> Unit,
    viewModel: ExplorationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    RefreshExplorationOnResume(viewModel)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("探索中心", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(HeikaIcons.Retry, contentDescription = "刷新探索数据", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 6.dp, end = 18.dp, bottom = 132.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            item {
                val progress = ExplorationLogic.progression(state.experience)
                val animatedProgress by animateFloatAsState(
                    targetValue = progress.percent / 100f,
                    animationSpec = tween(HeikaMotion.rating, easing = HeikaMotion.standard),
                    label = "exploration-level-progress",
                )
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 14.dp, vertical = 11.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("LV.${progress.current.level}", color = MaterialTheme.colorScheme.primary, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                        Text(progress.current.reward, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 9.dp).weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${state.experience} / ${progress.next?.threshold?.toString() ?: "满级"} EXP", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                    LinearProgressIndicator(
                        progress = { animatedProgress },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(3.dp).clip(CircleShape),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                }
            }
            item {
                val summary = ExplorationLogic.dailySummary(state.missions)
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface)).clickable(onClick = onTasks).padding(vertical = 11.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Icon(HeikaIcons.Medal, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                        Text("今日任务", Modifier.weight(1f).padding(start = 9.dp), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Text(
                            if (state.loading && state.missions.isEmpty()) "同步中" else "${summary.completed}/${state.missions.size} · ${summary.totalPoints} EXP",
                            color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp,
                        )
                        androidx.compose.material3.Icon(HeikaIcons.Forward, "查看今日任务", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 5.dp).size(16.dp))
                    }
                }
            }
            item { Text("探索功能", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
            item {
                Column(Modifier.fillMaxWidth()) {
                    ExplorationActionRow("探索日历", "翻卡记录", HeikaIcons.Calendar, onCalendar)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    ExplorationActionRow("双人探索", "和伙伴共同揭晓", HeikaIcons.CoExplore, onCoExplore)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    ExplorationActionRow("故事接龙", "续写社区故事", HeikaIcons.StoryChain, onStoryChains)
                }
            }
            state.error?.let { message -> item { InlineError(message, onRetry = { viewModel.load(force = true) }) } }
            state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
            item {
                val claimable = ExplorationLogic.levels.firstOrNull { it.level !in state.claimedLevels && state.experience >= it.threshold }
                val next = claimable ?: ExplorationLogic.levels.firstOrNull { state.experience < it.threshold }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 13.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("等级奖励", Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("查看全部", Modifier.clickable(onClick = onRewards).padding(horizontal = 4.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        androidx.compose.material3.Icon(HeikaIcons.Forward, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(15.dp))
                    }
                    if (next != null) Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("LV.${next.level}", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(45.dp))
                        Column(Modifier.weight(1f)) {
                            Text(next.reward, color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(if (claimable != null) "可领取" else "${next.threshold} EXP 解锁", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                        }
                        if (claimable != null) TextButton(onClick = { viewModel.claimLevel(claimable.level) }, enabled = state.busyLevel == null) {
                            Text(if (state.busyLevel == claimable.level) "领取中" else "领取", fontSize = 10.sp)
                        }
                    } else Text("已达到当前最高等级", Modifier.padding(top = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                }
            }
            item {
                Column(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("最近成长记录", Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        if (state.events.isNotEmpty()) Text("查看全部", Modifier.clickable(onClick = onEvents).padding(6.dp), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    }
                    if (state.events.isEmpty()) {
                        Text(if (state.loading) "正在同步" else "暂无记录", Modifier.padding(vertical = 9.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    } else state.events.take(3).forEachIndexed { index, event ->
                        ExperienceEventRow(event)
                        if (index < minOf(3, state.events.size) - 1) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    }
                }
            }
        }
    }
}

@Composable
fun ExplorationDailyTasksScreen(onBack: () -> Unit, onCompleteMission: (String) -> Unit = {}, viewModel: ExplorationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    RefreshExplorationOnResume(viewModel)
    val summary = ExplorationLogic.dailySummary(state.missions)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("今日探索任务", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(HeikaIcons.Retry, contentDescription = "刷新今日任务", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 4.dp, end = 18.dp, bottom = 132.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(HeikaRadii.surface)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(state.serverDate?.let { "今日 · $it" } ?: "今日任务", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                state.updatedAtMillis?.let { "同步于 ${formatSyncTime(it)}" } ?: "任务进度按服务端实时同步",
                                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                        if (state.refreshing) CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 11.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            if (state.loading && state.missions.isEmpty()) "正在同步任务" else "完成 ${summary.completed}/${state.missions.size}",
                            color = MaterialTheme.colorScheme.onBackground, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        )
                        Text(
                            if (state.loading && state.missions.isEmpty()) "— EXP" else "总可得 ${summary.totalPoints} EXP",
                            color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        )
                    }
                    LinearProgressIndicator(
                        progress = { summary.progress }, modifier = Modifier.fillMaxWidth().padding(top = 7.dp).height(3.dp).clip(CircleShape),
                        color = MaterialTheme.colorScheme.primary, trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                }
            }
            if (state.loading && state.missions.isEmpty()) item { MissionSkeleton() }
            state.error?.let { message -> item { InlineError(message, onRetry = { viewModel.load(force = true) }) } }
            state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) } }
            if (!state.loading && state.missions.isEmpty() && state.error == null) item {
                Text("今日暂无任务", Modifier.fillMaxWidth().padding(vertical = 25.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            items(state.missions, key = { it.key }) { mission ->
                val canClaim = ExplorationLogic.canClaim(mission.progress, mission.target, mission.claimed, state.busyMission != null)
                val complete = mission.target > 0 && mission.progress >= mission.target
                Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(mission.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text(mission.description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                        }
                        TextButton(
                            onClick = {
                                when {
                                    canClaim -> viewModel.claimMission(mission.key)
                                    !complete -> onCompleteMission(mission.key)
                                }
                            },
                            enabled = !mission.claimed && (state.busyMission == null || state.busyMission == mission.key),
                        ) {
                            Text(when { mission.claimed -> "已领取"; state.busyMission == mission.key -> "领取中"; canClaim -> "领取"; else -> "去完成" }, fontSize = 10.sp)
                        }
                    }
                    LinearProgressIndicator(
                        progress = { (mission.progress.toFloat() / mission.target.coerceAtLeast(1)).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().padding(top = 7.dp).height(3.dp).clip(CircleShape),
                        color = if (complete) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${mission.progress.coerceAtMost(mission.target)}/${mission.target}", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp)
                        Text("+${mission.points} EXP", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    }
                    HorizontalDivider(Modifier.padding(top = 10.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                }
            }
        }
    }
}

@Composable
fun ExplorationRewardsScreen(onBack: () -> Unit, viewModel: ExplorationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    RefreshExplorationOnResume(viewModel)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("等级奖励", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(HeikaIcons.Retry, contentDescription = "刷新等级奖励", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 4.dp, end = 18.dp, bottom = 132.dp)) {
            items(ExplorationLogic.levels, key = { "level-${it.level}" }) { level ->
                val unlocked = state.experience >= level.threshold
                val claimed = level.level in state.claimedLevels
                Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("LV.${level.level}", color = if (unlocked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(48.dp))
                    Column(Modifier.weight(1f)) {
                        Text(level.reward, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text("${level.threshold} EXP · ${level.description}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    }
                    when {
                        claimed -> Text("已领取", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        unlocked -> TextButton(onClick = { viewModel.claimLevel(level.level) }, enabled = state.busyLevel == null) { Text(if (state.busyLevel == level.level) "领取中" else "领取", fontSize = 10.sp) }
                        else -> Text("未解锁", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
            }
        }
    }
}

@Composable
fun ExplorationEventsScreen(onBack: () -> Unit, viewModel: ExplorationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    RefreshExplorationOnResume(viewModel)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("成长记录", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(HeikaIcons.Retry, contentDescription = "刷新成长记录", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 4.dp, end = 18.dp, bottom = 132.dp)) {
            state.error?.let { message -> item { InlineError(message, onRetry = { viewModel.load(force = true) }) } }
            if (state.events.isEmpty() && state.error == null) item {
                Text(if (state.loading) "正在同步" else "暂无记录", Modifier.fillMaxWidth().padding(vertical = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
            items(state.events) { event ->
                ExperienceEventRow(event)
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
            }
        }
    }
}

@Composable
private fun ExperienceEventRow(event: ExperienceEvent) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(eventLabel(event.type), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            Text(event.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 2.dp))
        }
        Text("+${event.points} EXP", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

private fun formatSyncTime(timestamp: Long): String = runCatching {
    Instant.ofEpochMilli(timestamp).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT))
}.getOrDefault("")

@Composable
private fun RefreshExplorationOnResume(viewModel: ExplorationViewModel) {
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasResumedOnce by remember(viewModel) { mutableStateOf(false) }
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (hasResumedOnce) viewModel.load(force = true)
                hasResumedOnce = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun ExplorationCalendarScreen(
    onBack: () -> Unit,
    onPost: (CalendarRecord) -> Unit,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
    viewModel: ExplorationCalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(viewModel) { viewModel.load(month = null) }
    val yearMonth = remember(state.month) { runCatching { YearMonth.parse(state.month) }.getOrElse { YearMonth.now() } }
    val selectedDay = state.selectedDate
    val metricsUnavailable = state.records.isEmpty() && state.counts.isEmpty() && (state.loading || state.error != null)
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("探索日历", onBack) {
            androidx.compose.material3.IconButton(onClick = { viewModel.load(refresh = true) }, enabled = !state.refreshing) {
                androidx.compose.material3.Icon(HeikaIcons.Retry, "刷新", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 112.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.IconButton(onClick = { viewModel.shiftMonth(-1) }) { androidx.compose.material3.Icon(HeikaIcons.Back, "上个月") }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${yearMonth.year}年${yearMonth.monthValue}月", color = MaterialTheme.colorScheme.onBackground, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Text("${if (metricsUnavailable) "—" else state.streak.toString()} 天连续探索 · ${state.timeZone}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                    }
                    androidx.compose.material3.IconButton(onClick = { viewModel.shiftMonth(1) }, enabled = state.month?.let { it < (state.today?.take(7) ?: it) } ?: false) {
                        androidx.compose.material3.Icon(HeikaIcons.Forward, "下个月")
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
                    ) { androidx.compose.material3.Icon(HeikaIcons.Share, null); Text("分享月报") }
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
                                                .clickable {
                                                    if (selectedDay != date) {
                                                        viewModel.selectDate(date)
                                                        HeikaNoticeBus.showSelection("探索日期：$date")
                                                    }
                                                },
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
                val sharedImageModifier = if (record.post != null && sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
                    with(sharedTransitionScope) {
                        Modifier.heikaSharedPostImage(
                            sharedTransitionScope = sharedTransitionScope,
                            animatedVisibilityScope = animatedVisibilityScope,
                            postKey = record.post?.sharedImageKey() ?: record.postId.lowercase(),
                            isDetail = false,
                            enabled = true,
                            sourceCornerRadius = 8.dp,
                        )
                    }
                } else Modifier
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surface).clickable { onPost(record) }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!record.image.isNullOrBlank()) Box(Modifier.size(60.dp, 68.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant).then(sharedImageModifier)) {
                        AsyncImage(record.image, null, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    }
                    else Box(Modifier.size(60.dp, 68.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant).then(sharedImageModifier), contentAlignment = Alignment.Center) {
                        Text("黑卡", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    }
                    Column(Modifier.weight(1f).padding(start = 11.dp)) {
                        Text(record.tag, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                        Text(record.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                        Text("${rarityLabel(record.rarityTier)} · ${record.openedAt.replace('T', ' ').take(16)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                    androidx.compose.material3.Icon(HeikaIcons.Forward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (state.loading && state.records.isEmpty()) item { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
        }
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun CoExploreScreen(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onPost: (HeikaPost) -> Unit,
    viewModel: CoExploreViewModel = hiltViewModel(),
    inviteCode: String? = null,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    sharedElementsEnabled: Boolean = false,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(viewModel, inviteCode) { viewModel.initialize(inviteCode) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("双人探索", onBack) {
            if (state.inviteCode.isNotBlank()) androidx.compose.material3.IconButton(onClick = viewModel::refresh) { androidx.compose.material3.Icon(HeikaIcons.Retry, "刷新房间") }
        }
        if (state.accountId == null) {
            Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("登录后使用双人探索", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Button(onClick = onLogin, modifier = Modifier.padding(top = 12.dp)) { Text("登录") }
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
                                TextButton(onClick = { shareText(context, "和我一起探索黑卡", "https://moonclean.shop/?room=${state.inviteCode}") }) { androidx.compose.material3.Icon(HeikaIcons.Share, null); Text("邀请") }
                            }
                            Text("邀请码  ${state.inviteCode}", color = MaterialTheme.colorScheme.primary, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (state.expiresAt.isBlank()) "房间有效期由服务端管理" else "有效至 ${state.expiresAt.replace('T', ' ').take(16)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.weight(1f))
                                TextButton(onClick = { copyText(context, "HEIKA 邀请码", state.inviteCode) }) { androidx.compose.material3.Icon(HeikaIcons.Copy, null); Text("复制") }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                            Text("发起者  ·  ${if (state.hostId == state.accountId) "你" else "已加入"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
                            Text("伙伴  ·  ${if (state.guestId == null) "等待加入" else if (state.guestId == state.accountId) "你已加入" else "已加入"}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
                            if (!state.expired && !state.revealed) TextButton(onClick = viewModel::refresh, modifier = Modifier.align(Alignment.End)) { androidx.compose.material3.Icon(HeikaIcons.Retry, null); Text("刷新") }
                        }
                    }
                    if (state.revealed) {
                        item { Text("彼此的灵感已揭晓", color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                        items(state.picks, key = { it.userId }) { pick ->
                            val sharedModifier = if (pick.post != null && sharedElementsEnabled && sharedTransitionScope != null && animatedVisibilityScope != null) {
                                with(sharedTransitionScope) {
                                    Modifier.heikaSharedPostImage(sharedTransitionScope, animatedVisibilityScope, pick.post.sharedImageKey(), isDetail = false, enabled = true, sourceCornerRadius = 9.dp)
                                }
                            } else Modifier
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).clickable { pick.post?.let(onPost) }.padding(12.dp)) {
                                if (pick.image != null) Box(Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surfaceVariant).then(sharedModifier)) {
                                    AsyncImage(pick.image, null, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                }
                                else if (pick.post != null) Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surfaceVariant).then(sharedModifier), contentAlignment = Alignment.Center) { Text("黑卡", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }
                                Text("${pick.nickname} 分享了", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 9.dp))
                                Text(pick.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 4.dp))
                                if (pick.note.isNotBlank()) Text(pick.note, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
                            }
                        }
                    } else if (state.ownPick) {
                        item {
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                androidx.compose.material3.Icon(HeikaIcons.Locked, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(25.dp))
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
                            CandidatePostRow(post, selected = state.selectedPostId == post.cloudId, enabled = state.guestId != null && !state.busy, onClick = {
                                if (state.selectedPostId != post.cloudId) {
                                    viewModel.selectPost(post.cloudId)
                                    HeikaNoticeBus.showSelection("已选择：${post.title}")
                                }
                            })
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
            androidx.compose.material3.IconButton(onClick = { viewModel.load(force = true) }, enabled = !state.refreshing) { androidx.compose.material3.Icon(HeikaIcons.Retry, "刷新") }
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
                            Surface(onClick = {
                                if (!selected) {
                                    viewModel.selectPost(post.cloudId)
                                    HeikaNoticeBus.showSelection("接龙内容已选择：${post.title}")
                                }
                            }, shape = RoundedCornerShape(9.dp), color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant) {
                                Row(Modifier.width(190.dp).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (!post.thumbnail.isNullOrBlank()) AsyncImage(post.thumbnail, null, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.size(45.dp).clip(RoundedCornerShape(7.dp)), contentScale = ContentScale.Crop)
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
                    TextButton(onClick = { shareText(context, chain.title, "https://moonclean.shop/?chain=${chain.id}") }) { androidx.compose.material3.Icon(HeikaIcons.Share, null); Text("分享接龙") }
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
        BackHeader("故事内容", onBack) { androidx.compose.material3.IconButton(onClick = { shareText(context, chain?.title ?: "黑卡故事接龙", "https://moonclean.shop/?chain=$chainId") }) { androidx.compose.material3.Icon(HeikaIcons.Share, "分享接龙") } }
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
                        if (!chain.seedImage.isNullOrBlank()) AsyncImage(chain.seedImage, null, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).height(190.dp), contentScale = ContentScale.Crop)
                        Text(chain.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
                        Text(chain.prompt, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 7.dp))
                        Row(Modifier.padding(top = 9.dp).clickable { onSeedPost(chain.seedPostId) }, verticalAlignment = Alignment.CenterVertically) {
                            Text("查看起始作品", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                            androidx.compose.material3.Icon(HeikaIcons.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(15.dp))
                        }
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
    if (showCloseConfirm && chain != null) HeikaGlassDialog(
        title = "结束这个接龙？",
        message = "结束后其他探索者将不能继续参与，已有记录会保留。",
        confirmText = "结束接龙",
        destructive = true,
        onConfirm = { showCloseConfirm = false; viewModel.close(chain.id) },
        onCancel = { showCloseConfirm = false },
    )
}

@Composable
private fun CandidatePostRow(post: HeikaPost, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surface).clickable(enabled = enabled, onClick = onClick).padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
        if (!post.thumbnail.isNullOrBlank()) AsyncImage(post.thumbnail, null, imageLoader = LocalHeikaImageLoader.current, modifier = Modifier.size(55.dp, 62.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(post.title, color = MaterialTheme.colorScheme.onBackground, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(post.tag, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        }
        if (selected) androidx.compose.material3.Icon(com.heika.nativeapp.ui.HeikaIcons.Check, contentDescription = "已选择", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 4.dp).size(18.dp))
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
        androidx.compose.material3.Icon(HeikaIcons.Forward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
    HeikaNoticeBus.show("已复制", HeikaNoticeKind.SUCCESS)
}

private fun shareText(context: Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_SUBJECT, title); putExtra(Intent.EXTRA_TEXT, text) }
    runCatching { context.startActivity(Intent.createChooser(intent, title)) }
}
