package com.heika.nativeapp.ui

import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.runtime.Composable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.StarOutline
import com.heika.nativeapp.R

/** Bundled SVG assets from the icon archive supplied for this app. */
object HeikaIcons {
    @Composable private fun vector(id: Int): ImageVector = ImageVector.vectorResource(id)
    val Back: ImageVector @Composable get() = vector(R.drawable.ic_pack_arrow_left)
    val Forward: ImageVector @Composable get() = vector(R.drawable.ic_pack_arrow_right)
    val Close: ImageVector @Composable get() = vector(R.drawable.ic_pack_clear)
    val Check: ImageVector @Composable get() = vector(R.drawable.ic_pack_check_one)
    val Home: ImageVector @Composable get() = vector(R.drawable.ic_pack_home)
    val Discovery: ImageVector @Composable get() = vector(R.drawable.ic_pack_magic)
    val Messages: ImageVector @Composable get() = vector(R.drawable.ic_pack_message_one)
    val Profile: ImageVector @Composable get() = vector(R.drawable.ic_pack_avatar)
    val Publish: ImageVector @Composable get() = vector(R.drawable.ic_pack_message_sent)
    val Search: ImageVector @Composable get() = vector(R.drawable.ic_pack_search)
    val Notifications: ImageVector @Composable get() = vector(R.drawable.ic_pack_message_unread)
    val Filter: ImageVector @Composable get() = vector(R.drawable.ic_pack_list_view)
    val StarOutline: ImageVector = Icons.Outlined.StarOutline
    val StarFilled: ImageVector = Icons.Filled.Star
    val LikeOutline: ImageVector @Composable get() = vector(R.drawable.ic_pack_like)
    val LikeFilled: ImageVector = Icons.Filled.Favorite
    val SaveOutline: ImageVector = Icons.Outlined.BookmarkBorder
    val SaveFilled: ImageVector = Icons.Filled.Bookmark
    val Comment: ImageVector @Composable get() = vector(R.drawable.ic_pack_comment)
    val Share: ImageVector @Composable get() = vector(R.drawable.ic_pack_share)
    val Report: ImageVector @Composable get() = vector(R.drawable.ic_pack_report)
    val Settings: ImageVector @Composable get() = vector(R.drawable.ic_pack_setting_two)
    val More: ImageVector @Composable get() = vector(R.drawable.ic_pack_more)
    val Copy: ImageVector @Composable get() = vector(R.drawable.ic_pack_copy_one)
    val Block: ImageVector @Composable get() = vector(R.drawable.ic_pack_forbid)
    val Calendar: ImageVector @Composable get() = vector(R.drawable.ic_pack_announcement)
    val CoExplore: ImageVector @Composable get() = vector(R.drawable.ic_pack_communication)
    val Retry: ImageVector @Composable get() = vector(R.drawable.ic_pack_refresh)
}
