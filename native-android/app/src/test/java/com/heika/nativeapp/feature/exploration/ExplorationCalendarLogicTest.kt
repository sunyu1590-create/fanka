package com.heika.nativeapp.feature.exploration

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExplorationCalendarLogicTest {
    @Test
    fun convertsOpeningTimestampUsingAccountTimezone() {
        val shanghai = ZoneId.of("Asia/Shanghai")
        assertEquals(LocalDate.parse("2026-11-10"), ExplorationCalendarLogic.localDate("2026-11-09T16:30:00Z", shanghai))
        assertEquals(LocalDate.parse("2026-11-09"), ExplorationCalendarLogic.localDate("2026-11-09T16:30:00Z", ZoneId.of("UTC")))
        assertNull(ExplorationCalendarLogic.localDate("invalid", shanghai))
    }

    @Test
    fun streakStartsTodayOrYesterdayAndStopsAtFirstGap() {
        val today = LocalDate.parse("2026-11-10")
        assertEquals(3, ExplorationCalendarLogic.streak(setOf(today, today.minusDays(1), today.minusDays(2)), today))
        assertEquals(2, ExplorationCalendarLogic.streak(setOf(today.minusDays(1), today.minusDays(2)), today))
        assertEquals(0, ExplorationCalendarLogic.streak(setOf(today.minusDays(2)), today))
    }
}
