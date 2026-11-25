package com.heika.nativeapp.feature.search

/**
 * 跨页面发起一次搜索（例如详情页的话题、关联内容）。
 * 搜索页创建时消费一次，避免返回后重复触发。
 */
object SearchIntent {
    @Volatile
    private var pending: String? = null

    fun send(term: String) { pending = term.trim().takeIf { it.isNotBlank() } }

    fun consume(): String? {
        val value = pending
        pending = null
        return value
    }
}
