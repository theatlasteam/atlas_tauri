package get.ahmed.atlas.push

import android.util.Log

/**
 * Bridge to the E2EE implementation in the Rust core (src-tauri/src/e2ee.rs via
 * android_push.rs). Kotlin passes the ciphertext and the sender's public key
 * in; the identity secret is loaded and used on the Rust side, so there is one
 * implementation of the crypto and one place that touches private keys.
 */
internal object NativeCrypto {
    private const val TAG = "AtlasPush"

    private val available: Boolean = try {
        // Same shared object the Tauri activity loads (see [lib] name in
        // src-tauri/Cargo.toml). Loading it again from this process is a no-op
        // if the activity already did.
        System.loadLibrary("atlas_lib")
        true
    } catch (e: Throwable) {
        Log.w(TAG, "atlas_lib unavailable, E2EE notifications will be generic: ${e.message}")
        false
    }

    /**
     * Decrypt an "x25519-v1" body. Returns null on any failure, including a
     * missing library — callers fall back to a generic notification.
     *
     * Must stay in sync with the exported symbol name in android_push.rs; a
     * mismatch surfaces as an UnsatisfiedLinkError at call time, not build time.
     */
    fun decrypt(secretsDir: String, peerPublicKey: String, body: String): String? {
        if (!available) return null
        return try {
            nativeDecrypt(secretsDir, peerPublicKey, body)
        } catch (e: Throwable) {
            Log.w(TAG, "native decrypt failed: ${e.message}")
            null
        }
    }

    private external fun nativeDecrypt(
        secretsDir: String,
        peerPublicKey: String,
        body: String,
    ): String?
}
