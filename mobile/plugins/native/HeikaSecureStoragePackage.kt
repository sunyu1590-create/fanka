package com.heika.community.securestorage

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class HeikaSecureStoragePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(HeikaSecureStorageModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class HeikaSecureStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences = context.getSharedPreferences("heika_secure_auth_v1", 0)
  private val alias = "com.heika.community.auth_storage_v1"

  override fun getName() = "HeikaSecureStorage"

  @ReactMethod
  fun getItem(key: String, promise: Promise) {
    try {
      val encoded = preferences.getString(storageKey(key), null)
      if (encoded == null) {
        promise.resolve(null)
        return
      }
      val packed = Base64.decode(encoded, Base64.NO_WRAP)
      if (packed.size < 30 || packed[0].toInt() != 1) {
        preferences.edit().remove(storageKey(key)).apply()
        promise.resolve(null)
        return
      }
      val iv = packed.copyOfRange(1, 13)
      val ciphertext = packed.copyOfRange(13, packed.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
      cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
      promise.resolve(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
    } catch (_: Exception) {
      // A lost or invalidated Android Keystore key must invalidate the session, not expose plaintext.
      preferences.edit().remove(storageKey(key)).apply()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, secretKey())
      cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
      val iv = cipher.iv
      val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      val packed = byteArrayOf(1) + iv + ciphertext
      val encoded = Base64.encodeToString(packed, Base64.NO_WRAP)
      if (!preferences.edit().putString(storageKey(key), encoded).commit()) {
        throw IllegalStateException("Secure storage write failed")
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORAGE_WRITE_FAILED", "无法安全保存登录状态", error)
    }
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    try {
      preferences.edit().remove(storageKey(key)).commit()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORAGE_REMOVE_FAILED", "无法清除登录状态", error)
    }
  }

  private fun storageKey(key: String): String = Base64.encodeToString(key.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = keyStore.getKey(alias, null) as? SecretKey
    if (existing != null) return existing
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }
}
