//! E2EE via vodozemac Olm (Double Ratchet). Scheme on the wire: "olm-v1".
//!
//! The server still only sees opaque bodies plus a public identity / one-time
//! key directory. Groups stay plaintext until Megolm.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use vodozemac::olm::{
    Account, AccountPickle, OlmMessage, PreKeyMessage, Session, SessionConfig, SessionPickle,
};
use vodozemac::Curve25519PublicKey;

use crate::e2ee::E2eeError;
use base64::engine::general_purpose::{STANDARD as B64, STANDARD_NO_PAD};
use base64::Engine;

const ACCOUNT_KEY: &str = "olm_account";
const PICKLE_KEY_KEY: &str = "olm_pickle_key";
const SESSION_PREFIX: &str = "olm_session_";
const SESSIONS_PREFIX: &str = "olm_sessions_";
const REMOTE_IK_PREFIX: &str = "olm_remote_ik_";
const PEER_LIST_KEY: &str = "olm_peer_ids";
const MAX_SESSIONS_PER_PEER: usize = 8;

static ACCOUNT: Mutex<Option<Account>> = Mutex::new(None);
static SESSIONS: Mutex<Option<HashMap<String, Vec<Session>>>> = Mutex::new(None);

fn b64_encode(bytes: impl AsRef<[u8]>) -> String {
    B64.encode(bytes)
}

fn curve_from_wire(s: &str) -> Result<Curve25519PublicKey, E2eeError> {
    let bytes = B64
        .decode(s)
        .or_else(|_| STANDARD_NO_PAD.decode(s))
        .map_err(|_| E2eeError::Bad("public key not base64".into()))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| E2eeError::Bad("public key must be 32 bytes".into()))?;
    Ok(Curve25519PublicKey::from(arr))
}

fn pickle_key(app: &AppHandle) -> Result<[u8; 32], E2eeError> {
    if let Some(b64) = crate::secure::secret_get(app.clone(), PICKLE_KEY_KEY.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &b64)
            .map_err(|_| E2eeError::Storage("pickle key corrupt".into()))?;
        return bytes
            .try_into()
            .map_err(|_| E2eeError::Storage("pickle key corrupt".into()));
    }
    let mut key = [0u8; 32];
    getrandom::getrandom(&mut key).map_err(|e| E2eeError::Storage(e.to_string()))?;
    crate::secure::secret_set(app.clone(), PICKLE_KEY_KEY.to_string(), b64_encode(key))
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(key)
}

fn persist_account(app: &AppHandle, account: &Account) -> Result<(), E2eeError> {
    let key = pickle_key(app)?;
    let pickled = account.pickle().encrypt(&key);
    crate::secure::secret_set(app.clone(), ACCOUNT_KEY.to_string(), pickled)
        .map_err(|e| E2eeError::Storage(e.to_string()))
}

fn take_account(app: &AppHandle) -> Result<Account, E2eeError> {
    if let Some(a) = ACCOUNT.lock().unwrap().take() {
        return Ok(a);
    }
    let key = pickle_key(app)?;
    if let Some(p) = crate::secure::secret_get(app.clone(), ACCOUNT_KEY.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let pickle =
            AccountPickle::from_encrypted(&p, &key).map_err(|e| E2eeError::Storage(e.to_string()))?;
        Ok(Account::from_pickle(pickle))
    } else {
        let acc = Account::new();
        persist_account(app, &acc)?;
        Ok(acc)
    }
}

fn put_account(app: &AppHandle, account: Account) -> Result<(), E2eeError> {
    persist_account(app, &account)?;
    *ACCOUNT.lock().unwrap() = Some(account);
    Ok(())
}

fn session_store_key(peer: &str) -> String {
    format!("{SESSION_PREFIX}{peer}")
}

fn sessions_store_key(peer: &str) -> String {
    format!("{SESSIONS_PREFIX}{peer}")
}

fn remote_ik_key(peer: &str) -> String {
    format!("{REMOTE_IK_PREFIX}{peer}")
}

fn set_remote_ik(app: &AppHandle, peer: &str, ik: &str) -> Result<(), E2eeError> {
    crate::secure::secret_set(app.clone(), remote_ik_key(peer), ik.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    remember_peer(app, peer)
}

fn remember_peer(app: &AppHandle, peer: &str) -> Result<(), E2eeError> {
    let mut ids: Vec<String> = crate::secure::secret_get(app.clone(), PEER_LIST_KEY.to_string())
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if !ids.iter().any(|p| p == peer) {
        ids.push(peer.to_string());
        crate::secure::secret_set(app.clone(), PEER_LIST_KEY.to_string(), serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()))
            .map_err(|e| E2eeError::Storage(e.to_string()))?;
    }
    Ok(())
}

fn persist_sessions(app: &AppHandle, peer: &str, sessions: &[Session]) -> Result<(), E2eeError> {
    let key = pickle_key(app)?;
    let pickled: Vec<String> = sessions.iter().map(|s| s.pickle().encrypt(&key)).collect();
    let json = serde_json::to_string(&pickled).map_err(|e| E2eeError::Storage(e.to_string()))?;
    crate::secure::secret_set(app.clone(), sessions_store_key(peer), json)
        .map_err(|e| E2eeError::Storage(e.to_string()))
}

fn decode_one_pickle(p: &str, key: &[u8; 32]) -> Result<Session, E2eeError> {
    let pickle =
        SessionPickle::from_encrypted(p, key).map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(Session::from_pickle(pickle))
}

fn take_sessions(app: &AppHandle, peer: &str) -> Result<Vec<Session>, E2eeError> {
    let mut cache = SESSIONS.lock().unwrap();
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.remove(peer) {
        return Ok(s);
    }
    drop(cache);
    let key = pickle_key(app)?;
    if let Some(raw) = crate::secure::secret_get(app.clone(), sessions_store_key(peer))
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let pickled: Vec<String> =
            serde_json::from_str(&raw).map_err(|e| E2eeError::Storage(e.to_string()))?;
        return pickled.iter().map(|p| decode_one_pickle(p, &key)).collect();
    }
    // Legacy single-session pickle.
    if let Some(p) = crate::secure::secret_get(app.clone(), session_store_key(peer))
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        return Ok(vec![decode_one_pickle(&p, &key)?]);
    }
    Ok(vec![])
}

fn put_sessions(app: &AppHandle, peer: &str, mut sessions: Vec<Session>) -> Result<(), E2eeError> {
    if sessions.len() > MAX_SESSIONS_PER_PEER {
        sessions.drain(0..sessions.len() - MAX_SESSIONS_PER_PEER);
    }
    persist_sessions(app, peer, &sessions)?;
    SESSIONS
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(peer.to_string(), sessions);
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PublicBundle {
    pub identity_key: String,
    pub signing_key: String,
    pub signed_prekey: String,
    pub signed_prekey_id: u32,
    pub signed_prekey_sig: String,
}

#[tauri::command]
pub fn e2ee2_bundle(app: AppHandle) -> Result<PublicBundle, E2eeError> {
    let account = take_account(&app)?;
    let ik_bytes = account.curve25519_key().to_bytes();
    let ik = B64.encode(ik_bytes);
    let sk = B64.encode(account.ed25519_key().as_bytes());
    let sig = B64.encode(account.sign(ik_bytes).to_bytes());
    let bundle = PublicBundle {
        identity_key: ik.clone(),
        signing_key: sk,
        signed_prekey: ik,
        signed_prekey_id: 1,
        signed_prekey_sig: sig,
    };
    put_account(&app, account)?;
    Ok(bundle)
}

#[tauri::command]
pub fn e2ee2_new_prekeys(app: AppHandle, count: u32) -> Result<Vec<String>, E2eeError> {
    let mut account = take_account(&app)?;
    let n = (count as usize).min(100);
    account.generate_one_time_keys(n);
    let pubs: Vec<String> = account.one_time_keys().values().map(|k| B64.encode(k.to_bytes())).collect();
    account.mark_keys_as_published();
    put_account(&app, account)?;
    Ok(pubs)
}

#[tauri::command]
pub fn e2ee2_start_session(
    app: AppHandle,
    peer: String,
    bundle: PublicBundle,
    one_time_prekey: Option<String>,
) -> Result<(), E2eeError> {
    let otk_b64 = one_time_prekey.ok_or_else(|| {
        E2eeError::Bad("olm needs a one-time prekey; peer hasn't uploaded any".into())
    })?;
    let ik = curve_from_wire(&bundle.identity_key)?;
    let otk = curve_from_wire(&otk_b64)?;
    let account = take_account(&app)?;
    let session = account.create_outbound_session(SessionConfig::version_1(), ik, otk);
    put_account(&app, account)?;
    let mut sessions = take_sessions(&app, &peer)?;
    sessions.push(session);
    put_sessions(&app, &peer, sessions)?;
    set_remote_ik(&app, &peer, &bundle.identity_key)
}

#[tauri::command]
pub fn e2ee2_encrypt(app: AppHandle, peer: String, plaintext: String) -> Result<String, E2eeError> {
    let mut sessions = take_sessions(&app, &peer)?;
    let mut session = sessions
        .pop()
        .ok_or_else(|| E2eeError::Bad("no olm session for peer".into()))?;
    let msg = session.encrypt(plaintext);
    sessions.push(session);
    put_sessions(&app, &peer, sessions)?;
    let json = serde_json::to_vec(&msg).map_err(|e| E2eeError::Bad(e.to_string()))?;
    Ok(B64.encode(json))
}

fn parse_olm_body(body: &str) -> Result<OlmMessage, E2eeError> {
    let json = B64.decode(body).unwrap_or_else(|_| body.as_bytes().to_vec());
    serde_json::from_slice(&json).map_err(|e| E2eeError::Bad(e.to_string()))
}

#[tauri::command]
pub fn e2ee2_decrypt(app: AppHandle, peer: String, body: String) -> Result<String, E2eeError> {
    let msg: OlmMessage = parse_olm_body(&body)?;
    let mut sessions = take_sessions(&app, &peer)?;
    for i in (0..sessions.len()).rev() {
        match sessions[i].decrypt(&msg) {
            Ok(pt) => {
                let used = sessions.remove(i);
                sessions.push(used);
                put_sessions(&app, &peer, sessions)?;
                return String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()));
            }
            Err(_) => continue,
        }
    }
    if let OlmMessage::PreKey(pre) = &msg {
        inbound(&app, &peer, pre, sessions)
    } else {
        let had = !sessions.is_empty();
        put_sessions(&app, &peer, sessions)?;
        Err(if had {
            E2eeError::Decrypt
        } else {
            E2eeError::Bad("no session and not a pre-key message".into())
        })
    }
}

fn inbound(
    app: &AppHandle,
    peer: &str,
    pre: &PreKeyMessage,
    mut sessions: Vec<Session>,
) -> Result<String, E2eeError> {
    let mut account = take_account(app)?;
    let their_ik = pre.identity_key();
    let result = account
        .create_inbound_session(their_ik, pre)
        .map_err(|e| E2eeError::Bad(e.to_string()))?;
    put_account(app, account)?;
    sessions.push(result.session);
    put_sessions(app, peer, sessions)?;
    let _ = set_remote_ik(app, peer, &b64_encode(their_ik.to_bytes()));
    String::from_utf8(result.plaintext).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}

#[tauri::command]
pub fn e2ee2_remote_identity(app: AppHandle, peer: String) -> Result<Option<String>, E2eeError> {
    crate::secure::secret_get(app, remote_ik_key(&peer)).map_err(|e| E2eeError::Storage(e.to_string()))
}

#[tauri::command]
pub fn e2ee2_forget_peer(app: AppHandle, peer: String) -> Result<(), E2eeError> {
    let _ = take_sessions(&app, &peer);
    SESSIONS
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .remove(&peer);
    let _ = crate::secure::secret_delete(app.clone(), sessions_store_key(&peer));
    let _ = crate::secure::secret_delete(app.clone(), session_store_key(&peer));
    let _ = crate::secure::secret_delete(app, remote_ik_key(&peer));
    Ok(())
}

/// New Olm account, drop every per-peer session. Callers must republish the bundle.
#[tauri::command]
pub fn e2ee2_reset_account(app: AppHandle) -> Result<(), E2eeError> {
    let peers: Vec<String> = crate::secure::secret_get(app.clone(), PEER_LIST_KEY.to_string())
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    for peer in &peers {
        let _ = e2ee2_forget_peer(app.clone(), peer.clone());
    }
    *ACCOUNT.lock().unwrap() = None;
    *SESSIONS.lock().unwrap() = Some(HashMap::new());
    let _ = crate::secure::secret_delete(app.clone(), ACCOUNT_KEY.to_string());
    let _ = crate::secure::secret_delete_prefix(&app, SESSION_PREFIX);
    let _ = crate::secure::secret_delete_prefix(&app, SESSIONS_PREFIX);
    let _ = crate::secure::secret_delete_prefix(&app, REMOTE_IK_PREFIX);
    let _ = crate::secure::secret_delete(app.clone(), PEER_LIST_KEY.to_string());
    let acc = Account::new();
    put_account(&app, acc)
}

#[tauri::command]
pub fn e2ee2_has_session(app: AppHandle, peer: String) -> Result<bool, E2eeError> {
    let sessions = take_sessions(&app, &peer)?;
    let any = !sessions.is_empty();
    put_sessions(&app, &peer, sessions)?;
    Ok(any)
}

#[tauri::command]
pub fn e2ee2_fingerprint(bundle: PublicBundle) -> Result<String, E2eeError> {
    crate::e2ee::e2ee_fingerprint(bundle.identity_key)
}

/// Plaintext an Android FCM decrypt already opened (and advanced the ratchet for).
/// Consumed so the in-app path does not try to decrypt the same ciphertext twice.
#[tauri::command]
pub fn take_push_preview(app: AppHandle, message_id: String) -> Result<Option<String>, E2eeError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    let path = dir.join("push_previews.json");
    // Android FCM writes next to secrets.json, which is this same directory.
    let Ok(bytes) = std::fs::read(&path) else {
        return Ok(None);
    };
    let mut map: HashMap<String, String> = serde_json::from_slice(&bytes).unwrap_or_default();
    let text = map.remove(&message_id);
    if text.is_some() {
        let _ = std::fs::write(&path, serde_json::to_vec(&map).unwrap_or_else(|_| b"{}".to_vec()));
    }
    Ok(text)
}

/// Decrypt an olm-v1 body using `secrets.json` in `dir` (Android FCM process).
#[cfg(target_os = "android")]
/// Advances and persists the matching session so the in-app ratchet stays in
/// lockstep with a notification that opened the ciphertext first.
pub fn decrypt_from_dir(dir: &std::path::Path, peer: &str, body: &str) -> Result<String, E2eeError> {
    let path = dir.join("secrets.json");
    let bytes = std::fs::read(&path).map_err(|e| E2eeError::Storage(e.to_string()))?;
    let mut map: HashMap<String, String> =
        serde_json::from_slice(&bytes).map_err(|e| E2eeError::Storage(e.to_string()))?;
    let key = pickle_key_from_map(&map)?;

    let mut sessions = {
        let mut cache = SESSIONS.lock().unwrap();
        let m = cache.get_or_insert_with(HashMap::new);
        if let Some(s) = m.remove(peer) {
            s
        } else {
            load_sessions_from_map(&map, peer, &key)?
        }
    };

    let msg = parse_olm_body(body)?;
    for i in (0..sessions.len()).rev() {
        match sessions[i].decrypt(&msg) {
            Ok(pt) => {
                let used = sessions.remove(i);
                sessions.push(used);
                persist_sessions_to_map(&mut map, peer, &sessions, &key)?;
                write_secrets(&path, &map)?;
                SESSIONS
                    .lock()
                    .unwrap()
                    .get_or_insert_with(HashMap::new)
                    .insert(peer.to_string(), sessions);
                return String::from_utf8(pt)
                    .map_err(|_| E2eeError::Bad("plaintext not utf-8".into()));
            }
            Err(_) => continue,
        }
    }

    let OlmMessage::PreKey(pre) = &msg else {
        let had = !sessions.is_empty();
        SESSIONS
            .lock()
            .unwrap()
            .get_or_insert_with(HashMap::new)
            .insert(peer.to_string(), sessions);
        return Err(if had {
            E2eeError::Decrypt
        } else {
            E2eeError::Bad("no session and not a pre-key message".into())
        });
    };

    let mut account = {
        let mut g = ACCOUNT.lock().unwrap();
        if let Some(a) = g.take() {
            a
        } else {
            load_account_from_map(&map, &key)?
        }
    };
    let result = account
        .create_inbound_session(pre.identity_key(), pre)
        .map_err(|e| E2eeError::Bad(e.to_string()))?;
    map.insert(ACCOUNT_KEY.to_string(), account.pickle().encrypt(&key));
    *ACCOUNT.lock().unwrap() = Some(account);
    sessions.push(result.session);
    persist_sessions_to_map(&mut map, peer, &sessions, &key)?;
    write_secrets(&path, &map)?;
    SESSIONS
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(peer.to_string(), sessions);
    String::from_utf8(result.plaintext).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}

#[cfg(target_os = "android")]
fn pickle_key_from_map(map: &HashMap<String, String>) -> Result<[u8; 32], E2eeError> {
    let b64 = map
        .get(PICKLE_KEY_KEY)
        .ok_or_else(|| E2eeError::Storage("no pickle key".into()))?;
    let bytes = B64
        .decode(b64)
        .map_err(|_| E2eeError::Storage("pickle key corrupt".into()))?;
    bytes
        .try_into()
        .map_err(|_| E2eeError::Storage("pickle key corrupt".into()))
}

#[cfg(target_os = "android")]
fn load_account_from_map(
    map: &HashMap<String, String>,
    key: &[u8; 32],
) -> Result<Account, E2eeError> {
    let p = map
        .get(ACCOUNT_KEY)
        .ok_or_else(|| E2eeError::Storage("no olm account".into()))?;
    let pickle =
        AccountPickle::from_encrypted(p, key).map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(Account::from_pickle(pickle))
}

#[cfg(target_os = "android")]
fn load_sessions_from_map(
    map: &HashMap<String, String>,
    peer: &str,
    key: &[u8; 32],
) -> Result<Vec<Session>, E2eeError> {
    if let Some(raw) = map.get(&sessions_store_key(peer)) {
        let pickled: Vec<String> =
            serde_json::from_str(raw).map_err(|e| E2eeError::Storage(e.to_string()))?;
        return pickled.iter().map(|p| decode_one_pickle(p, key)).collect();
    }
    if let Some(p) = map.get(&session_store_key(peer)) {
        return Ok(vec![decode_one_pickle(p, key)?]);
    }
    Ok(vec![])
}

#[cfg(target_os = "android")]
fn persist_sessions_to_map(
    map: &mut HashMap<String, String>,
    peer: &str,
    sessions: &[Session],
    key: &[u8; 32],
) -> Result<(), E2eeError> {
    let pickled: Vec<String> = sessions.iter().map(|s| s.pickle().encrypt(key)).collect();
    let json = serde_json::to_string(&pickled).map_err(|e| E2eeError::Storage(e.to_string()))?;
    map.insert(sessions_store_key(peer), json);
    Ok(())
}

#[cfg(target_os = "android")]
fn write_secrets(path: &std::path::Path, map: &HashMap<String, String>) -> Result<(), E2eeError> {
    let bytes = serde_json::to_vec(map).map_err(|e| E2eeError::Storage(e.to_string()))?;
    std::fs::write(path, bytes).map_err(|e| E2eeError::Storage(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn olm_alice_then_bob_reply() {
        let mut bob = Account::new();
        bob.generate_one_time_keys(1);
        let otk = *bob.one_time_keys().values().next().unwrap();
        let alice = Account::new();
        let mut alice_s = alice.create_outbound_session(SessionConfig::version_1(), bob.curve25519_key(), otk);
        bob.mark_keys_as_published();
        let msg = alice_s.encrypt("hello bob");
        let OlmMessage::PreKey(pre) = &msg else { panic!("expected prekey") };
        let result = bob.create_inbound_session(alice.curve25519_key(), pre).unwrap();
        assert_eq!(result.plaintext, b"hello bob");
        let mut bob_s = result.session;
        let reply = bob_s.encrypt("hello alice");
        let pt = alice_s.decrypt(&reply).unwrap();
        assert_eq!(pt, b"hello alice");
    }

    #[test]
    fn dual_outbound_keeps_both_sessions() {
        let mut alice = Account::new();
        let mut bob = Account::new();
        alice.generate_one_time_keys(1);
        bob.generate_one_time_keys(1);
        let alice_otk = *alice.one_time_keys().values().next().unwrap();
        let bob_otk = *bob.one_time_keys().values().next().unwrap();
        alice.mark_keys_as_published();
        bob.mark_keys_as_published();
        let mut alice_out =
            alice.create_outbound_session(SessionConfig::version_1(), bob.curve25519_key(), bob_otk);
        let mut bob_out = bob.create_outbound_session(
            SessionConfig::version_1(),
            alice.curve25519_key(),
            alice_otk,
        );
        let m_ab = alice_out.encrypt("from alice");
        let m_ba = bob_out.encrypt("from bob");
        let OlmMessage::PreKey(pre_ab) = &m_ab else { panic!("prekey") };
        let OlmMessage::PreKey(pre_ba) = &m_ba else { panic!("prekey") };
        let alice_in = alice
            .create_inbound_session(bob.curve25519_key(), pre_ba)
            .unwrap();
        let bob_in = bob
            .create_inbound_session(alice.curve25519_key(), pre_ab)
            .unwrap();
        assert_eq!(alice_in.plaintext, b"from bob");
        assert_eq!(bob_in.plaintext, b"from alice");
        let mut alice_in_s = alice_in.session;
        let reply = alice_in_s.encrypt("alice reply");
        assert_eq!(bob_out.decrypt(&reply).unwrap(), b"alice reply");
        let mut bob_in_s = bob_in.session;
        let reply2 = bob_in_s.encrypt("bob reply");
        assert_eq!(alice_out.decrypt(&reply2).unwrap(), b"bob reply");
    }
}
