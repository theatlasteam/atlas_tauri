//! Atlas Spaces — self-contained HTML mini-apps Compass (or a remix) generated.
//! Rendered in a sandboxed iframe; this module only stores and serves them.

use axum::extract::{Path, State};
use axum::response::{Html, IntoResponse};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

const MAX_HTML_BYTES: usize = 400_000;
const MAX_TITLE: usize = 80;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDto {
    pub id: Uuid,
    pub title: String,
    pub html: String,
    pub creator_id: Uuid,
    pub parent_space_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpace {
    pub title: Option<String>,
    pub html: String,
    pub parent_space_id: Option<Uuid>,
}

fn sanitize_title(raw: Option<String>) -> String {
    let t = raw.unwrap_or_default();
    let t = t.trim();
    if t.is_empty() {
        "Space".into()
    } else {
        t.chars().take(MAX_TITLE).collect()
    }
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateSpace>,
) -> ApiResult<Json<SpaceDto>> {
    if body.html.len() > MAX_HTML_BYTES || body.html.trim().is_empty() {
        return Err(AppError::BadRequest("html must be 1..=400kB".into()));
    }
    let title = sanitize_title(body.title);
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, (Uuid, String, String, Uuid, Option<Uuid>, chrono::DateTime<chrono::Utc>)>(
        "INSERT INTO spaces (id, creator_id, parent_space_id, html, title)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, html, creator_id, parent_space_id, created_at",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(body.parent_space_id)
    .bind(&body.html)
    .bind(&title)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(SpaceDto {
        id: row.0,
        title: row.1,
        html: row.2,
        creator_id: row.3,
        parent_space_id: row.4,
        created_at: row.5,
    }))
}

async fn fetch_space(state: &AppState, id: Uuid) -> ApiResult<SpaceDto> {
    let row = sqlx::query_as::<_, (Uuid, String, String, Uuid, Option<Uuid>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, title, html, creator_id, parent_space_id, created_at FROM spaces WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(SpaceDto {
        id: row.0,
        title: row.1,
        html: row.2,
        creator_id: row.3,
        parent_space_id: row.4,
        created_at: row.5,
    })
}

pub async fn get(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SpaceDto>> {
    Ok(Json(fetch_space(&state, id).await?))
}

/// Share link — UUID is the capability. Anyone with the id can view.
pub async fn get_public(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SpaceDto>> {
    Ok(Json(fetch_space(&state, id).await?))
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// JSON string safe to drop inside `<script>` — `<` would close the tag.
fn js_string(s: &str) -> String {
    serde_json::to_string(s)
        .unwrap_or_else(|_| "\"\"".into())
        .replace('<', r"\u003c")
        .replace('\u{2028}', r"\u2028")
        .replace('\u{2029}', r"\u2029")
}

/// Public host for `/s/{id}` — no account. HTML is assigned to `iframe.srcdoc`
/// so it never runs on atlasmsg.app's origin. UUID is the capability.
pub async fn share_page(State(state): State<AppState>, Path(id): Path<Uuid>) -> impl IntoResponse {
    match fetch_space(&state, id).await {
        Ok(space) => {
            let title = esc(&space.title);
            let html_js = js_string(&space.html);
            Html(format!(
                r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>{title}</title>
  <style>
    html, body {{ margin: 0; height: 100%; background: #111; }}
    iframe {{ border: 0; width: 100%; height: 100%; display: block; background: #fff; }}
  </style>
</head>
<body>
  <iframe id="view" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
  <script>document.getElementById("view").srcdoc = {html_js};</script>
</body>
</html>
"##,
                title = title,
                html_js = html_js,
            ))
            .into_response()
        }
        Err(_) => (
            axum::http::StatusCode::NOT_FOUND,
            Html(String::from(
                r#"<!DOCTYPE html><html><body style="font:16px system-ui;padding:2rem">This Space is gone or the link is wrong.</body></html>"#,
            )),
        )
            .into_response(),
    }
}


