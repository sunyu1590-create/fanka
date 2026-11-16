package com.heika.nativeapp.feature.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.data.HeikaPost
import com.heika.nativeapp.data.HeikaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DiscoveryAd(
    val kind: String,
    val title: String,
    val body: String,
    val imageUrl: String?,
    val post: HeikaPost,
)

data class DiscoveryAdState(
    val ad: DiscoveryAd? = null,
    val unavailable: Boolean = false,
)

@HiltViewModel
class DiscoveryAdViewModel @Inject constructor(
    private val repository: HeikaRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(DiscoveryAdState())
    val state = mutableState.asStateFlow()
    private var requestGeneration = 0L

    fun refresh() {
        val requestId = ++requestGeneration
        mutableState.update { it.copy(unavailable = false) }
        viewModelScope.launch {
            val result = runCatching {
                repository.explorationAd()?.takeIf { it.optBoolean("enabled") }?.let { value ->
                    val postId = value.optString("post_id")
                    val title = value.optString("title").takeIf(String::isNotBlank)
                    if (postId.isBlank() || title == null) null else {
                        val post = repository.postDetailByKey(postId)
                        DiscoveryAd(
                            kind = if (value.optString("kind") == "image") "image" else "text",
                            title = title,
                            body = value.optString("body"),
                            imageUrl = value.optString("image_url")
                                .takeIf { value.optString("kind") == "image" && it.startsWith("https://") },
                            post = post,
                        )
                    }
                }
            }
            if (requestId == requestGeneration) {
                result.onSuccess { ad -> mutableState.value = DiscoveryAdState(ad = ad) }
                    .onFailure { mutableState.value = DiscoveryAdState(unavailable = true) }
            }
        }
    }
}
