//! E2EE key distribution.
//!
//! The server's entire role in end-to-end encryption is (a) a bulletin board
//! for public identity keys, (b) a one-time-use dispenser of key packages
//! (MLS KeyPackages / X3DH prekey bundles — opaque bytes to us), and (c) an
//! opaque ciphertext transport (the normal message path with a non-"plain"
//! scheme). Private keys never exist server-side, so a full server compromise
//! yields ciphertext and public keys only.
//!
//! Trust caveat clients must handle: a malicious *server* could hand out a
//! substituted identity key (MITM). That is inherent to any centralized key
//! directory — the mitigation is client-side fingerprint/safety-number
//! verification, not anything the server can do for itself.

use axum::extract::{Path, State};
use axum::Json;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

const MAX_PACKAGE_BYTES: usize = 8 * 1024;
const MAX_PACKAGES_PER_UPLOAD: usize = 100;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishIdentityPayload {
    /// base64 public identity key.
    identity_key: String,
}

pub async fn publish_identity(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<PublishIdentityPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let key = B64
        .decode(&payload.identity_key)
        .map_err(|_| AppError::BadRequest("identityKey must be base64".into()))?;
    if key.is_empty() || key.len() > 256 {
        return Err(AppError::BadRequest("identity key size out of range".into()));
    }
    // First write wins; rotating an identity key resets peers' trust and must
    // be an explicit, noisy operation — not a silent overwrite an attacker
    // with a stolen session token could use to MITM future conversations.
    let res = sqlx::query(
        "UPDATE users SET identity_key = $2
         WHERE id = $1 AND (identity_key IS NULL OR identity_key = $2)",
    )
    .bind(auth.user_id)
    .bind(&key)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "identity key already published; rotation requires re-registration".into(),
        ));
    }
    Ok(Json(json!({ "ok": true })))
}

/// Explicit, self-service escape hatch for "this device's local identity no
/// longer matches what's published" (reinstall, factory reset, lost device):
/// clears the caller's own published key so their next `publish_identity`
/// call succeeds instead of 409ing forever. Deliberately requires the caller
/// to already be authenticated as themselves — this is "I know my device and
/// the server disagree, let me fix it", not a way to reset anyone else's.
///
/// This is real, noisy rotation, not the silent-overwrite `publish_identity`
/// refuses: every peer's cached copy of the old key goes stale and DMs sent
/// in the meantime (before they refetch) will fail to decrypt. That's the
/// tradeoff for having a recovery path at all.
pub async fn reset_identity(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE users SET identity_key = NULL WHERE id = $1")
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityResponse {
    user_id: Uuid,
    identity_key: Option<String>,
}

pub async fn get_identity(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<IdentityResponse>> {
    let key: Option<Option<Vec<u8>>> =
        sqlx::query_scalar("SELECT identity_key FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    let key = key.ok_or(AppError::NotFound)?;
    Ok(Json(IdentityResponse { user_id, identity_key: key.map(|k| B64.encode(k)) }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadPackagesPayload {
    device_id: String,
    /// base64-encoded opaque key packages.
    packages: Vec<String>,
}

pub async fn upload_packages(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<UploadPackagesPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    if payload.device_id.is_empty() || payload.device_id.len() > 64 {
        return Err(AppError::BadRequest("deviceId must be 1-64 chars".into()));
    }
    if payload.packages.is_empty() || payload.packages.len() > MAX_PACKAGES_PER_UPLOAD {
        return Err(AppError::BadRequest(format!(
            "must upload 1..={MAX_PACKAGES_PER_UPLOAD} packages"
        )));
    }
    let mut decoded = Vec::with_capacity(payload.packages.len());
    for p in &payload.packages {
        let bytes = B64
            .decode(p)
            .map_err(|_| AppError::BadRequest("packages must be base64".into()))?;
        if bytes.is_empty() || bytes.len() > MAX_PACKAGE_BYTES {
            return Err(AppError::BadRequest("package size out of range".into()));
        }
        decoded.push(bytes);
    }

    let mut tx = state.db.begin().await?;
    for bytes in decoded {
        sqlx::query(
            "INSERT INTO key_packages (id, user_id, device_id, package) VALUES ($1, $2, $3, $4)",
        )
        .bind(Uuid::new_v4())
        .bind(auth.user_id)
        .bind(&payload.device_id)
        .bind(&bytes)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedPackage {
    user_id: Uuid,
    device_id: String,
    package: String,
}

/// Claim (consume) one unclaimed key package of a user. `FOR UPDATE SKIP
/// LOCKED` makes concurrent claims race-free without serializing them: two
/// simultaneous claimers atomically get two different packages.
pub async fn claim_package(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<ClaimedPackage>> {
    let row: Option<(String, Vec<u8>)> = sqlx::query_as(
        "UPDATE key_packages SET claimed_at = now()
         WHERE id = (
            SELECT id FROM key_packages
            WHERE user_id = $1 AND claimed_at IS NULL
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         RETURNING device_id, package",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    let (device_id, package) = row.ok_or(AppError::NotFound)?;
    Ok(Json(ClaimedPackage { user_id, device_id, package: B64.encode(package) }))
}

// ---------- E2EE v2 prekey bundles ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBundlePayload {
    /// base64 X25519 identity public key.
    identity_key: String,
    /// base64 Ed25519 identity public key.
    signing_key: String,
    /// base64 X25519 signed prekey public.
    signed_prekey: String,
    signed_prekey_id: i32,
    /// base64 Ed25519 signature over the signed prekey bytes.
    signed_prekey_sig: String,
}

fn decode_bounded(b64: &str, max: usize, what: &str) -> Result<Vec<u8>, AppError> {
    let bytes = B64
        .decode(b64)
        .map_err(|_| AppError::BadRequest(format!("{what} must be base64")))?;
    if bytes.is_empty() || bytes.len() > max {
        return Err(AppError::BadRequest(format!("{what} size out of range")));
    }
    Ok(bytes)
}

/// Publish (or refresh) the caller's prekey bundle. Unlike the raw identity
/// key, a bundle refresh is normal operation: the signed prekey rotates and
/// the new one is authenticated by the long-term Ed25519 signing key, so an
/// attacker with a session token still cannot substitute it silently — the
/// signature check on the client would fail.
pub async fn publish_bundle(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<PublishBundlePayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let identity_key = decode_bounded(&payload.identity_key, 64, "identityKey")?;
    let signing_key = decode_bounded(&payload.signing_key, 64, "signingKey")?;
    let signed_prekey = decode_bounded(&payload.signed_prekey, 64, "signedPrekey")?;
    let signed_prekey_sig = decode_bounded(&payload.signed_prekey_sig, 128, "signedPrekeySig")?;

    // Long-term signing identity is immutable once set (same rule as the v1
    // identity key) — rotation is an explicit reset, not a silent overwrite.
    let res = sqlx::query(
        "INSERT INTO prekey_bundles (user_id, identity_key, signing_key, signed_prekey, signed_prekey_id, signed_prekey_sig, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (user_id) DO UPDATE SET
            identity_key = EXCLUDED.identity_key,
            signing_key = EXCLUDED.signing_key,
            signed_prekey = EXCLUDED.signed_prekey,
            signed_prekey_id = EXCLUDED.signed_prekey_id,
            signed_prekey_sig = EXCLUDED.signed_prekey_sig,
            updated_at = now()
         WHERE prekey_bundles.identity_key = EXCLUDED.identity_key
            OR prekey_bundles.signing_key = EXCLUDED.signing_key",
    )
    .bind(auth.user_id)
    .bind(&identity_key)
    .bind(&signing_key)
    .bind(&signed_prekey)
    .bind(payload.signed_prekey_id)
    .bind(&signed_prekey_sig)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "identity already published with different keys; rotation requires a reset".into(),
        ));
    }
    // Keep the legacy v1 identity column populated from the bundle so older
    // builds at least see a key exists.
    sqlx::query("UPDATE users SET identity_key = $2 WHERE id = $1 AND identity_key IS NULL")
        .bind(auth.user_id)
        .bind(&identity_key)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleResponse {
    user_id: Uuid,
    identity_key: String,
    signing_key: String,
    signed_prekey: String,
    signed_prekey_id: i32,
    signed_prekey_sig: String,
}

pub async fn get_bundle(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<BundleResponse>> {
    let row: Option<(Vec<u8>, Vec<u8>, Vec<u8>, i32, Vec<u8>)> = sqlx::query_as(
        "SELECT identity_key, signing_key, signed_prekey, signed_prekey_id, signed_prekey_sig
         FROM prekey_bundles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    let (ik, sk, spk, spk_id, sig) = row.ok_or(AppError::NotFound)?;
    Ok(Json(BundleResponse {
        user_id,
        identity_key: B64.encode(ik),
        signing_key: B64.encode(sk),
        signed_prekey: B64.encode(spk),
        signed_prekey_id: spk_id,
        signed_prekey_sig: B64.encode(sig),
    }))
}

/// Explicit reset of the caller's bundle (reinstall/lost device). Noisy for
/// the same reason as reset_identity: peers' sessions break until they
/// re-establish with the new identity.
pub async fn reset_bundle(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM prekey_bundles WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    sqlx::query("DELETE FROM key_packages WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageCount {
    available: i64,
}

/// Clients poll this to know when to replenish their one-time packages.
pub async fn package_count(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<PackageCount>> {
    let available: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM key_packages WHERE user_id = $1 AND claimed_at IS NULL",
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(PackageCount { available }))
}
