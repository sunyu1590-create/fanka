package com.heika.nativeapp.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.content.Context
import android.telephony.TelephonyManager
import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.data.HeikaApi
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

enum class NetworkRegionWarning {
    MAINLAND_NETWORK,
}

@HiltViewModel
class NetworkRegionNoticeViewModel @Inject constructor(
    private val api: HeikaApi,
    private val preferences: NativePreferences,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val mutableWarning = MutableStateFlow<NetworkRegionWarning?>(null)
    val warning = mutableWarning.asStateFlow()
    private var started = false

    fun checkNetworkRegion() {
        if (started) return
        started = true
        viewModelScope.launch {
            // The serving cellular network is local evidence and avoids waiting
            // for an app backend when the device is already on a mainland carrier.
            val networkCountry = runCatching {
                context.getSystemService(TelephonyManager::class.java)?.networkCountryIso
            }.getOrNull()
            val country = if (networkCountry.equals("CN", ignoreCase = true)) {
                "CN"
            } else runCatching {
                // Query the public egress IP directly from the device; don't route
                // the region check through HEIKA's Vercel-hosted business API.
                val response = withTimeout(3_500L) {
                    api.get("https://api.country.is/")
                }
                if (!response.isSuccessful) {
                    response.errorBody()?.close()
                    throw IllegalStateException("IP country lookup failed")
                } else {
                    val body = response.body()?.use { it.string() }
                    body?.let { JSONObject(it).optString("country").takeIf(String::isNotBlank) }
                }
            }.getOrNull()
            if (country.equals("CN", ignoreCase = true) &&
                !runCatching { preferences.hasSeenNetworkNotice(BuildConfig.VERSION_NAME) }.getOrDefault(false)
            ) {
                mutableWarning.value = NetworkRegionWarning.MAINLAND_NETWORK
            }
        }
    }

    fun continueIntoApp() {
        viewModelScope.launch {
            runCatching { preferences.markNetworkNoticeSeen(BuildConfig.VERSION_NAME) }
            mutableWarning.value = null
        }
    }
}
