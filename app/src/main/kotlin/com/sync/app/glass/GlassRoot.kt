package com.sync.app.glass

import android.webkit.WebView
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import androidx.compose.ui.viewinterop.AndroidView
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import kotlin.math.roundToInt

/** SYNC is an always-dark UI → the dark-theme values of Kyant's catalog are used verbatim. */
internal object GlassTheme {
    val Accent = Color(0xFF0091FF)
    val Container = Color(0xFF121212).copy(0.4f)
    val Content = Color.White
    val Danger = Color(0xFFFF453A)
}

/**
 * Layer 0 : the WebView (frontend UI, unchanged) recorded by `layerBackdrop`
 * Layer 1 : Kyant `drawBackdrop` glass surfaces + native controls, placed at the rects the DOM reports.
 */
@Composable
fun GlassRoot(webView: WebView, c: GlassController) {
    val backdrop = rememberLayerBackdrop()
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().layerBackdrop(backdrop)) {
            AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
        }

        val s = c.state
        val dim = s.dialog != null || s.confirm != null || s.add != null
        val chromeAlpha by animateFloatAsState(if (dim) 0.45f else 1f, label = "chromeDim")

        Box(Modifier.fillMaxSize().graphicsLayer { alpha = chromeAlpha }) {
            s.nav?.let { NavGlass(it, backdrop, c) }
            s.bar?.let { BarGlass(it, backdrop, c) }
            s.search?.let { SearchGlass(it, backdrop, c) }
        }
        s.ctx?.let { ContextMenuGlass(it, backdrop, c) }
        s.dialog?.let { DialogGlass(it, backdrop, c) }
        s.confirm?.let { ConfirmGlass(it, backdrop, c) }
        s.add?.let { AddModalGlass(it, backdrop, c) }
    }
}

internal fun Modifier.cssRect(r: CssRect): Modifier = this
    .offset { IntOffset((r.x * density).roundToInt(), (r.y * density).roundToInt()) }
    .size(r.w.dp, r.h.dp)

/** Pop-in spring used by dialogs / menus (scale + alpha through the backdrop's own layerBlock). */
@Composable
internal fun rememberPopIn(): Animatable<Float, *> {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { a.animateTo(1f, spring(0.72f, 420f, 0.001f)) }
    return a
}

internal fun popScale(p: Float) = lerp(0.90f, 1f, p)
