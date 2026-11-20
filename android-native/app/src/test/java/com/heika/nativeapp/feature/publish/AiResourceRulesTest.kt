package com.heika.nativeapp.feature.publish

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AiResourceRulesTest {
    @Test
    fun contentTypesCoverAllAiResourceCategories() {
        assertEquals(setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"), AiResourceRules.contentTypes)
    }

    @Test
    fun resourceInfoFieldsAreNoLongerRequired() {
        // 取消资源信息后，AiResourceRules 不再持有任何必填字段规则。
        // 发布只校验标题、正文与分类，空的资源信息不得阻塞提交。
        val declared = AiResourceRules::class.java.declaredMethods.map { it.name }.toSet()
        assertTrue("missingRequiredFields 应已随资源信息一并移除", "missingRequiredFields" !in declared)
        assertTrue("requiredFields 应已随资源信息一并移除", "getRequiredFields" !in declared)
        assertTrue("labels 应已随资源信息一并移除", "getLabels" !in declared)
    }

    @Test
    fun usageScenarioValuesRemainForLegacyDraftRestore() {
        // 历史草稿里的使用场景只做取值过滤，不再是发布表单的一部分。
        assertEquals(listOf("learning", "programming", "writing", "office", "creation", "life"), AiResourceRules.usageScenarios.map { it.first })
    }
}
