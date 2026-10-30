package com.littlemonitor.app.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class RoomReading(
    val temperature: Double?,
    val humidity: Double?,
    val light: Double?,
    val receivedAt: String?,
    val faults: List<String>,
)

data class MonitorEvent(
    val id: String,
    val kind: String,
    val summary: String,
    val createdAt: String,
    val acknowledged: Boolean,
    val confidence: Double?,
)

data class MonitorSnapshot(
    val reading: RoomReading?,
    val events: List<MonitorEvent>,
    val online: Boolean,
)

class MonitorApi(private val config: MonitorConfig) {
    fun load(): MonitorSnapshot {
        require(config.baseUrl.startsWith("https://", ignoreCase = true)) {
            "Configure the backend URL and HTTPS app token in Settings."
        }
        require(config.appToken.isNotBlank()) { "Add the backend app token in Settings." }
        val latest = get("/api/v1/devices/${path(config.deviceId)}/latest")
        val readingJson = latest.optJSONObject("reading")
        val device = latest.optJSONObject("device")
        val faults = readingJson?.optString("sensor_faults_json")
            ?.takeIf { it.isNotBlank() }?.let { runCatching {
                val array = org.json.JSONArray(it)
                List(array.length()) { index -> array.getString(index) }
            }.getOrNull() }.orEmpty()
        val reading = readingJson?.let {
            RoomReading(
                temperature = it.optNullableDouble("temperature_c"),
                humidity = it.optNullableDouble("humidity_pct"),
                light = it.optNullableDouble("light_lux"),
                receivedAt = it.optString("received_at").takeIf(String::isNotBlank),
                faults = faults,
            )
        }
        val events = get("/api/v1/events?device_id=${path(config.deviceId)}&limit=50")
            .optJSONArray("items")
            ?.let { array -> List(array.length()) { index ->
                val item = array.getJSONObject(index)
                MonitorEvent(
                    id = item.optString("event_id"),
                    kind = item.optString("kind", "event"),
                    summary = item.optString("summary", "Monitor event"),
                    createdAt = item.optString("created_at"),
                    acknowledged = !item.isNull("acknowledged_at"),
                    confidence = item.optNullableDouble("confidence"),
                )
            } }.orEmpty()
        val online = device?.optString("network_status") == "online"
        return MonitorSnapshot(reading, events, online)
    }

    fun acknowledge(eventId: String) {
        request(
            "/api/v1/events/${path(eventId)}/acknowledgement",
            method = "POST",
            body = "{}",
        )
    }

    fun registerInstallation(installationId: String, fcmToken: String) {
        val body = JSONObject()
            .put("installation_id", installationId)
            .put("device_id", config.deviceId)
            .put("fcm_token", fcmToken)
            .toString()
        request("/api/v1/app/installations", method = "POST", body = body)
    }

    private fun get(path: String): JSONObject = JSONObject(request(path, method = "GET"))

    private fun request(path: String, method: String, body: String? = null): String {
        val connection = URL(config.baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 5_000
            connection.readTimeout = 5_000
            connection.setRequestProperty("Authorization", "Bearer ${config.appToken}")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            check(code in 200..299) { "Backend returned HTTP $code" }
            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun path(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
}

private fun JSONObject.optNullableDouble(key: String): Double? =
    if (isNull(key) || !has(key)) null else optDouble(key).takeIf(Double::isFinite)
