package com.heika.nativeapp.feature.decor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.data.BarPalette
import com.heika.nativeapp.data.BarSkin
import com.heika.nativeapp.data.CardPalette
import com.heika.nativeapp.data.CardSkin
import com.heika.nativeapp.data.DecorConfig
import com.heika.nativeapp.data.DecorRepository
import com.heika.nativeapp.data.DecorThemeItem
import com.heika.nativeapp.data.toJson
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** 主题列表的加载状态。 */
data class DecorThemeListState(
    val loading: Boolean = true,
    val items: List<DecorThemeItem> = emptyList(),
    val error: String? = null,
)

/** 工作室保存状态机（与网页 savePhase 一致）：idle / loading / success / error。 */
enum class DecorSavePhase { Idle, Loading, Success, Error }

/**
 * 创意工坊（需求 6.1）：官方预设 / 玩家工坊 / 我的装扮 / 我的投稿 / 工作室。
 * 与网页共用同一套服务端契约（6.2），本类只负责取数与编辑状态，不做网页跳转。
 */
@HiltViewModel
class DecorCenterViewModel @Inject constructor(
    private val repository: DecorRepository,
    private val auth: AuthRepository,
) : ViewModel() {

    /** 当前账号已应用的装扮（渲染层读取的也是它）。 */
    val applied: StateFlow<DecorConfig> = repository.config

    private val _official = MutableStateFlow(DecorThemeListState())
    val official: StateFlow<DecorThemeListState> = _official.asStateFlow()
    private val _community = MutableStateFlow(DecorThemeListState())
    val community: StateFlow<DecorThemeListState> = _community.asStateFlow()
    private val _mine = MutableStateFlow(DecorThemeListState())
    val mine: StateFlow<DecorThemeListState> = _mine.asStateFlow()

    /** 工作室编辑中的配置（预览中）。 */
    private val _working = MutableStateFlow(DecorConfig.DEFAULT)
    val working: StateFlow<DecorConfig> = _working.asStateFlow()

    /** 预览中尚未保存到账号。 */
    private val _dirty = MutableStateFlow(false)
    val dirty: StateFlow<Boolean> = _dirty.asStateFlow()

    private val _savePhase = MutableStateFlow(DecorSavePhase.Idle)
    val savePhase: StateFlow<DecorSavePhase> = _savePhase.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _notice = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val notice: SharedFlow<String> = _notice.asSharedFlow()

    private val loaded = mutableSetOf<String>()

    init {
        // 工作室从「当前已应用」起步，与网页一致。
        _working.value = repository.config.value
    }

    private fun say(message: String) {
        _notice.tryEmit(message)
    }

    fun load(scope: String, force: Boolean = false) {
        if (!force && scope in loaded) return
        loaded += scope
        val state = when (scope) {
            "community" -> _community
            "mine" -> _mine
            else -> _official
        }
        viewModelScope.launch {
            state.value = state.value.copy(loading = true, error = null)
            try {
                val items = repository.listThemes(scope)
                state.value = DecorThemeListState(loading = false, items = items)
            } catch (cause: Exception) {
                state.value = DecorThemeListState(loading = false, items = emptyList(), error = cause.message ?: "加载失败")
            }
        }
    }

    /** 应用主题：写入账号配置并立即渲染（6.3 区分「已保存到账户」「当前客户端已应用」）。 */
    fun applyTheme(theme: DecorThemeItem) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            try {
                val config = theme.config
                val ok = repository.saveSettings(
                    bottomBar = if (theme.kind != "card") config.optJSONObject("bottomBar") else null,
                    card = if (theme.kind != "bottom") config.optJSONObject("card") else null,
                    bottomBarThemeId = if (theme.kind != "card") theme.id else null,
                    cardThemeId = if (theme.kind != "bottom") theme.id else null,
                )
                if (ok) {
                    _working.value = repository.config.value
                    _dirty.value = false
                    say("已应用「${theme.title}」· 已保存到账户并应用到本机")
                } else {
                    say(repository.lastError.value ?: "应用失败，已保留原有装扮")
                }
            } finally {
                _busy.value = false
            }
        }
    }

    fun toggleFavorite(item: DecorThemeItem) {
        viewModelScope.launch {
            val result = repository.toggleFavorite(item.id, !item.favorite) ?: return@launch say("收藏操作失败")
            val (favorite, count) = result
            val patch: (DecorThemeListState) -> DecorThemeListState = { state ->
                state.copy(items = state.items.map {
                    if (it.id == item.id) it.copy(favorite = favorite, favoriteCount = count) else it
                })
            }
            _official.value = patch(_official.value)
            _community.value = patch(_community.value)
            _mine.value = patch(_mine.value)
        }
    }

    /** 撤回未上架投稿。 */
    fun withdraw(item: DecorThemeItem) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            val ok = repository.deleteTheme(item.id)
            _busy.value = false
            if (ok) {
                say("已撤回「${item.title}」")
                load("mine", force = true)
            } else {
                say("撤回失败：已上架过的主题需要提交下架申请")
            }
        }
    }

    /* ---------------- 工作室编辑 ---------------- */

    fun updateBarSkin(transform: (BarSkin) -> BarSkin) {
        _working.value = _working.value.copy(bar = transform(_working.value.bar))
        _dirty.value = true
    }

    fun updateCardSkin(transform: (CardSkin) -> CardSkin) {
        _working.value = _working.value.copy(card = transform(_working.value.card))
        _dirty.value = true
    }

    fun updateBarPalette(darkSide: Boolean, transform: (BarPalette) -> BarPalette) = updateBarSkin { skin ->
        if (darkSide) skin.copy(dark = transform(skin.dark)) else skin.copy(light = transform(skin.light))
    }

    fun updateCardPalette(darkSide: Boolean, transform: (CardPalette) -> CardPalette) = updateCardSkin { skin ->
        if (darkSide) skin.copy(dark = transform(skin.dark)) else skin.copy(light = transform(skin.light))
    }

    /** 仅恢复卡背 / 仅恢复内容面 / 全部恢复默认（需求 7.4）。 */
    fun restoreCardPart(part: CardPart, darkSide: Boolean) {
        val defaults = if (darkSide) DecorConfig.DARK_CARD else DecorConfig.LIGHT_CARD
        updateCardSkin { skin ->
            val source = if (darkSide) skin.dark else skin.light
            val updated = when (part) {
                CardPart.Back -> source.copy(
                    backBg = defaults.backBg, backImage = null, texture = defaults.texture, pattern = defaults.pattern,
                    backBorder = defaults.backBorder, numberColor = defaults.numberColor, hintColor = defaults.hintColor,
                    actionBg = defaults.actionBg, actionText = defaults.actionText,
                )
                CardPart.Content -> source.copy(
                    contentBg = defaults.contentBg, contentBorder = defaults.contentBorder, contentImage = null,
                    contentTexture = defaults.contentTexture, contentScrim = defaults.contentScrim,
                    titleColor = defaults.titleColor, bodyColor = defaults.bodyColor,
                    chipBg = defaults.chipBg, chipBorder = defaults.chipBorder, accent = defaults.accent,
                )
                CardPart.All -> defaults
            }
            if (darkSide) skin.copy(dark = updated) else skin.copy(light = updated)
        }
        say(when (part) {
            CardPart.Back -> "卡背已恢复默认（预览中，点击应用后保存）"
            CardPart.Content -> "内容面已恢复默认（预览中，点击应用后保存）"
            CardPart.All -> "卡片已恢复默认（预览中，点击应用后保存）"
        })
    }

    enum class CardPart { Back, Content, All }

    /** 上传装扮资源：图标（保留透明度）或底图（自动压缩）。返回 URL，失败时通知原因。 */
    fun uploadAsset(bytes: ByteArray, fileName: String, mimeType: String, kind: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            try {
                val url = withContext(Dispatchers.IO) {
                    repository.uploadAsset(bytes, fileName, mimeType, kind)
                }
                onDone(url)
                say("资源已上传，记得点击应用保存")
            } catch (cause: Exception) {
                say(cause.message ?: "资源上传失败")
            } finally {
                _busy.value = false
            }
        }
    }

    /** 应用工作区配置到账号（手工配置不挂主题 id）。 */
    fun saveWorking() {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            _savePhase.value = DecorSavePhase.Loading
            val workingConfig = _working.value
            val ok = repository.saveSettings(
                bottomBar = workingConfig.bar.toJson(),
                card = workingConfig.card.toJson(),
                clearBottomTheme = true,
                clearCardTheme = true,
            )
            _busy.value = false
            if (ok) {
                _dirty.value = false
                _savePhase.value = DecorSavePhase.Success
                say("已保存到账户 · 当前客户端已应用")
                viewModelScope.launch {
                    kotlinx.coroutines.delay(1800)
                    if (_savePhase.value == DecorSavePhase.Success) _savePhase.value = DecorSavePhase.Idle
                }
            } else {
                _savePhase.value = DecorSavePhase.Error
                say(repository.lastError.value ?: "保存失败，请重试（预览内容已保留）")
            }
        }
    }

    /** 投稿当前方案（需求 6.1 投稿及审核状态查看）。 */
    fun submit(title: String, description: String, tags: List<String>, kind: String, onDone: (Boolean) -> Unit) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            try {
                val config = JSONObject()
                    .put("bottomBar", _working.value.bar.toJson())
                    .put("card", _working.value.card.toJson())
                repository.submitTheme(title, description, tags, kind, config)
                say("已提交审核，通过后其他用户就能使用")
                load("mine", force = true)
                onDone(true)
            } catch (cause: Exception) {
                say(cause.message ?: "投稿失败，请重试")
                onDone(false)
            } finally {
                _busy.value = false
            }
        }
    }

    /** 工作区从已应用配置重新起步。 */
    fun resetWorkingFromApplied() {
        _working.value = repository.config.value
        _dirty.value = false
        _savePhase.value = DecorSavePhase.Idle
    }
}
