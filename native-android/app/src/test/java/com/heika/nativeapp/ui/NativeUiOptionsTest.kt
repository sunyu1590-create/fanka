package com.heika.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeUiOptionsTest {
    @Test
    fun allPageTransitionOptionsArePersistableAndInvalidValuesFallBack() {
        assertEquals(setOf("lift", "crossfade", "shared"), HeikaPageTransitions.choices)
        HeikaPageTransitions.choices.forEach { assertEquals(it, HeikaPageTransitions.normalize(it)) }
        assertEquals("lift", HeikaPageTransitions.normalize("unknown"))
    }

    @Test
    fun onlyBundledFontsAreSelectable() {
        assertEquals(setOf("system"), HeikaFontCatalog.availableChoices)
        assertTrue(HeikaFontCatalog.availableChoices.contains(HeikaFontCatalog.normalize("system")))
        assertFalse(HeikaFontCatalog.availableChoices.contains("oppo_sans"))
        assertEquals("system", HeikaFontCatalog.normalize("oppo_sans"))
    }
}
