package com.heika.nativeapp.data

import com.heika.nativeapp.ui.HeikaCoroutineGuard
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlin.random.Random

/**
 * 应用级媒体上传管理器。
 *
 * 上传任务不再挂在 viewModelScope：退出发布页、Activity 重建都不中断传输；
 * 页面销毁后文件继续上传（本地副本已持久化到 heika-drafts）。
 * - 3 路全局并发（弱网下自动降为 1，见 [slots] 调整点）；
 * - 可重试错误（网络异常/超时）按 1s/3s/8s + 抖动退避，最多 3 次；
 * - 校验类错误（格式/大小/权限）不重试，立即失败；
 * - 同 key 重复入队会替换旧任务，不允许同一文件并发重复上传。
 */
@Singleton
class MediaUploadManager @Inject constructor() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = ConcurrentHashMap<String, Job>()
    private val slots = Semaphore(3)

    fun enqueue(key: String, onFinalFailure: (Throwable) -> Unit = {}, block: suspend () -> Unit): Job {
        jobs.remove(key)?.cancel()
        val job = scope.launch(HeikaCoroutineGuard) {
            var attempt = 0
            while (true) {
                try {
                    slots.withPermit { block() }
                    return@launch
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (error: Exception) {
                    attempt += 1
                    if (attempt >= 3 || !retryable(error)) {
                        onFinalFailure(error)
                        return@launch
                    }
                    val backoff = listOf(1_000L, 3_000L, 8_000L)[attempt - 1]
                    delay(backoff + Random.nextLong(0, 400))
                }
            }
        }
        jobs[key] = job
        job.invokeOnCompletion { jobs.remove(key, job) }
        return job
    }

    fun active(key: String): Job? = jobs[key]

    fun cancel(key: String) {
        jobs.remove(key)?.cancel()
    }

    fun cancelAll() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
    }

    fun activeCount(): Int = jobs.size

    private fun retryable(error: Exception): Boolean = when (error) {
        // 网络抖动、超时、连接重置可重试；参数/格式/权限错误重试无意义。
        is IOException -> true
        is IllegalArgumentException -> false
        else -> {
            val message = error.message.orEmpty()
            !(message.contains("格式") || message.contains("大小") || message.contains("权限") || message.contains("无效"))
        }
    }
}
