package com.heika.nativeapp.ui

import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlin.coroutines.CoroutineContext

/**
 * 挂在每个 viewModelScope.launch / rememberCoroutineScope.launch 的上下文里。
 *
 * 背景：接口超时或 401 时，HeikaRepository.request 抛 IOException。若协程没有 try/catch，
 * 异常会一路走到 CoroutineExceptionHandler —— 没有 handler 就交给线程的默认处理器，
 * 在主线程上直接 FATAL，进程退出（bugreport 里大量 "SocketTimeoutException" 与
 * "401 登录状态已失效" 的崩溃都来自这里）。
 *
 * 注意：不能用 META-INF/services 注册全局 handler。协程库的
 * handleUncaughtCoroutineException 遍历完平台 handler 后仍会调用
 * propagateExceptionFinalResort，除非 handler 抛出内部专用异常，那样做会绑死实现细节。
 * 把 handler 放进协程 context 才是稳定的做法：context 命中 handler 后即返回，不再转交进程。
 */
object HeikaCoroutineGuard : CoroutineExceptionHandler {
    override val key: CoroutineContext.Key<*> get() = CoroutineExceptionHandler

    override fun handleException(context: CoroutineContext, exception: Throwable) {
        if (exception is kotlinx.coroutines.CancellationException) return
        Log.e(
            "HEIKA_COROUTINE",
            "caught: ${exception.javaClass.simpleName}: ${exception.message}",
            exception,
        )
    }
}
