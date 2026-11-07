package com.heika.android

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.SystemClock
import android.util.Log
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class Diagnostics(private val context: Context) {
    private val processStartedAt = SystemClock.elapsedRealtime()
    private val firstInteractiveRecorded = AtomicBoolean(false)
    private val firstContentRecorded = AtomicBoolean(false)

    fun record(event: String, value: Long? = null) {
        if (value == null) Log.i(TAG, event) else Log.i(TAG, "$event value=$value")
    }

    fun recordFirstInteractive() {
        if (firstInteractiveRecorded.compareAndSet(false, true)) {
            record("web_first_interactive_ms", SystemClock.elapsedRealtime() - processStartedAt)
        }
    }

    fun recordFirstContentVisible() {
        if (firstContentRecorded.compareAndSet(false, true)) {
            record("web_first_content_visible_ms", SystemClock.elapsedRealtime() - processStartedAt)
        }
    }

    fun recordResourceFailure() = record("web_resource_failure")

    fun recordBridgeFailure() = record("native_bridge_failure")

    fun recordRendererExit(didCrash: Boolean) = record("web_renderer_exit", if (didCrash) 1 else 0)

    fun recordMemory(level: Int) {
        val info = Debug.MemoryInfo()
        Debug.getMemoryInfo(info)
        Log.i(TAG, "memory_trim level=$level pss_kb=${info.totalPss}")
    }

    fun recordPreviousExitReasons() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        runCatching {
            val manager = context.getSystemService(ActivityManager::class.java)
            manager.getHistoricalProcessExitReasons(context.packageName, 0, 5).forEach { exit ->
                if (exit.reason == ApplicationExitInfo.REASON_ANR ||
                    exit.reason == ApplicationExitInfo.REASON_CRASH ||
                    exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE
                ) {
                    record("previous_process_exit", exit.reason.toLong())
                }
            }
        }.onFailure { record("previous_exit_diagnostics_failure") }
    }

    fun installCrashRecorder() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                writeCrashSummary(thread.name, throwable)
            } catch (_: Exception) {
                Log.e(TAG, "crash_summary_write_failed")
            } finally {
                if (previous != null) previous.uncaughtException(thread, throwable)
                else throw throwable
            }
        }
    }

    private fun writeCrashSummary(threadName: String, throwable: Throwable) {
        val directory = File(context.cacheDir, "diagnostics")
        if (!directory.exists() && !directory.mkdirs()) return
        val summary = buildString {
            append("thread=").append(threadName).append('\n')
            append("exception=").append(throwable.javaClass.name).append('\n')
            throwable.stackTrace.take(30).forEach { frame ->
                append(frame.className).append('.').append(frame.methodName)
                    .append(':').append(frame.lineNumber).append('\n')
            }
        }
        File(directory, "last-crash.txt").writeText(summary)
    }

    private companion object {
        const val TAG = "HeikaDiagnostics"
    }
}
