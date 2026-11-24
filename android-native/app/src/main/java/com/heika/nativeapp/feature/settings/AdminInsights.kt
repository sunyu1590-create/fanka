package com.heika.nativeapp.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.ui.HeikaIcons
import com.heika.nativeapp.ui.HeikaPulseLines
import com.heika.nativeapp.ui.HeikaRadii
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * 监控 / 媒体 / 存储 / 告警 / 人工复审：与网页端管理后台同源同字段。
 * 所有数字来自服务端接口；缺失时显示「暂无采集」而不是补 0 或画假曲线。
 */

private fun JSONObject.numberOf(key: String): Double? {
    if (!has(key)) return null
    val value = opt(key) ?: return null
    if (value == JSONObject.NULL) return null
    val parsed = optDouble(key, Double.NaN)
    return if (parsed.isNaN()) null else parsed
}

private fun JSONObject.textOf(key: String): String? = optString(key).takeIf { it.isNotBlank() && it != "null" }

private fun percentText(value: Double?): String = value?.let { "${it.roundToInt()}%" } ?: "—"

private fun bytesText(bytes: Double?): String {
    val value = bytes ?: return "—"
    return when {
        value < 1024 -> "${value.toLong()} B"
        value < 1024 * 1024 -> String.format("%.1f KB", value / 1024)
        value < 1024.0 * 1024 * 1024 -> String.format("%.1f MB", value / 1024 / 1024)
        else -> String.format("%.2f GB", value / 1024 / 1024 / 1024)
    }
}

private fun msText(value: Double?): String = value?.let { "${it.roundToInt()} ms" } ?: "—"

@Composable
private fun AdminCard(title: String? = null, content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(HeikaRadii.surface))
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .3f), RoundedCornerShape(HeikaRadii.surface))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (title != null) Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

@Composable
private fun AdminKV(label: String, value: String, tone: Int = 0) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            color = when (tone) {
                1 -> MaterialTheme.colorScheme.primary
                2 -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurface
            },
        )
    }
}

@Composable
private fun MetricRing(label: String, value: Double?, detail: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(HeikaRadii.surface))
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .3f), RoundedCornerShape(HeikaRadii.surface))
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                progress = { ((value ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.size(56.dp),
                strokeWidth = 5.dp,
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Text(percentText(value), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Text(detail, fontSize = 9.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

@Composable
fun AdminMonitorPanel(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    val metrics = state.metrics
    val current = metrics?.optJSONObject("current")
    val live = metrics?.optJSONObject("live_requests")
    val alerts = metrics?.optJSONArray("open_alerts") ?: JSONArray()
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("1h" to "1 小时", "24h" to "24 小时", "7d" to "7 天").forEach { (key, label) ->
                    val selected = state.monitorRange == key
                    Text(
                        label,
                        fontSize = 11.5.sp,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clipChip()
                            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .clickable { viewModel.setMonitorRange(key) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
        if (state.loading && metrics == null) item { HeikaPulseLines(Modifier.fillMaxWidth(), lines = 4, lineHeight = 12.dp) }
        if (current == null && metrics != null) item {
            AdminCard { Text("暂无采集数据", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); Text("采集器尚未写入 system_metrics，页面不会用模拟数据填充。", fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        if (current != null) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MetricRing("CPU", current.numberOf("cpu_percent"), "load ${current.numberOf("load1")?.let { String.format("%.2f", it) } ?: "—"}", Modifier.weight(1f))
                    MetricRing("内存", current.numberOf("mem_percent"), "可用 ${bytesText(current.numberOf("mem_available"))}", Modifier.weight(1f))
                    MetricRing("磁盘", current.numberOf("disk_percent"), "剩余 ${bytesText(current.numberOf("disk_free"))}", Modifier.weight(1f))
                }
            }
            item {
                AdminCard("接口性能") {
                    AdminKV("平均延迟", msText(current.numberOf("api_avg_ms") ?: live?.numberOf("avg_ms")))
                    AdminKV("P95 延迟", msText(current.numberOf("api_p95_ms") ?: live?.numberOf("p95_ms")))
                    AdminKV("采样请求数", (current.numberOf("api_requests") ?: live?.numberOf("requests"))?.toLong()?.toString() ?: "—")
                    AdminKV("错误率", live?.numberOf("error_rate")?.let { String.format("%.2f%%", it) } ?: "—")
                }
            }
            item {
                AdminCard("网络与采集") {
                    AdminKV("入站速率", "${bytesText(current.numberOf("net_rx_rate"))}/s")
                    AdminKV("出站速率", "${bytesText(current.numberOf("net_tx_rate"))}/s")
                    AdminKV("采集时间", current.textOf("captured_at") ?: "—")
                }
            }
        }
        item { Text("当前告警", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        if (alerts.length() == 0) item { Text("当前没有未恢复告警", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items((0 until alerts.length()).mapNotNull { alerts.optJSONObject(it) }) { alert ->
            AdminCard {
                Text(alert.textOf("title") ?: alert.textOf("alert_type") ?: "告警", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                Text(alert.textOf("detail") ?: "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text("${alert.textOf("level") ?: "warning"} · 出现 ${alert.optInt("occurrences", 1)} 次", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun Modifier.clipChip(): Modifier = this.clip(RoundedCornerShape(HeikaRadii.chip))

@Composable
fun AdminMediaPanel(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    val overview = state.mediaOverview
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        if (state.loading && overview == null) item { HeikaPulseLines(Modifier.fillMaxWidth(), lines = 3, lineHeight = 12.dp) }
        if (overview != null) {
            item {
                AdminCard("上传成功率") {
                    Text(
                        overview.numberOf("final_success_rate")?.let { String.format("%.1f%%", it) } ?: "—",
                        fontSize = 30.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    AdminKV("首次成功率", overview.numberOf("first_attempt_success_rate")?.let { String.format("%.1f%%", it) } ?: "—")
                    AdminKV("成功 / 失败", "${overview.optInt("ready")} / ${overview.optInt("failed")}")
                    AdminKV("传输量", bytesText(overview.numberOf("total_bytes")))
                    AdminKV("平均耗时", msText(overview.numberOf("avg_duration_ms")))
                    AdminKV("P95 耗时", msText(overview.numberOf("p95_duration_ms")))
                    overview.textOf("sample_note")?.let { Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
        item { Text("最近任务", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        if (state.mediaTasks.isEmpty()) item { Text("当前窗口内没有上传任务", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(state.mediaTasks, key = { it.optString("task_key") }) { task ->
            AdminCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(task.textOf("file_name") ?: "媒体文件", fontSize = 12.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(task.textOf("status") ?: "—", fontSize = 10.5.sp, color = if (task.textOf("status") == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                }
                Text("${bytesText(task.numberOf("file_size"))} · ${task.textOf("client_type") ?: "未知端"} · ${task.textOf("updated_at") ?: ""}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                task.textOf("error_message")?.let { Text(it, fontSize = 10.5.sp, color = MaterialTheme.colorScheme.error, maxLines = 2) }
                val path = task.textOf("storage_path")
                if (path != null) {
                    TextButton(
                        onClick = { viewModel.verifyMedia(path) },
                        enabled = state.saving == null,
                    ) { Text(if (state.saving == "media-verify") "核验中…" else "核验存储对象", fontSize = 11.sp) }
                }
            }
        }
    }
}

@Composable
fun AdminStoragePanel(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    val storage = state.storage
    val buckets = storage?.optJSONArray("buckets") ?: JSONArray()
    val maxBytes = (0 until buckets.length()).mapNotNull { buckets.optJSONObject(it)?.numberOf("bytes") }.maxOrNull() ?: 0.0
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        if (state.loading && storage == null) item { HeikaPulseLines(Modifier.fillMaxWidth(), lines = 3, lineHeight = 12.dp) }
        if (storage != null) {
            item {
                AdminCard("存储占用") {
                    AdminKV("媒体资产", storage.opt("media_assets")?.toString() ?: "—")
                    AdminKV("作品媒体关联", storage.opt("post_media_rows")?.toString() ?: "—")
                    storage.textOf("note")?.let { Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            items((0 until buckets.length()).mapNotNull { buckets.optJSONObject(it) }) { bucket ->
                val bytes = bucket.numberOf("bytes") ?: 0.0
                AdminCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(bucket.textOf("bucket") ?: "bucket", fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
                        Text(bytesText(bytes), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("${bucket.optInt("files")} 个对象", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LinearProgressIndicator(
                        progress = { if (maxBytes > 0) (bytes / maxBytes).toFloat() else 0f },
                        modifier = Modifier.fillMaxWidth().height(5.dp),
                    )
                    bucket.textOf("error")?.let { Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
fun AdminAlertsPanel(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("open" to "未恢复", "all" to "全部").forEach { (key, label) ->
                    val selected = state.alertScope == key
                    Text(
                        label,
                        fontSize = 11.5.sp,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clipChip()
                            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .clickable { viewModel.setAlertScope(key) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
        if (state.loading && state.alerts.isEmpty()) item { HeikaPulseLines(Modifier.fillMaxWidth(), lines = 3, lineHeight = 12.dp) }
        if (state.alerts.isEmpty() && !state.loading) item {
            Text(if (state.alertScope == "open") "当前没有未恢复的告警" else "暂无告警记录", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.alerts, key = { it.optString("id") }) { alert ->
            AdminCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(alert.textOf("title") ?: alert.textOf("alert_type") ?: "告警", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(alert.textOf("status") ?: "—", fontSize = 10.5.sp, color = if (alert.textOf("status") == "resolved") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                }
                alert.textOf("detail")?.let { Text(it, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3) }
                Text("出现 ${alert.optInt("occurrences", 1)} 次 · ${alert.textOf("last_seen_at") ?: ""}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (alert.textOf("status") != "resolved") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { viewModel.alertAction(alert.optString("id"), "acknowledge") }, enabled = state.saving == null) { Text("确认", fontSize = 11.sp) }
                        Button(onClick = { viewModel.alertAction(alert.optString("id"), "resolve") }, enabled = state.saving == null) { Text("标记恢复", fontSize = 11.sp) }
                    }
                }
            }
        }
    }
}

@Composable
fun AdminReviewPanel(state: AdminCenterState, viewModel: AdminCenterViewModel) {
    val reviewItems = state.aiTasks?.optJSONArray("reviewItems") ?: JSONArray()
    val batches = state.aiTasks?.optJSONArray("batches") ?: JSONArray()
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        if (state.loading && state.aiTasks == null) item { HeikaPulseLines(Modifier.fillMaxWidth(), lines = 3, lineHeight = 12.dp) }
        item {
            AdminCard("审核概况") {
                AdminKV("待人工复审", reviewItems.length().toString(), if (reviewItems.length() > 0) 1 else 0)
                AdminKV("分析批次", batches.length().toString())
                Text("AI 只做初审与风险标注，最终是否公开由管理员决定；出现「作品不可用」时表示内容记录缺失，只能重新分析。", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items((0 until reviewItems.length()).mapNotNull { reviewItems.optJSONObject(it) }, key = { it.optString("id") }) { item ->
            val unavailable = item.optJSONObject("post") == null || item.optBoolean("blocked")
            AdminCard {
                Text(item.textOf("title") ?: "未命名作品", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${item.textOf("author") ?: "作者未知"} · ${item.textOf("category") ?: "未分类"}", fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                item.textOf("ai_reason")?.let { Text(it, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3) }
                if (unavailable) {
                    Text("作品不可用：内容记录缺失或已删除，无法直接通过", fontSize = 10.5.sp, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { viewModel.reviewDecision(item.optString("batch_id"), item.optString("id"), "reanalyze") }, enabled = state.saving == null) { Text("重新分析", fontSize = 11.sp) }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = { viewModel.reviewDecision(item.optString("batch_id"), item.optString("id"), "published") }, enabled = state.saving == null, modifier = Modifier.weight(1f)) { Text("通过", fontSize = 11.sp) }
                        OutlinedButton(onClick = { viewModel.reviewDecision(item.optString("batch_id"), item.optString("id"), "revision") }, enabled = state.saving == null, modifier = Modifier.weight(1f)) { Text("退回", fontSize = 11.sp) }
                        OutlinedButton(onClick = { viewModel.reviewDecision(item.optString("batch_id"), item.optString("id"), "hidden") }, enabled = state.saving == null, modifier = Modifier.weight(1f)) { Text("驳回", fontSize = 11.sp) }
                    }
                }
            }
        }
        if (reviewItems.length() == 0 && !state.loading) item {
            Text("暂无待人工复审的内容", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
