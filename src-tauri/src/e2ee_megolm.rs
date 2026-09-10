//! Megolm group ratchet. Scheme on the wire: "megolm-v1".
//! Session keys are shared to members via Olm (see store/e2ee.ts).

use std::collections::HashMap;
use std::sync::Mutex;
use serde::Serialize;
use tauri::AppHandle;
use vodozemac::megolm::{
    GroupSession, GroupSessionPickle, InboundGroupSession, InboundGroupSessionPickle, MegolmMessage,
    SessionConfig, SessionKey,
};

use crate::e2ee::E2eeError;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

const PICKLE_KEY_KEY: &str = "olm_pickle_key";
const OUT_PREFIX: &str = "megolm_out_";
const IN_PREFIX: &str = "megolm_in_";
const ROTATE_AFTER: u32 = 100;

static OUT: Mutex<Option<HashMap<String, GroupSession>>> = Mutex::new(None);
static IN: Mutex<Option<HashMap<String, InboundGroupSession>>> = Mutex::new(None);

fn b64_encode(bytes: impl AsRef<[u8]>) -> String {
    B64.encode(bytes)
}

fn pickle_key(app: &AppHandle) -> Result<[u8; 32], E2eeError> {
    if let Some(b64) = crate::secure::secret_get(app.clone(), PICKLE_KEY_KEY.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let bytes = B64
            .decode(&b64)
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

fn out_key(chat: &str) -> String {
    format!("{OUT_PREFIX}{chat}")
}
fn in_key(chat: &str, sender: &str, session: &str) -> String {
    format!("{IN_PREFIX}{chat}:{sender}:{session}")
}

fn take_out(app: &AppHandle, chat: &str) -> Result<Option<GroupSession>, E2eeError> {
    let mut cache = OUT.lock().unwrap();
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.remove(chat) {
        return Ok(Some(s));
    }
    drop(cache);
    let key = pickle_key(app)?;
    if let Some(p) = crate::secure::secret_get(app.clone(), out_key(chat))
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let pickle = GroupSessionPickle::from_encrypted(&p, &key)
            .map_err(|e| E2eeError::Storage(e.to_string()))?;
        Ok(Some(GroupSession::from_pickle(pickle)))
    } else {
        Ok(None)
    }
}

fn put_out(app: &AppHandle, chat: &str, session: GroupSession) -> Result<(), E2eeError> {
    let key = pickle_key(app)?;
    let pickled = session.pickle().encrypt(&key);
    crate::secure::secret_set(app.clone(), out_key(chat), pickled)
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    OUT.lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(chat.to_string(), session);
    Ok(())
}

fn take_in(app: &AppHandle, k: &str) -> Result<Option<InboundGroupSession>, E2eeError> {
    let mut cache = IN.lock().unwrap();
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some(s) = map.remove(k) {
        return Ok(Some(s));
    }
    drop(cache);
    let key = pickle_key(app)?;
    if let Some(p) = crate::secure::secret_get(app.clone(), k.to_string())
        .map_err(|e| E2eeError::Storage(e.to_string()))?
    {
        let pickle = InboundGroupSessionPickle::from_encrypted(&p, &key)
            .map_err(|e| E2eeError::Storage(e.to_string()))?;
        Ok(Some(InboundGroupSession::from_pickle(pickle)))
    } else {
        Ok(None)
    }
}

fn put_in(app: &AppHandle, k: &str, session: InboundGroupSession) -> Result<(), E2eeError> {
    let key = pickle_key(app)?;
    let pickled = session.pickle().encrypt(&key);
    crate::secure::secret_set(app.clone(), k.to_string(), pickled)
        .map_err(|e| E2eeError::Storage(e.to_string()))?;
    IN.lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(k.to_string(), session);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MegolmSeal {
    pub session_id: String,
    pub ciphertext: String,
    pub session_key: String,
}

#[tauri::command]
pub fn megolm_encrypt(app: AppHandle, chat_id: String, plaintext: String) -> Result<MegolmSeal, E2eeError> {
    let mut session = match take_out(&app, &chat_id)? {
        Some(s) if s.message_index() < ROTATE_AFTER => s,
        _ => GroupSession::new(SessionConfig::version_1()),
    };
    let ciphertext = session.encrypt(plaintext.as_bytes()).to_base64();
    let session_id = session.session_id();
    let session_key = session.session_key().to_base64();
    put_out(&app, &chat_id, session)?;
    Ok(MegolmSeal { session_id, ciphertext, session_key })
}

#[tauri::command]
pub fn megolm_import_key(
    app: AppHandle,
    chat_id: String,
    sender_id: String,
    session_id: String,
    session_key: String,
) -> Result<(), E2eeError> {
    let k = in_key(&chat_id, &sender_id, &session_id);
    if let Some(existing) = take_in(&app, &k)? {
        put_in(&app, &k, existing)?;
        return Ok(());
    }
    let key = SessionKey::from_base64(&session_key).map_err(|e| E2eeError::Bad(e.to_string()))?;
    let inbound = InboundGroupSession::new(&key, SessionConfig::version_1());
    put_in(&app, &k, inbound)
}

#[tauri::command]
pub fn megolm_decrypt(
    app: AppHandle,
    chat_id: String,
    sender_id: String,
    session_id: String,
    ciphertext: String,
) -> Result<String, E2eeError> {
    let k = in_key(&chat_id, &sender_id, &session_id);
    let mut session = take_in(&app, &k)?.ok_or_else(|| E2eeError::Bad("no megolm session".into()))?;
    let msg = MegolmMessage::from_base64(&ciphertext).map_err(|e| E2eeError::Bad(e.to_string()))?;
    let pt = session.decrypt(&msg).map_err(|_| E2eeError::Decrypt)?;
    put_in(&app, &k, session)?;
    String::from_utf8(pt.plaintext).map_err(|_| E2eeError::Bad("plaintext not utf-8".into()))
}
