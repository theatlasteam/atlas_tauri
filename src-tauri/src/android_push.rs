//! JNI entry point for the Android notification service.
//!
//! A push carries ids only, so the Kotlin side (`push/FcmService.kt`) fetches
//! the ciphertext and calls in here to decrypt it. The identity secret is read
//! from the secrets file and used entirely within Rust — it is never handed out
//! to Kotlin, which keeps a single copy of the crypto (see `e2ee`) and one
//! place where private key material is touched.
//!
//! Kotlin resolves the directory holding `secrets.json` and passes it in,
//! rather than this side guessing: the app data directory differs between
//! Tauri's `app_data_dir()` and `Context.getFilesDir()` depending on platform
//! version, and the caller already has to read that file for the auth token.

use std::collections::HashMap;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use x25519_dalek::StaticSecret;

/// Matches `IDENTITY_SECRET_KEY` in `e2ee` and the map written by `secure`.
const IDENTITY_SECRET_KEY: &str = "e2ee_identity_key";
const SECRETS_FILE: &str = "secrets.json";

fn identity_from_dir(dir: &str) -> Option<StaticSecret> {
    let bytes = std::fs::read(std::path::Path::new(dir).join(SECRETS_FILE)).ok()?;
    let map: HashMap<String, String> = serde_json::from_slice(&bytes).ok()?;
    let raw = B64.decode(map.get(IDENTITY_SECRET_KEY)?).ok()?;
    let arr: [u8; 32] = raw.try_into().ok()?;
    Some(StaticSecret::from(arr))
}

/// Decrypt one "x25519-v1" body. Returns the plaintext, or Java `null` for any
/// failure — a notification that can't be decrypted degrades to a generic one
/// rather than propagating an exception into the messaging service.
///
/// Signature must match the `external fun` declared in
/// `get.ahmed.atlas.push.NativeCrypto`; renaming either side breaks the link at
/// call time, not build time.
#[no_mangle]
pub extern "system" fn Java_get_ahmed_atlas_push_NativeCrypto_nativeDecrypt(
    mut env: JNIEnv,
    _class: JClass,
    secrets_dir: JString,
    peer_public_key: JString,
    body: JString,
) -> jstring {
    let null = std::ptr::null_mut();

    let Ok(dir) = env.get_string(&secrets_dir).map(String::from) else { return null };
    let Ok(peer_b64) = env.get_string(&peer_public_key).map(String::from) else { return null };
    let Ok(body_b64) = env.get_string(&body).map(String::from) else { return null };

    let Some(secret) = identity_from_dir(&dir) else { return null };
    let Ok(peer) = crate::e2ee::parse_public(&peer_b64) else { return null };
    let Ok(plaintext) = crate::e2ee::open(&secret, &peer, &body_b64) else { return null };

    match env.new_string(plaintext) {
        Ok(s) => s.into_raw(),
        Err(_) => null,
    }
}
