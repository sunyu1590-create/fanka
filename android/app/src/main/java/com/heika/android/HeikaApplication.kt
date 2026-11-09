package com.heika.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class HeikaApplication : Application() {
    lateinit var diagnostics: Diagnostics
        private set

    override fun onCreate() {
        super.onCreate()
        diagnostics = Diagnostics(this)
        diagnostics.installCrashRecorder()
        diagnostics.recordPreviousExitReasons()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(
                    HEIKA_NOTIFICATION_CHANNEL,
                    "黑卡消息",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply { description = "黑卡私信与社区互动提醒" },
            )
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (::diagnostics.isInitialized) diagnostics.recordMemory(level)
    }

    companion object {
        const val HEIKA_NOTIFICATION_CHANNEL = "heika_messages_v1"
    }
}
