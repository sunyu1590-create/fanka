package com.heika.nativeapp.feature.publish

import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * 全局发布任务状态（APP 内悬浮窗数据源）。
 *
 * 发布任务不属于发布页：点击发布后可以离开编辑器，悬浮窗持续显示真实阶段
 * （等待图片/上传/校验/提交/审核），隐藏悬浮窗不取消任务。
 * 多个任务并行时保留列表，浮窗顶部可切换查看。
 */
data class PublishTaskImageUi(
    val key: String,
    val name: String,
    val percent: Int = 0,
    val state: String = "等待上传",
    val failed: Boolean = false,
)

data class PublishTaskUi(
    val taskKey: String,
    val title: String,
    val stage: String,
    val percent: Int = 0,
    val totalImages: Int = 0,
    val readyImages: Int = 0,
    val failedImages: Int = 0,
    val sentBytes: Long = 0,
    val totalBytes: Long = 0,
    val speedBps: Long = 0,
    val images: List<PublishTaskImageUi> = emptyList(),
    val error: String? = null,
    val finished: Boolean = false,
    val published: Boolean = false,
    val underReview: Boolean = false,
    val finishedAt: Long = 0L,
)

object PublishTaskCoordinator {
    private val mutableTasks = MutableStateFlow<List<PublishTaskUi>>(emptyList())
    val tasks = mutableTasks.asStateFlow()

    private val mutableActiveKey = MutableStateFlow<String?>(null)
    val activeKey = mutableActiveKey.asStateFlow()

    /** 用户手动收起浮窗（不等于取消任务）。 */
    private val mutableHidden = MutableStateFlow(false)
    val hidden = mutableHidden.asStateFlow()

    private val mutableExpanded = MutableStateFlow(false)
    val expanded = mutableExpanded.asStateFlow()

    /**
     * 「返回发布页」请求序号。浮窗不持有导航能力，只发事件；
     * 宿主监听后跳到发布页，发布页从本机草稿快照恢复现场，不会新建草稿或重复提交。
     */
    private val mutableResumeTick = MutableStateFlow(0L)
    val resumeTick = mutableResumeTick.asStateFlow()

    fun start(title: String): String {
        val key = UUID.randomUUID().toString()
        val task = PublishTaskUi(taskKey = key, title = title.ifBlank { "未命名作品" }, stage = "正在保存内容快照")
        mutableTasks.update { list -> (list + task).takeLast(8) }
        mutableActiveKey.value = key
        mutableHidden.value = false
        mutableExpanded.value = false
        return key
    }

    private fun updateTask(key: String?, transform: (PublishTaskUi) -> PublishTaskUi) {
        val target = key ?: mutableActiveKey.value ?: return
        mutableTasks.update { list -> list.map { if (it.taskKey == target) transform(it) else it } }
    }

    fun stage(
        stage: String,
        percent: Int? = null,
        totalImages: Int? = null,
        readyImages: Int? = null,
        failedImages: Int? = null,
        taskKey: String? = null,
    ) {
        updateTask(taskKey) { current ->
            current.copy(
                stage = stage,
                percent = percent ?: current.percent,
                totalImages = totalImages ?: current.totalImages,
                readyImages = readyImages ?: current.readyImages,
                failedImages = failedImages ?: current.failedImages,
            )
        }
    }

    /** 高频进度：真实字节 + 单张状态，只更新内存。 */
    fun progress(
        sentBytes: Long,
        totalBytes: Long,
        speedBps: Long,
        readyImages: Int,
        failedImages: Int,
        images: List<PublishTaskImageUi>,
        taskKey: String? = null,
    ) {
        updateTask(taskKey) { current ->
            val percent = when {
                totalBytes > 0 -> ((sentBytes * 100) / totalBytes).toInt().coerceIn(0, 99)
                current.totalImages > 0 -> (readyImages * 100 / current.totalImages).coerceIn(0, 99)
                else -> current.percent
            }
            current.copy(
                percent = percent,
                sentBytes = sentBytes,
                totalBytes = totalBytes,
                speedBps = speedBps,
                readyImages = readyImages,
                failedImages = failedImages,
                images = images,
            )
        }
    }

    fun fail(message: String, taskKey: String? = null) {
        updateTask(taskKey) { current ->
            current.copy(stage = "发布失败", error = message, finished = true, published = false, underReview = false, finishedAt = System.currentTimeMillis())
        }
    }

    fun succeed(underReview: Boolean, taskKey: String? = null) {
        updateTask(taskKey) { current ->
            current.copy(
                stage = if (underReview) "已提交审核" else "发布成功",
                percent = 100,
                finished = true,
                published = !underReview,
                underReview = underReview,
                finishedAt = System.currentTimeMillis(),
            )
        }
    }

    fun focus(taskKey: String) {
        mutableActiveKey.value = taskKey
        mutableExpanded.value = true
        mutableHidden.value = false
    }

    fun expand() {
        mutableExpanded.value = true
        mutableHidden.value = false
    }

    fun collapse() {
        mutableExpanded.value = false
    }

    /** 隐藏浮窗：只收起界面，任务继续。 */
    fun hide() {
        mutableHidden.value = true
        mutableExpanded.value = false
    }

    fun requestResume() {
        mutableResumeTick.value = mutableResumeTick.value + 1
        mutableExpanded.value = false
    }

    fun clearFinished() {
        mutableTasks.update { list -> list.filterNot { it.finished } }
        if (mutableTasks.value.none { it.taskKey == mutableActiveKey.value }) {
            mutableActiveKey.value = mutableTasks.value.lastOrNull()?.taskKey
        }
    }
}
