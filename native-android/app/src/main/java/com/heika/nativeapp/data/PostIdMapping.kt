package com.heika.nativeapp.data

/** Keeps database UUIDs and public numeric client IDs separate across API payload shapes. */
object PostIdMapping {
    fun clientId(clientId: Any?, client_id: Any?, legacyId: Any?): Int =
        sequenceOf(clientId, client_id, legacyId)
            .mapNotNull(::positiveInt)
            .firstOrNull() ?: throw IllegalArgumentException("Post payload is missing a positive client_id")

    fun cloudId(explicitCloudId: String, id: String, cloud_id: String): String =
        explicitCloudId.ifBlank {
            if (id.toIntOrNull() != null) cloud_id else id
        }.ifBlank { cloud_id }

    private fun positiveInt(value: Any?): Int? = when (value) {
        is Number -> value.toDouble()
            .takeIf { it.isFinite() && it % 1.0 == 0.0 && it in 1.0..Int.MAX_VALUE.toDouble() }
            ?.toInt()
        is String -> value.toIntOrNull()?.takeIf { it > 0 }
        else -> null
    }
}
