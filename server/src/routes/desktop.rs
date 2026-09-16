//! Owner-facing desktop API: view a Mind's screen, hand control back and forth.
//!
//! * `GET /api/desktop/shot/{token}` — public PNG serve for the vision
//!   gateway (token is the auth; 10-minute TTL).
//! * `GET /api/minds/{id}/desktop` — ensure the Mind's screen exists and get
//!   its viewer URL + control state. Opening the viewer boots the screen.
//! * `POST /api/minds/{id}/desktop/takeover` — owner takes exclusive control
//!   (accepting the Mind's request, or seizing it); Mind input is refused
//!   until `…/release` hands the screen back.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue};
use axum::Json;
use serde::Serialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::UserRow;
use crate::state::AppState;

async fn load_me(state: &AppState, id: Uuid) -> Result<UserRow, AppError> {
    sqlx::query_as::<_, UserRow>(&format!("SELECT {} FROM users WHERE id = $1", crate::auth::USER_COLUMNS))
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)
}

fn require_x(user: &UserRow) -> Result<(), AppError> {
    if user.atlas_x || user.verified || user.handle == "atlas" {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn own_mind(state: &AppState, owner: Uuid, mind_id: Uuid) -> Result<(), AppError> {
    let owned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM minds WHERE id = $1 AND owner_id = $2)")
        .bind(mind_id)
        .bind(owner)
        .fetch_one(&state.db)
        .await?;
    if owned {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

/// A stored capture, served publicly. The random token is the only auth —
/// it lives 10 minutes and is never logged or listed anywhere.
pub async fn serve_shot(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<(HeaderMap, Vec<u8>), AppError> {
    if token.len() != 32 || !token.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::NotFound);
    }
    match crate::desktop::take_shot(&state, &token) {
        Some(png) => {
            let mut headers = HeaderMap::new();
            headers.insert("content-type", HeaderValue::from_static("image/png"));
            headers.insert("cache-control", HeaderValue::from_static("no-store"));
            Ok((headers, png))
        }
        None => Err(AppError::NotFound),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    pub display_num: i64,
    /// Relative noVNC path on this server (proxied to the display's
    /// websockify; proxied socket itself lands next).
    pub novnc_path: String,
    pub control: String,
    pub takeover_request: Option<String>,
}

pub async fn get_desktop(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(mind_id): Path<Uuid>,
) -> ApiResult<Json<DesktopInfo>> {
    let me = load_me(&state, auth.user_id).await?;
    require_x(&me)?;
    own_mind(&state, auth.user_id, mind_id).await?;
    let (num, _, _) = crate::desktop::ensure_display(&state, auth.user_id, mind_id).await?;
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT control, takeover_request FROM desktop_displays WHERE mind_id = $1",
    )
    .bind(mind_id)
    .fetch_optional(&state.db)
    .await?;
    let (control, takeover_request) = row.unwrap_or_else(|| ("mind".into(), None));
    Ok(Json(DesktopInfo {
        display_num: num,
        novnc_path: format!("/api/desktop/vnc/{mind_id}"),
        control,
        takeover_request,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlState {
    pub control: String,
}

/// Owner takes the screen: Mind input is refused from now on, so a password
/// or a fiddly dialog can't get double-driven.
pub async fn takeover(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(mind_id): Path<Uuid>,
) -> ApiResult<Json<ControlState>> {
    let me = load_me(&state, auth.user_id).await?;
    require_x(&me)?;
    own_mind(&state, auth.user_id, mind_id).await?;
    sqlx::query(
        "UPDATE desktop_displays SET control = 'owner', takeover_request = NULL WHERE mind_id = $1",
    )
    .bind(mind_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ControlState { control: "owner".into() }))
}

/// Owner hands the screen back to the Mind.
pub async fn release(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(mind_id): Path<Uuid>,
) -> ApiResult<Json<ControlState>> {
    let me = load_me(&state, auth.user_id).await?;
    require_x(&me)?;
    own_mind(&state, auth.user_id, mind_id).await?;
    sqlx::query("UPDATE desktop_displays SET control = 'mind' WHERE mind_id = $1")
        .bind(mind_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ControlState { control: "mind".into() }))
}
