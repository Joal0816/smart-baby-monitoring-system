package com.littlemonitor.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.littlemonitor.app.R
import com.littlemonitor.app.data.MonitorApi
import com.littlemonitor.app.data.MonitorConfig
import com.littlemonitor.app.data.MonitorEvent
import com.littlemonitor.app.data.MonitorSnapshot
import com.littlemonitor.app.data.RoomReading
import com.littlemonitor.app.data.SecureConfigStore
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class AppIcon {
    Home, History, Settings, Thermometer, Droplet, Sun, Device, Alert, Check,
}

private enum class Destination(val label: String, val icon: AppIcon) {
    Overview("Overview", AppIcon.Home), History("History", AppIcon.History), Settings("Settings", AppIcon.Settings),
}

private const val READING_STALE_AFTER_SECONDS = 120L

private val DemoSnapshot = MonitorSnapshot(
    reading = RoomReading(23.4, 56.0, 42.0, "Just now", emptyList()),
    events = listOf(
        MonitorEvent("demo-1", "check_in", "Room check-in", "2:14 PM", true, null),
        MonitorEvent("demo-2", "light", "Light level changed", "1:52 PM", true, null),
        MonitorEvent("demo-3", "online", "Monitor is online", "1:30 PM", true, null),
    ),
    online = true,
)

@Composable
fun LittleMonitorApp(configStore: SecureConfigStore) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbars = remember { SnackbarHostState() }
    var config by remember { mutableStateOf(configStore.read()) }
    var snapshot by remember { mutableStateOf(if (config.baseUrl.isBlank() && config.appToken.isBlank()) DemoSnapshot else MonitorSnapshot(null, emptyList(), false)) }
    var remoteError by remember { mutableStateOf<String?>(null) }
    var destination by remember { mutableStateOf(Destination.Overview) }
    var cryAlert by remember { mutableStateOf(false) }
    val demoMode = config.baseUrl.isBlank() && config.appToken.isBlank()

    LaunchedEffect(config.baseUrl, config.appToken, config.deviceId) {
        if (demoMode) {
            snapshot = DemoSnapshot
            remoteError = null
            return@LaunchedEffect
        }
        val api = MonitorApi(config)
        while (isActive) {
            val result = runCatching { withContext(Dispatchers.IO) { api.load() } }
            result.onSuccess {
                snapshot = it
                remoteError = null
            }.onFailure {
                remoteError = it.message ?: "Could not reach the monitor service."
            }
            delay(15_000)
        }
    }

    LaunchedEffect(config.baseUrl, config.appToken, config.deviceId) {
        if (demoMode) return@LaunchedEffect
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (token.isNotBlank()) {
                    val prefs = context.getSharedPreferences("monitor_installation", 0)
                    val installationId = prefs.getString("installation_id", null)
                        ?: UUID.randomUUID().toString().also { prefs.edit().putString("installation_id", it).apply() }
                    Executors.newSingleThreadExecutor().execute {
                        runCatching { MonitorApi(config).registerInstallation(installationId, token) }
                    }
                }
            }
        }
    }

    MonitorTheme {
        val palette = LocalMonitorPalette.current
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = palette.paper,
            contentWindowInsets = WindowInsets.navigationBars,
            snackbarHost = { SnackbarHost(snackbars) },
            bottomBar = {
                NavigationBar(containerColor = palette.card, tonalElevation = 0.dp) {
                    Destination.entries.forEach { page ->
                        NavigationBarItem(
                            selected = destination == page,
                            onClick = { destination = page },
                            icon = { LineIcon(page.icon, if (destination == page) palette.teal else palette.muted) },
                            label = { Text(page.label, fontSize = 11.sp) },
                        )
                    }
                }
            },
        ) { padding ->
            when (destination) {
                Destination.Overview -> OverviewScreen(
                    snapshot = snapshot,
                    demoMode = demoMode,
                    cryAlert = cryAlert,
                    remoteError = remoteError,
                    padding = padding,
                    onHistory = { destination = Destination.History },
                    onSimulateCry = {
                        if (demoMode) {
                            cryAlert = true
                            snapshot = snapshot.copy(events = listOf(
                                MonitorEvent("demo-cry", "cry", "Simulated cry alert", "Just now", false, null),
                            ) + snapshot.events.filterNot { it.id == "demo-cry" })
                        } else {
                            scope.launch { snackbars.showSnackbar("Demo alert is only available in sample mode.") }
                        }
                    },
                )
                Destination.History -> HistoryScreen(
                    events = snapshot.events,
                    demoMode = demoMode,
                    padding = padding,
                    onAcknowledge = { event ->
                        if (demoMode) {
                            snapshot = snapshot.copy(events = snapshot.events.map {
                                if (it.id == event.id) it.copy(acknowledged = true) else it
                            })
                            cryAlert = false
                        } else {
                            scope.launch {
                                val result = runCatching {
                                    withContext(Dispatchers.IO) { MonitorApi(config).acknowledge(event.id) }
                                }
                                if (result.isSuccess) {
                                    snapshot = snapshot.copy(events = snapshot.events.map {
                                        if (it.id == event.id) it.copy(acknowledged = true) else it
                                    })
                                } else snackbars.showSnackbar(result.exceptionOrNull()?.message ?: "Could not acknowledge event.")
                            }
                        }
                    },
                )
                Destination.Settings -> SettingsScreen(
                    initial = config,
                    padding = padding,
                    onSave = { updated ->
                        runCatching {
                            configStore.save(updated)
                            config = updated.copy(baseUrl = updated.baseUrl.trim().trimEnd('/'))
                            if (config.baseUrl.isBlank() && config.appToken.isBlank()) snapshot = DemoSnapshot
                            else snapshot = MonitorSnapshot(null, emptyList(), false)
                        }.onFailure { scope.launch { snackbars.showSnackbar(it.message ?: "Could not save settings.") } }.isSuccess
                    },
                )
            }
        }
    }
}

@Composable
private fun OverviewScreen(
    snapshot: MonitorSnapshot,
    demoMode: Boolean,
    cryAlert: Boolean,
    remoteError: String?,
    padding: PaddingValues,
    onHistory: () -> Unit,
    onSimulateCry: () -> Unit,
) {
    val palette = LocalMonitorPalette.current
    val reading = snapshot.reading
    val lastUpdateAge = secondsSince(reading?.receivedAt)
    val readingStale = !demoMode && (
        reading == null || lastUpdateAge == null || lastUpdateAge > READING_STALE_AFTER_SECONDS
    )
    val hasCry = cryAlert || snapshot.events.any { it.kind == "cry" && !it.acknowledged }
    val needsAttention = remoteError != null || !snapshot.online || readingStale
    val connectionLabel = when {
        demoMode -> "Demo data"
        remoteError != null -> "Update failed"
        !snapshot.online -> "Offline"
        reading == null -> "No readings"
        readingStale -> "Stale data"
        else -> "Connected"
    }
    val heroStatus = when {
        hasCry -> if (demoMode) "SIMULATED CRY ALERT" else "CRY ALERT · REVIEW"
        remoteError != null -> "CONNECTION NEEDS ATTENTION"
        !snapshot.online -> "MONITOR OFFLINE"
        reading == null -> "WAITING FOR FIRST READING"
        readingStale -> "DATA STALE"
        demoMode -> "PREVIEW ACTIVE"
        else -> "MONITOR CONNECTED"
    }
    val heroTitle = when {
        hasCry -> "Cry alert needs review"
        remoteError != null -> "Update failed"
        !snapshot.online -> "Monitor offline"
        reading == null -> "Waiting for first reading"
        readingStale -> "Readings may be out of date"
        demoMode -> "No simulated alert"
        else -> "No active alert"
    }
    val heroMessage = when {
        hasCry && demoMode -> "This is a simulated event. No audio was recorded."
        hasCry -> "A likely cry was detected. Review the room and acknowledge the event."
        remoteError != null -> remoteError
        !snapshot.online -> "Reconnect the monitor to receive current readings."
        reading == null -> "No readings have arrived from this device yet."
        readingStale -> "The last update was ${relativeAge(reading?.receivedAt)}. Check the monitor connection."
        demoMode -> "Sample room readings are shown below. No audio is recorded."
        else -> "No likely crying event detected. Current readings are shown below."
    }
    val deviceFaults = reading?.faults?.filter(String::isNotBlank).orEmpty()
    val deviceStatus = when {
        remoteError != null -> "Update failed"
        !snapshot.online -> "Offline"
        reading == null -> "Unavailable"
        deviceFaults.isNotEmpty() -> "Needs care"
        readingStale -> "Stale data"
        else -> "Online"
    }
    val deviceNote = when {
        deviceFaults.isNotEmpty() -> deviceFaults.joinToString()
        remoteError != null -> "Latest update failed"
        !snapshot.online -> "Connection unavailable"
        reading == null -> "No device reading"
        readingStale -> "Last update ${relativeAge(reading?.receivedAt)}"
        demoMode -> "Sample status only"
        else -> "No reported device faults"
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.ic_little_monitor_logo),
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                )
                Column(Modifier.padding(start = 10.dp).weight(1f)) {
                    Text("little monitor", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = palette.ink)
                    Text("Nursery monitor", fontSize = 12.sp, color = palette.muted)
                }
                StatusPill(connectionLabel, when (connectionLabel) {
                    "Connected" -> palette.mintWash
                    "Demo data" -> palette.gold
                    else -> palette.peach
                })
            }
        }
        item {
            Column {
                Text("Nursery", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = palette.ink)
                Text("Room readings and monitor status", fontSize = 14.sp, color = palette.muted,
                    modifier = Modifier.padding(top = 4.dp))
            }
        }
        item {
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = if (hasCry || needsAttention) palette.peach else palette.hero),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 18.dp, top = 18.dp, end = 10.dp, bottom = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(if (hasCry || needsAttention) palette.alert else palette.good))
                            Text(heroStatus, fontSize = 11.sp, letterSpacing = .6.sp, fontWeight = FontWeight.Bold,
                                color = if (hasCry || needsAttention) palette.alert else palette.good,
                                modifier = Modifier.padding(start = 7.dp))
                        }
                        Spacer(Modifier.height(9.dp))
                        Text(heroTitle, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold, color = palette.ink)
                        Text(heroMessage, fontSize = 13.sp, lineHeight = 19.sp, color = palette.muted,
                            modifier = Modifier.padding(top = 6.dp))
                        Text(
                            if (demoMode) "Sample update · just now" else "Last update · ${relativeAge(reading?.receivedAt)}",
                            fontSize = 12.sp, color = palette.muted, modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    MiniMoon(Modifier.size(104.dp), palette)
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("Room readings", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = palette.ink)
                    Text(if (demoMode) "Example measurements from the preview" else "Latest measurements from your device",
                        fontSize = 12.sp, color = palette.muted)
                }
                Text(
                    when {
                        demoMode -> "Sample values"
                        readingStale -> "Data stale"
                        remoteError != null -> "Update failed"
                        else -> "Recent update"
                    },
                    fontSize = 11.sp, fontWeight = FontWeight.Medium,
                    color = if (readingStale || remoteError != null) palette.alert else palette.good,
                )
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ReadingCard(Modifier.weight(1f), AppIcon.Thermometer, "Temperature",
                        reading?.temperature?.let { "%.1f".format(it) } ?: "—", "°C", "Sample band · 18–30 °C",
                        palette.peach, palette,
                        reading?.temperature?.let { if (it in 18.0..30.0) "In range" else "Check range" } ?: "Unavailable")
                    ReadingCard(Modifier.weight(1f), AppIcon.Droplet, "Humidity",
                        reading?.humidity?.let { "%.0f".format(it) } ?: "—", "%", "Sample band · 30–70%",
                        palette.mintWash, palette,
                        reading?.humidity?.let { if (it in 30.0..70.0) "In range" else "Check range" } ?: "Unavailable")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ReadingCard(Modifier.weight(1f), AppIcon.Sun, "Ambient light",
                        reading?.light?.let { "%.0f".format(it) } ?: "—", "lux", "Room brightness",
                        palette.gold, palette,
                        if (reading?.light != null) "Measured" else "Unavailable")
                    ReadingCard(Modifier.weight(1f), AppIcon.Device, "Device health",
                        if (deviceStatus == "Online") "Online" else deviceStatus, "", deviceNote,
                        palette.mintWash, palette, deviceStatus)
                }
            }
        }
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = palette.card),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Recent events", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = palette.ink)
                            Text("Latest room and monitor events", fontSize = 12.sp, color = palette.muted)
                        }
                        TextButton(onClick = onHistory, contentPadding = PaddingValues(horizontal = 8.dp)) {
                            Text("See history")
                            LineIcon(AppIcon.History, palette.teal, Modifier.padding(start = 4.dp).size(18.dp))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    if (snapshot.events.isEmpty()) {
                        Text("No events yet.", fontSize = 13.sp, color = palette.muted, modifier = Modifier.padding(vertical = 12.dp))
                    } else {
                        snapshot.events.take(3).forEachIndexed { index, event ->
                            if (index > 0) HorizontalDivider(color = palette.line)
                            EventRow(event, palette)
                        }
                    }
                }
            }
        }
        item {
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = palette.gold)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Prototype limits", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = palette.ink)
                    Spacer(Modifier.height(6.dp))
                    Text("This is a classroom prototype, not a safety-certified monitor. Always maintain adult supervision.",
                        fontSize = 13.sp, lineHeight = 19.sp, color = palette.muted)
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onSimulateCry, enabled = demoMode) {
                    Text(if (demoMode) "Simulate cry alert" else "Sample alert unavailable")
                }
                Text(
                    if (demoMode) "Sample event only · no audio recorded" else "Available in sample mode",
                    fontSize = 12.sp, color = palette.muted, modifier = Modifier.weight(1f),
                )
            }
        }
        item {
            Text("Little Monitor · Classroom preview", fontSize = 12.sp, color = palette.muted,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
        }
    }
}

@Composable
private fun HistoryScreen(
    events: List<MonitorEvent>,
    demoMode: Boolean,
    padding: PaddingValues,
    onAcknowledge: (MonitorEvent) -> Unit,
) {
    val palette = LocalMonitorPalette.current
    var query by remember { mutableStateOf("") }
    val filtered = events.filter { it.summary.contains(query, ignoreCase = true) || it.kind.contains(query, true) }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Event history", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = palette.ink)
            Text(if (demoMode) "Sample room and monitor events" else "Events reported by your monitor",
                color = palette.muted, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            OutlinedTextField(
                value = query, onValueChange = { query = it }, modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Search events") }, singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )
        }
        if (filtered.isEmpty()) {
            item {
                Text(if (query.isBlank()) "No events yet." else "No events match this search.",
                    color = palette.muted, modifier = Modifier.padding(vertical = 18.dp))
            }
        }
        items(filtered, key = { it.id }) { event ->
            Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = palette.card)) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(13.dp))
                                .background(if (event.kind == "cry") palette.peach else palette.mintWash),
                            contentAlignment = Alignment.Center,
                        ) {
                            LineIcon(if (event.kind == "cry") AppIcon.Alert else AppIcon.Check,
                                if (event.kind == "cry") palette.alert else palette.good, Modifier.size(20.dp))
                        }
                        Column(Modifier.weight(1f).padding(start = 11.dp)) {
                            Text(event.summary, fontWeight = FontWeight.SemiBold, color = palette.ink,
                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text("${event.kind.replaceFirstChar(Char::uppercase)} · ${displayDateTime(event.createdAt)}",
                                color = palette.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
                        }
                        StatusPill(if (event.acknowledged) "Reviewed" else "New",
                            if (event.acknowledged) palette.mintWash else palette.gold)
                    }
                    if (event.confidence != null) {
                        Text("Model confidence · ${(event.confidence * 100).toInt()}%",
                            color = palette.muted, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
                    }
                    if (!event.acknowledged) {
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = { onAcknowledge(event) }, modifier = Modifier.fillMaxWidth()) {
                            Text("Mark reviewed")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(initial: MonitorConfig, padding: PaddingValues, onSave: (MonitorConfig) -> Boolean) {
    val palette = LocalMonitorPalette.current
    val context = LocalContext.current
    var baseUrl by remember(initial) { mutableStateOf(initial.baseUrl) }
    var token by remember(initial) { mutableStateOf(initial.appToken) }
    var deviceId by remember(initial) { mutableStateOf(initial.deviceId) }
    var saved by remember { mutableStateOf(false) }
    val preferenceStore = remember { context.getSharedPreferences("monitor_preferences", 0) }
    val permissionRequired = Build.VERSION.SDK_INT >= 33
    val permissionGranted = !permissionRequired || ContextCompat.checkSelfPermission(
        context, Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    var notifications by remember(permissionGranted) {
        mutableStateOf(preferenceStore.getBoolean("notifications_enabled", true) && permissionGranted)
    }
    var permissionMessage by remember { mutableStateOf<String?>(null) }
    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notifications = granted
        preferenceStore.edit().putBoolean("notifications_enabled", granted).apply()
        permissionMessage = if (granted) "Push notifications are enabled." else
            "Notifications are off. Allow them in Android Settings to receive alerts."
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("Settings", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = palette.ink)
            Text("Set the backend connection and notification preference.", color = palette.muted, fontSize = 14.sp,
                modifier = Modifier.padding(top = 4.dp))
        }
        item {
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = palette.card)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Backend connection", fontWeight = FontWeight.SemiBold, color = palette.ink)
                    Text("Leave the URL and token blank for sample mode. Use a trusted HTTPS address for live data.",
                        fontSize = 13.sp, lineHeight = 19.sp, color = palette.muted)
                    OutlinedTextField(
                        value = baseUrl, onValueChange = { baseUrl = it; saved = false },
                        label = { Text("Backend HTTPS URL") }, placeholder = { Text("https://monitor.example.com") },
                        modifier = Modifier.fillMaxWidth(), singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        shape = RoundedCornerShape(15.dp),
                    )
                    OutlinedTextField(
                        value = token, onValueChange = { token = it; saved = false },
                        label = { Text("App bearer token") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        shape = RoundedCornerShape(15.dp),
                    )
                    OutlinedTextField(
                        value = deviceId, onValueChange = { deviceId = it; saved = false },
                        label = { Text("Device ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                        shape = RoundedCornerShape(15.dp),
                    )
                    Button(onClick = {
                        saved = onSave(MonitorConfig(baseUrl.trim(), token, deviceId.trim()))
                    }, modifier = Modifier.fillMaxWidth()) { Text(if (saved) "Connection saved" else "Save connection") }
                }
            }
        }
        item {
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = palette.card)) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Push notifications", color = palette.ink, fontWeight = FontWeight.SemiBold)
                            Text(if (permissionGranted) "Receive alerts from the configured monitor." else "Turn this on to request Android notification access.",
                                color = palette.muted, fontSize = 13.sp, lineHeight = 18.sp)
                        }
                        Switch(checked = notifications, onCheckedChange = { enabled ->
                            permissionMessage = null
                            if (!enabled) {
                                notifications = false
                                preferenceStore.edit().putBoolean("notifications_enabled", false).apply()
                            } else if (permissionRequired && !permissionGranted) {
                                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                            } else {
                                notifications = true
                                preferenceStore.edit().putBoolean("notifications_enabled", true).apply()
                            }
                        })
                    }
                    permissionMessage?.let {
                        Text(it, color = if (notifications) palette.good else palette.alert,
                            fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(bottom = 10.dp))
                    }
                    HorizontalDivider(color = palette.line)
                    Text("Display bands · sample values", fontWeight = FontWeight.SemiBold, color = palette.ink,
                        modifier = Modifier.padding(top = 14.dp))
                    Text("Temperature  ·  18–30 °C\nHumidity  ·  30–70%",
                        color = palette.muted, fontSize = 13.sp, lineHeight = 20.sp,
                        modifier = Modifier.padding(top = 6.dp, bottom = 14.dp))
                }
            }
        }
        item {
            Text("Classroom prototype only. It is not safety-certified and does not replace adult supervision.",
                color = palette.muted, fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(bottom = 10.dp))
        }
    }
}

@Composable
private fun ReadingCard(
    modifier: Modifier,
    icon: AppIcon,
    label: String,
    value: String,
    unit: String,
    note: String,
    iconBackground: Color,
    palette: MonitorPalette,
    status: String,
) {
    Card(
        modifier = modifier.heightIn(min = 156.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = palette.card),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(iconBackground),
                    contentAlignment = Alignment.Center) {
                    LineIcon(icon, palette.teal, Modifier.size(21.dp))
                }
                Spacer(Modifier.weight(1f))
                StatusPill(status,
                    if (status in setOf("Check range", "Unavailable", "Offline", "Stale data", "Update failed", "Needs care")) palette.peach else palette.mintWash)
            }
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = palette.muted,
                modifier = Modifier.padding(top = 3.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, fontWeight = FontWeight.Bold,
                    fontSize = if (value.length > 7) 20.sp else 25.sp, color = palette.ink,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (unit.isNotBlank()) Text(" $unit", fontSize = 12.sp, color = palette.muted,
                    modifier = Modifier.padding(bottom = 3.dp))
            }
            Text(note, fontSize = 11.sp, lineHeight = 14.sp, color = palette.muted,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun EventRow(event: MonitorEvent, palette: MonitorPalette) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp))
            .background(if (event.kind == "cry") palette.peach else palette.mintWash), contentAlignment = Alignment.Center) {
            LineIcon(if (event.kind == "cry") AppIcon.Alert else AppIcon.Check,
                if (event.kind == "cry") palette.alert else palette.good, Modifier.size(19.dp))
        }
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text(event.summary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = palette.ink,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (event.acknowledged) "Reviewed" else "Needs review",
                fontSize = 12.sp, color = palette.muted, maxLines = 1)
        }
        Text(displayTime(event.createdAt), color = palette.muted, fontSize = 12.sp)
    }
}

@Composable
private fun StatusPill(label: String, color: Color) {
    val palette = LocalMonitorPalette.current
    val dot = when (label) {
        "Offline", "Update failed", "Stale data", "No readings", "Unavailable", "Check range", "Needs care", "New" -> palette.alert
        "Connected", "Online", "In range", "Reviewed" -> palette.good
        else -> palette.teal
    }
    Row(
        modifier = Modifier.clip(CircleShape).background(color).padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
        Text(label, color = palette.ink, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            maxLines = 1, modifier = Modifier.padding(start = 6.dp))
    }
}

@Composable
private fun LineIcon(icon: AppIcon, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(24.dp)) {
        val w = size.width
        val h = size.height
        val sw = size.minDimension * .085f
        val line = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun p(x: Float, y: Float) = Offset(w * x, h * y)
        when (icon) {
            AppIcon.Home -> {
                val house = Path().apply {
                    moveTo(w * .12f, h * .47f); lineTo(w * .5f, h * .15f); lineTo(w * .88f, h * .47f)
                    moveTo(w * .22f, h * .42f); lineTo(w * .22f, h * .86f); lineTo(w * .78f, h * .86f); lineTo(w * .78f, h * .42f)
                    moveTo(w * .43f, h * .86f); lineTo(w * .43f, h * .61f); lineTo(w * .57f, h * .61f); lineTo(w * .57f, h * .86f)
                }
                drawPath(house, color, style = line)
            }
            AppIcon.History -> {
                for (y in listOf(.25f, .5f, .75f)) {
                    drawCircle(color, sw * 1.15f, p(.15f, y))
                    drawLine(color, p(.33f, y), p(.88f, y), sw, StrokeCap.Round)
                }
            }
            AppIcon.Settings -> {
                listOf(.28f, .5f, .72f).forEachIndexed { index, y ->
                    drawLine(color, p(.14f, y), p(.86f, y), sw, StrokeCap.Round)
                    val x = listOf(.38f, .65f, .48f)[index]
                    drawCircle(color, sw * 1.65f, p(x, y), style = Stroke(sw))
                }
            }
            AppIcon.Thermometer -> {
                val path = Path().apply {
                    moveTo(w * .58f, h * .62f); lineTo(w * .58f, h * .22f)
                    cubicTo(w * .58f, h * .08f, w * .38f, h * .08f, w * .38f, h * .22f)
                    lineTo(w * .38f, h * .62f)
                    cubicTo(w * .21f, h * .79f, w * .34f, h * .94f, w * .48f, h * .94f)
                    cubicTo(w * .64f, h * .94f, w * .77f, h * .78f, w * .58f, h * .62f)
                }
                drawPath(path, color, style = line)
                drawLine(color, p(.48f, .36f), p(.48f, .73f), sw, StrokeCap.Round)
            }
            AppIcon.Droplet -> {
                val path = Path().apply {
                    moveTo(w * .5f, h * .1f); cubicTo(w * .38f, h * .31f, w * .2f, h * .52f, w * .2f, h * .67f)
                    cubicTo(w * .2f, h * .86f, w * .34f, h * .94f, w * .5f, h * .94f)
                    cubicTo(w * .66f, h * .94f, w * .8f, h * .86f, w * .8f, h * .67f)
                    cubicTo(w * .8f, h * .52f, w * .62f, h * .31f, w * .5f, h * .1f); close()
                }
                drawPath(path, color, style = line)
                drawArc(color, 200f, 65f, false, Offset(w * .34f, h * .6f), androidx.compose.ui.geometry.Size(w * .28f, h * .2f), style = Stroke(sw))
            }
            AppIcon.Sun -> {
                drawCircle(color, w * .2f, p(.5f, .5f), style = Stroke(sw))
                for (index in 0 until 8) {
                    val angle = Math.toRadians(index * 45.0)
                    val inner = w * .34f
                    val outer = w * .45f
                    drawLine(color, p(.5f + kotlin.math.cos(angle).toFloat() * inner / w, .5f + kotlin.math.sin(angle).toFloat() * inner / h),
                        p(.5f + kotlin.math.cos(angle).toFloat() * outer / w, .5f + kotlin.math.sin(angle).toFloat() * outer / h), sw, StrokeCap.Round)
                }
            }
            AppIcon.Device -> {
                drawRoundRect(color, p(.17f, .1f), androidx.compose.ui.geometry.Size(w * .66f, h * .65f),
                    CornerRadius(w * .08f), style = line)
                drawLine(color, p(.38f, .9f), p(.62f, .9f), sw, StrokeCap.Round)
                drawLine(color, p(.5f, .75f), p(.5f, .9f), sw, StrokeCap.Round)
                drawLine(color, p(.34f, .43f), p(.46f, .55f), sw, StrokeCap.Round)
                drawLine(color, p(.46f, .55f), p(.68f, .31f), sw, StrokeCap.Round)
            }
            AppIcon.Alert -> {
                drawCircle(color, w * .37f, p(.5f, .5f), style = Stroke(sw))
                drawLine(color, p(.5f, .29f), p(.5f, .54f), sw, StrokeCap.Round)
                drawCircle(color, sw * 1.2f, p(.5f, .68f))
            }
            AppIcon.Check -> {
                drawLine(color, p(.2f, .53f), p(.42f, .74f), sw, StrokeCap.Round)
                drawLine(color, p(.42f, .74f), p(.82f, .28f), sw, StrokeCap.Round)
            }
        }
    }
}

@Composable
private fun MiniMoon(modifier: Modifier, palette: MonitorPalette) {
    val transition = rememberInfiniteTransition(label = "moon-drift")
    val floatY by transition.animateFloat(
        initialValue = -3f, targetValue = 3f,
        animationSpec = infiniteRepeatable(tween(2400), RepeatMode.Reverse), label = "moon-y",
    )
    Canvas(
        modifier.graphicsLayer { translationY = floatY.dp.toPx() }
            .semantics { contentDescription = "A softly floating smiling crescent moon" },
    ) {
        val center = Offset(size.width * .53f, size.height * .5f)
        val orbit = size.minDimension * .43f
        drawCircle(palette.line.copy(alpha = .65f), orbit, center, style = Stroke(width = 1.dp.toPx()))
        drawCircle(palette.line.copy(alpha = .5f), orbit * .77f,
            Offset(center.x + orbit * .12f, center.y - orbit * .05f), style = Stroke(width = 1.dp.toPx()))
        val moonCenter = Offset(center.x + orbit * .13f, center.y)
        val moonRadius = size.minDimension * .29f
        drawCircle(palette.gold, moonRadius, moonCenter)
        drawCircle(palette.hero, moonRadius * .79f,
            Offset(moonCenter.x + moonRadius * .47f, moonCenter.y - moonRadius * .5f))
        val faceX = moonCenter.x - moonRadius * .33f
        val faceY = moonCenter.y + moonRadius * .02f
        drawCircle(palette.teal, 1.5.dp.toPx(), Offset(faceX - 2.5.dp.toPx(), faceY - 1.7.dp.toPx()))
        drawCircle(palette.teal, 1.5.dp.toPx(), Offset(faceX + 2.5.dp.toPx(), faceY - 1.7.dp.toPx()))
        drawArc(
            color = palette.teal, startAngle = 15f, sweepAngle = 150f, useCenter = false,
            topLeft = Offset(faceX - 3.dp.toPx(), faceY - .2.dp.toPx()),
            size = androidx.compose.ui.geometry.Size(6.dp.toPx(), 4.dp.toPx()),
            style = Stroke(width = 1.dp.toPx()),
        )
        drawStar(Offset(size.width * .2f, size.height * .27f), 6.dp.toPx(), palette.gold)
        drawStar(Offset(size.width * .85f, size.height * .24f), 3.dp.toPx(), palette.gold)
        drawStar(Offset(size.width * .79f, size.height * .72f), 4.dp.toPx(), palette.gold)
    }
}

private fun DrawScope.drawStar(center: Offset, radius: Float, color: Color) {
    drawLine(color, Offset(center.x, center.y - radius), Offset(center.x, center.y + radius), 1.3.dp.toPx())
    drawLine(color, Offset(center.x - radius, center.y), Offset(center.x + radius, center.y), 1.3.dp.toPx())
}

private fun secondsSince(raw: String?): Long? = raw?.let { value ->
    runCatching { Duration.between(OffsetDateTime.parse(value).toInstant(), Instant.now()).seconds.coerceAtLeast(0) }.getOrNull()
}

private fun relativeAge(raw: String?): String {
    val seconds = secondsSince(raw) ?: return "time unavailable"
    return when {
        seconds < 60 -> "just now"
        seconds < 3_600 -> "${seconds / 60} min ago"
        seconds < 86_400 -> "${seconds / 3_600} hr ago"
        else -> "${seconds / 86_400} days ago"
    }
}

private fun displayTime(raw: String): String = runCatching {
    OffsetDateTime.parse(raw).format(DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault()))
}.getOrDefault(raw)

private fun displayDateTime(raw: String): String = runCatching {
    OffsetDateTime.parse(raw).format(DateTimeFormatter.ofPattern("MMM d · h:mm a", Locale.getDefault()))
}.getOrDefault(raw)
