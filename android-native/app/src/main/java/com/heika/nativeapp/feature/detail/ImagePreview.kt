package com.heika.nativeapp.feature.detail

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * 详情页正文图片全屏预览：双指缩放、双击放大、拖动查看、多图切换。
 * 关闭后不重建正文，滚动位置由调用方保持。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImagePreviewOverlay(
    urls: List<String>,
    initialIndex: Int,
    onClose: () -> Unit,
) {
    if (urls.isEmpty()) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(initialPage = initialIndex.coerceIn(0, urls.lastIndex)) { urls.size }
    var menuOpen by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val currentUrl = urls.getOrNull(pagerState.currentPage).orEmpty()

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
            ZoomableImage(
                url = urls[page],
                onLongPress = { menuOpen = true },
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 42.dp, start = 16.dp, end = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "关闭",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clipToBounds().background(Color.Black.copy(alpha = .42f), RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 7.dp)
                    .pointerInput(Unit) { detectTapGestures { onClose() } },
            )
            Text("${pagerState.currentPage + 1} / ${urls.size}", color = Color.White.copy(alpha = .8f), fontSize = 12.sp)
        }
        if (menuOpen) {
            ModalBottomSheet(onDismissRequest = { menuOpen = false }, sheetState = sheetState, containerColor = MaterialTheme.colorScheme.surface) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("图片操作", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(bottom = 6.dp))
                    SheetAction(if (saving) "正在保存…" else "保存图片") {
                        if (saving) return@SheetAction
                        saving = true
                        scope.launch {
                            val uri = withContext(Dispatchers.IO) { saveImageToGallery(context, currentUrl) }
                            saving = false
                            menuOpen = false
                            Toast.makeText(context, if (uri != null) "已保存到相册" else "保存失败，请稍后重试", Toast.LENGTH_SHORT).show()
                        }
                    }
                    SheetAction("分享图片") {
                        scope.launch {
                            val uri = withContext(Dispatchers.IO) { saveImageToGallery(context, currentUrl) }
                            menuOpen = false
                            if (uri == null) {
                                Toast.makeText(context, "分享失败，请稍后重试", Toast.LENGTH_SHORT).show()
                                return@launch
                            }
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "image/*"
                                putExtra(Intent.EXTRA_STREAM, uri)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            context.startActivity(Intent.createChooser(intent, "分享图片"))
                        }
                    }
                    Text("保存的图片会进入系统相册，作者设置下载限制时请勿二次传播。", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp, bottom = 18.dp))
                }
            }
        }
    }
}

@Composable
private fun SheetAction(label: String, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 15.sp,
        modifier = Modifier.fillMaxWidth().clipToBounds().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 13.dp)
            .pointerInput(label) { detectTapGestures { onClick() } },
    )
}

@Composable
private fun ZoomableImage(url: String, onLongPress: () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current).data(url).build(),
        contentDescription = "图片预览",
        contentScale = ContentScale.Fit,
        modifier = Modifier.fillMaxSize()
            .clipToBounds()
            .pointerInput(url) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 4f)
                    offset = if (scale <= 1f) Offset.Zero else offset + pan
                }
            }
            .pointerInput(url) {
                detectTapGestures(
                    onDoubleTap = {
                        if (scale > 1f) { scale = 1f; offset = Offset.Zero } else scale = 2.2f
                    },
                    onLongPress = { onLongPress() },
                )
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y
            },
    )
}

/** 使用系统媒体库保存，Android 10+ 走分区存储，旧版本写入公共图片目录。 */
private fun saveImageToGallery(context: Context, url: String): Uri? {
    return try {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            instanceFollowRedirects = true
        }
        val bytes = connection.inputStream.use { it.readBytes() }
        connection.disconnect()
        val name = "heika-${System.currentTimeMillis()}.jpg"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, name)
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/HEIKA")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            uri
        } else {
            @Suppress("DEPRECATION")
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
            val folder = java.io.File(dir, "HEIKA").apply { mkdirs() }
            val file = java.io.File(folder, name)
            file.outputStream().use { it.write(bytes) }
            @Suppress("DEPRECATION")
            MediaStore.Images.Media.insertImage(context.contentResolver, file.absolutePath, name, null)?.let { Uri.parse(it) }
        }
    } catch (_: Exception) {
        null
    }
}
