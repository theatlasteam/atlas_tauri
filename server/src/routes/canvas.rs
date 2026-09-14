use axum::extract::{Path, State};
use axum::Json;
use serde::Serialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDto {
    pub id: Uuid,
    pub creator_id: Option<Uuid>,
}

pub async fn create(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<CanvasDto>> {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO canvases (id, creator_id) VALUES ($1, $2)")
        .bind(id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(CanvasDto {
        id,
        creator_id: Some(auth.user_id),
    }))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<CanvasDto>> {
    let row: Option<(Uuid, Option<Uuid>)> =
        sqlx::query_as("SELECT id, creator_id FROM canvases WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let Some((id, creator_id)) = row else {
        return Err(AppError::NotFound);
    };
    Ok(Json(CanvasDto { id, creator_id }))
}