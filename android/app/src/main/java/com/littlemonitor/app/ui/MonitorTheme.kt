package com.littlemonitor.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class MonitorPalette(
    val paper: Color,
    val card: Color,
    val mint: Color,
    val mintWash: Color,
    val teal: Color,
    val ink: Color,
    val muted: Color,
    val peach: Color,
    val gold: Color,
    val line: Color,
    val good: Color,
    val alert: Color,
    val hero: Color,
)

private val LightPalette = MonitorPalette(
    paper = Color(0xFFF6F5FF), card = Color(0xFFFFFFFF), mint = Color(0xFFDDF4EF),
    mintWash = Color(0xFFE8F6F2), teal = Color(0xFF176B64), ink = Color(0xFF211D42),
    muted = Color(0xFF555B78), peach = Color(0xFFFFE6E3), gold = Color(0xFFFFF0C9),
    line = Color(0xFFD9D9EF), good = Color(0xFF276A48), alert = Color(0xFF9D334B),
    hero = Color(0xFFEAE8FF),
)

private val DarkPalette = MonitorPalette(
    paper = Color(0xFF11152B), card = Color(0xFF1B2140), mint = Color(0xFF1E393D),
    mintWash = Color(0xFF24483F), teal = Color(0xFF75E5D3), ink = Color(0xFFF5F3FF),
    muted = Color(0xFFD0D4F2), peach = Color(0xFF542D3D), gold = Color(0xFF443A2B),
    line = Color(0xFF394269), good = Color(0xFFA8F0C0), alert = Color(0xFFFFC5BC),
    hero = Color(0xFF25264D),
)

val LocalMonitorPalette = staticCompositionLocalOf { LightPalette }

@Composable
fun MonitorTheme(content: @Composable () -> Unit) {
    val palette = if (isSystemInDarkTheme()) DarkPalette else LightPalette
    val scheme = if (isSystemInDarkTheme()) {
        darkColorScheme(
            primary = palette.teal, secondary = palette.good, background = palette.paper,
            surface = palette.card, onBackground = palette.ink, onSurface = palette.ink,
            onPrimary = Color(0xFF143D39), outline = palette.line, error = palette.alert,
        )
    } else {
        lightColorScheme(
            primary = palette.teal, secondary = palette.good, background = palette.paper,
            surface = palette.card, onBackground = palette.ink, onSurface = palette.ink,
            onPrimary = Color.White, outline = palette.line, error = palette.alert,
        )
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalMonitorPalette provides palette) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
