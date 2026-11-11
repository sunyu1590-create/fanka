package com.heika.nativeapp.ui

import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import com.heika.nativeapp.R

/** Bundled IconPark Vector Drawables. Tint is supplied by the current UI state/theme. */
object HeikaIconRes {
    val Back = R.drawable.ic_ip_back
    val Forward = R.drawable.ic_ip_forward
    val Close = R.drawable.ic_ip_close
    val Check = R.drawable.ic_ip_check
    val Home = R.drawable.ic_ip_home
    val Discovery = R.drawable.ic_ip_discovery
    val Messages = R.drawable.ic_ip_messages
    val Profile = R.drawable.ic_ip_profile
    val Publish = R.drawable.ic_ip_add
    val Search = R.drawable.ic_ip_search
    val Notifications = R.drawable.ic_ip_notifications
    val Filter = R.drawable.ic_ip_filter
    val StarOutline = R.drawable.ic_ip_star_outline
    val StarFilled = R.drawable.ic_ip_star
    val LikeOutline = R.drawable.ic_ip_heart_outline
    val LikeFilled = R.drawable.ic_ip_heart
    val SaveOutline = R.drawable.ic_ip_bookmark
    val SaveFilled = R.drawable.ic_ip_bookmark_fill
    val Comment = R.drawable.ic_ip_comment
    val Share = R.drawable.ic_ip_share
    val Report = R.drawable.ic_ip_report
    val Settings = R.drawable.ic_ip_settings
    val More = R.drawable.ic_ip_more
    val Copy = R.drawable.ic_ip_copy
    val Block = R.drawable.ic_ip_block
    val Calendar = R.drawable.ic_ip_calendar
    val CoExplore = R.drawable.ic_ip_people
    val Retry = R.drawable.ic_ip_refresh
    val Delete = R.drawable.ic_ip_delete
    val Edit = R.drawable.ic_ip_edit
    val Font = R.drawable.ic_ip_font
    val Image = R.drawable.ic_ip_images
    val Robot = R.drawable.ic_ip_robot
    val Logout = R.drawable.ic_ip_logout
    val Shield = R.drawable.ic_ip_shield
    val Storage = R.drawable.ic_ip_storage
    val Info = R.drawable.ic_ip_info
    val Tag = R.drawable.ic_ip_tag
    val Gavel = R.drawable.ic_ip_gavel
    val BusinessUser = R.drawable.ic_ip_business_user
    val Video = R.drawable.ic_ip_video
    val Play = R.drawable.ic_ip_play
    val Medal = R.drawable.ic_ip_medal
    val Magic = R.drawable.ic_ip_magic
    val Globe = R.drawable.ic_ip_globe
    val List = R.drawable.ic_ip_list
    val Text = R.drawable.ic_ip_text
    val Camera = R.drawable.ic_ip_camera
    val Add = R.drawable.ic_ip_add
    val Vip = R.drawable.ic_ip_vip
    val Help = R.drawable.ic_ip_help
    val Warning = R.drawable.ic_ip_warning
    val UserSearch = R.drawable.ic_ip_people_search
    val Privacy = R.drawable.ic_ip_privacy
    val Upload = R.drawable.ic_ip_upload
    val Content = R.drawable.ic_ip_content
    val Album = R.drawable.ic_ip_album
    val Admin = R.drawable.ic_ip_admin
    val OpenExternal = R.drawable.ic_ip_share
}

object HeikaIcons {
    @Composable private fun icon(@DrawableRes id: Int): ImageVector = ImageVector.vectorResource(id)
    val Back: ImageVector @Composable get() = icon(HeikaIconRes.Back)
    val Forward: ImageVector @Composable get() = icon(HeikaIconRes.Forward)
    val Close: ImageVector @Composable get() = icon(HeikaIconRes.Close)
    val Check: ImageVector @Composable get() = icon(HeikaIconRes.Check)
    val Home: ImageVector @Composable get() = icon(HeikaIconRes.Home)
    val Discovery: ImageVector @Composable get() = icon(HeikaIconRes.Discovery)
    val Messages: ImageVector @Composable get() = icon(HeikaIconRes.Messages)
    val Profile: ImageVector @Composable get() = icon(HeikaIconRes.Profile)
    val Publish: ImageVector @Composable get() = icon(HeikaIconRes.Publish)
    val Search: ImageVector @Composable get() = icon(HeikaIconRes.Search)
    val Notifications: ImageVector @Composable get() = icon(HeikaIconRes.Notifications)
    val Filter: ImageVector @Composable get() = icon(HeikaIconRes.Filter)
    val StarOutline: ImageVector @Composable get() = icon(HeikaIconRes.StarOutline)
    val StarFilled: ImageVector @Composable get() = icon(HeikaIconRes.StarFilled)
    val LikeOutline: ImageVector @Composable get() = icon(HeikaIconRes.LikeOutline)
    val LikeFilled: ImageVector @Composable get() = icon(HeikaIconRes.LikeFilled)
    val SaveOutline: ImageVector @Composable get() = icon(HeikaIconRes.SaveOutline)
    val SaveFilled: ImageVector @Composable get() = icon(HeikaIconRes.SaveFilled)
    val Comment: ImageVector @Composable get() = icon(HeikaIconRes.Comment)
    val Share: ImageVector @Composable get() = icon(HeikaIconRes.Share)
    val Report: ImageVector @Composable get() = icon(HeikaIconRes.Report)
    val Settings: ImageVector @Composable get() = icon(HeikaIconRes.Settings)
    val More: ImageVector @Composable get() = icon(HeikaIconRes.More)
    val Copy: ImageVector @Composable get() = icon(HeikaIconRes.Copy)
    val Block: ImageVector @Composable get() = icon(HeikaIconRes.Block)
    val Calendar: ImageVector @Composable get() = icon(HeikaIconRes.Calendar)
    val CoExplore: ImageVector @Composable get() = icon(HeikaIconRes.CoExplore)
    val Retry: ImageVector @Composable get() = icon(HeikaIconRes.Retry)
    val Delete: ImageVector @Composable get() = icon(HeikaIconRes.Delete)
    val Edit: ImageVector @Composable get() = icon(HeikaIconRes.Edit)
    val Font: ImageVector @Composable get() = icon(HeikaIconRes.Font)
    val Image: ImageVector @Composable get() = icon(HeikaIconRes.Image)
    val Robot: ImageVector @Composable get() = icon(HeikaIconRes.Robot)
    val Logout: ImageVector @Composable get() = icon(HeikaIconRes.Logout)
    val Shield: ImageVector @Composable get() = icon(HeikaIconRes.Shield)
    val Storage: ImageVector @Composable get() = icon(HeikaIconRes.Storage)
    val Info: ImageVector @Composable get() = icon(HeikaIconRes.Info)
    val Tag: ImageVector @Composable get() = icon(HeikaIconRes.Tag)
    val Gavel: ImageVector @Composable get() = icon(HeikaIconRes.Gavel)
    val BusinessUser: ImageVector @Composable get() = icon(HeikaIconRes.BusinessUser)
    val Video: ImageVector @Composable get() = icon(HeikaIconRes.Video)
    val Play: ImageVector @Composable get() = icon(HeikaIconRes.Play)
    val Medal: ImageVector @Composable get() = icon(HeikaIconRes.Medal)
    val Magic: ImageVector @Composable get() = icon(HeikaIconRes.Magic)
    val Globe: ImageVector @Composable get() = icon(HeikaIconRes.Globe)
    val List: ImageVector @Composable get() = icon(HeikaIconRes.List)
    val Text: ImageVector @Composable get() = icon(HeikaIconRes.Text)
    val Camera: ImageVector @Composable get() = icon(HeikaIconRes.Camera)
    val Add: ImageVector @Composable get() = icon(HeikaIconRes.Add)
    val Vip: ImageVector @Composable get() = icon(HeikaIconRes.Vip)
    val Help: ImageVector @Composable get() = icon(HeikaIconRes.Help)
    val Warning: ImageVector @Composable get() = icon(HeikaIconRes.Warning)
    val UserSearch: ImageVector @Composable get() = icon(HeikaIconRes.UserSearch)
    val Privacy: ImageVector @Composable get() = icon(HeikaIconRes.Privacy)
    val Upload: ImageVector @Composable get() = icon(HeikaIconRes.Upload)
    val Content: ImageVector @Composable get() = icon(HeikaIconRes.Content)
    val Album: ImageVector @Composable get() = icon(HeikaIconRes.Album)
    val Admin: ImageVector @Composable get() = icon(HeikaIconRes.Admin)
    val OpenExternal: ImageVector @Composable get() = icon(HeikaIconRes.OpenExternal)

    // Compatibility aliases for existing UI references; all resolve to bundled IconPark assets.
    val AccountCircle: ImageVector @Composable get() = icon(HeikaIconRes.Profile)
    val ArrowForwardIos: ImageVector @Composable get() = icon(HeikaIconRes.Forward)
    val AutoAwesomeMotion: ImageVector @Composable get() = icon(HeikaIconRes.Album)
    val CleaningServices: ImageVector @Composable get() = icon(HeikaIconRes.Delete)
    val ColorLens: ImageVector @Composable get() = icon(HeikaIconRes.Magic)
    val Feedback: ImageVector @Composable get() = icon(HeikaIconRes.Comment)
    val FontDownload: ImageVector @Composable get() = icon(HeikaIconRes.Font)
    val ImageLibrary: ImageVector @Composable get() = icon(HeikaIconRes.Image)
    val Language: ImageVector @Composable get() = icon(HeikaIconRes.Globe)
    val NotificationsActive: ImageVector @Composable get() = icon(HeikaIconRes.Notifications)
    val NotificationsNone: ImageVector @Composable get() = icon(HeikaIconRes.Notifications)
    val Policy: ImageVector @Composable get() = icon(HeikaIconRes.Shield)
    val PrivacyTip: ImageVector @Composable get() = icon(HeikaIconRes.Privacy)
    val Security: ImageVector @Composable get() = icon(HeikaIconRes.Shield)
    val TextFields: ImageVector @Composable get() = icon(HeikaIconRes.Text)
    val ViewAgenda: ImageVector @Composable get() = icon(HeikaIconRes.List)
    val ChevronRight: ImageVector @Composable get() = icon(HeikaIconRes.Forward)
    val ChevronLeft: ImageVector @Composable get() = icon(HeikaIconRes.Back)
    val DeleteOutline: ImageVector @Composable get() = icon(HeikaIconRes.Delete)
    val FavoriteBorder: ImageVector @Composable get() = icon(HeikaIconRes.LikeOutline)
    val CalendarMonth: ImageVector @Composable get() = icon(HeikaIconRes.Calendar)
    val ContentCopy: ImageVector @Composable get() = icon(HeikaIconRes.Copy)
    val Groups: ImageVector @Composable get() = icon(HeikaIconRes.CoExplore)
    val AutoAwesome: ImageVector @Composable get() = icon(HeikaIconRes.Magic)
    val Assignment: ImageVector @Composable get() = icon(HeikaIconRes.Content)
    val ChatBubbleOutline: ImageVector @Composable get() = icon(HeikaIconRes.Comment)
    val Flag: ImageVector @Composable get() = icon(HeikaIconRes.Report)
    val ManageAccounts: ImageVector @Composable get() = icon(HeikaIconRes.BusinessUser)
    val ReportProblem: ImageVector @Composable get() = icon(HeikaIconRes.Warning)
    val SettingsSuggest: ImageVector @Composable get() = icon(HeikaIconRes.Settings)
    val SmartToy: ImageVector @Composable get() = icon(HeikaIconRes.Robot)
    val ArrowBack: ImageVector @Composable get() = icon(HeikaIconRes.Back)
    val OpenInNew: ImageVector @Composable get() = icon(HeikaIconRes.OpenExternal)
}
