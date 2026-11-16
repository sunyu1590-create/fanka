package com.heika.nativeapp.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heika.nativeapp.ui.BackHeader

@Composable
fun AccountScreen(onBack: () -> Unit, onSignedIn: () -> Unit, viewModel: AccountViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    val flow = state.flow
    // 退出登录后停留在本页时，必须清空上一个账号的邮箱和密码，
    // 否则密码框的掩码会让新输入拼在旧密码后面，导致校验失败。
    LaunchedEffect(state.session?.userId) {
        if (state.session == null) {
            email = ""
            password = ""
            confirmation = ""
            nickname = ""
            code = ""
            passwordVisible = false
        }
    }
    // 登录失败后清空密码，避免反复叠加；注册/找回时保留，省得重输两遍。
    LaunchedEffect(state.error, flow) {
        if (state.error != null && flow == AccountFlow.LOGIN) password = ""
    }
    LaunchedEffect(state.session?.userId, state.message) {
        if (state.session != null && (state.message == "登录成功" || state.message == "账号已创建，欢迎来到黑卡。")) onSignedIn()
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
                        value = password,
                        onValueChange = { password = it.take(128) },
                        label = { Text(if (flow == AccountFlow.LOGIN) "密码" else "新密码（至少 8 位）") },
                        singleLine = true,
                        visualTransformation = if (passwordVisible) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
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
                        when (flow) {
                            AccountFlow.LOGIN -> viewModel.signIn(email, password)
                            AccountFlow.SIGN_UP -> viewModel.signUp(email, password, confirmation, nickname)
                            AccountFlow.RECOVERY_CODE -> viewModel.recoverWithCode(email, code, password, confirmation)
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
}
