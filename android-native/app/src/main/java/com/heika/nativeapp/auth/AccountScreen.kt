package com.heika.nativeapp.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaAlertDialog

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
    var code by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    val flow = state.flow
    val focusManager = LocalFocusManager.current
    // 只有"从已登录变成未登录"（用户主动退出）才清空表单。
    // 之前只要 session 为空就清空，会在登录失败、页面重组等时机把刚输入的密码抹掉，
    // 看起来像"点登录的一瞬间密码自己清空了"。
    var hadSession by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.session?.userId) {
        if (state.session != null) {
            hadSession = true
        } else if (hadSession) {
            email = ""
            passwordField = TextFieldValue("")
            confirmation = ""
            nickname = ""
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
    val latestCode by rememberUpdatedState(code)
    val latestFlow by rememberUpdatedState(flow)
    LaunchedEffect(pendingSubmit) {
        if (!pendingSubmit) return@LaunchedEffect
        withFrameNanos { }
        withFrameNanos { }
        pendingSubmit = false
        when (latestFlow) {
            AccountFlow.LOGIN -> viewModel.signIn(latestEmail, latestPassword)
            AccountFlow.SIGN_UP -> viewModel.signUp(latestEmail, latestPassword, latestConfirmation, latestNickname)
            AccountFlow.RECOVERY_CODE -> viewModel.recoverWithCode(latestEmail, latestCode, latestPassword, latestConfirmation)
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("黑卡账号", onBack)
        if (state.loading) {
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) { CircularProgressIndicator() }
        } else if (state.session != null && flow == AccountFlow.LOGIN) {
            Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("账号已登录", color = MaterialTheme.colorScheme.onBackground, fontSize = 23.sp)
                Text(state.session?.email ?: state.session?.userId.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Button(onClick = { viewModel.signOut(onBack) }, modifier = Modifier.fillMaxWidth()) { Text("退出登录") }
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
                        else -> "欢迎回来。"
                    },
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 25.sp,
                )
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
                Spacer(Modifier.height(24.dp))
            }
        }
    }
    if (state.pendingRecoveryCodes.isNotEmpty()) {
        NewAccountRecoveryPanel(codes = state.pendingRecoveryCodes, onConfirm = viewModel::acknowledgeRecoveryCodes)
    }
}

/**
 * 注册成功后的强制一步：展示恢复码并要求确认已保存。
 *
 * 找回密码目前只支持恢复码，用户如果在这里跳过，等忘记密码时账号就真的回不来了。
 * 所以这个面板不可点外部关闭、没有"稍后再说"，必须勾选后才能进入。
 */
@Composable
private fun NewAccountRecoveryPanel(codes: List<String>, onConfirm: () -> Unit) {
    val context = LocalContext.current
    var saved by remember { mutableStateOf(false) }
    HeikaAlertDialog(
        onDismissRequest = { },
        title = { Text("保存你的恢复码") },
        text = {
            Column(
                Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                Text(
                    "这是目前唯一能找回密码的方式。忘记密码时只有它能救回账号，我们无法代为重置。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    codes.forEach { code ->
                        Text(code, color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.2.sp)
                    }
                }
                Text(
                    "每个码只能使用一次。建议截图，或复制到密码管理器。关闭后无法再次查看。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                )
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { saved = !saved }.padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Checkbox(checked = saved, onCheckedChange = { saved = it })
                    Text("我已妥善保存，知道丢失后无法找回", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = {
                    val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
                    clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("HEIKA 账号恢复码", codes.joinToString("\n")))
                }) { Text("复制全部") }
                TextButton(enabled = saved, onClick = onConfirm) { Text("进入黑卡") }
            }
        },
    )
}
