package com.heika.nativeapp.feature.publish

import java.net.URI

object AiResourceRules {
    val contentTypes = setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial")
    val usageScenarios = listOf(
        "learning" to "学习", "programming" to "编程", "writing" to "写作",
        "office" to "办公", "creation" to "创作", "life" to "生活",
    )
    val requiredFields = mapOf(
        "agent" to listOf("functionality", "platforms", "run_mode", "source_url", "version"),
        "skill" to listOf("functionality", "environments", "installation", "version", "source_url"),
        "prompt" to listOf("model", "scenario", "prompt"),
        "ai_tool" to listOf("functionality", "platforms", "source_url"),
        "tutorial" to listOf("difficulty", "requirements", "steps"),
    )
    val labels = mapOf(
        "functionality" to "功能说明", "platforms" to "兼容平台", "run_mode" to "运行方式", "use_cases" to "适用场景",
        "environments" to "兼容环境", "installation" to "安装步骤", "configuration" to "配置内容", "example" to "使用示例",
        "model" to "适用模型", "scenario" to "应用场景", "prompt" to "完整 Prompt", "variables" to "可替换变量",
        "version" to "版本", "source_url" to "资源链接", "difficulty" to "难度", "requirements" to "准备条件", "steps" to "使用步骤",
    )

    fun missingRequiredFields(type: String, values: Map<String, String>): List<String> =
        requiredFields[type].orEmpty().filter { values[it].orEmpty().trim().isEmpty() }

    fun isSafeSourceUrl(value: String): Boolean = runCatching {
        val uri = URI(value.trim())
        val host = uri.host?.lowercase()?.removeSuffix(".") ?: return false
        uri.scheme.equals("https", ignoreCase = true) && uri.rawUserInfo == null && host.isNotBlank() &&
            host != "localhost" && !host.endsWith(".local") && !host.endsWith(".internal") &&
            !host.matches(Regex("(?:\\d{1,3}\\.){3}\\d{1,3}")) && uri.port in setOf(-1, 443)
    }.getOrDefault(false)
}
