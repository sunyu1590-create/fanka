package com.heika.nativeapp.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("黑卡账号", onBack)
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 25.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("欢迎回来", color = MaterialTheme.colorScheme.onBackground, fontSize = 25.sp)
            Text("使用网站现有 HEIKA 账号登录，原生页面会继续复用同一账号。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 19.sp)
            if (state.session != null) {
                Text(state.session?.email ?: "已登录", color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.padding(top = 16.dp))
                Button(onClick = { viewModel.signOut(onBack) }, modifier = Modifier.fillMaxWidth()) { Text("退出登录") }
            } else {
                OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("邮箱") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
                Button(onClick = { viewModel.signIn(email, password) }, enabled = !state.busy && email.isNotBlank() && password.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                    if (state.busy) CircularProgressIndicator(Modifier.height(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp) else Text("登录")
                }
                Text("注册和找回密码继续使用黑卡网站的官方账号流程。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.weight(1f))
    }
}
