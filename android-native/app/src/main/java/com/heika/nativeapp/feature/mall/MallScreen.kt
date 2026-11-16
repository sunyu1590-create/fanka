package com.heika.nativeapp.feature.mall

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heika.nativeapp.ui.BackHeader
import com.heika.nativeapp.ui.HeikaIcons

/**
 * 商城占位页：先把入口与版式定下来，商品与下单链路后续接入。
 */
@Composable
fun MallScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BackHeader("商城", onBack)
        Column(
            Modifier.fillMaxSize().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                Modifier.size(66.dp).clip(RoundedCornerShape(21.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = .12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(HeikaIcons.Bag, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            }
            Spacer(Modifier.height(16.dp))
            Text("商城", color = MaterialTheme.colorScheme.onBackground, fontSize = 21.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .6.sp)
            Spacer(Modifier.height(9.dp))
            Text(
                "限定卡面、实体周边与会员礼盒正在准备中。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(18.dp))
            Text(
                "正在开发 · 敬请期待",
                color = MaterialTheme.colorScheme.primary,
                fontSize = 10.sp,
                letterSpacing = 1.4.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .border(.7.dp, MaterialTheme.colorScheme.primary.copy(alpha = .35f), RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
    }
}
