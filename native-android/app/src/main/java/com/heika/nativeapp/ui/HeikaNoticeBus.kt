package com.heika.nativeapp.ui

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

enum class HeikaNoticeKind { INFO, SUCCESS, ERROR, WARNING }

data class HeikaNotice(val id: Long, val message: String, val kind: HeikaNoticeKind)

/** Single in-app notice channel so transient results never fall back to Android Toasts. */
object HeikaNoticeBus {
    private val ids = AtomicLong()
    private val mutableEvents = MutableSharedFlow<HeikaNotice>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val events = mutableEvents.asSharedFlow()

    fun show(message: String, kind: HeikaNoticeKind = HeikaNoticeKind.INFO) {
        if (message.isNotBlank()) mutableEvents.tryEmit(HeikaNotice(ids.incrementAndGet(), message, kind))
    }
}
