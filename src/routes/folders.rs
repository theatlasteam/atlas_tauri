use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::FolderDto;
use crate::state::AppState;

pub async fn list_folders(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<FolderDto>>> {
    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, name FROM folders WHERE user_id = $1 ORDER BY position, created_at",
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(|(id, name)| FolderDto { id, name }).collect()))
}

#[derive(Deserialize)]
pub struct CreateFolderPayload {
    name: String,
}

pub async fn create_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<CreateFolderPayload>,
) -> ApiResult<Json<FolderDto>> {
    let name = payload.name.trim().to_string();
    if name.is_empty() || name.len() > 40 {
        return Err(AppError::BadRequest("folder name must be 1-40 characters".into()));
    }
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO folders (id, user_id, name) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(auth.user_id)
        .bind(&name)
        .execute(&state.db)
        .await?;
    Ok(Json(FolderDto { id, name }))
}

pub async fn delete_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(folder_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM folders WHERE id = $1 AND user_id = $2")
        .bind(folder_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn add_chat_to_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((folder_id, chat_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<serde_json::Value>> {
    // Both legs authorized in one statement: the folder must be mine and the
    // chat must be one I'm a member of.
    let res = sqlx::query(
        "INSERT INTO folder_chats (folder_id, chat_id)
         SELECT f.id, cm.chat_id FROM folders f
         JOIN chat_members cm ON cm.chat_id = $2 AND cm.user_id = $3
         WHERE f.id = $1 AND f.user_id = $3
         ON CONFLICT DO NOTHING",
    )
    .bind(folder_id)
    .bind(chat_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        // Distinguish "already there" (fine) from "not yours" (404).
        let owned: bool = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM folder_chats fc
                JOIN folders f ON f.id = fc.folder_id
                WHERE fc.folder_id = $1 AND fc.chat_id = $2 AND f.user_id = $3)",
        )
        .bind(folder_id)
        .bind(chat_id)
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;
        if !owned {
            return Err(AppError::NotFound);
        }
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove_chat_from_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((folder_id, chat_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query(
        "DELETE FROM folder_chats fc USING folders f
         WHERE fc.folder_id = f.id AND f.user_id = $3
           AND fc.folder_id = $1 AND fc.chat_id = $2",
    )
    .bind(folder_id)
    .bind(chat_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "ok": true })))
}
