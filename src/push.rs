//! Android push notifications via FCM HTTP v1.
//!
//! Data-only by design: this server cannot read E2EE message bodies, so it
//! never sends a `notification` block. Each push carries only ids plus the
//! sender's display name, and the Android client fetches the message, decrypts
//! it locally and posts the notification itself. That also sidesteps FCM's 4KB
//! payload ceiling, which message bodies (up to 64KB) can exceed.
//!
//! Unconfigured is a supported state: with no service account in the
//! environment every send is a no-op, so the server runs identically in local
//! development and in a deployment that hasn't set up Firebase yet.

use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
/// Google's access tokens last an hour; refresh early so an in-flight send
/// never races the expiry.
const TOKEN_REFRESH_SKEW_SECS: i64 = 300;
const JWT_TTL_SECS: i64 = 3600;

/// The subset of a Firebase service-account JSON key that we need.
#[derive(Clone, Deserialize)]
pub struct ServiceAccount {
    pub project_id: String,
    pub client_email: String,
    /// PEM-encoded RSA private key (PKCS#8, `-----BEGIN PRIVATE KEY-----`).
    pub private_key: String,
}

/// Hand-written so the private key can't reach a log. Config derives Debug and
/// is printable as a whole, so a derived impl here would leak the signing key
/// the first time anyone dumped the config.
impl std::fmt::Debug for ServiceAccount {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServiceAccount")
            .field("project_id", &self.project_id)
            .field("client_email", &self.client_email)
            .field("private_key", &"<redacted>")
            .finish()
    }
}

impl ServiceAccount {
    /// Accepts either raw JSON or base64-encoded JSON — hosting panels vary in
    /// how well they tolerate multi-line secrets, so both are allowed.
    pub fn parse(raw: &str) -> Result<Self, String> {
        let trimmed = raw.trim();
        let json = if trimmed.starts_with('{') {
            trimmed.to_string()
        } else {
            let bytes = B64
                .decode(trimmed.as_bytes())
                .map_err(|e| format!("not JSON and not valid base64: {e}"))?;
            String::from_utf8(bytes).map_err(|e| format!("base64 did not decode to UTF-8: {e}"))?
        };
        serde_json::from_str(&json).map_err(|e| format!("malformed service account JSON: {e}"))
    }
}

#[derive(Serialize)]
struct JwtClaims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: i64,
    exp: i64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
}

struct CachedToken {
    value: String,
    /// Unix seconds at which this token should no longer be used.
    expires_at: i64,
}

/// Outcome of a single send, so the caller can prune tokens FCM has retired.
enum SendOutcome {
    Delivered,
    /// FCM says this token is dead — drop it from the database.
    Unregistered,
    Failed(String),
}

pub struct Push {
    account: Option<ServiceAccount>,
    http: reqwest::Client,
    token: RwLock<Option<CachedToken>>,
}

/// What the Android client needs to build a notification after it decrypts.
pub struct PushMessage {
    pub chat_id: Uuid,
    pub message_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
}

impl Push {
    pub fn new(account: Option<ServiceAccount>) -> Self {
        if let Some(acct) = &account {
            tracing::info!(project = %acct.project_id, "FCM push enabled");
        } else {
            tracing::info!("FCM push disabled (FCM_SERVICE_ACCOUNT unset)");
        }
        Self {
            account,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest client"),
            token: RwLock::new(None),
        }
    }

    pub fn enabled(&self) -> bool {
        self.account.is_some()
    }

    /// Mint or reuse an OAuth2 access token for the FCM scope.
    async fn access_token(&self, account: &ServiceAccount) -> Result<String, String> {
        let now = chrono::Utc::now().timestamp();
        if let Some(cached) = self.token.read().await.as_ref() {
            if cached.expires_at > now {
                return Ok(cached.value.clone());
            }
        }

        let claims = JwtClaims {
            iss: &account.client_email,
            scope: FCM_SCOPE,
            aud: TOKEN_ENDPOINT,
            iat: now,
            exp: now + JWT_TTL_SECS,
        };
        let key = jsonwebtoken::EncodingKey::from_rsa_pem(account.private_key.as_bytes())
            .map_err(|e| format!("service account private_key is not a usable RSA PEM: {e}"))?;
        let assertion = jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
            &claims,
            &key,
        )
        .map_err(|e| format!("signing the auth JWT failed: {e}"))?;

        let res = self
            .http
            .post(TOKEN_ENDPOINT)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", &assertion),
            ])
            .send()
            .await
            .map_err(|e| format!("token request failed: {e}"))?;
        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("token endpoint returned {status}: {body}"));
        }
        let parsed: TokenResponse =
            res.json().await.map_err(|e| format!("malformed token response: {e}"))?;

        *self.token.write().await = Some(CachedToken {
            value: parsed.access_token.clone(),
            expires_at: now + parsed.expires_in - TOKEN_REFRESH_SKEW_SECS,
        });
        Ok(parsed.access_token)
    }

    async fn send_one(
        &self,
        account: &ServiceAccount,
        access_token: &str,
        device_token: &str,
        msg: &PushMessage,
    ) -> SendOutcome {
        // All FCM data values must be strings, and there is deliberately no
        // `notification` block: a data-only message wakes the client so it can
        // decrypt and post the notification itself. HIGH priority is required
        // for a data-only push to be delivered promptly while the app is
        // backgrounded or the device is dozing.
        let body = serde_json::json!({
            "message": {
                "token": device_token,
                "data": {
                    "kind": "message",
                    "chatId": msg.chat_id.to_string(),
                    "messageId": msg.message_id.to_string(),
                    "senderId": msg.sender_id.to_string(),
                    "senderName": msg.sender_name,
                },
                "android": { "priority": "HIGH" },
            }
        });

        let url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            account.project_id
        );
        let res = match self.http.post(&url).bearer_auth(access_token).json(&body).send().await {
            Ok(res) => res,
            Err(e) => return SendOutcome::Failed(format!("request failed: {e}")),
        };

        if res.status().is_success() {
            return SendOutcome::Delivered;
        }
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        // 404 UNREGISTERED (app uninstalled / token rotated) and the
        // INVALID_ARGUMENT that a malformed token produces are both permanent
        // — retrying either one will never succeed, so the row should go.
        if status == reqwest::StatusCode::NOT_FOUND || text.contains("UNREGISTERED") {
            SendOutcome::Unregistered
        } else if status == reqwest::StatusCode::BAD_REQUEST && text.contains("INVALID_ARGUMENT") {
            SendOutcome::Unregistered
        } else {
            SendOutcome::Failed(format!("FCM returned {status}: {text}"))
        }
    }

    /// Push to every registered device of `user_ids`, pruning dead tokens.
    /// Errors are logged rather than returned: a failed notification must
    /// never fail the message send that triggered it.
    pub async fn notify_users(&self, db: &sqlx::PgPool, user_ids: &[Uuid], msg: PushMessage) {
        let Some(account) = &self.account else { return };
        if user_ids.is_empty() {
            return;
        }

        let tokens: Vec<String> =
            match sqlx::query_scalar("SELECT token FROM device_tokens WHERE user_id = ANY($1)")
                .bind(user_ids)
                .fetch_all(db)
                .await
            {
                Ok(t) => t,
                Err(e) => {
                    tracing::warn!(error = %e, "could not load device tokens");
                    return;
                }
            };
        if tokens.is_empty() {
            return;
        }

        let access_token = match self.access_token(account).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(error = %e, "FCM auth failed, dropping notifications");
                return;
            }
        };

        let mut dead: Vec<String> = Vec::new();
        for token in &tokens {
            match self.send_one(account, &access_token, token, &msg).await {
                SendOutcome::Delivered => {}
                SendOutcome::Unregistered => dead.push(token.clone()),
                SendOutcome::Failed(e) => tracing::warn!(error = %e, "push send failed"),
            }
        }

        if !dead.is_empty() {
            tracing::info!(count = dead.len(), "pruning unregistered device tokens");
            if let Err(e) = sqlx::query("DELETE FROM device_tokens WHERE token = ANY($1)")
                .bind(&dead)
                .execute(db)
                .await
            {
                tracing::warn!(error = %e, "could not prune device tokens");
            }
        }
    }
}

/// Convenience for the fanout path: fire the pushes on a background task so
/// the HTTP response to the sender doesn't wait on Google.
pub fn notify_detached(
    push: Arc<Push>,
    db: sqlx::PgPool,
    user_ids: Vec<Uuid>,
    msg: PushMessage,
) {
    if !push.enabled() || user_ids.is_empty() {
        return;
    }
    tokio::spawn(async move {
        push.notify_users(&db, &user_ids, msg).await;
    });
}
