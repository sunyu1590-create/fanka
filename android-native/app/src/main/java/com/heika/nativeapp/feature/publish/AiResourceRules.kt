package com.heika.nativeapp.feature.publish

/**
 * 发布页不再要求填写任何「资源信息」字段（功能说明、资源链接、使用场景等）。
 * 这里只保留 AI 资源类型与场景的取值表：
 * - contentTypes 用于「资源类型」选择与提交校验（资源分类保留）；
 * - usageScenarios 仅用于恢复历史草稿时过滤无效值，不再出现在发布表单里。
 */
object AiResourceRules {
    val contentTypes = setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial")
    val usageScenarios = listOf(
        "learning" to "学习", "programming" to "编程", "writing" to "写作",
        "office" to "办公", "creation" to "创作", "life" to "生活",
    )
}
