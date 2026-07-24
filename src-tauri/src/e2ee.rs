//! Client-side E2EE for DM messages — scheme "x25519-v1".
//!
//! All private-key material lives here in the Rust core, in the app data dir;
//! the webview only ever sees public keys, plaintext it authored/received, and
//! opaque ciphertext bodies. That keeps key theft out of reach of webview XSS.
//!
//! Construction (v1):
//!   shared  = X25519(my_identity_secret, peer_identity_public)
//!   key     = HKDF-SHA256(ikm = shared, info = "atlas-e2ee-v1" || sort(pubA, pubB))
//!   body    = base64( nonce(12) || AES-256-GCM(key, nonce, plaintext) )
//! Both directions derive the same key (public keys are sorted into `info`),
//! so one command pair covers send and receive.
//!
//! Honest limitations, called out in the README as well: static–static DH has
//! no forward secrecy (a stolen identity key decrypts recorded history) and no
//! per-message ratchet. The upgrade path is a real Double Ratchet or MLS on
//! the same transport — the server already treats bodies as opaque and serves
//! one-time key packages, so nothing server-side changes.
//! The defence against a malicious *server* handing out substituted identity
//! keys is out-of-band fingerprint comparison (`e2ee_fingerprint`).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hkdf::Hkdf;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use x25519_dalek::{PublicKey, StaticSecret};

#[derive(Debug, thiserror::Error)]
pub enum E2eeError {
    #[error("crypto storage unavailable: {0}")]
    Storage(String),
    #[error("bad key or ciphertext: {0}")]
    Bad(String),
    #[error("decryption failed")]
    Decrypt,
}

impl serde::Serialize for E2eeError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

static IDENTITY_LOCK: Mutex<()> = Mutex::new(());

fn identity_path(app: &AppHandle) -> Result<PathBuf, E2eeError> {
    let dir = app.path().app_data_dir().map_err(|e| E2eeError::Storage(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(dir.join("e2ee_identity.key"))
}

/// Load the identity secret, generating and persisting one on first use.
fn identity(app: &AppHandle) -> Result<StaticSecret, E2eeError> {
    let _guard = IDENTITY_LOCK.lock().unwrap();
    let path = identity_path(app)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| E2eeError::Storage("identity key corrupt".into()))?;
            Ok(StaticSecret::from(arr))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let mut seed = [0u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut seed);
            let secret = StaticSecret::from(seed);
            std::fs::write(&path, secret.to_bytes())
                .map_err(|e| E2eeError::Storage(e.to_string()))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            Ok(secret)
        }
        Err(e) => Err(E2eeError::Storage(e.to_string())),
    }
}

fn parse_public(b64: &str) -> Result<PublicKey, E2eeError> {
    let bytes = B64.decode(b64).map_err(|_| E2eeError::Bad("public key not base64".into()))?;
    let arr: [u8; 32] =
        bytes.try_into().map_err(|_| E2eeError::Bad("public key must be 32 bytes".into()))?;
    Ok(PublicKey::from(arr))
}

fn derive_key(secret: &StaticSecret, peer: &PublicKey) -> [u8; 32] {
    let shared = secret.diffie_hellman(peer);
    let my_pub = PublicKey::from(secret);
    let (lo, hi) = if my_pub.as_bytes() <= peer.as_bytes() {
        (my_pub, *peer)
    } else {
        (*peer, my_pub)
    };
    let mut info = Vec::with_capacity(13 + 64);
    info.extend_from_slice(b"atlas-e2ee-v1");
    info.extend_from_slice(lo.as_bytes());
    info.extend_from_slice(hi.as_bytes());

    let hk = Hkdf::<Sha256>::new(None, shared.as_bytes());
    let mut key = [0u8; 32];
    hk.expand(&info, &mut key).expect("32 bytes is a valid hkdf length");
    key
}

/// My public identity key (base64) — published to the server key directory.
#[tauri::command]
pub fn e2ee_public_key(app: AppHandle) -> Result<String, E2eeError> {
    let secret = identity(&app)?;
    Ok(B64.encode(PublicKey::from(&secret).as_bytes()))
}

/// Short human-comparable fingerprint of a public key (mine or a peer's),
/// for out-of-band verification against server key substitution.
#[tauri::command]
pub fn e2ee_fingerprint(public_key: String) -> Result<String, E2eeError> {
    let key = parse_public(&public_key)?;
    let digest = Sha256::digest(key.as_bytes());
    let hex: String = digest[..10].iter().map(|b| format!("{b:02x}")).collect();
    Ok(hex
        .as_bytes()
        .chunks(5)
        .map(|c| String::from_utf8_lossy(c).into_owned())
        .collect::<Vec<_>>()
        .join(" "))
}

/// Encrypt plaintext for a peer -> base64 body for scheme "x25519-v1".
#[tauri::command]
pub fn e2ee_seal(app: AppHandle, peer_public_key: String, plaintext: String) -> Result<String, E2eeError> {
    let secret = identity(&app)?;
    let peer = parse_public(&peer_public_key)?;
    let key = derive_key(&secret, &peer);

    let cipher = Aes256Gcm::new_from_slice(&key).expect("32-byte key");
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|_| E2eeError::Bad("encryption failure".into()))?;

    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

/// Decrypt a base64 "x25519-v1" body from a peer -> plaintext.
#[tauri::command]
pub fn e2ee_open(app: AppHandle, peer_public_key: String, body: String) -> Result<String, E2eeError> {
    let secret = identity(&app)?;
    let peer = parse_public(&peer_public_key)?;
    let key = derive_key(&secret, &peer);

    let bytes = B64.decode(&body).map_err(|_| E2eeError::Bad("body not base64".into()))?;
    if bytes.len() < 12 + 16 {
        return Err(E2eeError::Bad("body too short".into()));
    }
    let (nonce, ct) = bytes.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(&key).expect("32-byte key");
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| E2eeError::Decrypt)?;
    String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}
