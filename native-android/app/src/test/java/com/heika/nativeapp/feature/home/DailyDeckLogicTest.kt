package com.heika.nativeapp.feature.home

import org.junit.Assert.assertEquals
import org.junit.Test

class DailyDeckLogicTest {
    @Test
    fun candidateOrderMatchesWebsiteFnvSeededOrder() {
        assertEquals(
            listOf(2, 3, 1, 4, 5, 42),
            DailyDeckLogic.rankCandidates(listOf(1, 2, 3, 4, 5, 42), "2026-11-09", emptySet(), emptyMap()),
        )
    }

    @Test
    fun membershipAndLuckyBonusBoundariesArePreserved() {
        assertEquals(5, DailyDeckLogic.allowanceFor("free"))
        assertEquals(9, DailyDeckLogic.allowanceFor("plus"))
        assertEquals(13, DailyDeckLogic.allowanceFor("pro"))
        assertEquals(10, DailyDeckLogic.luckyBonusFor(0.0009))
        assertEquals(5, DailyDeckLogic.luckyBonusFor(0.015))
        assertEquals(3, DailyDeckLogic.luckyBonusFor(0.065))
        assertEquals(2, DailyDeckLogic.luckyBonusFor(0.165))
        assertEquals(0, DailyDeckLogic.luckyBonusFor(0.166))
    }
}
