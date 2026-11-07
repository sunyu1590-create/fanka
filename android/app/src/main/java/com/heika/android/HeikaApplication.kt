package com.heika.android

import android.app.Application

class HeikaApplication : Application() {
    lateinit var diagnostics: Diagnostics
        private set

    override fun onCreate() {
        super.onCreate()
        diagnostics = Diagnostics(this)
        diagnostics.installCrashRecorder()
        diagnostics.recordPreviousExitReasons()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (::diagnostics.isInitialized) diagnostics.recordMemory(level)
    }
}
