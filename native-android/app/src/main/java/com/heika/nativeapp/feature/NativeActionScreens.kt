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
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
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
    MemberPlan("free", "Free", 5, "免费", listOf("每日基础翻卡额度 5 次", "基础内容浏览、收藏、评论与分享"), "免费基础权益持续可用。"),
    MemberPlan("plus", "Plus", 9, "方案配置暂不可用", listOf("每日基础翻卡额度 9 次", "保留现有浏览与社区功能", "自愿支持独立开发者"), "购买须通过实际配置的爱发电商品获取激活码。"),
    MemberPlan("pro", "Pro", 13, "方案配置暂不可用", listOf("每日基础翻卡额度 13 次", "保留现有浏览与社区功能", "支持黑卡持续维护"), "购买须通过实际配置的爱发电商品获取激活码。"),
)

@Composable
fun MembershipScreen(onBack: () -> Unit, onLogin: () -> Unit, onAbout: () -> Unit = {}, onRedeem: () -> Unit = {}, viewModel: NativeActionViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(Unit) { viewModel.loadMembership() }
    DisposableEffect(lifecycleOwner, viewModel) {
        var initialLoadObserved = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (initialLoadObserved) viewModel.loadMembership() else initialLoadObserved = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val actualTier = state.tier.lowercase().takeIf { it in setOf("free", "plus", "pro") } ?: "free"
    var previewTier by remember(actualTier) { mutableStateOf(actualTier) }
    var detailsExpanded by remember { mutableStateOf(false) }
    var supportInfoExpanded by remember { mutableStateOf(false) }
    var faqExpanded by remember { mutableStateOf(false) }
    val configuredPlans = remember(state.membershipData) {
        val rows = state.membershipData?.optJSONArray("plans")
        if (rows == null || rows.length() == 0) memberPlans else (0 until rows.length()).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            val id = row.optString("tier")
            if (id !in setOf("free", "plus", "pro")) return@mapNotNull null
            val benefits = row.optJSONArray("benefits")
            val details = if (benefits == null) emptyList() else (0 until benefits.length()).mapNotNull { benefits.optString(it).takeIf(String::isNotBlank) }
            val cents = row.optInt("support_price_cents")
            val price = if (id == "free") "免费" else "¥${cents / 100}${if (cents % 100 == 0) "" else ".${(cents % 100).toString().padStart(2, '0')}"} / ${row.optInt("duration_days", 30)} 天"
            MemberPlan(id, row.optString("display_name", id.uppercase()), row.optInt("daily_flips", 5), price, details.ifEmpty { memberPlans.first { it.id == id }.details }, "会员预览不创建订单或直接修改账号等级。")
        }.ifEmpty { memberPlans }
    }
    val selected = configuredPlans.firstOrNull { it.id == previewTier } ?: configuredPlans.first { it.id == actualTier }
    val loginError = state.error?.takeIf { it.contains("登录") }
    val context = LocalContext.current
    val currentAllowance = state.membershipData?.optInt("dailyAllowance") ?: selected.quota
    val remainingAllowance = state.membershipData?.optInt("remaining") ?: currentAllowance
    val expiresAt = state.membershipData?.optString("expiresAt")?.takeIf { it.isNotBlank() && it != "null" }
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
                        MemberMetric("每日翻卡额度", if (state.membershipLoaded) "${currentAllowance} 次 / 日" else "暂不可用", Modifier.weight(1f))
                        MemberMetric("今日剩余", if (state.membershipLoaded) "$remainingAllowance 次" else "暂不可用", Modifier.weight(1f))
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MemberMetric("经验值", if (state.membershipLoaded) "${state.experience} EXP" else "暂不可用", Modifier.weight(1f))
                        if (actualTier != "free") MemberMetric("会员到期", expiresAt?.take(10) ?: "长期有效", Modifier.weight(1f))
                    }
                    state.error?.takeUnless { it.contains("登录") }?.let { Text("会员数据暂不可用，当前展示缓存等级。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp) }
                }
            }
            item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("探索会员方案", color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    configuredPlans.forEach { plan ->
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
            item { Text("会员方案仅供预览，暂未开放在线订阅。切换档位不会创建订单、发起支付或更改账号等级。爱发电商品配置完成后，按商品说明领取激活码。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp) }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("一个人的开发，也需要大家的支持", color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("黑卡 HEIKA 由个人独立开发与维护，运行依赖 Vercel 应用服务和 Supabase 数据库及内容存储。海外部署可能让国内部分地区访问较慢；存储、网络与持续维护也需要投入。作为一名还在读高三的开发者，我希望将更多时间用于改善体验和建设内容。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Text("支持完全自愿，免费功能会持续保留。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    Button(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://afdian.com/a/heikaka"))) }.onFailure { Toast.makeText(context, "无法打开爱发电，请稍后重试", Toast.LENGTH_SHORT).show() } }, modifier = Modifier.fillMaxWidth()) { Text("前往爱发电支持  ↗") }
                    TextButton(onClick = onRedeem) { Text("已经获得卡密？兑换会员") }
                    Row(Modifier.fillMaxWidth().clickable { supportInfoExpanded = !supportInfoExpanded }, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("你的支持将用于哪里？", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            Text("服务器、数据库、内容服务与体验优化", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                        }
                        Icon(HeikaIcons.Forward, contentDescription = if (supportInfoExpanded) "收起支持用途" else "查看支持用途", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp).rotate(if (supportInfoExpanded) 270f else 90f))
                    }
                    AnimatedVisibility(supportInfoExpanded, enter = fadeIn(tween(220)) + expandVertically(tween(220)), exit = fadeOut(tween(180)) + shrinkVertically(tween(180))) {
                        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            listOf("应用部署与服务器维护", "数据库、存储与网络资源", "内容及图片服务", "应用功能优化与国内访问体验改善").forEach { item ->
                                Text("•  $item", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp)
                            }
                        }
                    }
                    TextButton(onClick = onAbout) { Text("了解开发者故事  ›") }
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { faqExpanded = !faqExpanded }) { Text("会员与额度规则", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(if (faqExpanded) "收起" else "常见问题 · 查看", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }
                    AnimatedVisibility(faqExpanded) { Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("每日基础额度按 Free 5 次、Plus 9 次、Pro 13 次计算；额外幸运奖励独立计入。EXP 与成长任务按服务端记录为准。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                        Text("爱发电通过项目商品配置发放激活码；在线订单自动同步尚未接入。兑换前会先验证卡密、等级和有效期。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    } }
                }
            }
        }
    }
}

@Composable
fun MembershipRedeemScreen(onBack: () -> Unit, onLogin: () -> Unit, viewModel: NativeActionViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var code by remember { mutableStateOf("") }
    val preview = state.redeemPreview
    val result = state.redeemResult
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("兑换会员", onBack)
        Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Icon(HeikaIcons.Tag, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                Text(if (result != null) "探索权益已激活" else "激活你的探索权益", color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text("输入通过爱发电获得的会员激活码。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            if (result == null) {
                OutlinedTextField(value = code, onValueChange = { code = it.uppercase().filter { ch -> ch.isLetterOrDigit() || ch == '-' }.take(40); viewModel.clearMembershipRedemption() }, modifier = Modifier.fillMaxWidth(), label = { Text("会员激活码") }, placeholder = { Text("HEIKA-XXXX-XXXX-XXXX-XXXX-XXXX") }, singleLine = true, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii, autoCorrect = false))
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
                if (state.error?.contains("登录") == true) Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) { Text("登录后继续兑换") }
                if (preview == null) Button(onClick = { viewModel.previewMembershipCode(code) }, enabled = !state.sending && code.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(if (state.sending) "正在验证…" else "验证激活码") }
                else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${preview.optString("tier").uppercase()} · ${preview.optInt("durationDays")} 天", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("预计生效：${preview.optString("effectiveFrom").take(10)}\n预计到期：${preview.optString("expiresAt").take(10)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Text("确认后将为当前账号兑换，不能撤回。会员状态与翻卡额度由服务端更新。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 17.sp)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { viewModel.clearMembershipRedemption() }, enabled = !state.sending, modifier = Modifier.weight(1f)) { Text("取消") }
                        Button(onClick = { viewModel.confirmMembershipCode(code) }, enabled = !state.sending, modifier = Modifier.weight(1f)) { Text(if (state.sending) "正在兑换…" else "确认兑换") }
                    }
                }
            } else {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${result.optString("tier").uppercase()} 权益已激活", color = MaterialTheme.colorScheme.primary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("账号当前等级：${result.optString("membershipTier").uppercase()}\n有效至：${result.optString("expiresAt").take(10)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Button(onClick = { code = ""; viewModel.clearMembershipRedemption(); onBack() }, modifier = Modifier.fillMaxWidth()) { Text("完成") }
                }
            }
            TextButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://afdian.com/a/heikaka"))) }.onFailure { Toast.makeText(context, "无法打开爱发电，请稍后重试", Toast.LENGTH_SHORT).show() } }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("还没有激活码？前往爱发电") }
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
