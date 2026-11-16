package com.heika.nativeapp.ui

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.heika.nativeapp.HeikaApplication

data class AnnouncementUi(val title: String, val body: String, val version: Int)

/**
 * 公告加载与展示。
 *
 * 这里故意不经过 Hilt ViewModel：公告挂在启动路径上，一旦某个 ViewModel 的注入绑定
 * 没有在构建期生成，hiltViewModel() 会退回反射构造并抛 NoSuchMethodException，
 * 整个 App 起不来（2.5.0/2.6.0 的闪退就是这样发生的）。
 * 公告只读、无状态迁移，用 Composable 自带协程就够，少一层生命周期也少一个崩溃点。
 */
@Composable
fun AnnouncementHost() {
    val context = LocalContext.current
    var item by remember { mutableStateOf<AnnouncementUi?>(null) }

    LaunchedEffect(Unit) {
        val repository = (context.applicationContext as? HeikaApplication)?.announcementRepository
            ?: return@LaunchedEffect
        val data = runCatching { repository.announcement() }.getOrNull() ?: return@LaunchedEffect
        val version = data.optInt("version", 0)
        val title = data.optString("title").trim()
        val body = data.optString("body").trim()
        if (version <= 0 || title.isEmpty() || body.isEmpty()) return@LaunchedEffect
        val prefs = context.getSharedPreferences("heika-announcement", Context.MODE_PRIVATE)
        if (prefs.getInt("seen_version", 0) == version) return@LaunchedEffect
        item = AnnouncementUi(title, body, version)
    }

    item?.let { current ->
        AnnouncementDialog(current) {
            context.getSharedPreferences("heika-announcement", Context.MODE_PRIVATE)
                .edit().putInt("seen_version", current.version).apply()
            item = null
        }
    }
}

@Composable
fun AnnouncementDialog(item: AnnouncementUi, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.widthIn(max = 340.dp).padding(vertical = 22.dp, horizontal = 22.dp)) {
                Text("公告", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, letterSpacing = 1.8.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(9.dp))
                Text(item.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp)
                Spacer(Modifier.height(10.dp))
                Text(
                    item.body,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    lineHeight = 21.sp,
                    modifier = Modifier.heightIn(max = 300.dp).verticalScroll(rememberScrollState()),
                )
                Spacer(Modifier.height(18.dp))
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("我知道了", fontSize = 13.sp)
                }
            }
        }
    }
}
