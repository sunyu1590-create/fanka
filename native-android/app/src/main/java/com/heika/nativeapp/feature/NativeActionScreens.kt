package com.heika.nativeapp.feature

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.FilterChip

@Composable
fun FeedbackScreen(onBack: () -> Unit, onLogin: () -> Unit, viewModel: NativeActionViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var category by remember { mutableStateOf("suggestion") }
    var message by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("意见反馈", onBack)
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            Text("告诉我们你遇到的问题或希望改进的地方。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf("suggestion" to "建议", "problem" to "问题", "other" to "其他").forEach { (value, label) -> FilterChip(label, category == value, { category = value }) }
            }
            OutlinedTextField(value = message, onValueChange = { message = it.take(3000) }, modifier = Modifier.fillMaxWidth(), label = { Text("反馈内容") }, placeholder = { Text("请尽量描述复现步骤或期望…") }, minLines = 7, maxLines = 12, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences), supportingText = { Text("${message.length}/3000 · 至少 10 个字符") })
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
            if (state.error?.contains("登录") == true) Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) { Text("登录") }
            state.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }
            Button(onClick = { viewModel.submitFeedback(category, message) }, enabled = !state.sending && message.trim().length >= 10, modifier = Modifier.fillMaxWidth()) {
                if (state.sending) CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary) else Text("提交反馈")
            }
            Text("反馈将关联当前登录账号，仅用于产品改进与问题处理。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
fun MembershipScreen(onBack: () -> Unit, onLogin: () -> Unit, viewModel: NativeActionViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.loadMembership() }
    val tier = state.tier.lowercase().let { if (it in setOf("plus", "pro")) it else "free" }
    val activeAllowance = when (tier) { "plus" -> 9; "pro" -> 13; else -> 5 }
    val loginError = state.error?.takeIf { it.contains("登录") }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("会员与支持", onBack)
        if (loginError != null) {
            Column(Modifier.fillMaxWidth().padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(loginError, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onLogin) { Text("登录") }
            }
        } else androidx.compose.foundation.lazy.LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surface).padding(17.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("HEIKA · 支持计划", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp)
                    Text("让每一次翻卡，都有下一次。", color = MaterialTheme.colorScheme.onBackground, fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
                    Text("当前账号等级：${tier.uppercase()} · 基础每日额度 $activeAllowance 次 · ${state.experience} EXP", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
            }
            if (state.loading) item { androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) } }
            item { Text("关于黑卡，我想说几句话。", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
            item { Text("黑卡由个人开发和维护。最初只是想创造一个不太一样的内容世界，希望每一次翻卡，都能带来一些未知的惊喜。使用黑卡、提出建议或分享给朋友，都是对它的支持。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 20.sp) }
            item { Text("会员方案预览", color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(Triple("Free", "5 次 / 日", "免费"), Triple("Plus", "9 次 / 日", "¥12 / 月（预览）"), Triple("Pro", "13 次 / 日", "¥16 / 月（预览）")).forEach { (name, quota, price) ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(name, color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold); Text(quota, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
                            Text(price, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                        }
                    }
                }
            }
            item {
                Text("当前没有开放线上订阅或支持渠道。以上方案仅作权益预览，不会扣费、创建订单或更改账号等级。基础额度以系统计算结果为准，幸运奖励另行计入。", Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface).padding(13.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, lineHeight = 17.sp)
            }
        }
    }
}
