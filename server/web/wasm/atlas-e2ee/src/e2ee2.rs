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

static ACCOUNT: Mutex<Option<Account>> = Mutex::new(None);
static SESSIONS: Mutex<Option<HashMap<String, Session>>> = Mutex::new(None);

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

fn persist_session(peer: &str, session: &Session) -> Result<(), E2eeError> {
    let key = pickle_key()?;
    crate::store::secret_set(session_store_key(peer), session.pickle().encrypt(&key)).map_err(E2eeError::Storage)
}

fn take_session(peer: &str) -> Result<Option<Session>, E2eeError> {
    let mut cache = SESSIONS.lock().unwrap_or_else(|p| p.into_inner());
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.remove(peer) {
        return Ok(Some(s));
    }
    drop(cache);
    let key = pickle_key()?;
    if let Some(p) = crate::store::secret_get(session_store_key(peer)).map_err(E2eeError::Storage)? {
        let pickle = SessionPickle::from_encrypted(&p, &key).map_err(|e| E2eeError::Storage(e.to_string()))?;
        Ok(Some(Session::from_pickle(pickle)))
    } else {
        Ok(None)
    }
}

fn put_session(peer: &str, session: Session) -> Result<(), E2eeError> {
    persist_session(peer, &session)?;
    SESSIONS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get_or_insert_with(HashMap::new)
        .insert(peer.to_string(), session);
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
    put_session(&peer, session)
}

pub fn e2ee2_encrypt(peer: String, plaintext: String) -> Result<String, E2eeError> {
    let mut session = take_session(&peer)?.ok_or_else(|| E2eeError::Bad("no olm session for peer".into()))?;
    let msg = session.encrypt(plaintext);
    put_session(&peer, session)?;
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
    if let Some(mut session) = take_session(&peer)? {
        match session.decrypt(&msg) {
            Ok(pt) => {
                put_session(&peer, session)?;
                return String::from_utf8(pt).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()));
            }
            Err(_) => {
                if let OlmMessage::PreKey(pre) = &msg {
                    return inbound(&peer, pre);
                }
                return Err(E2eeError::Decrypt);
            }
        }
    }
    if let OlmMessage::PreKey(pre) = &msg {
        inbound(&peer, pre)
    } else {
        Err(E2eeError::Bad("no session and not a pre-key message".into()))
    }
}

fn inbound(peer: &str, pre: &PreKeyMessage) -> Result<String, E2eeError> {
    let mut account = take_account()?;
    let result = account
        .create_inbound_session(pre.identity_key(), pre)
        .map_err(|e| E2eeError::Bad(e.to_string()))?;
    put_account(account)?;
    put_session(peer, result.session)?;
    String::from_utf8(result.plaintext).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}

pub fn e2ee2_has_session(peer: String) -> Result<bool, E2eeError> {
    if let Some(s) = take_session(&peer)? {
        put_session(&peer, s)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn e2ee2_fingerprint(bundle: PublicBundle) -> Result<String, E2eeError> {
    crate::e2ee::e2ee_fingerprint(bundle.identity_key)
}
