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

/// Decrypt one message body (x25519-v1, olm-v1 / dr-v1, or megolm-v1).
/// Returns Java `null` on any failure so the notification degrades to a
/// generic one instead of crashing the messaging service.
///
/// Signature must match the `external fun` in `NativeCrypto`.
#[no_mangle]
pub extern "system" fn Java_get_ahmed_atlas_push_NativeCrypto_nativeDecrypt(
    mut env: JNIEnv,
    _class: JClass,
    secrets_dir: JString,
    scheme: JString,
    peer: JString,
    chat_id: JString,
    peer_public_key: JString,
    body: JString,
) -> jstring {
    let null = std::ptr::null_mut();

    let Ok(dir) = env.get_string(&secrets_dir).map(String::from) else { return null };
    let Ok(scheme) = env.get_string(&scheme).map(String::from) else { return null };
    let Ok(peer) = env.get_string(&peer).map(String::from) else { return null };
    let Ok(chat_id) = env.get_string(&chat_id).map(String::from) else { return null };
    let Ok(peer_b64) = env.get_string(&peer_public_key).map(String::from) else { return null };
    let Ok(body) = env.get_string(&body).map(String::from) else { return null };

    let path = std::path::Path::new(&dir);
    let plaintext = match scheme.as_str() {
        "x25519-v1" => {
            let Some(secret) = identity_from_dir(&dir) else { return null };
            let Ok(pk) = crate::e2ee::parse_public(&peer_b64) else { return null };
            crate::e2ee::open(&secret, &pk, &body).ok()
        }
        "olm-v1" | "dr-v1" => crate::e2ee2::decrypt_from_dir(path, &peer, &body).ok(),
        "megolm-v1" => crate::e2ee_megolm::decrypt_from_dir(path, &chat_id, &peer, &body).ok(),
        _ => None,
    };

    let Some(plaintext) = plaintext else { return null };
    match env.new_string(plaintext) {
        Ok(s) => s.into_raw(),
        Err(_) => null,
    }
}
