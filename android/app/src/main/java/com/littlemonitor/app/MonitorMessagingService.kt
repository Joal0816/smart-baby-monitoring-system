package com.littlemonitor.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.littlemonitor.app.data.MonitorApi
import com.littlemonitor.app.data.SecureConfigStore
import java.util.UUID
import java.util.concurrent.Executors

class MonitorMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val config = SecureConfigStore(applicationContext).read()
        if (config.baseUrl.isBlank() || config.appToken.isBlank()) return
        val prefs = getSharedPreferences("monitor_installation", Context.MODE_PRIVATE)
        val id = prefs.getString("installation_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("installation_id", it).apply()
        }
        Executors.newSingleThreadExecutor().execute {
            runCatching { MonitorApi(config).registerInstallation(id, token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (!getSharedPreferences("monitor_preferences", Context.MODE_PRIVATE)
                .getBoolean("notifications_enabled", true)
        ) return
        val manager = getSystemService(NotificationManager::class.java)
        val channelId = "monitor-alerts"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(channelId, "Monitor alerts", NotificationManager.IMPORTANCE_HIGH)
            )
        }
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = message.notification?.title ?: "Little Monitor alert"
        val body = message.notification?.body ?: "Open the app to review a new room event."
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .build()
        manager.notify(message.data["eventId"]?.hashCode() ?: title.hashCode(), notification)
    }
}
