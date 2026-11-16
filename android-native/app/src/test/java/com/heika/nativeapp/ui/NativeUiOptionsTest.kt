package com.heika.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeUiOptionsTest {
    @Test
    fun allPageTransitionOptionsArePersistableAndInvalidValuesFallBack() {
        assertEquals(setOf("lift", "crossfade", "shared"), HeikaPageTransitions.choices)
        HeikaPageTransitions.choices.forEach { assertEquals(it, HeikaPageTransitions.normalize(it)) }
        assertEquals("crossfade", HeikaPageTransitions.normalize("unknown"))
    }

    @Test
    fun onlyBundledFontsAreSelectable() {
        assertEquals(setOf("system", "oppo_sans"), HeikaFontCatalog.availableChoices)
        assertTrue(HeikaFontCatalog.availableChoices.contains(HeikaFontCatalog.normalize("system")))
        assertTrue(HeikaFontCatalog.availableChoices.contains("oppo_sans"))
        assertEquals("oppo_sans", HeikaFontCatalog.normalize("oppo_sans"))
        assertEquals("oppo_sans", HeikaFontCatalog.normalize("unknown-font"))
    }

    @Test
    fun readingSizeChoicesAreStableAndGrowOnlyContentTypography() {
        assertEquals("standard", HeikaReadingSizes.normalize("unknown"))
        assertEquals(1f, HeikaReadingSizes.bodyScale("standard"))
        assertTrue(HeikaReadingSizes.bodyScale("slightly-large") > HeikaReadingSizes.bodyScale("standard"))
        assertTrue(HeikaReadingSizes.bodyScale("large") > HeikaReadingSizes.bodyScale("slightly-large"))
        assertTrue(HeikaReadingSizes.titleScale("large") > HeikaReadingSizes.titleScale("standard"))
    }
}
