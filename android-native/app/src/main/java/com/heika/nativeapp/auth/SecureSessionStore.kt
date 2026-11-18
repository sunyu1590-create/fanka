package com.heika.nativeapp.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

private val Context.sessionDataStore by preferencesDataStore(name = "heika_secure_session")

@Singleton
class SecureSessionStore @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.sessionDataStore
    private val encryptedSession = stringPreferencesKey("encrypted_session_v1")
    private val encryptedAccounts = stringPreferencesKey("encrypted_accounts_v1")

    suspend fun read(): HeikaSession? {
        val encoded = dataStore.data.first()[encryptedSession] ?: return null
        return runCatching {
            val packed = Base64.decode(encoded, Base64.NO_WRAP)
            require(packed.size > 12)
            val iv = packed.copyOfRange(0, 12)
            val cipherText = packed.copyOfRange(12, packed.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            HeikaSession.fromJson(String(cipher.doFinal(cipherText), Charsets.UTF_8))
        }.getOrElse {
            clear()
            null
        }
    }

    suspend fun write(session: HeikaSession) {
        dataStore.edit { it[encryptedSession] = encrypt(session.toJson()) }
        remember(session)
    }

    suspend fun clear() = dataStore.edit { it.remove(encryptedSession) }

    /**
     * 本机账号列表：为了「快捷更换账号」，除当前会话外再保留最近登录过的几个账号。
     * 与主会话同样使用 Keystore 加密，退出登录不会删除这里的记录。
     */
    data class StoredAccount(val userId: String, val email: String?, val session: HeikaSession, val savedAt: Long)

    suspend fun accounts(): List<StoredAccount> {
        val encoded = dataStore.data.first()[encryptedAccounts] ?: return emptyList()
        return runCatching {
            val array = org.json.JSONArray(decrypt(encoded))
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val session = runCatching { HeikaSession.fromJson(item.getJSONObject("session").toString()) }.getOrNull() ?: continue
                    add(StoredAccount(session.userId, session.email, session, item.optLong("savedAt")))
                }
            }
        }.getOrDefault(emptyList())
    }

    suspend fun remember(session: HeikaSession) {
        val next = (accounts().filter { it.userId != session.userId } + StoredAccount(session.userId, session.email, session, System.currentTimeMillis()))
            .sortedByDescending { it.savedAt }
            .take(5)
        val array = org.json.JSONArray()
        next.forEach { account ->
            array.put(
                org.json.JSONObject()
                    .put("session", org.json.JSONObject(account.session.toJson()))
                    .put("savedAt", account.savedAt),
            )
        }
        dataStore.edit { it[encryptedAccounts] = encrypt(array.toString()) }
    }

    suspend fun forget(userId: String) {
        val kept = accounts().filter { it.userId != userId }
        val array = org.json.JSONArray()
        kept.forEach { account ->
            array.put(
                org.json.JSONObject()
                    .put("session", org.json.JSONObject(account.session.toJson()))
                    .put("savedAt", account.savedAt),
            )
        }
        dataStore.edit { it[encryptedAccounts] = encrypt(array.toString()) }
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val packed = Base64.decode(encoded, Base64.NO_WRAP)
        require(packed.size > 12)
        val iv = packed.copyOfRange(0, 12)
        val cipherText = packed.copyOfRange(12, packed.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(cipherText), Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object { const val KEY_ALIAS = "heika.native.session.v1" }
}
