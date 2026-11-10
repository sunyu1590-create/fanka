package com.heika.nativeapp.feature.publish

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AiResourceRulesTest {
    @Test fun supportedTypesMatchWebsiteContract() {
        assertEquals(setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"), AiResourceRules.contentTypes)
    }

    @Test fun requiredFieldsAreSpecificToResourceType() {
        assertEquals(listOf("functionality", "platforms", "run_mode", "source_url", "version"), AiResourceRules.missingRequiredFields("agent", emptyMap()))
        assertEquals(listOf("model", "scenario", "prompt"), AiResourceRules.missingRequiredFields("prompt", emptyMap()))
        assertTrue(AiResourceRules.missingRequiredFields("knowledge_article", emptyMap()).isEmpty())
    }

    @Test fun safeExternalLinksRequirePublicHttps() {
        assertTrue(AiResourceRules.isSafeSourceUrl("https://example.com/resource"))
        assertFalse(AiResourceRules.isSafeSourceUrl("http://example.com"))
        assertFalse(AiResourceRules.isSafeSourceUrl("https://user:pass@example.com"))
        assertFalse(AiResourceRules.isSafeSourceUrl("https://127.0.0.1/internal"))
        assertFalse(AiResourceRules.isSafeSourceUrl("https://service.local"))
        assertFalse(AiResourceRules.isSafeSourceUrl("https://example.com:8443"))
    }
}
