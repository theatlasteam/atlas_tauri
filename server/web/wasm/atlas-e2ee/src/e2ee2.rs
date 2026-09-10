//! Browser Olm (vodozemac) — same wire format as src-tauri/src/e2ee2.rs.

use std::collections::HashMap;
use std::sync::Mutex;
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

fn pickle_key() -> Result<[u8; 32], E2eeError> {
    if let Some(b64) = crate::store::secret_get(PICKLE_KEY_KEY).map_err(E2eeError::Storage)? {
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &b64)
            .map_err(|_| E2eeError::Storage("pickle key corrupt".into()))?;
        return bytes
            .try_into()
            .map_err(|_| E2eeError::Storage("pickle key corrupt".into()));
    }
    let mut key = [0u8; 32];
    getrandom::getrandom(&mut key).map_err(|e| E2eeError::Storage(e.to_string()))?;
    crate::store::secret_set(PICKLE_KEY_KEY, b64_encode(key)).map_err(E2eeError::Storage)?;
    Ok(key)
}

fn persist_account(account: &Account) -> Result<(), E2eeError> {
    let key = pickle_key()?;
    crate::store::secret_set(ACCOUNT_KEY, account.pickle().encrypt(&key)).map_err(E2eeError::Storage)
}

fn take_account() -> Result<Account, E2eeError> {
    if let Some(a) = ACCOUNT.lock().unwrap_or_else(|p| p.into_inner()).take() {
        return Ok(a);
    }
    let key = pickle_key()?;
    if let Some(p) = crate::store::secret_get(ACCOUNT_KEY).map_err(E2eeError::Storage)? {
        let pickle = AccountPickle::from_encrypted(&p, &key).map_err(|e| E2eeError::Storage(e.to_string()))?;
        Ok(Account::from_pickle(pickle))
    } else {
        let acc = Account::new();
        persist_account(&acc)?;
        Ok(acc)
    }
}

fn put_account(account: Account) -> Result<(), E2eeError> {
    persist_account(&account)?;
    *ACCOUNT.lock().unwrap_or_else(|p| p.into_inner()) = Some(account);
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

fn decode_one_pickle(p: &str, key: &[u8; 32]) -> Result<Session, E2eeError> {
    let pickle = SessionPickle::from_encrypted(p, key).map_err(|e| E2eeError::Storage(e.to_string()))?;
    Ok(Session::from_pickle(pickle))
}

fn persist_sessions(peer: &str, sessions: &[Session]) -> Result<(), E2eeError> {
    let key = pickle_key()?;
    let pickled: Vec<String> = sessions.iter().map(|s| s.pickle().encrypt(&key)).collect();
    let json = serde_json::to_string(&pickled).map_err(|e| E2eeError::Storage(e.to_string()))?;
    crate::store::secret_set(sessions_store_key(peer), json).map_err(E2eeError::Storage)
}

fn take_sessions(peer: &str) -> Result<Vec<Session>, E2eeError> {
    let mut cache = SESSIONS.lock().unwrap_or_else(|p| p.into_inner());
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.remove(peer) {
        return Ok(s);
    }
    drop(cache);
    let key = pickle_key()?;
    if let Some(raw) = crate::store::secret_get(sessions_store_key(peer)).map_err(E2eeError::Storage)? {
        let pickled: Vec<String> =
            serde_json::from_str(&raw).map_err(|e| E2eeError::Storage(e.to_string()))?;
        return pickled.iter().map(|p| decode_one_pickle(p, &key)).collect();
    }
    if let Some(p) = crate::store::secret_get(session_store_key(peer)).map_err(E2eeError::Storage)? {
        return Ok(vec![decode_one_pickle(&p, &key)?]);
    }
    Ok(vec![])
}

fn put_sessions(peer: &str, mut sessions: Vec<Session>) -> Result<(), E2eeError> {
    if sessions.len() > MAX_SESSIONS_PER_PEER {
        sessions.drain(0..sessions.len() - MAX_SESSIONS_PER_PEER);
    }
    persist_sessions(peer, &sessions)?;
    SESSIONS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
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

pub fn e2ee2_bundle() -> Result<PublicBundle, E2eeError> {
    let account = take_account()?;
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
    put_account(account)?;
    Ok(bundle)
}

pub fn e2ee2_new_prekeys(count: u32) -> Result<Vec<String>, E2eeError> {
    let mut account = take_account()?;
    account.generate_one_time_keys((count as usize).min(100));
    let pubs: Vec<String> = account.one_time_keys().values().map(|k| B64.encode(k.to_bytes())).collect();
    account.mark_keys_as_published();
    put_account(account)?;
    Ok(pubs)
}

pub fn e2ee2_start_session(
    peer: String,
    bundle: PublicBundle,
    one_time_prekey: Option<String>,
) -> Result<(), E2eeError> {
    let otk_b64 = one_time_prekey
        .ok_or_else(|| E2eeError::Bad("olm needs a one-time prekey; peer hasn't uploaded any".into()))?;
    let ik = curve_from_wire(&bundle.identity_key)?;
    let otk = curve_from_wire(&otk_b64)?;
    let account = take_account()?;
    let session = account.create_outbound_session(SessionConfig::version_1(), ik, otk);
    put_account(account)?;
    let mut sessions = take_sessions(&peer)?;
    sessions.push(session);
    put_sessions(&peer, sessions)?;
    crate::store::secret_set(remote_ik_key(&peer), bundle.identity_key).map_err(E2eeError::Storage)
}

pub fn e2ee2_encrypt(peer: String, plaintext: String) -> Result<String, E2eeError> {
    let mut sessions = take_sessions(&peer)?;
    let mut session = sessions
        .pop()
        .ok_or_else(|| E2eeError::Bad("no olm session for peer".into()))?;
    let msg = session.encrypt(plaintext);
    sessions.push(session);
    put_sessions(&peer, sessions)?;
    let json = serde_json::to_vec(&msg).map_err(|e| E2eeError::Bad(e.to_string()))?;
    Ok(B64.encode(json))
}

fn parse_olm_body(body: &str) -> Result<OlmMessage, E2eeError> {
    let json = B64
        .decode(body)
        .unwrap_or_else(|_| body.as_bytes().to_vec());
    serde_json::from_slice(&json).map_err(|e| E2eeError::Bad(e.to_string()))
}

pub fn e2ee2_decrypt(peer: String, body: String) -> Result<String, E2eeError> {
    let msg: OlmMessage = parse_olm_body(&body)?;
    let mut sessions = take_sessions(&peer)?;
    for i in (0..sessions.len()).rev() {
        match sessions[i].decrypt(&msg) {
            Ok(pt) => {
                let used = sessions.remove(i);
                sessions.push(used);
                put_sessions(&peer, sessions)?;
                return String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()));
            }
            Err(_) => continue,
        }
    }
    if let OlmMessage::PreKey(pre) = &msg {
        inbound(&peer, pre, sessions)
    } else {
        let had = !sessions.is_empty();
        put_sessions(&peer, sessions)?;
        Err(if had {
            E2eeError::Decrypt
        } else {
            E2eeError::Bad("no session and not a pre-key message".into())
        })
    }
}

fn inbound(peer: &str, pre: &PreKeyMessage, mut sessions: Vec<Session>) -> Result<String, E2eeError> {
    let mut account = take_account()?;
    let result = account
        .create_inbound_session(pre.identity_key(), pre)
        .map_err(|e| E2eeError::Bad(e.to_string()))?;
    put_account(account)?;
    sessions.push(result.session);
    put_sessions(peer, sessions)?;
    let _ = crate::store::secret_set(remote_ik_key(peer), b64_encode(pre.identity_key().to_bytes()));
    String::from_utf8(result.plaintext).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}

pub fn e2ee2_remote_identity(peer: String) -> Result<Option<String>, E2eeError> {
    crate::store::secret_get(remote_ik_key(&peer)).map_err(E2eeError::Storage)
}

pub fn e2ee2_forget_peer(peer: String) -> Result<(), E2eeError> {
    let _ = take_sessions(&peer);
    SESSIONS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get_or_insert_with(HashMap::new)
        .remove(&peer);
    let _ = crate::store::secret_delete(sessions_store_key(&peer));
    let _ = crate::store::secret_delete(session_store_key(&peer));
    let _ = crate::store::secret_delete(remote_ik_key(&peer));
    Ok(())
}

pub fn e2ee2_has_session(peer: String) -> Result<bool, E2eeError> {
    let sessions = take_sessions(&peer)?;
    let any = !sessions.is_empty();
    put_sessions(&peer, sessions)?;
    Ok(any)
}

pub fn e2ee2_fingerprint(bundle: PublicBundle) -> Result<String, E2eeError> {
    crate::e2ee::e2ee_fingerprint(bundle.identity_key)
}
