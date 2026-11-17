package com.heika.nativeapp.ui

/**
 * 作品首图的宽高比缓存。
 *
 * 详情页头图必须在第一帧就确定容器高度：如果先按兜底比例排版、
 * 等原图解码后再换成真实比例，下方标题与正文会整体上移再落回，观感上就是"页面抖了一下"。
 * 列表卡片的缩略图解码完成时把比例写进这里，点进详情即可零延迟拿到。
 *
 * 只存内存，进程重启后由列表重新填充；命中不了时详情页退回兜底比例。
 */
object HeikaImageRatioCache {
    private val ratios = HashMap<String, Float>(64)

    @Synchronized
    fun get(postId: String): Float? = ratios[postId]

    @Synchronized
    fun remember(postId: String, width: Float, height: Float) {
        if (postId.isBlank() || width <= 0f || height <= 0f) return
        val ratio = width / height
        if (!ratio.isFinite() || ratio <= 0.05f) return
        ratios[postId] = ratio
    }

    /** 详情页读到任意比例后回填，供下次直接命中。 */
    @Synchronized
    fun put(postId: String, ratio: Float) {
        if (postId.isBlank() || !ratio.isFinite() || ratio <= 0.05f) return
        ratios[postId] = ratio
    }
}
