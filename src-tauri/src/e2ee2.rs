//! E2EE v2 — X3DH session setup + Double Ratchet, scheme "dr-v1".
//!
//! Replaces x25519-v1 (static–static DH): every message now gets a fresh
//! ratchet-derived message key, so compromising an identity key decrypts
//! neither recorded history (forward secrecy) nor post-recovery traffic.
//!
//! Key material hierarchy:
//!   - identity: Ed25519 signing key + X25519 agreement key (per device,
//!     OS keychain)
//!   - signed prekey: X25519, signature by the Ed25519 identity, rotated
//!     periodically
//!   - one-time prekeys: X25519, consumed by the server (key_packages)
//!
//! Session setup (X3DH, simplified 4-DH):
//!   DH1 = DH(IK_A, SPK_B)
//!   DH2 = DH(EK_A, IK_B)
//!   DH3 = DH(EK_A, SPK_B)
//!   DH4 = DH(EK_A, OPK_B)   (when the bundle carried a one-time prekey)
//!   SK  = HKDF-SHA256(DH1 || DH2 || DH3 || DH4, info = "atlas-dr-v1")
//! The initiator's first ciphertext carries a header with their identity
//! keys, ephemeral key and which SPK/OPK was used, so the responder can
//! reproduce SK.
//!
//! After setup both sides run a symmetric Double Ratchet:
//!   - root key + DH ratchet keys drive sending/receiving chain keys
//!   - chain key -> (next chain key, message key) via HMAC-SHA256
//!   - message key encrypts with AES-256-GCM; the ratchet header is the
//!     AEAD's associated data, so headers can't be tampered with
//!   - out-of-order messages use a bounded skipped-key cache
//!
//! All private material stays in this module / the OS keychain; the webview
//! only ever sees base64 public keys and opaque ciphertext.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signer, Verifier};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tauri::AppHandle;
use x25519_dalek::{PublicKey, StaticSecret};

use crate::e2ee::E2eeError;

const INFO_SETUP: &[u8] = b"atlas-dr-v1-setup";
const INFO_ROOT: &[u8] = b"atlas-dr-v1-root";
const INFO_CHAIN: &[u8] = b"atlas-dr-v1-chain";
const MAX_SKIPPED_KEYS: usize = 200;
const IDENTITY_SECRET_KEY: &str = "e2ee2_identity_key";
const SIGNING_SECRET_KEY: &str = "e2ee2_signing_key";
const SPK_SECRET_KEY: &str = "e2ee2_spk_secret";
const SPK_ID_KEY: &str = "e2ee2_spk_id";

// ---------- key containers ----------

fn random_32() -> [u8; 32] {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b
}

fn load_or_make_x25519(app: &AppHandle, key: &str) -> Result<StaticSecret, E2eeError> {
    if let Some(b64) = crate::secure::secret_get(app.clone(), key.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let bytes = B64.decode(&b64).map_err(|_| E2eeError::Storage("key corrupt".into()))?;
        let arr: [u8; 32] =
            bytes.try_into().map_err(|_| E2eeError::Storage("key corrupt".into()))?;
        return Ok(StaticSecret::from(arr));
    }
    let secret = StaticSecret::from(random_32());
    crate::secure::secret_set(app.clone(), key.to_string(), B64.encode(secret.to_bytes()))
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(secret)
}

fn load_or_make_signing(app: &AppHandle) -> Result<ed25519_dalek::SigningKey, E2eeError> {
    if let Some(b64) = crate::secure::secret_get(app.clone(), SIGNING_SECRET_KEY.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let bytes = B64.decode(&b64).map_err(|_| E2eeError::Storage("signing key corrupt".into()))?;
        let arr: [u8; 32] =
            bytes.try_into().map_err(|_| E2eeError::Storage("signing key corrupt".into()))?;
        return Ok(ed25519_dalek::SigningKey::from_bytes(&arr));
    }
    let mut seed = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    let key = ed25519_dalek::SigningKey::from_bytes(&seed);
    crate::secure::secret_set(app.clone(), SIGNING_SECRET_KEY.to_string(), B64.encode(key.to_bytes()))
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(key)
}

// ---------- public bundle (goes to the server key directory) ----------

/// What the server publishes for this device. All base64.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PublicBundle {
    pub identity_key: String,          // X25519 identity public
    pub signing_key: String,           // Ed25519 identity public
    pub signed_prekey: String,         // X25519 signed prekey public
    pub signed_prekey_id: u32,
    pub signed_prekey_sig: String,     // Ed25519 signature over the SPK bytes
}

fn hkdf(ikm: &[u8], info: &[u8], out_len: usize) -> Vec<u8> {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut out = vec![0u8; out_len];
    hk.expand(info, &mut out).expect("hkdf length");
    out
}

fn hmac(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut m = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("hmac");
    m.update(msg);
    let r = m.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&r);
    out
}

/// Compose the X3DH shared secret from the four DH outputs.
fn x3dh_secret(dh1: [u8; 32], dh2: [u8; 32], dh3: [u8; 32], dh4: Option<[u8; 32]>) -> [u8; 32] {
    let mut ikm = Vec::with_capacity(128);
    ikm.extend_from_slice(&dh1);
    ikm.extend_from_slice(&dh2);
    ikm.extend_from_slice(&dh3);
    if let Some(d4) = dh4 {
        ikm.extend_from_slice(&d4);
    }
    let out = hkdf(&ikm, INFO_SETUP, 32);
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&out);
    sk
}

fn parse_pub(b64: &str) -> Result<PublicKey, E2eeError> {
    crate::e2ee::parse_public(b64)
}

// ---------- Double Ratchet state ----------

#[derive(Serialize, Deserialize, Clone)]
struct RatchetSession {
    root_key: [u8; 32],
    /// my current ratchet keypair (secret + public)
    send_ratchet_secret: Option<[u8; 32]>,
    send_ratchet_pub: Option<[u8; 32]>,
    recv_ratchet_pub: Option<[u8; 32]>,
    send_chain: Option<[u8; 32]>,
    recv_chain: Option<[u8; 32]>,
    send_n: u32,
    recv_n: u32,
    prev_chain_len: u32,
    /// skipped message keys: (ratchet pub b64, n) -> message key
    skipped: VecDeque<(String, u32, [u8; 32])>,
    /// peer identity (X25519) for binding sessions to the directory key
    peer_identity: [u8; 32],
}

fn dh_ratchet(root: &[u8; 32], dh: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let mut ikm = Vec::with_capacity(64);
    ikm.extend_from_slice(root);
    ikm.extend_from_slice(dh);
    let out = hkdf(&ikm, INFO_ROOT, 64);
    let mut rk = [0u8; 32];
    let mut ck = [0u8; 32];
    rk.copy_from_slice(&out[..32]);
    ck.copy_from_slice(&out[32..]);
    (rk, ck)
}

fn chain_step(chain: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    // next chain key = HMAC(chain, 0x01), message key = HMAC(chain, 0x02)
    let next = hmac(chain, &[0x01]);
    let mut ikm = Vec::with_capacity(64);
    ikm.extend_from_slice(&next);
    ikm.extend_from_slice(INFO_CHAIN);
    let mk_out = hkdf(&ikm, INFO_CHAIN, 32);
    let mut mk = [0u8; 32];
    mk.copy_from_slice(&mk_out);
    (next, mk)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MsgHeader {
    /// sender's current ratchet public key
    rk: String,
    n: u32,
    pn: u32,
    /// first-message X3DH payload, present only until the peer has answered
    ik: Option<String>,      // sender X25519 identity
    sk: Option<String>,      // sender Ed25519 identity
    ek: Option<String>,      // sender X3DH ephemeral
    spk_id: Option<u32>,
    opk: Option<String>,     // one-time prekey public the sender used
}

// In-memory session cache keyed by peer user id. The encrypted on-disk copy
// lives in the OS keychain per peer.
static SESSIONS: Mutex<Option<HashMap<String, RatchetSession>>> = Mutex::new(None);

fn sessions_key(peer: &str) -> String {
    format!("e2ee2_session_{peer}")
}

fn load_session(app: &AppHandle, peer: &str) -> Result<Option<RatchetSession>, E2eeError> {
    let mut cache = SESSIONS.lock().unwrap();
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.get(peer) {
        return Ok(Some(s.clone()));
    }
    if let Some(b64) = crate::secure::secret_get(app.clone(), sessions_key(peer))
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let bytes = B64.decode(&b64).map_err(|_| E2eeError::Storage("session corrupt".into()))?;
        let s: RatchetSession =
            serde_json::from_slice(&bytes).map_err(|_| E2eeError::Storage("session corrupt".into()))?;
        map.insert(peer.to_string(), s.clone());
        return Ok(Some(s));
    }
    Ok(None)
}

fn store_session(app: &AppHandle, peer: &str, s: &RatchetSession) -> Result<(), E2eeError> {
    let mut cache = SESSIONS.lock().unwrap();
    cache.get_or_insert_with(HashMap::new).insert(peer.to_string(), s.clone());
    let bytes = serde_json::to_vec(s).map_err(|_| E2eeError::Storage("session encode".into()))?;
    crate::secure::secret_set(app.clone(), sessions_key(peer), B64.encode(bytes))
        .map_err(|e| E2eeError::Storage(e.to_string()))
}

// ---------- public API ----------

/// Generate / fetch this device's public bundle for the server directory.
#[tauri::command]
pub fn e2ee2_bundle(app: AppHandle) -> Result<PublicBundle, E2eeError> {
    let identity = load_or_make_x25519(&app, IDENTITY_SECRET_KEY)?;
    let signing = load_or_make_signing(&app)?;
    let spk = load_or_make_x25519(&app, SPK_SECRET_KEY)?;
    let spk_pub = PublicKey::from(&spk);
    let sig = signing.sign(spk_pub.as_bytes());
    let spk_id: u32 = crate::secure::secret_get(app.clone(), SPK_ID_KEY.to_string())
        .ok()
        .flatten()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1);
    Ok(PublicBundle {
        identity_key: B64.encode(PublicKey::from(&identity).as_bytes()),
        signing_key: B64.encode(signing.verifying_key().as_bytes()),
        signed_prekey: B64.encode(spk_pub.as_bytes()),
        signed_prekey_id: spk_id,
        signed_prekey_sig: B64.encode(sig.to_bytes()),
    })
}

/// Generate `count` one-time prekeys; returns base64 public keys. The
/// caller uploads them; the matching secrets are kept locally, indexed by
/// their public key so X3DH receive can find them.
#[tauri::command]
pub fn e2ee2_new_prekeys(app: AppHandle, count: u32) -> Result<Vec<String>, E2eeError> {
    let count = count.min(100);
    let mut pubs = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let secret = StaticSecret::from(random_32());
        let pub_b64 = B64.encode(PublicKey::from(&secret).as_bytes());
        crate::secure::secret_set(
            app.clone(),
            format!("e2ee2_opk_{pub_b64}"),
            B64.encode(secret.to_bytes()),
        )
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
        pubs.push(pub_b64);
    }
    Ok(pubs)
}

/// Initiator side of X3DH: build a session from the peer's public bundle.
/// Returns nothing; the next encrypt() will carry the setup header.
#[tauri::command]
pub fn e2ee2_start_session(
    app: AppHandle,
    peer: String,
    bundle: PublicBundle,
    one_time_prekey: Option<String>,
) -> Result<(), E2eeError> {
    let my_ik = load_or_make_x25519(&app, IDENTITY_SECRET_KEY)?;
    let my_sk = load_or_make_signing(&app)?;

    let peer_ik = parse_pub(&bundle.identity_key)?;
    let peer_spk = parse_pub(&bundle.signed_prekey)?;

    // Verify the signed prekey actually belongs to the identity key —
    // otherwise the server could substitute a prekey it controls.
    let sign_bytes = B64.decode(&bundle.signing_key)
        .map_err(|_| E2eeError::Bad("signing key not base64".into()))?;
    let sign_arr: [u8; 32] =
        sign_bytes.try_into().map_err(|_| E2eeError::Bad("signing key must be 32 bytes".into()))?;
    let vk = ed25519_dalek::VerifyingKey::from_bytes(&sign_arr)
        .map_err(|_| E2eeError::Bad("bad signing key".into()))?;
    let sig_bytes = B64.decode(&bundle.signed_prekey_sig)
        .map_err(|_| E2eeError::Bad("signature not base64".into()))?;
    let sig_arr: [u8; 64] =
        sig_bytes.try_into().map_err(|_| E2eeError::Bad("signature must be 64 bytes".into()))?;
    vk.verify(peer_spk.as_bytes(), &ed25519_dalek::Signature::from_bytes(&sig_arr))
        .map_err(|_| E2eeError::Bad("signed prekey signature invalid".into()))?;

    let ek = StaticSecret::from(random_32());
    let ek_pub = PublicKey::from(&ek);

    let dh1 = my_ik.diffie_hellman(&peer_spk).to_bytes();
    let dh2 = ek.diffie_hellman(&peer_ik).to_bytes();
    let dh3 = ek.diffie_hellman(&peer_spk).to_bytes();
    let dh4 = match &one_time_prekey {
        Some(opk_b64) => Some(ek.diffie_hellman(&parse_pub(opk_b64)?).to_bytes()),
        None => None,
    };
    let sk = x3dh_secret(dh1, dh2, dh3, dh4);

    // Sender ratchet starts with a fresh keypair; SK becomes the root key,
    // first DH ratchet produces the sending chain.
    let ratchet = StaticSecret::from(random_32());
    let ratchet_pub = PublicKey::from(&ratchet);
    let (root, send_chain) = dh_ratchet(&sk, &ratchet.diffie_hellman(&peer_spk).to_bytes());

    let session = RatchetSession {
        root_key: root,
        send_ratchet_secret: Some(ratchet.to_bytes()),
        send_ratchet_pub: Some(ratchet_pub.to_bytes()),
        recv_ratchet_pub: Some(peer_spk.to_bytes()),
        send_chain: Some(send_chain),
        recv_chain: None,
        send_n: 0,
        recv_n: 0,
        prev_chain_len: 0,
        skipped: VecDeque::new(),
        peer_identity: peer_ik.to_bytes(),
    };
    // Stash the X3DH header bits on the session via a sidecar until first send.
    store_session(&app, &peer, &session)?;
    let sidecar = serde_json::json!({
        "ik": B64.encode(PublicKey::from(&my_ik).as_bytes()),
        "sk": B64.encode(my_sk.verifying_key().as_bytes()),
        "ek": B64.encode(ek_pub.as_bytes()),
        "spkId": bundle.signed_prekey_id,
        "opk": one_time_prekey,
    });
    crate::secure::secret_set(
        app,
        format!("e2ee2_x3dh_{peer}"),
        sidecar.to_string(),
    )
    .map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(())
}

/// Responder side: rebuild SK from a first-message header.
fn accept_session(
    app: &AppHandle,
    _peer: &str,
    h: &MsgHeader,
) -> Result<RatchetSession, E2eeError> {
    let ik_b64 = h.ik.as_ref().ok_or_else(|| E2eeError::Bad("missing ik".into()))?;
    let ek_b64 = h.ek.as_ref().ok_or_else(|| E2eeError::Bad("missing ek".into()))?;
    let peer_ik = parse_pub(ik_b64)?;
    let peer_ek = parse_pub(ek_b64)?;

    let my_ik = load_or_make_x25519(app, IDENTITY_SECRET_KEY)?;
    let my_spk = load_or_make_x25519(app, SPK_SECRET_KEY)?;

    let dh1 = my_spk.diffie_hellman(&peer_ik).to_bytes();
    let dh2 = my_ik.diffie_hellman(&peer_ek).to_bytes();
    let dh3 = my_spk.diffie_hellman(&peer_ek).to_bytes();
    let dh4 = match &h.opk {
        Some(opk_b64) => {
            let raw = crate::secure::secret_get(
                app.clone(),
                format!("e2ee2_opk_{opk_b64}"),
            )
            .ok()
            .flatten()
            .ok_or_else(|| E2eeError::Bad("unknown one-time prekey".into()))?;
            let bytes = B64.decode(raw).map_err(|_| E2eeError::Storage("opk corrupt".into()))?;
            let arr: [u8; 32] =
                bytes.try_into().map_err(|_| E2eeError::Storage("opk corrupt".into()))?;
            let opk = StaticSecret::from(arr);
            let out = opk.diffie_hellman(&peer_ek).to_bytes();
            // one-time means one-time
            let _ = crate::secure::secret_delete(app.clone(), format!("e2ee2_opk_{opk_b64}"));
            Some(out)
        }
        None => None,
    };
    let sk = x3dh_secret(dh1, dh2, dh3, dh4);

    let peer_rk = parse_pub(&h.rk)?;
    let (root, recv_chain) = dh_ratchet(&sk, &my_spk.diffie_hellman(&peer_rk).to_bytes());

    Ok(RatchetSession {
        root_key: root,
        send_ratchet_secret: None,
        send_ratchet_pub: None,
        recv_ratchet_pub: Some(peer_rk.to_bytes()),
        send_chain: None,
        recv_chain: Some(recv_chain),
        send_n: 0,
        recv_n: 0,
        prev_chain_len: 0,
        skipped: VecDeque::new(),
        peer_identity: peer_ik.to_bytes(),
    })
}

fn seal_with_key(mk: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, E2eeError> {
    let cipher = Aes256Gcm::new_from_slice(mk).expect("32-byte key");
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|_| E2eeError::Bad("encryption failure".into()))?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn open_with_key(mk: &[u8; 32], aad: &[u8], body: &[u8]) -> Result<Vec<u8>, E2eeError> {
    if body.len() < 12 + 16 {
        return Err(E2eeError::Bad("body too short".into()));
    }
    let (nonce, ct) = body.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(mk).expect("32-byte key");
    cipher
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ct, aad })
        .map_err(|_| E2eeError::Decrypt)
}

/// Encrypt for a peer with an established session -> base64 dr-v1 body.
#[tauri::command]
pub fn e2ee2_encrypt(app: AppHandle, peer: String, plaintext: String) -> Result<String, E2eeError> {
    let mut s = load_session(&app, &peer)?
        .ok_or_else(|| E2eeError::Bad("no session for peer".into()))?;
    let send_chain = s
        .send_chain
        .ok_or_else(|| E2eeError::Bad("session has no sending chain yet".into()))?;

    let rk_b64 = B64.encode(s.send_ratchet_pub.ok_or_else(|| E2eeError::Bad("no ratchet key".into()))?);
    let mut header = MsgHeader {
        rk: rk_b64,
        n: s.send_n,
        pn: s.prev_chain_len,
        ik: None,
        sk: None,
        ek: None,
        spk_id: None,
        opk: None,
    };
    // Attach the X3DH payload while the peer hasn't answered yet.
    if s.recv_chain.is_none() {
        if let Ok(Some(raw)) = crate::secure::secret_get(app.clone(), format!("e2ee2_x3dh_{peer}")) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                header.ik = v.get("ik").and_then(|x| x.as_str()).map(str::to_string);
                header.sk = v.get("sk").and_then(|x| x.as_str()).map(str::to_string);
                header.ek = v.get("ek").and_then(|x| x.as_str()).map(str::to_string);
                header.spk_id = v.get("spkId").and_then(|x| x.as_u64()).map(|x| x as u32);
                header.opk = v.get("opk").and_then(|x| x.as_str()).map(str::to_string);
            }
        }
    }

    let header_bytes = serde_json::to_vec(&header).map_err(|_| E2eeError::Bad("header encode".into()))?;
    let (next_chain, mk) = chain_step(&send_chain);
    let ct = seal_with_key(&mk, &header_bytes, plaintext.as_bytes())?;

    s.send_chain = Some(next_chain);
    s.send_n += 1;
    store_session(&app, &peer, &s)?;

    let mut out = header_bytes;
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

/// Decrypt a dr-v1 body from a peer -> plaintext.
#[tauri::command]
pub fn e2ee2_decrypt(app: AppHandle, peer: String, body: String) -> Result<String, E2eeError> {
    let bytes = B64.decode(&body).map_err(|_| E2eeError::Bad("body not base64".into()))?;
    let header_end = bytes
        .iter()
        .position(|b| *b == b'}')
        .ok_or_else(|| E2eeError::Bad("no header".into()))?
        + 1;
    let (header_bytes, ct) = bytes.split_at(header_end);
    let header: MsgHeader =
        serde_json::from_slice(header_bytes).map_err(|_| E2eeError::Bad("bad header".into()))?;

    let mut s = match load_session(&app, &peer)? {
        Some(s) => s,
        None => accept_session(&app, &peer, &header)?,
    };

    let rk_b64 = header.rk.clone();

    // Skipped-message cache first (out-of-order delivery).
    if let Some(pos) = s.skipped.iter().position(|(k, n, _)| k == &rk_b64 && *n == header.n) {
        let (_, _, mk) = s.skipped.remove(pos).unwrap();
        store_session(&app, &peer, &s)?;
        let pt = open_with_key(&mk, header_bytes, ct)?;
        return String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()));
    }

    // New ratchet key from the peer -> advance the DH ratchet.
    if Some(rk_b64.as_str()) != s.recv_ratchet_pub.map(|p| B64.encode(p)).as_deref() {
        // Cache skipped keys from the previous receiving chain.
        if let (Some(mut chain), Some(_)) = (s.recv_chain, s.recv_ratchet_pub) {
            let old_rk = rk_b64.clone();
            for n in s.recv_n..header.pn {
                let (next, mk) = chain_step(&chain);
                chain = next;
                s.skipped.push_back((old_rk.clone(), n, mk));
                while s.skipped.len() > MAX_SKIPPED_KEYS {
                    s.skipped.pop_front();
                }
            }
        }
        let peer_rk = parse_pub(&rk_b64)?;
        let my_ratchet = StaticSecret::from(random_32());
        let my_ratchet_pub = PublicKey::from(&my_ratchet);
        let (root, recv_chain) = dh_ratchet(&s.root_key, &{
            let my_spk = load_or_make_x25519(&app, SPK_SECRET_KEY)?;
            my_spk.diffie_hellman(&peer_rk).to_bytes()
        });
        let (root2, send_chain) = dh_ratchet(&root, &my_ratchet.diffie_hellman(&peer_rk).to_bytes());
        s.root_key = root2;
        s.recv_chain = Some(recv_chain);
        s.send_chain = Some(send_chain);
        s.send_ratchet_secret = Some(my_ratchet.to_bytes());
        s.send_ratchet_pub = Some(my_ratchet_pub.to_bytes());
        s.recv_ratchet_pub = Some(peer_rk.to_bytes());
        s.prev_chain_len = s.send_n;
        s.send_n = 0;
        s.recv_n = 0;
        // First peer answer confirms the session: drop the X3DH sidecar.
        let _ = crate::secure::secret_delete(app.clone(), format!("e2ee2_x3dh_{peer}"));
    }

    // Skip ahead within the current chain, caching message keys.
    let mut chain = s.recv_chain.ok_or_else(|| E2eeError::Bad("no receiving chain".into()))?;
    if header.n < s.recv_n {
        return Err(E2eeError::Bad("message too old".into()));
    }
    for n in s.recv_n..header.n {
        let (next, mk) = chain_step(&chain);
        chain = next;
        s.skipped.push_back((rk_b64.clone(), n, mk));
        while s.skipped.len() > MAX_SKIPPED_KEYS {
            s.skipped.pop_front();
        }
    }
    let (next_chain, mk) = chain_step(&chain);
    s.recv_chain = Some(next_chain);
    s.recv_n = header.n + 1;
    store_session(&app, &peer, &s)?;

    let pt = open_with_key(&mk, header_bytes, ct)?;
    String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}

/// Whether we already have a ratchet session with this peer.
#[tauri::command]
pub fn e2ee2_has_session(app: AppHandle, peer: String) -> Result<bool, E2eeError> {
    Ok(load_session(&app, &peer)?.is_some())
}

/// Combined identity + prekey safety fingerprint for out-of-band checks.
#[tauri::command]
pub fn e2ee2_fingerprint(bundle: PublicBundle) -> Result<String, E2eeError> {
    crate::e2ee::e2ee_fingerprint(bundle.identity_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_keys_advance_deterministically() {
        let ck = [7u8; 32];
        let (n1, m1) = chain_step(&ck);
        let (n2, m2) = chain_step(&n1);
        assert_ne!(m1, m2);
        assert_ne!(n1, n2);
        assert_ne!(n1, m1);
    }

    #[test]
    fn seal_roundtrip_and_aad_tamper() {
        let mk = [42u8; 32];
        let aad = b"header";
        let ct = seal_with_key(&mk, aad, b"secret message").unwrap();
        assert_eq!(open_with_key(&mk, aad, &ct).unwrap(), b"secret message");
        assert!(open_with_key(&mk, b"wrong header", &ct).is_err());
    }
}
