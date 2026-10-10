package com.sync.app.glass

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.shapes.Capsule
import com.sync.app.glass.kyant.InteractiveHighlight

/** Mini player = one Kyant glass capsule (same effect stack as LiquidBottomTabs' container). */
@Composable
internal fun BarGlass(bar: BarState, backdrop: Backdrop, c: GlassController) {
    val scope = rememberCoroutineScope()
    val highlight = remember(scope) { InteractiveHighlight(scope) }
    val art = rememberRemoteImage(bar.art)
    val accent = Color(bar.accent)

    Box(
        Modifier
            .cssRect(bar.rect)
            .drawBackdrop(
                backdrop = backdrop,
                shape = { Capsule() },
                effects = {
                    vibrancy()
                    blur(8f.dp.toPx())
                    lens(24f.dp.toPx(), 24f.dp.toPx())
                },
                onDrawSurface = { drawRect(GlassTheme.Container) }
            )
            .then(highlight.modifier)
            .then(highlight.gestureModifier)
    ) {
        Row(
            Modifier.fillMaxSize().padding(start = 10.dp, end = 8.dp, bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.White.copy(0.08f))
                    .clickable { c.cmd { put("t", "bar"); put("a", "open") } }
            ) {
                if (art != null) Image(art, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            Column(
                Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp)
                    .clickable { c.cmd { put("t", "bar"); put("a", "open") } },
                verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically)
            ) {
                BasicText(
                    bar.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = TextStyle(GlassTheme.Content, 14.sp, FontWeight.SemiBold)
                )
                BasicText(
                    bar.channel, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = TextStyle(GlassTheme.Content.copy(0.62f), 12.sp)
                )
            }
            IconSlot(onClick = { c.cmd { put("t", "bar"); put("a", "fav") } }) {
                Canvas(Modifier.size(20.dp)) {
                    if (bar.fav) {
                        fillIcon(GlassIcons.Heart, 15f, accent)
                    } else {
                        strokeIcon(listOf(GlassIcons.Heart), 15f, GlassTheme.Content.copy(0.85f), 1.5f)
                    }
                }
            }
            Visualizer(bar.playing)
            IconSlot(onClick = { c.cmd { put("t", "bar"); put("a", "play") } }) {
                Canvas(Modifier.size(24.dp)) {
                    fillIcon(if (bar.playing) GlassIcons.PauseFill else GlassIcons.PlayFill, 512f, GlassTheme.Content)
                }
            }
            IconSlot(onClick = { c.cmd { put("t", "bar"); put("a", "next") } }) {
                Canvas(Modifier.size(22.dp)) { fillIcon(GlassIcons.NextFill, 512f, GlassTheme.Content) }
            }
        }
        // playback progress (mirrors #bar-prog-fill)
        Canvas(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 30.dp, vertical = 6.dp)
                .fillMaxWidth()
                .height(2.dp)
        ) {
            val r = CornerRadius(size.height / 2f)
            drawRoundRect(Color.White.copy(0.16f), Offset.Zero, size, r)
            if (bar.progress > 0f)
                drawRoundRect(Color.White.copy(0.9f), Offset.Zero, Size(size.width * bar.progress, size.height), r)
        }
    }
}

@Composable
private fun IconSlot(onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) { content() }
}

@Composable
private fun Visualizer(playing: Boolean) {
    val t = rememberInfiniteTransition(label = "viz")
    val phases = listOf(380, 520, 440, 600, 480).mapIndexed { i, ms ->
        t.animateFloat(
            0.25f, 1f,
            infiniteRepeatable(tween(ms, easing = LinearEasing), RepeatMode.Reverse),
            label = "vb$i"
        )
    }
    Canvas(Modifier.padding(horizontal = 4.dp).size(width = 18.dp, height = 16.dp)) {
        val bw = 2.dp.toPx()
        val gap = (size.width - bw * 5) / 4f
        phases.forEachIndexed { i, p ->
            val h = size.height * (if (playing) p.value else 0.25f)
            drawRoundRect(
                GlassTheme.Content.copy(0.8f),
                Offset(i * (bw + gap), size.height - h), Size(bw, h), CornerRadius(bw / 2f)
            )
        }
    }
}
