package com.heika.android.discovery

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.view.MotionEvent
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import androidx.core.graphics.ColorUtils
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.AsyncListDiffer
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.GlideException
import android.graphics.drawable.Drawable
import kotlinx.coroutines.launch
import kotlin.math.max

/** Native discovery surface. The existing WebView remains underneath it and owns the glass navigation. */
internal class DiscoveryScreen(
    context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val viewModel: DiscoveryViewModel,
    private val listener: Listener,
) : FrameLayout(context) {
    interface Listener {
        fun onOpenPost(id: Long)
        fun onOpenAuthor(id: String)
        fun onSearch(query: String)
        fun onLoginRequired()
    }

    private val header = LinearLayout(context)
    private val channelTabs = LinearLayout(context)
    private val searchInput = EditText(context)
    private val panes = mapOf(
        DiscoveryChannel.COMMUNITY to FeedPane(context, DiscoveryChannel.COMMUNITY),
        DiscoveryChannel.AI to FeedPane(context, DiscoveryChannel.AI),
    )
    private var activeChannel = DiscoveryChannel.COMMUNITY
    private var darkTheme = true
    private var themeApplied = false
    private var searchExpanded = false
    private var searchText = ""
    private val navigationCutout = RectF()
    private val navigationHitRect = RectF()
    private val navigationCutoutPath = Path()

    init {
        clipChildren = false
        clipToPadding = false
        isClickable = false
        val page = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(5), dp(14), dp(2))
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        buildHeader()
        buildChannels()
        page.addView(header, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(48)))
        page.addView(searchInput, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(42)))
        searchInput.visibility = GONE
        page.addView(channelTabs, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(42)))
        panes.values.forEach { pane -> page.addView(pane, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)) }
        addView(page)
        showChannel(DiscoveryChannel.COMMUNITY)
        searchInput.addTextChangedListener(SimpleTextWatcher { value ->
            searchText = value
            panes.values.forEach { it.applySearch(value) }
        })
        searchInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_GO) {
                val query = searchInput.text.toString().trim()
                if (query.isNotEmpty()) listener.onSearch(query)
                true
            } else false
        }
        lifecycleOwner.lifecycleScope.launch {
            lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.feeds.collect { states ->
                    states.forEach { (channel, state) -> panes.getValue(channel).render(state, searchText) }
                }
            }
        }
        applyTheme(dark = true)
    }

    fun applyTheme(dark: Boolean) {
        if (themeApplied && darkTheme == dark) return
        themeApplied = true
        darkTheme = dark
        val bg = if (dark) Color.rgb(13, 16, 18) else Color.rgb(245, 243, 238)
        val ink = if (dark) Color.rgb(238, 238, 232) else Color.rgb(32, 33, 31)
        val muted = if (dark) Color.rgb(155, 158, 154) else Color.rgb(119, 118, 111)
        setBackgroundColor(bg)
        panes.values.forEach { it.applyTheme(dark, bg, ink, muted) }
        header.setBackgroundColor(bg)
        channelTabs.setBackgroundColor(bg)
        fun recolor(view: View) {
            if (view is TextView && view.text.toString() != "DISCOVER") view.setTextColor(ink)
            else if (view is ViewGroup) for (index in 0 until view.childCount) recolor(view.getChildAt(index))
        }
        for (index in 0 until header.childCount) recolor(header.getChildAt(index))
        for (index in 0 until channelTabs.childCount) {
            val button = channelTabs.getChildAt(index) as TextView
            val selected = (button.tag as? DiscoveryChannel) == activeChannel
            button.setTextColor(if (selected) ink else muted)
            button.background = pill(if (selected) if (dark) Color.rgb(45, 49, 50) else Color.rgb(229, 226, 217) else Color.TRANSPARENT)
        }
        searchInput.setTextColor(ink)
        searchInput.setHintTextColor(muted)
        searchInput.background = rounded(if (dark) Color.rgb(34, 38, 40) else Color.rgb(255, 254, 250), dp(10))
    }

    fun updateNavigationTop(topPx: Int) {
        // MainActivity resizes the view itself to the web navigation's measured top edge.
        requestLayout()
    }

    fun setNavigationCutout(left: Int, top: Int, width: Int, height: Int) {
        if (width <= 0 || height <= 0) {
            navigationCutout.setEmpty()
            navigationHitRect.setEmpty()
            navigationCutoutPath.reset()
            invalidate()
            return
        }
        // The circle is owned by the website. Leave it visible through this native
        // surface, including its CSS shadow, so the existing glass navigation and
        // compose interaction remain exactly the website's implementation.
        val shadow = dp(12).toFloat()
        navigationCutout.set(
            left - shadow,
            top - shadow,
            left + width + shadow,
            top + height + shadow,
        )
        navigationHitRect.set(left.toFloat(), top.toFloat(), (left + width).toFloat(), (top + height).toFloat())
        navigationCutoutPath.reset()
        navigationCutoutPath.addOval(navigationCutout, Path.Direction.CW)
        invalidate()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN && navigationHitRect.contains(event.x, event.y)) {
            // A drawing clip does not alter hit testing. Let the original WebView
            // compose button receive its normal tap and animation through the hole.
            return false
        }
        return super.dispatchTouchEvent(event)
    }

    override fun draw(canvas: Canvas) {
        if (navigationCutout.isEmpty) {
            super.draw(canvas)
            return
        }
        val save = canvas.save()
        canvas.clipOutPath(navigationCutoutPath)
        super.draw(canvas)
        canvas.restoreToCount(save)
    }

    fun setSession(userId: String?, token: String?) = viewModel.setSession(userId, token)

    fun clearSearchFocus() = searchInput.clearFocus()

    fun saveListState() {
        panes.forEach { (channel, pane) -> pane.saveScrollState() }
    }

    private fun buildHeader() {
        header.orientation = LinearLayout.HORIZONTAL
        header.gravity = Gravity.CENTER_VERTICAL
        val brand = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        brand.addView(ImageView(context).apply {
            setImageResource(com.heika.android.R.drawable.ic_heika)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "黑卡标识"
        }, LinearLayout.LayoutParams(dp(34), dp(34)).apply { rightMargin = dp(8) })
        val brandCopy = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        brandCopy.addView(TextView(context).apply {
            text = "黑卡  HEIKA"
            textSize = 16f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            letterSpacing = .035f
        })
        brandCopy.addView(TextView(context).apply {
            text = "DISCOVER"
            textSize = 9f
            letterSpacing = .18f
            setTextColor(Color.rgb(185, 151, 82))
        })
        brand.addView(brandCopy)
        header.addView(brand, LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        val search = headerButton("⌕", "搜索") {
            searchExpanded = !searchExpanded
            searchInput.visibility = if (searchExpanded) VISIBLE else GONE
            if (!searchExpanded) { searchInput.setText(""); searchText = "" }
            if (searchExpanded) searchInput.requestFocus()
        }
        header.addView(search, LinearLayout.LayoutParams(dp(42), dp(42)))
        val more = headerButton("···", "更多") { showMoreMenu(it) }
        header.addView(more, LinearLayout.LayoutParams(dp(42), dp(42)))
    }

    private fun buildChannels() {
        channelTabs.orientation = LinearLayout.HORIZONTAL
        channelTabs.gravity = Gravity.CENTER_VERTICAL
        channelTabs.addView(channelButton("社区", DiscoveryChannel.COMMUNITY), LinearLayout.LayoutParams(dp(72), dp(34)))
        channelTabs.addView(channelButton("AI 空间", DiscoveryChannel.AI), LinearLayout.LayoutParams(dp(86), dp(34)))
    }

    private fun channelButton(label: String, channel: DiscoveryChannel) = TextView(context).apply {
        text = label
        textSize = 14f
        gravity = Gravity.CENTER
        tag = channel
        background = pill(Color.rgb(45, 49, 50))
        setOnClickListener { showChannel(channel) }
    }

    private fun showChannel(channel: DiscoveryChannel) {
        activeChannel = channel
        panes.forEach { (key, pane) -> pane.visibility = if (key == channel) VISIBLE else GONE }
        for (index in 0 until channelTabs.childCount) {
            val button = channelTabs.getChildAt(index) as TextView
            val selected = button.tag == channel
            val ink = if (darkTheme) Color.rgb(238, 238, 232) else Color.rgb(32, 33, 31)
            val muted = if (darkTheme) Color.rgb(155, 158, 154) else Color.rgb(119, 118, 111)
            button.setTextColor(if (selected) ink else muted)
            button.background = pill(if (selected) if (darkTheme) Color.rgb(45, 49, 50) else Color.rgb(229, 226, 217) else Color.TRANSPARENT)
        }
    }

    private fun showMoreMenu(anchor: View) {
        PopupMenu(context, anchor).apply {
            menu.add("刷新内容").setOnMenuItemClickListener { viewModel.refresh(activeChannel); true }
            menu.add("登录与同步").setOnMenuItemClickListener { listener.onLoginRequired(); true }
            show()
        }
    }

    private fun headerButton(symbol: String, description: String, action: (View) -> Unit) = TextView(context).apply {
        text = symbol
        textSize = if (symbol == "···") 21f else 27f
        gravity = Gravity.CENTER
        contentDescription = description
        setOnClickListener { action(this) }
    }

    private inner class FeedPane(context: Context, private val channel: DiscoveryChannel) : LinearLayout(context) {
        private val controls = LinearLayout(context)
        private val categoryScroll = HorizontalScrollView(context)
        private val categoryRow = LinearLayout(context)
        private val contentTypeScroll = HorizontalScrollView(context)
        private val contentTypeRow = LinearLayout(context)
        private val sortRow = LinearLayout(context)
        private val status = TextView(context)
        private val list = RecyclerView(context)
        private val adapter = DiscoveryAdapter(
            context,
            onPost = { listener.onOpenPost(it.id) },
            onAuthor = { it.authorId?.let(listener::onOpenAuthor) },
            onLike = { if (viewModel.hasSession()) viewModel.toggleLike(channel, it) else listener.onLoginRequired() },
            onSave = { post ->
                if (post.saved || viewModel.hasSession()) viewModel.toggleSaved(channel, post)
                else listener.onLoginRequired()
            },
        )
        private var categoryNames = emptyList<String>()
        private var state: DiscoveryFeedState? = null
        private var currentQuery = ""
        private var dark = true

        fun saveScrollState() = viewModel.saveScrollState(channel, list.layoutManager?.onSaveInstanceState())

        init {
            orientation = VERTICAL
            controls.orientation = VERTICAL
            categoryRow.orientation = LinearLayout.HORIZONTAL
            categoryScroll.isHorizontalScrollBarEnabled = false
            categoryScroll.addView(categoryRow)
            contentTypeRow.orientation = LinearLayout.HORIZONTAL
            contentTypeScroll.isHorizontalScrollBarEnabled = false
            contentTypeScroll.addView(contentTypeRow)
            sortRow.orientation = LinearLayout.HORIZONTAL
            sortRow.gravity = Gravity.CENTER_VERTICAL
            controls.addView(categoryScroll, LayoutParams(LayoutParams.MATCH_PARENT, dp(42)))
            controls.addView(contentTypeScroll, LayoutParams(LayoutParams.MATCH_PARENT, dp(34)))
            controls.addView(sortRow, LayoutParams(LayoutParams.MATCH_PARENT, dp(39)))
            addView(controls, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
            status.gravity = Gravity.CENTER
            status.textSize = 12f
            addView(status, LayoutParams(LayoutParams.MATCH_PARENT, dp(42)))
            list.layoutManager = StaggeredGridLayoutManager(2, RecyclerView.VERTICAL).apply { gapStrategy = StaggeredGridLayoutManager.GAP_HANDLING_MOVE_ITEMS_BETWEEN_SPANS }
            list.adapter = adapter
            viewModel.restoreScrollState(channel)?.let { saved -> list.layoutManager?.onRestoreInstanceState(saved) }
            list.setHasFixedSize(false)
            list.itemAnimator = null
            list.setItemViewCacheSize(8)
            list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    if (dy <= 0) return
                    val manager = recyclerView.layoutManager as? StaggeredGridLayoutManager ?: return
                    val last = manager.findLastVisibleItemPositions(null).maxOrNull() ?: 0
                    if (last >= adapter.itemCount - 6) viewModel.loadMore(channel)
                }
            })
            addView(list, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        }

        fun applyTheme(isDark: Boolean, bg: Int, ink: Int, muted: Int) {
            dark = isDark
            setBackgroundColor(bg)
            list.setBackgroundColor(bg)
            status.setTextColor(muted)
            adapter.applyTheme(isDark)
            state?.let { value ->
                renderCategories(value)
                renderSort(value)
                renderContentTypes(value)
                render(value, currentQuery)
            }
        }

        fun applySearch(query: String) {
            currentQuery = query
            state?.let { render(it, query) }
        }

        fun render(newState: DiscoveryFeedState, query: String) {
            val previous = state
            val filterChanged = previous != null && (
                previous.selectedCategory != newState.selectedCategory ||
                    previous.selectedTopic != newState.selectedTopic ||
                    previous.selectedContentType != newState.selectedContentType ||
                    previous.sort != newState.sort
                )
            state = newState
            currentQuery = query
            if (previous?.categories?.map { it.name } != newState.categories.map { it.name }) renderCategories(newState)
            if (previous?.tags?.map { it.name } != newState.tags.map { it.name } || previous?.sort != newState.sort || previous?.selectedTopic != newState.selectedTopic) renderSort(newState)
            if (previous?.selectedContentType != newState.selectedContentType || previous?.channel != newState.channel) renderContentTypes(newState)
            val filtered = if (query.isBlank()) newState.items else newState.items.filter {
                it.title.contains(query, true) || it.body.contains(query, true) || it.category.contains(query, true) || it.topics.any { topic -> topic.contains(query, true) }
            }
            adapter.submit(filtered)
            if (filterChanged) list.scrollToPosition(0)
            status.visibility = if (newState.loading && newState.items.isEmpty() || newState.error != null && newState.items.isEmpty() || filtered.isEmpty() && !newState.loading) VISIBLE else GONE
            status.text = when {
                newState.loading && newState.items.isEmpty() -> "正在加载内容…"
                newState.error != null && newState.items.isEmpty() -> newState.error + "　点此重试"
                newState.loading && filtered.isNotEmpty() -> "正在加载更多…"
                newState.error != null && filtered.isNotEmpty() -> "连接中断 · 点此重试"
                query.isNotBlank() && filtered.isEmpty() -> "没有匹配内容"
                else -> "这里暂时没有内容"
            }
            status.setOnClickListener { if (newState.error != null) viewModel.refresh(channel) }
            if (newState.error != null && newState.items.isNotEmpty()) {
                status.visibility = VISIBLE
                status.text = "连接中断 · 点此重试"
                status.setOnClickListener { viewModel.refresh(channel) }
            }
        }

        private fun renderCategories(value: DiscoveryFeedState) {
            categoryNames = value.categories.map { it.name }
            categoryRow.removeAllViews()
            value.categories.forEach { category ->
                categoryRow.addView(chip(category.name, value.selectedCategory == category.name) {
                    viewModel.setCategory(channel, category.name)
                }, LayoutParams(LayoutParams.WRAP_CONTENT, dp(31)).apply { rightMargin = dp(7) })
            }
        }

        private fun renderSort(value: DiscoveryFeedState) {
            sortRow.removeAllViews()
            val topic = TextView(context).apply {
                text = value.selectedTopic?.let { "标签 · $it⌄" } ?: "标签⌄"
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(dp(9), 0, dp(9), 0)
                background = rounded(if (dark) Color.rgb(37, 41, 43) else Color.rgb(235, 232, 224), dp(9))
                setTextColor(if (dark) Color.rgb(193, 196, 190) else Color.rgb(85, 84, 78))
                setOnClickListener { showTopicMenu(this, value.tags, value.selectedTopic) }
            }
            sortRow.addView(topic, LayoutParams(LayoutParams.WRAP_CONTENT, dp(29)).apply { rightMargin = dp(6) })
            val sorts = if (channel == DiscoveryChannel.COMMUNITY) listOf(DiscoverySort.FEATURED, DiscoverySort.LATEST, DiscoverySort.HIGH_SCORE, DiscoverySort.FOLLOWING)
                else listOf(DiscoverySort.FEATURED, DiscoverySort.LATEST, DiscoverySort.HIGH_SCORE)
            sorts.forEach { sort ->
                val label = when (channel to sort) {
                    DiscoveryChannel.COMMUNITY to DiscoverySort.FEATURED -> "为你推荐"
                    DiscoveryChannel.COMMUNITY to DiscoverySort.HIGH_SCORE -> "高评分"
                    DiscoveryChannel.AI to DiscoverySort.HIGH_SCORE -> "热门"
                    else -> sort.label
                }
                sortRow.addView(chip(label, value.sort == sort) {
                    if (sort == DiscoverySort.FOLLOWING && !viewModel.hasSession()) listener.onLoginRequired()
                    else viewModel.setSort(channel, sort)
                }, LayoutParams(LayoutParams.WRAP_CONTENT, dp(29)).apply { rightMargin = dp(5) })
            }
        }

        private fun renderContentTypes(value: DiscoveryFeedState) {
            contentTypeRow.removeAllViews()
            contentTypeScroll.visibility = if (channel == DiscoveryChannel.AI) VISIBLE else GONE
            if (channel != DiscoveryChannel.AI) return
            val options = listOf(
                null to "全部类型",
                "knowledge_article" to "AI 知识",
                "agent" to "Agent",
                "skill" to "Skills",
                "prompt" to "Prompt",
                "ai_tool" to "AI 工具",
                "tutorial" to "实战教程",
            )
            options.forEach { (type, label) ->
                contentTypeRow.addView(chip(label, value.selectedContentType == type) { viewModel.setContentType(channel, type) },
                    LayoutParams(LayoutParams.WRAP_CONTENT, dp(28)).apply { rightMargin = dp(6) })
            }
        }

        private fun showTopicMenu(anchor: View, tags: List<DiscoveryCategory>, selected: String?) {
            PopupMenu(context, anchor).apply {
                menu.add("全部标签").setOnMenuItemClickListener { viewModel.setTopic(channel, null); true }
                tags.take(45).forEach { tag ->
                    menu.add(tag.name).setOnMenuItemClickListener { viewModel.setTopic(channel, tag); true }
                }
                show()
            }
        }

        private fun chip(label: String, selected: Boolean, action: () -> Unit) = TextView(context).apply {
            text = label
            textSize = 11f
            gravity = Gravity.CENTER
            setPadding(dp(10), 0, dp(10), 0)
            setTextColor(if (selected) Color.rgb(190, 157, 91) else if (dark) Color.rgb(153, 157, 154) else Color.rgb(112, 111, 104))
            background = rounded(if (selected) ColorUtils.setAlphaComponent(Color.rgb(182, 147, 77), if (dark) 48 else 34) else Color.TRANSPARENT, dp(9))
            setOnClickListener { action() }
        }
    }

    private class DiscoveryAdapter(
        private val context: Context,
        private val onPost: (DiscoveryPost) -> Unit,
        private val onAuthor: (DiscoveryPost) -> Unit,
        private val onLike: (DiscoveryPost) -> Unit,
        private val onSave: (DiscoveryPost) -> Unit,
    ) : RecyclerView.Adapter<DiscoveryHolder>() {
        private val differ = AsyncListDiffer(this, object : DiffUtil.ItemCallback<DiscoveryPost>() {
            override fun areItemsTheSame(oldItem: DiscoveryPost, newItem: DiscoveryPost) = oldItem.stableKey == newItem.stableKey
            override fun areContentsTheSame(oldItem: DiscoveryPost, newItem: DiscoveryPost) = oldItem == newItem
        })
        private var dark = true
        init { setHasStableIds(true) }

        fun applyTheme(isDark: Boolean) { dark = isDark; notifyItemRangeChanged(0, itemCount) }
        fun submit(values: List<DiscoveryPost>) { differ.submitList(values.toList()) }

        override fun getItemId(position: Int): Long = stableLong(differ.currentList[position].stableKey)
        override fun getItemCount() = differ.currentList.size
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = DiscoveryHolder(context, onPost, onAuthor, onLike, onSave)
        override fun onBindViewHolder(holder: DiscoveryHolder, position: Int) = holder.bind(differ.currentList[position], dark)
        override fun onViewRecycled(holder: DiscoveryHolder) { holder.recycle(); super.onViewRecycled(holder) }
    }

    private class DiscoveryHolder(
        context: Context,
        private val onPost: (DiscoveryPost) -> Unit,
        private val onAuthor: (DiscoveryPost) -> Unit,
        private val onLike: (DiscoveryPost) -> Unit,
        private val onSave: (DiscoveryPost) -> Unit,
    ) : RecyclerView.ViewHolder(LinearLayout(context)) {
        private val root = itemView as LinearLayout
        private val card = LinearLayout(context)
        private val cover = FrameLayout(context)
        private val image = ImageView(context)
        private val imageError = TextView(context)
        private val categoryLabel = TextView(context)
        private val ratingLabel = TextView(context)
        private val title = TextView(context)
        private val textBody = TextView(context)
        private val metadata = LinearLayout(context)
        private val author = TextView(context)
        private val like = TextView(context)
        private val save = TextView(context)
        private var post: DiscoveryPost? = null

        init {
            root.orientation = LinearLayout.VERTICAL
            root.setPadding(dp(3), 0, dp(3), dp(11))
            card.orientation = LinearLayout.VERTICAL
            card.clipToOutline = true
            cover.addView(image, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            categoryLabel.textSize = 9f
            categoryLabel.setPadding(dp(8), dp(5), dp(8), dp(5))
            cover.addView(categoryLabel, FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.LEFT).apply { setMargins(dp(8), dp(8), 0, 0) })
            ratingLabel.textSize = 9f
            ratingLabel.setPadding(dp(8), dp(5), dp(8), dp(5))
            cover.addView(ratingLabel, FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.RIGHT).apply { setMargins(0, dp(8), dp(8), 0) })
            title.textSize = 13f
            title.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            title.maxLines = 3
            title.setShadowLayer(3f, 0f, 1f, Color.BLACK)
            title.setTextColor(Color.WHITE)
            title.setPadding(dp(10), dp(24), dp(10), dp(9))
            title.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.TRANSPARENT, 0xCC000000.toInt()))
            cover.addView(title, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
            imageError.text = "图片暂不可用 · 重试"
            imageError.textSize = 10f
            imageError.gravity = Gravity.CENTER
            imageError.visibility = View.GONE
            imageError.setTextColor(Color.WHITE)
            imageError.setBackgroundColor(0x99000000.toInt())
            cover.addView(imageError, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(34), Gravity.CENTER))

            textBody.textSize = 12f
            textBody.maxLines = 4
            textBody.setPadding(dp(11), dp(8), dp(11), dp(12))
            card.addView(cover)
            card.addView(textBody)
            metadata.orientation = LinearLayout.HORIZONTAL
            metadata.gravity = Gravity.CENTER_VERTICAL
            metadata.setPadding(dp(9), dp(6), dp(8), dp(8))
            author.textSize = 10f
            author.maxLines = 1
            author.ellipsize = android.text.TextUtils.TruncateAt.END
            metadata.addView(author, LinearLayout.LayoutParams(0, dp(27), 1f))
            like.textSize = 10f
            like.gravity = Gravity.CENTER
            metadata.addView(like, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, dp(27)).apply { leftMargin = dp(4) })
            save.textSize = 13f
            save.gravity = Gravity.CENTER
            metadata.addView(save, LinearLayout.LayoutParams(dp(27), dp(27)))
            card.addView(metadata)
            root.addView(card, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
            root.setOnClickListener { this.post?.let(onPost) }
            author.setOnClickListener { this.post?.let(onAuthor) }
            like.setOnClickListener { this.post?.let(onLike) }
            save.setOnClickListener { this.post?.let(onSave) }
            imageError.setOnClickListener { this.post?.imageUrl?.let(::loadImage) }
        }

        fun bind(value: DiscoveryPost, dark: Boolean) {
            post = value
            Glide.with(image).clear(image)
            imageError.visibility = View.GONE
            val bg = if (dark) Color.rgb(28, 32, 34) else Color.rgb(255, 254, 250)
            val ink = if (dark) Color.rgb(235, 235, 229) else Color.rgb(32, 33, 31)
            val muted = if (dark) Color.rgb(164, 167, 162) else Color.rgb(111, 109, 102)
            card.background = rounded(bg, dp(13))
            root.background = ColorDrawable(Color.TRANSPARENT)
            categoryLabel.text = value.category
            categoryLabel.setTextColor(Color.WHITE)
            categoryLabel.background = rounded(0x9C1A1D1F.toInt(), dp(9))
            ratingLabel.text = if (value.ratingCount > 0) "★ ${"%.1f".format(java.util.Locale.US, value.ratingAverage)}" else "★ 待评级"
            ratingLabel.setTextColor(Color.rgb(224, 188, 111))
            ratingLabel.background = rounded(0xA61A1D1F.toInt(), dp(9))
            title.text = value.title
            textBody.text = value.body.ifBlank { value.title }
            textBody.setTextColor(muted)
            author.text = "${value.author}  ·  ${value.category}"
            author.setTextColor(muted)
            like.text = "${if (value.liked) "♥" else "♡"} ${value.likeCount}"
            like.setTextColor(if (value.liked) Color.rgb(199, 137, 124) else muted)
            save.text = if (value.saved) "◆" else "◇"
            save.setTextColor(if (value.saved) Color.rgb(190, 157, 91) else muted)
            val imageUrl = value.imageUrl
            if (imageUrl == null) {
                image.visibility = View.GONE
                imageError.visibility = View.GONE
                categoryLabel.visibility = View.VISIBLE
                title.visibility = View.GONE
                textBody.visibility = View.VISIBLE
                cover.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, if (dark) intArrayOf(0xFF34393B.toInt(), 0xFF171B1D.toInt()) else intArrayOf(0xFFEAE6DD.toInt(), 0xFFDCD8CE.toInt()))
                val heightDp = (132 + value.body.length / 5).coerceIn(132, 224)
                cover.layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(heightDp))
                textBody.text = "${value.title}\n\n${value.body.ifBlank { "打开内容查看详情" }}"
                title.text = value.title
            } else {
                cover.background = rounded(if (dark) Color.rgb(38, 42, 43) else Color.rgb(235, 232, 224), dp(13))
                image.visibility = View.VISIBLE
                image.scaleType = ImageView.ScaleType.CENTER_CROP
                textBody.visibility = View.GONE
                title.visibility = View.VISIBLE
                val widthDp = max(120, (root.resources.displayMetrics.widthPixels / root.resources.displayMetrics.density / 2f - 25).toInt())
                val aspectHeight = when (kotlin.math.abs(value.id) % 8L) {
                    0L -> 1.45f
                    1L, 2L -> 1.18f
                    else -> 1.25f
                }
                cover.layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp((widthDp * aspectHeight).toInt()))
                imageError.visibility = View.GONE
                loadImage(imageUrl)
            }
            // Cover height is fixed before decode, so image completion never shifts the masonry layout.
        }

        private fun loadImage(url: String) {
            imageError.visibility = View.GONE
            Glide.with(image).load(url).diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
                .placeholder(ColorDrawable(if (post != null) 0xFF292D2F.toInt() else Color.DKGRAY))
                .error(ColorDrawable(0xFF292D2F.toInt()))
                .listener(object : RequestListener<Drawable> {
                    override fun onLoadFailed(e: GlideException?, model: Any?, target: Target<Drawable>, isFirstResource: Boolean): Boolean {
                        imageError.visibility = View.VISIBLE
                        return false
                    }
                    override fun onResourceReady(resource: Drawable, model: Any?, target: Target<Drawable>?, dataSource: DataSource, isFirstResource: Boolean) = false
                }).into(image)
        }

        fun recycle() { Glide.with(image).clear(image); post = null }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()

    private fun pill(color: Int) = rounded(color, dp(20))

    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private class SimpleTextWatcher(private val changed: (String) -> Unit) : android.text.TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { changed(s?.toString().orEmpty()) }
        override fun afterTextChanged(s: android.text.Editable?) = Unit
    }
}

private fun dp(value: Int) = (value * android.content.res.Resources.getSystem().displayMetrics.density + .5f).toInt()

private fun stableLong(value: String): Long {
    val id = runCatching { java.util.UUID.fromString(value) }.getOrNull()
    if (id != null) return id.mostSignificantBits xor id.leastSignificantBits
    var hash = -0x340d631b7bdddcdbL
    value.forEach { hash = (hash xor it.code.toLong()) * 0x100000001b3L }
    return hash
}
