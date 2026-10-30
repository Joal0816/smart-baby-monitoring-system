package com.littlemonitor.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.littlemonitor.app.data.SecureConfigStore
import com.littlemonitor.app.ui.LittleMonitorApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { LittleMonitorApp(SecureConfigStore(applicationContext)) }
    }
}
