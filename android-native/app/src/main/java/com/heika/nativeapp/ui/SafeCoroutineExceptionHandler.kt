package com.heika.nativeapp.ui

import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlin.coroutines.CoroutineContext

/**
 * 协程未捕获异常的最后一层兜底。
 *
 * 通过 META-INF/services 注册（见 app/src/main/resources/META-INF/services/），
 * kotlinx.coroutines 在找不到局部 CoroutineExceptionHandler 时会走这里，
 * 而不是抛给线程的默认处理器把进程干掉。
 *
 * 典型场景：viewModelScope 里直接调接口，国内网络超时或登录态过期抛 IOException，
 * 页面还没渲染就先崩了。这类异常不该让整个 App 退出，记日志后交给上层状态位处理。
 */
class SafeCoroutineExceptionHandler : CoroutineExceptionHandler {
    override val key: CoroutineContext.Key<*> get() = CoroutineExceptionHandler

    override fun handleException(context: CoroutineContext, exception: Throwable) {
        Log.e(
            "HEIKA_COROUTINE",
            "uncaught coroutine exception: ${exception.javaClass.simpleName}: ${exception.message}",
            exception,
        )
    }
}
