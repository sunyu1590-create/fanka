package com.heika.nativeapp.feature.exploration

import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExplorationLogicTest {
    @Test fun progressionUsesWebsiteThresholdsAndClampsAtLevelTen() {
        assertEquals(1, ExplorationLogic.progression(0).current.level)
        assertEquals(2, ExplorationLogic.progression(100).current.level)
        assertEquals(36, ExplorationLogic.progression(150).percent)
        assertEquals(90, ExplorationLogic.progression(150).remaining)
        assertEquals(10, ExplorationLogic.progression(10_000).current.level)
        assertEquals(100, ExplorationLogic.progression(10_000).percent)
    }

    @Test fun monthGridUsesMondayFirstAndCorrectLeapMonthLength() {
        val february = ExplorationLogic.calendarCellDates(YearMonth.of(2024, 2))
        assertEquals(29, february.count { it != null })
        assertEquals(3, february.takeWhile { it == null }.size)
        assertEquals(29, february.last())
    }

    @Test fun missionClaimRequiresServerCompletionAndNoPendingClaim() {
        assertTrue(ExplorationLogic.canClaim(2, 2, claimed = false, busy = false))
        assertFalse(ExplorationLogic.canClaim(1, 2, claimed = false, busy = false))
        assertFalse(ExplorationLogic.canClaim(2, 2, claimed = true, busy = false))
        assertFalse(ExplorationLogic.canClaim(2, 2, claimed = false, busy = true))
    }

    @Test fun dailySummaryUsesConfiguredMissionCountAndRewards() {
        val summary = ExplorationLogic.dailySummary(
            listOf(
                MissionItem("one", "翻卡", "", 10, 1, 1, claimed = false),
                MissionItem("two", "评分", "", 20, 0, 1, claimed = false),
                MissionItem("three", "收藏", "", 15, 2, 2, claimed = true),
            ),
        )
        assertEquals(2, summary.completed)
        assertEquals(45, summary.totalPoints)
        assertEquals(2f / 3f, summary.progress, 0.0001f)
    }
}
