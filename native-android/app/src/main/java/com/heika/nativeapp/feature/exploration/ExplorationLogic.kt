package com.heika.nativeapp.feature.exploration

import java.time.DayOfWeek
import java.time.YearMonth
import kotlin.math.roundToInt

data class ExperienceLevel(
    val level: Int,
    val threshold: Int,
    val reward: String,
    val description: String,
)

data class ExperienceProgress(
    val current: ExperienceLevel,
    val next: ExperienceLevel?,
    val percent: Int,
    val remaining: Int,
)

data class DailyMissionSummary(val completed: Int, val totalPoints: Int, val progress: Float)

object ExplorationLogic {
    val levels = listOf(
        ExperienceLevel(1, 0, "黑卡探索者", "获得黑卡探索者身份。"),
        ExperienceLevel(2, 100, "LV2 探索徽章", "在个人资料中展示 LV2 探索徽章。"),
        ExperienceLevel(3, 240, "头像边框", "解锁个人头像的金属边框。"),
        ExperienceLevel(4, 430, "专属卡背", "解锁专属黑卡卡背样式。"),
        ExperienceLevel(5, 680, "置顶收藏位 +1", "收藏夹额外增加一个置顶位置。"),
        ExperienceLevel(6, 1000, "个人页主题色", "解锁个人主页主题色。"),
        ExperienceLevel(7, 1390, "翻卡揭晓动效", "解锁专属翻卡揭晓动效。"),
        ExperienceLevel(8, 1850, "置顶内容位 +1", "作品额外增加一个置顶位置。"),
        ExperienceLevel(9, 2380, "探索者专属称号", "解锁个人资料专属称号。"),
        ExperienceLevel(10, 2980, "黑卡收藏家边框", "获得黑卡收藏家头像边框。"),
    )

    fun progression(total: Int): ExperienceProgress {
        val safeTotal = total.coerceAtLeast(0)
        val currentIndex = levels.indexOfLast { safeTotal >= it.threshold }.coerceAtLeast(0)
        val current = levels[currentIndex]
        val next = levels.getOrNull(currentIndex + 1)
        val span = next?.let { it.threshold - current.threshold } ?: 0
        return ExperienceProgress(
            current = current,
            next = next,
            percent = if (next == null) 100 else (((safeTotal - current.threshold).toFloat() / span) * 100).roundToInt().coerceIn(0, 100),
            remaining = next?.let { (it.threshold - safeTotal).coerceAtLeast(0) } ?: 0,
        )
    }

    fun dailySummary(missions: List<MissionItem>): DailyMissionSummary {
        val completed = missions.count { it.target > 0 && it.progress >= it.target }
        return DailyMissionSummary(
            completed = completed,
            totalPoints = missions.sumOf { it.points.coerceAtLeast(0) },
            progress = if (missions.isEmpty()) 0f else completed.toFloat() / missions.size,
        )
    }

    fun calendarCellDates(yearMonth: YearMonth): List<Int?> {
        val leading = (yearMonth.atDay(1).dayOfWeek.value - DayOfWeek.MONDAY.value + 7) % 7
        return List(leading) { null } + (1..yearMonth.lengthOfMonth()).map { it }
    }

    fun canClaim(progress: Int, target: Int, claimed: Boolean, busy: Boolean): Boolean =
        !claimed && !busy && target > 0 && progress >= target
}
