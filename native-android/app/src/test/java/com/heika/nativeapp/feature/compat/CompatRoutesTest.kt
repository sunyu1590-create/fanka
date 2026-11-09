package com.heika.nativeapp.feature.compat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CompatRoutesTest {
    @Test
    fun addsNativeShellWithoutDroppingRouteParameters() {
        assertEquals("/?nativeTab=messages&nativeShell=1", normalizeCompatPath("/?nativeTab=messages"))
    }

    @Test
    fun replacesExistingNativeShellFlag() {
        assertEquals("/?post=42&nativeShell=1", normalizeCompatPath("/?post=42&nativeShell=0&nativeShell=0"))
    }

    @Test
    fun rejectsAbsoluteAndProtocolRelativeTargets() {
        assertThrows(IllegalArgumentException::class.java) { normalizeCompatPath("https://attacker.example/path") }
        assertThrows(IllegalArgumentException::class.java) { normalizeCompatPath("//attacker.example/path") }
        assertThrows(IllegalArgumentException::class.java) { normalizeCompatPath("/javascript:alert(1)") }
    }
}
