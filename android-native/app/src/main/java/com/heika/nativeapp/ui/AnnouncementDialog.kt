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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AnnouncementUi(val title: String, val body: String, val version: Int)

@HiltViewModel
class AnnouncementViewModel @Inject constructor(
    private val repository: HeikaRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val mutableState = MutableStateFlow<AnnouncementUi?>(null)
    val state = mutableState.asStateFlow()
    private var loaded = false

    /** 每个公告版本只弹一次；网络失败时静默跳过，不影响启动。 */
    fun load() {
        if (loaded) return
        loaded = true
        viewModelScope.launch {
            val data = runCatching { repository.announcement() }.getOrNull() ?: return@launch
            val version = data.optInt("version", 0)
            val title = data.optString("title").trim()
            val body = data.optString("body").trim()
            if (version <= 0 || title.isEmpty() || body.isEmpty()) return@launch
            val prefs = context.getSharedPreferences("heika-announcement", Context.MODE_PRIVATE)
            if (prefs.getInt("seen_version", 0) == version) return@launch
            mutableState.value = AnnouncementUi(title, body, version)
        }
    }

    fun dismiss() {
        val current = mutableState.value ?: return
        context.getSharedPreferences("heika-announcement", Context.MODE_PRIVATE)
            .edit().putInt("seen_version", current.version).apply()
        mutableState.value = null
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
