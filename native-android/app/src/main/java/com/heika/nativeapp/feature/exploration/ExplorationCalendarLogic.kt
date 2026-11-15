package com.heika.nativeapp.feature.exploration

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

object ExplorationCalendarLogic {
    fun localDate(timestamp: String, zone: ZoneId): LocalDate? =
        runCatching { Instant.parse(timestamp).atZone(zone).toLocalDate() }.getOrNull()

    fun streak(openedDates: Set<LocalDate>, today: LocalDate): Int {
        var cursor = if (today in openedDates) today else today.minusDays(1)
        var count = 0
        while (cursor in openedDates) {
            count++
            cursor = cursor.minusDays(1)
        }
        return count
    }
}
