package com.heika.nativeapp.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaPulsePage

@Composable
fun AccountScreen(onBack: () -> Unit, onSignedIn: () -> Unit, viewModel: AccountViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // rememberSaveable：页面因为加载态或键盘收起而重组时，已经输入的内容不会被重置。
    var email by rememberSaveable { mutableStateOf("") }
    // 密码框用 TextFieldValue 而不是 String：String 重载会丢掉输入法的组合态，
    // 中文/符号键盘下正在组合的最后一个字符会在收起键盘时被回滚，
    // 于是提交出去的是"少一位的密码"，服务端只能回 invalid_credentials。
    var passwordField by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue("")) }
    val password = passwordField.text
    var confirmation by rememberSaveable { mutableStateOf("") }
    var nickname by rememberSaveable { mutableStateOf("") }
    var inviteCode by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    // 已登录时点"登录其他账号"进入的登录表单：会话还在，只是暂时盖住账号列表。
    var addingAccount by rememberSaveable { mutableStateOf(false) }
    val flow = state.flow
    // 恢复码是注册后的独立一步：整页展示，不再用弹窗盖住表单。
    // 用户必须先确认保存，才会回到正常登录/已登录界面。
    if (state.pendingRecoveryCodes.isNotEmpty()) {
        NewAccountRecoveryPage(state.pendingRecoveryCodes, viewModel::acknowledgeRecoveryCodes)
        return
    }
    // state 是委托属性，直接读 state.pendingInvitation 无法智能转换，先取局部变量。
    val pendingInvitation = state.pendingInvitation
    if (state.invitationWelcomePending && pendingInvitation != null) {
        InvitationWelcomePage(pendingInvitation, viewModel::acknowledgeInvitationWelcome)
        return
    }
    val focusManager = LocalFocusManager.current
    // 只有"从已登录变成未登录"（用户主动退出）才清空表单。
    // 之前只要 session 为空就清空，会在登录失败、页面重组等时机把刚输入的密码抹掉，
    // 看起来像"点登录的一瞬间密码自己清空了"。
    var hadSession by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.session?.userId) {
        if (state.session != null) {
            hadSession = true
        } else if (hadSession) {
            addingAccount = false
            email = ""
            passwordField = TextFieldValue("")
            confirmation = ""
            nickname = ""
            inviteCode = ""
            code = ""
            passwordVisible = false
            hadSession = false
        }
    }
    // 登录失败保留密码：自动清空既让用户以为输入被吞，也无法对照修改。
    // 新注册的恢复码还没确认保存时不能放行，否则用户会直接跳过这一步。
    LaunchedEffect(state.session?.userId, state.message, state.pendingRecoveryCodes.size) {
        if (state.session != null && state.pendingRecoveryCodes.isEmpty() &&
            (state.message == "登录成功" || state.message == "账号已创建，欢迎来到黑卡。")
        ) onSignedIn()
    }
    // 提交前先收起键盘，等两帧再读输入值。
    // 密码最后一个字符若还停在输入法的组合状态里，直接读 value 会拿到缺一位的密码，
    // 服务端于是回 invalid_credentials —— 表现为"明明输对了却说密码不正确，且时好时坏"。
    var pendingSubmit by remember { mutableStateOf(false) }
    val latestEmail by rememberUpdatedState(email)
    val latestPassword by rememberUpdatedState(password)
    val latestConfirmation by rememberUpdatedState(confirmation)
    val latestNickname by rememberUpdatedState(nickname)
    val latestInviteCode by rememberUpdatedState(inviteCode)
    val latestCode by rememberUpdatedState(code)
    val latestFlow by rememberUpdatedState(flow)
    LaunchedEffect(pendingSubmit) {
        if (!pendingSubmit) return@LaunchedEffect
        withFrameNanos { }
        withFrameNanos { }
        pendingSubmit = false
        when (latestFlow) {
            AccountFlow.LOGIN -> viewModel.signIn(latestEmail, latestPassword)
            AccountFlow.SIGN_UP -> viewModel.signUp(latestEmail, latestPassword, latestConfirmation, latestNickname, latestInviteCode)
            AccountFlow.RECOVERY_CODE -> viewModel.recoverWithCode(latestEmail, latestCode, latestPassword, latestConfirmation)
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("黑卡账号", onBack)
        if (state.loading) {
            HeikaPulsePage(cards = 3, cardHeight = 74.dp)
        } else if (state.session != null && flow == AccountFlow.LOGIN && !addingAccount) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("账号已登录", color = MaterialTheme.colorScheme.onBackground, fontSize = 23.sp)
                Text(state.session?.email ?: state.session?.userId.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Button(onClick = { viewModel.signOut(onBack) }, modifier = Modifier.fillMaxWidth()) { Text("退出登录") }

                Spacer(Modifier.height(6.dp))
                Text("本机账号", color = MaterialTheme.colorScheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (state.accounts.size > 1) "切换后无需重新输入密码，最多保留 5 个账号。"
                    else "登录过的账号会记在这里，下次一键切换，最多 5 个。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.5.sp,
                )
                run {
                    state.accounts.forEach { account ->
                        val current = account.userId == state.session?.userId
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(MaterialTheme.colorScheme.surface)
                                .border(
                                    if (current) 1.dp else 0.dp,
                                    if (current) MaterialTheme.colorScheme.primary.copy(alpha = .45f) else androidx.compose.ui.graphics.Color.Transparent,
                                    RoundedCornerShape(14.dp),
                                )
                                .padding(start = 12.dp, end = 6.dp, top = 9.dp, bottom = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                Modifier.size(30.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)),
                                contentAlignment = Alignment.Center,
                            ) { Text((account.email ?: "探").take(1).uppercase(), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Text(
                                    account.email ?: account.userId.take(8),
                                    color = MaterialTheme.colorScheme.onSurface, fontSize = 12.5.sp, fontWeight = FontWeight.Medium,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                                if (current) Text("当前登录", color = MaterialTheme.colorScheme.primary, fontSize = 9.5.sp)
                            }
                            if (current) {
                                TextButton(enabled = !state.busy, onClick = { viewModel.forgetAccount(account.userId) }) { Text("移除记录", fontSize = 10.sp) }
                            } else {
                                TextButton(enabled = !state.busy, onClick = { viewModel.switchAccount(account.userId) }) { Text(if (state.busy) "切换中…" else "切换", fontSize = 10.5.sp) }
                            }
                        }
                    }
                }
                androidx.compose.material3.OutlinedButton(
                    enabled = !state.busy,
                    onClick = { addingAccount = true; email = ""; passwordField = TextFieldValue("") },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("登录其他账号") }
                state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp) }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
            }
        } else {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                Text(
                    when (flow) {
                        AccountFlow.SIGN_UP -> "加入黑卡。"
                        AccountFlow.RECOVERY_CODE -> "找回密码。"
                        else -> if (addingAccount) "登录其他账号。" else "欢迎回来。"
                    },
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 25.sp,
                )
                if (addingAccount) {
                    Text(
                        "当前账号会保留在本机账号里，登录成功后自动切换过去。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp,
                    )
                }
                Text(
                    when (flow) {
                        AccountFlow.SIGN_UP -> "用邮箱和密码创建账号，无需邮箱验证码。"
                        AccountFlow.RECOVERY_CODE -> "输入注册邮箱、账号恢复码和新密码。当前账号服务使用恢复码找回，不发送邮箱验证码。"
                        else -> "使用网站现有 HEIKA 账号，原生页面共享同一会话。"
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    lineHeight = 19.sp,
                )
                OutlinedTextField(value = email, onValueChange = { email = it.take(254) }, label = { Text("邮箱") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (flow == AccountFlow.SIGN_UP) {
                    OutlinedTextField(value = nickname, onValueChange = { nickname = it.take(24) }, label = { Text("昵称（2–24 字）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = inviteCode, onValueChange = { inviteCode = it.uppercase().take(24) }, label = { Text("入驻邀请码（选填）") }, placeholder = { Text("HEIKA-XXXX-XXXX-XXXX") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
                if (flow == AccountFlow.RECOVERY_CODE) {
                    OutlinedTextField(value = code, onValueChange = { code = it.take(64) }, label = { Text("账号恢复码") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
                if (flow in setOf(AccountFlow.LOGIN, AccountFlow.SIGN_UP, AccountFlow.RECOVERY_CODE)) {
                    OutlinedTextField(
                        value = passwordField,
                        onValueChange = { value -> if (value.text.length <= 128) passwordField = value },
                        label = { Text(if (flow == AccountFlow.LOGIN) "密码" else "新密码（至少 8 位）") },
                        singleLine = true,
                        visualTransformation = if (passwordVisible) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = {
                            // 键盘上直接按"完成"就等于提交，省掉"先收起键盘再点按钮"这一步，
                            // 少了这一步就少一次组合态被回滚的机会。
                            if (!state.busy) pendingSubmit = true
                        }),
                        trailingIcon = {
                            Text(
                                if (passwordVisible) "隐藏" else "显示",
                                Modifier.clickable { passwordVisible = !passwordVisible }.padding(10.dp),
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 12.sp,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (flow in setOf(AccountFlow.SIGN_UP, AccountFlow.RECOVERY_CODE)) {
                    OutlinedTextField(value = confirmation, onValueChange = { confirmation = it.take(128) }, label = { Text("确认密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                }
                state.error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    if (flow == AccountFlow.LOGIN) {
                        Text("请确认邮箱是否正确，密码区分大小写。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    }
                }
                state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, lineHeight = 18.sp) }
                Button(
                    enabled = !state.busy && when (flow) {
                        AccountFlow.LOGIN -> email.isNotBlank() && password.isNotEmpty()
                        AccountFlow.SIGN_UP -> email.isNotBlank() && nickname.trim().length >= 2 && password.length >= 8 && confirmation.isNotEmpty()
                        AccountFlow.RECOVERY_CODE -> email.isNotBlank() && code.isNotBlank() && password.length >= 8 && confirmation.isNotEmpty()
                    },
                    onClick = {
                        // busy 里再点一次会并发发出两个登录请求，后到的失败结果会把界面打回错误态。
                        if (!state.busy) {
                            focusManager.clearFocus(force = true)
                            pendingSubmit = true
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.busy) CircularProgressIndicator(Modifier.height(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                    else Text(when (flow) {
                        AccountFlow.LOGIN -> "登录"
                        AccountFlow.SIGN_UP -> "创建账号"
                        AccountFlow.RECOVERY_CODE -> "验证恢复码并重置"
                    })
                }
                when (flow) {
                    AccountFlow.LOGIN -> {
                        Text("忘记密码？使用恢复码找回", Modifier.clickable { viewModel.setFlow(AccountFlow.RECOVERY_CODE) }.padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                        Text("创建新账号", Modifier.clickable { viewModel.setFlow(AccountFlow.SIGN_UP) }.padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                    }
                    AccountFlow.SIGN_UP -> Text("已有账号，返回登录", Modifier.clickable { viewModel.setFlow(AccountFlow.LOGIN) }.padding(8.dp), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                    AccountFlow.RECOVERY_CODE -> Text("返回登录", Modifier.clickable { viewModel.setFlow(AccountFlow.LOGIN) }.padding(8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                if (addingAccount) {
                    // 已登录状态下打开的表单：给一条不留痕迹的退路。
                    Text(
                        "返回当前账号",
                        Modifier.clickable { addingAccount = false; email = ""; passwordField = TextFieldValue("") }.padding(8.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

/**
 * 注册成功后的强制一步：整页展示恢复码并要求确认已保存。
 *
 * 找回密码目前只支持恢复码，用户如果在这里跳过，等忘记密码时账号就真的回不来了。
 * 所以这一页没有返回、没有"稍后再说"，必须勾选后才能进入。
 */
@Composable
private fun NewAccountRecoveryPage(codes: List<String>, onConfirm: () -> Unit) {
    val context = LocalContext.current
    var saved by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("最后一步。", color = MaterialTheme.colorScheme.onBackground, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "账号已创建。请保存下面这组恢复码——它是目前唯一能找回密码的方式，忘记密码时我们无法代为重置。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 20.sp,
        )
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            codes.forEach { code ->
                Text(code, color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.4.sp)
            }
        }
        Text(
            "每个码只能使用一次。请截图，或复制到密码管理器；离开本页后无法再次查看。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            lineHeight = 17.sp,
        )
        TextButton(
            onClick = {
                val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
                clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("HEIKA 账号恢复码", codes.joinToString("\n")))
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("复制全部") }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = .7f)).clickable { saved = !saved }.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Checkbox(checked = saved, onCheckedChange = { saved = it })
            Text("我已妥善保存，知道丢失后无法找回", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp)
        }
        Button(
            enabled = saved,
            onClick = onConfirm,
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) { Text("进入黑卡") }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun InvitationWelcomePage(invitation: org.json.JSONObject, onContinue: () -> Unit) {
    val badge = invitation.optJSONObject("badge")?.optString("label").orEmpty().ifBlank { "受邀入驻" }
    val days = invitation.optInt("rewardDays", 30).coerceAtLeast(1)
    val batch = invitation.optString("batchLabel").takeIf { it.isNotBlank() && it != "null" }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("HEIKA / INVITATION", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.4.sp)
        Text("谢谢你，受邀而来。", color = MaterialTheme.colorScheme.onBackground, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
        Text("黑卡因为愿意分享的人而变得更好。感谢你带着自己的经验与灵感加入这里，也感谢你愿意为社区添上一份优质内容。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 22.sp)
        Text("你的账号已获得「$badge」标识，并已开启 Pro $days 天。欢迎在这里慢慢探索，也期待看到你的作品。", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, lineHeight = 22.sp)
        batch?.let { Text("邀请批次：$it", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("进入黑卡") }
    }
}
