package com.heika.nativeapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.HeikaRepository
import com.heika.nativeapp.ui.HeikaImageCache
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@HiltAndroidApp
class HeikaApplication : Application() {
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var imageCache: HeikaImageCache
    /** 公告读取走这里，不经过 ViewModel，避免注入绑定缺失时把启动路径带崩。 */
    @Inject lateinit var announcementRepository: HeikaRepository
    private val startupScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "私信与动态",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "黑卡应用内消息提醒"
                enableVibration(true)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        imageCache.initialize()
        startupScope.launch { runCatching { authRepository.restore() } }
        Log.i("HEIKA_NATIVE", "application=compose version=${BuildConfig.VERSION_NAME} code=${BuildConfig.VERSION_CODE}")
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "heika-activity"
    }
}
