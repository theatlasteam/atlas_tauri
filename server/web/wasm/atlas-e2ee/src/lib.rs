//! Browser build of Atlas E2EE — the same algorithms as `src-tauri/src/e2ee.rs`
//! and `e2ee2.rs`, compiled to WASM so the PWA does not keep a second protocol.

use wasm_bindgen::prelude::*;

mod e2ee;
mod e2ee2;
mod e2ee_megolm;
mod store;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn store_hydrate(json: &str) {
    store::hydrate(json);
}

#[wasm_bindgen]
pub fn store_dump() -> String {
    store::dump()
}

fn err(e: e2ee::E2eeError) -> JsError {
    JsError::new(&e.to_string())
}

#[wasm_bindgen]
pub fn e2ee_public_key() -> Result<String, JsError> {
    e2ee::e2ee_public_key().map_err(err)
}

#[wasm_bindgen]
pub fn e2ee_fingerprint(public_key: String) -> Result<String, JsError> {
    e2ee::e2ee_fingerprint(public_key).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee_seal(peer_public_key: String, plaintext: String) -> Result<String, JsError> {
    e2ee::e2ee_seal(peer_public_key, plaintext).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee_open(peer_public_key: String, body: String) -> Result<String, JsError> {
    e2ee::e2ee_open(peer_public_key, body).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_bundle() -> Result<String, JsError> {
    let b = e2ee2::e2ee2_bundle().map_err(err)?;
    serde_json::to_string(&b).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn e2ee2_new_prekeys(count: u32) -> Result<String, JsError> {
    let p = e2ee2::e2ee2_new_prekeys(count).map_err(err)?;
    serde_json::to_string(&p).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn e2ee2_start_session(
    peer: String,
    bundle_json: String,
    one_time_prekey: Option<String>,
) -> Result<(), JsError> {
    let bundle: e2ee2::PublicBundle =
        serde_json::from_str(&bundle_json).map_err(|e| JsError::new(&e.to_string()))?;
    e2ee2::e2ee2_start_session(peer, bundle, one_time_prekey).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_encrypt(peer: String, plaintext: String) -> Result<String, JsError> {
    e2ee2::e2ee2_encrypt(peer, plaintext).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_decrypt(peer: String, body: String) -> Result<String, JsError> {
    e2ee2::e2ee2_decrypt(peer, body).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_has_session(peer: String) -> Result<bool, JsError> {
    e2ee2::e2ee2_has_session(peer).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_remote_identity(peer: String) -> Result<String, JsError> {
    Ok(e2ee2::e2ee2_remote_identity(peer).map_err(err)?.unwrap_or_default())
}

#[wasm_bindgen]
pub fn e2ee2_forget_peer(peer: String) -> Result<(), JsError> {
    e2ee2::e2ee2_forget_peer(peer).map_err(err)
}

#[wasm_bindgen]
pub fn e2ee2_fingerprint(bundle_json: String) -> Result<String, JsError> {
    let bundle: e2ee2::PublicBundle =
        serde_json::from_str(&bundle_json).map_err(|e| JsError::new(&e.to_string()))?;
    e2ee2::e2ee2_fingerprint(bundle).map_err(err)
}

#[wasm_bindgen]
pub fn megolm_encrypt(chat_id: String, plaintext: String) -> Result<String, JsError> {
    let s = e2ee_megolm::megolm_encrypt(chat_id, plaintext).map_err(err)?;
    serde_json::to_string(&s).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn megolm_import_key(
    chat_id: String,
    sender_id: String,
    session_id: String,
    session_key: String,
) -> Result<(), JsError> {
    e2ee_megolm::megolm_import_key(chat_id, sender_id, session_id, session_key).map_err(err)
}

#[wasm_bindgen]
pub fn megolm_decrypt(
    chat_id: String,
    sender_id: String,
    session_id: String,
    ciphertext: String,
) -> Result<String, JsError> {
    e2ee_megolm::megolm_decrypt(chat_id, sender_id, session_id, ciphertext).map_err(err)
}
