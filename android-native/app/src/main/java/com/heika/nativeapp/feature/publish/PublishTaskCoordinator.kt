package com.heika.nativeapp.feature.publish

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * 全局发布任务状态（APP 内悬浮窗数据源）。
 *
 * 发布任务不属于发布页组件：用户点击发布后可以离开编辑器，
 * 悬浮窗持续显示真实阶段（上传/校验/提交/审核），关闭悬浮窗不取消任务。
 */
data class PublishTaskUi(
    val title: String,
    val stage: String,
    val percent: Int = 0,
    val totalImages: Int = 0,
    val readyImages: Int = 0,
    val failedImages: Int = 0,
    val error: String? = null,
    val finished: Boolean = false,
    val published: Boolean = false,
    val underReview: Boolean = false,
)

object PublishTaskCoordinator {
    private val mutable = MutableStateFlow<PublishTaskUi?>(null)
    val state = mutable.asStateFlow()
    private var dismissed = false

    fun start(title: String) {
        dismissed = false
        mutable.value = PublishTaskUi(title = title, stage = "正在保存内容快照")
    }

    fun stage(stage: String, percent: Int? = null, totalImages: Int? = null, readyImages: Int? = null, failedImages: Int? = null) {
        if (dismissed) return
        mutable.update { current ->
            current?.copy(
                stage = stage,
                percent = percent ?: current.percent,
                totalImages = totalImages ?: current.totalImages,
                readyImages = readyImages ?: current.readyImages,
                failedImages = failedImages ?: current.failedImages,
            )
        }
    }

    fun fail(message: String) {
        if (dismissed) return
        mutable.update { it?.copy(stage = "发布失败", error = message, finished = true, published = false, underReview = false) }
    }

    fun succeed(underReview: Boolean) {
        if (dismissed) return
        mutable.update {
            it?.copy(
                stage = if (underReview) "已提交审核" else "发布成功",
                percent = 100,
                finished = true,
                published = !underReview,
                underReview = underReview,
            )
        }
    }

    /** 用户关闭悬浮窗只隐藏界面，不改变任务状态。 */
    fun dismiss() {
        dismissed = true
        mutable.value = null
    }
}
