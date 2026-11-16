package com.heika.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter

/** Fixed, circular user image with a persistent fallback during load and on failure. */
@Composable
fun HeikaAvatar(
    imageUrl: String?,
    label: String,
    size: Dp,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    var failed by remember(imageUrl) { mutableStateOf(false) }
    Box(
        modifier.size(size).clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(.6.dp, MaterialTheme.colorScheme.outline.copy(alpha = .34f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (label.isNotBlank()) {
            Text(
                label.trim().take(1),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = (size.value * .36f).sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
        } else {
            Icon(HeikaIcons.Profile, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(size * .48f))
        }
        if (!imageUrl.isNullOrBlank() && !failed) {
            AsyncImage(
                model = imageUrl,
                contentDescription = contentDescription ?: "$label 头像",
                contentScale = ContentScale.Crop,
                imageLoader = LocalHeikaImageLoader.current,
                modifier = Modifier.fillMaxSize(),
                onState = { failed = it is AsyncImagePainter.State.Error },
            )
        }
    }
}
