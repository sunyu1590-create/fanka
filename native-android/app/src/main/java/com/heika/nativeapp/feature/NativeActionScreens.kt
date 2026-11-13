package com.heika.nativeapp.feature

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import com.heika.nativeapp.ui.HeikaIcons

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
    }
}

private data class MemberPlan(val id: String, val title: String, val quota: Int, val price: String, val details: List<String>, val note: String)
private val memberPlans = listOf(
    MemberPlan("free", "Free", 5, "免费", listOf("每日基础翻卡额度 5 次", "基础内容浏览、收藏、评论与分享", "参与社区探索及成长记录"), "免费基础权益持续可用。"),
    MemberPlan("plus", "Plus", 9, "¥12 / 月（预览）", listOf("每日基础翻卡额度 9 次", "内容浏览、收藏、评论与分享按现有账号权限使用", "额外幸运奖励与基础额度分开计算"), "当前没有开放在线订阅或付费专属功能。"),
    MemberPlan("pro", "Pro", 13, "¥16 / 月（预览）", listOf("每日基础翻卡额度 13 次", "内容浏览、收藏、评论与分享按现有账号权限使用", "额外幸运奖励与基础额度分开计算"), "当前没有开放在线订阅或付费专属功能。"),
)

@Composable
fun MembershipScreen(onBack: () -> Unit, onLogin: () -> Unit, onAbout: () -> Unit = {}, viewModel: NativeActionViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.loadMembership() }
    val actualTier = state.tier.lowercase().takeIf { it in setOf("free", "plus", "pro") } ?: "free"
    var previewTier by remember(actualTier) { mutableStateOf(actualTier) }
    var detailsExpanded by remember { mutableStateOf(false) }
    var faqExpanded by remember { mutableStateOf(false) }
    val selected = memberPlans.first { it.id == previewTier }
    val loginError = state.error?.takeIf { it.contains("登录") }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("会员与支持", onBack)
        if (loginError != null) {
            Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("登录后查看当前会员权益", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp)); Button(onClick = onLogin) { Text("登录") }
            }
        } else LazyColumn(contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text("HEIKA MEMBER", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Medium); Text(if (state.membershipLoaded) actualTier.uppercase() else "等级暂不可用", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                        MemberTierBadge(if (state.membershipLoaded) actualTier.uppercase() else "HEIKA")
                    }
                    Text("探索未知，发现更多。", color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                    if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MemberMetric("每日基础额度", if (state.membershipLoaded) "${memberPlans.first { it.id == actualTier }.quota} 次 / 日" else "暂不可用", Modifier.weight(1f))
                        MemberMetric("经验值", if (state.membershipLoaded) "${state.experience} EXP" else "暂不可用", Modifier.weight(1f))
                    }
                    state.error?.takeUnless { it.contains("登录") }?.let { Text("会员数据暂不可用，当前展示缓存等级。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
                }
            }
            item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("会员方案预览", color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    memberPlans.forEach { plan ->
                        val active = previewTier == plan.id
                        Column(Modifier.width(112.dp).heightIn(min = 102.dp).clip(RoundedCornerShape(14.dp))
                            .background(if (active) MaterialTheme.colorScheme.primary.copy(alpha = .10f) else MaterialTheme.colorScheme.surface)
                            .border(if (active) 1.dp else .5.dp, if (active) MaterialTheme.colorScheme.primary.copy(alpha = .65f) else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                            .clickable { previewTier = plan.id }.padding(11.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) { Text(plan.title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold); if (active) Icon(HeikaIcons.Check, contentDescription = "已选择${plan.title}预览", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(15.dp)) }
                            if (plan.id == actualTier) Text("当前账号", color = MaterialTheme.colorScheme.primary, fontSize = 9.sp)
                            Text("${plan.quota} 次 / 日", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                            Text(plan.price, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                    }
                }
            } }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Text("${selected.title} 权益", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold); Text("${selected.quota} 次 / 日", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp) }
                    AnimatedContent(targetState = selected, transitionSpec = { fadeIn(tween(210)) togetherWith fadeOut(tween(170)) }, label = "membership-benefit-preview") { plan ->
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            plan.details.take(if (detailsExpanded) plan.details.size else 2).forEach { Text("•  $it", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp) }
                            AnimatedVisibility(detailsExpanded, enter = fadeIn(tween(220)) + expandVertically(tween(220)), exit = fadeOut(tween(180)) + shrinkVertically(tween(180))) { Text("幸运奖励单独计算，不包含在每日基础额度中。实际体验还受当前账号权限及服务端规则约束。${plan.note}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp) }
                        }
                    }
                    TextButton(onClick = { detailsExpanded = !detailsExpanded }) { Text(if (detailsExpanded) "收起权益详情" else "查看权益详情") }
                }
            }
            item { Text("会员方案仅供预览，暂未开放在线订阅。不会创建订单、发起支付或更改账号等级。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp) }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("一份独立开发的坚持", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("黑卡由个人开发者独立开发与维护。从最初的想法，到现在不断成长的内容社区，每一次探索、建议与分享，都是黑卡继续前进的动力。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Text("服务器、内容存储与持续维护都需要投入。感谢你使用黑卡，也欢迎通过意见反馈分享建议。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    TextButton(onClick = onAbout) { Text("了解我们的故事  ›") }
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { faqExpanded = !faqExpanded }) { Text("会员与额度规则", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(if (faqExpanded) "收起" else "常见问题 · 查看", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }
                    AnimatedVisibility(faqExpanded) { Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("每日基础额度按 Free 5 次、Plus 9 次、Pro 13 次计算；额外幸运奖励独立计入。EXP 与成长任务按服务端记录为准。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                        Text("当前没有在线订阅、购买或支持渠道。会员预览不会更改真实账号等级。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    } }
                }
            }
        }
    }
}

@Composable private fun MemberMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.background.copy(alpha = .55f)).padding(horizontal = 10.dp, vertical = 8.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
        Text(value, color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable private fun MemberTierBadge(label: String) {
    Text(label, Modifier.clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)).padding(horizontal = 11.dp, vertical = 7.dp), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
}
