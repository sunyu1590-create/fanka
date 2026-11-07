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
    private var frameSampleCount = 0
    private var frameBudgetMisses = 0
    private var droppedMetricReports = 0
    private var maxFrameDurationNanos = 0L
    private val frameDurationBuckets = LongArray(FRAME_DURATION_BUCKETS.size)

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

    fun recordFrameSample(frameDurationNanos: Long, refreshRateHz: Float, droppedReports: Int) {
        if (frameDurationNanos <= 0L) return
        val refreshRate = refreshRateHz.takeIf { it.isFinite() && it > 0f } ?: 60f
        val frameBudgetNanos = (1_000_000_000.0 / refreshRate).toLong().coerceAtLeast(1L)
        val budgetMultiple = frameDurationNanos.toDouble() / frameBudgetNanos
        val bucket = FRAME_DURATION_BUCKETS.indexOfFirst { budgetMultiple <= it }
            .takeIf { it >= 0 } ?: frameDurationBuckets.lastIndex

        frameSampleCount += 1
        frameDurationBuckets[bucket] += 1
        if (budgetMultiple > 1.0) frameBudgetMisses += 1
        droppedMetricReports += droppedReports.coerceAtLeast(0)
        maxFrameDurationNanos = maxOf(maxFrameDurationNanos, frameDurationNanos)
        if (frameSampleCount < FRAME_WINDOW_SIZE) return

        Log.i(
            TAG,
            "frame_window samples=$frameSampleCount refresh_hz=${refreshRate.toInt()} " +
                "p50_budget_bucket=${percentileBucket(0.50)} " +
                "p90_budget_bucket=${percentileBucket(0.90)} " +
                "budget_misses=$frameBudgetMisses metrics_reports_dropped=$droppedMetricReports " +
                "max_frame_ms=${maxFrameDurationNanos / 1_000_000.0}",
        )
        frameSampleCount = 0
        frameBudgetMisses = 0
        droppedMetricReports = 0
        maxFrameDurationNanos = 0L
        frameDurationBuckets.fill(0L)
    }

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

    private fun percentileBucket(percentile: Double): String {
        val target = (frameSampleCount * percentile).toInt().coerceAtLeast(1)
        var count = 0
        for ((index, bucketCount) in frameDurationBuckets.withIndex()) {
            count += bucketCount.toInt()
            if (count >= target) return FRAME_DURATION_BUCKET_LABELS[index]
        }
        return FRAME_DURATION_BUCKET_LABELS.last()
    }

    private companion object {
        const val TAG = "HeikaDiagnostics"
        const val FRAME_WINDOW_SIZE = 900
        val FRAME_DURATION_BUCKETS = doubleArrayOf(0.5, 0.75, 1.0, 1.5, 2.0, 3.0, Double.POSITIVE_INFINITY)
        val FRAME_DURATION_BUCKET_LABELS = arrayOf("<=0.5x", "<=0.75x", "<=1x", "<=1.5x", "<=2x", "<=3x", ">3x")
    }
}
