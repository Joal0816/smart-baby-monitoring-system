package com.littlemonitor.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class MonitorConfig(
    val baseUrl: String = "",
    val appToken: String = "",
    val deviceId: String = "rt-spark-01",
)

/** Keeps the bearer token encrypted with a non-exportable Android Keystore AES key. */
class SecureConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences("monitor_config", Context.MODE_PRIVATE)
    private val keyAlias = "little-monitor-config-v1"

    fun read(): MonitorConfig = MonitorConfig(
        baseUrl = prefs.getString("base_url", "").orEmpty(),
        appToken = decrypt(prefs.getString("app_token", null)),
        deviceId = prefs.getString("device_id", "rt-spark-01").orEmpty(),
    )

    fun save(config: MonitorConfig) {
        require(config.baseUrl.isBlank() || config.baseUrl.startsWith("https://", ignoreCase = true)) {
            "Use an HTTPS address for the monitor API."
        }
        prefs.edit()
            .putString("base_url", config.baseUrl.trim().trimEnd('/'))
            .putString("app_token", encrypt(config.appToken))
            .putString("device_id", config.deviceId.trim())
            .apply()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        if (value.isEmpty()) return ""
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + sealed, Base64.NO_WRAP)
    }

    private fun decrypt(value: String?): String {
        if (value.isNullOrEmpty()) return ""
        return try {
            val packed = Base64.decode(value, Base64.NO_WRAP)
            val iv = packed.copyOfRange(0, 12)
            val ciphertext = packed.copyOfRange(12, packed.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }
}
