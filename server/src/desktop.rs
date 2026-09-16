//! Graphical desktops for Minds: one container per owner, one X screen per Mind.
//!
//! Layout: `atlas-desktop-{owner}` runs Xvnc displays `:1..=32`, each with its
//! own Xfce session, Chromium profile, and home (`/home/mind-{n}`), plus a
//! websockify bridge per display for the owner's noVNC viewer. The Mind sees
//! its screen through `desktop_screenshot` (vision) and drives it with the
//! `desktop_*` input tools (xdotool); the owner watches the same screen and
//! can take over exclusive control (see routes::desktop).
//!
//! Disabled unless `DESKTOP_ENABLED=1` — a desktop wants gigabytes this VPS
//! doesn't have. Everything funnels through `ensure_display`, `screenshot`,
//! and `input` so a remote Docker host later means touching only this file.

use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

/// A captured screen, served publicly for a few minutes so the vision
/// gateway can fetch it by https URL.
pub struct DesktopShot {
    pub png: Vec<u8>,
    pub expires: Instant,
}

const SHOT_TTL: Duration = Duration::from_secs(10 * 60);
const MAX_DISPLAYS: i64 = 32;
/// `docker exec` budget for one screen op. Screenshots of a cold Xfce can
/// take a few seconds; input must stay snappy.
const OP_TIMEOUT: Duration = Duration::from_secs(25);

fn require_enabled(state: &AppState) -> Result<(), AppError> {
    if state.cfg.desktop_enabled {
        Ok(())
    } else {
        Err(AppError::BadRequest("graphical desktops are disabled on this server".into()))
    }
}

fn container_name(owner_id: Uuid) -> String {
    format!("atlas-desktop-{}", owner_id.simple())
}

async fn docker(args: &[&str]) -> Result<std::process::Output, AppError> {
    let out = tokio::process::Command::new("docker")
        .args(args)
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/local/bin")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("docker unavailable: {e}")))?;
    Ok(out)
}

/// The Mind's display row: `{display_num, vnc_port, novnc_port}`. Verifies
/// ownership (a Mind only ever reaches its own screen).
pub async fn ensure_display(state: &AppState, owner_id: Uuid, mind_id: Uuid) -> Result<(i64, i64, i64), AppError> {
    require_enabled(state)?;
    let owned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM minds WHERE id = $1 AND owner_id = $2)")
        .bind(mind_id)
        .bind(owner_id)
        .fetch_one(&state.db)
        .await?;
    if !owned {
        return Err(AppError::NotFound);
    }
    if let Some(row) = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT display_num, vnc_port, novnc_port FROM desktop_displays WHERE mind_id = $1",
    )
    .bind(mind_id)
    .fetch_optional(&state.db)
    .await?
    {
        ensure_container(state, owner_id).await?;
        start_display(state, owner_id, row.0).await?;
        return Ok(row);
    }
    // Lowest free display number for this owner; ports derive from it so a
    // row wholly determines where its screen lives.
    let taken: Vec<i64> =
        sqlx::query_scalar("SELECT display_num FROM desktop_displays WHERE owner_id = $1")
            .bind(owner_id)
            .fetch_all(&state.db)
            .await?;
    let num = (1..=MAX_DISPLAYS).find(|n| !taken.contains(n)).ok_or_else(|| {
        AppError::BadRequest("no free desktop screens (32 max per owner)".into())
    })?;
    let vnc = state.cfg.desktop_vnc_base_port as i64 + num;
    let novnc = state.cfg.desktop_novnc_base_port as i64 + num;
    sqlx::query(
        "INSERT INTO desktop_displays (mind_id, owner_id, display_num, vnc_port, novnc_port)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (mind_id) DO NOTHING",
    )
    .bind(mind_id)
    .bind(owner_id)
    .bind(num)
    .bind(vnc)
    .bind(novnc)
    .execute(&state.db)
    .await?;
    ensure_container(state, owner_id).await?;
    start_display(state, owner_id, num).await?;
    Ok((num, vnc, novnc))
}

/// The per-owner container, created once with /32 port ranges for all future
/// displays. Idempotent: an existing running container is left alone.
async fn ensure_container(state: &AppState, owner_id: Uuid) -> Result<(), AppError> {
    let name = container_name(owner_id);
    let probe = docker(&["inspect", "-f", "{{.State.Running}}", &name]).await?;
    if probe.status.success() && String::from_utf8_lossy(&probe.stdout).trim() == "true" {
        return Ok(());
    }
    // Stale stopped container with our name: drop it, recreate fresh.
    if probe.status.success() {
        let _ = docker(&["rm", "-f", &name]).await;
    }
    let home = format!("{}/{owner_id}", state.cfg.desktop_data_dir);
    tokio::fs::create_dir_all(&home)
        .await
        .map_err(|e| AppError::Internal(format!("desktop storage unavailable: {e}")))?;
    let vnc_range = format!(
        "127.0.0.1:{}-{}:{}-{}",
        state.cfg.desktop_vnc_base_port,
        state.cfg.desktop_vnc_base_port as i64 + MAX_DISPLAYS,
        state.cfg.desktop_vnc_base_port,
        state.cfg.desktop_vnc_base_port as i64 + MAX_DISPLAYS
    );
    let novnc_range = format!(
        "127.0.0.1:{}-{}:{}-{}",
        state.cfg.desktop_novnc_base_port,
        state.cfg.desktop_novnc_base_port as i64 + MAX_DISPLAYS,
        state.cfg.desktop_novnc_base_port,
        state.cfg.desktop_novnc_base_port as i64 + MAX_DISPLAYS
    );
    let out = docker(&[
        "run", "-d", "--name", &name,
        "--shm-size=2g",
        "--memory=3g",
        "-v", &format!("{home}:/home/desktop"),
        "-p", &vnc_range,
        "-p", &novnc_range,
        &state.cfg.desktop_image,
    ])
    .await?;
    if !out.status.success() {
        return Err(AppError::Internal(format!(
            "desktop container failed to start: {}",
            String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>()
        )));
    }
    Ok(())
}

/// Boot one Xvnc + Xfce + websockify stack inside the container. The
/// container-side `atlas-display` script is idempotent (does nothing if the
/// display already answers).
async fn start_display(_state: &AppState, owner_id: Uuid, num: i64) -> Result<(), AppError> {
    let name = container_name(owner_id);
    let n = num.to_string();
    let out = tokio::time::timeout(
        OP_TIMEOUT,
        tokio::process::Command::new("docker")
            .args(["exec", &name, "atlas-display", &n])
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/local/bin")
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| AppError::Internal("desktop display timed out starting".into()))?
    .map_err(|e| AppError::Internal(format!("desktop display failed: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Internal(format!(
            "display :{num} failed: {}",
            String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>()
        )));
    }
    Ok(())
}

async fn exec_display(_state: &AppState, owner_id: Uuid, num: i64, sh: &str) -> Result<Vec<u8>, AppError> {
    let name = container_name(owner_id);
    let display = format!(":{num}");
    let out = tokio::time::timeout(
        OP_TIMEOUT,
        tokio::process::Command::new("docker")
            .args(["exec", "-e", &format!("DISPLAY={display}"), &name, "sh", "-c", sh])
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/local/bin")
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| AppError::Internal("desktop operation timed out".into()))?
    .map_err(|e| AppError::Internal(format!("desktop operation failed: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Internal(format!(
            "desktop error: {}",
            String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>()
        )));
    }
    Ok(out.stdout)
}

/// Capture the Mind's screen as PNG bytes (1280x800 scrot).
pub async fn screenshot(state: &AppState, owner_id: Uuid, mind_id: Uuid) -> Result<Vec<u8>, AppError> {
    let (num, _, _) = ensure_display(state, owner_id, mind_id).await?;
    let png = exec_display(state, owner_id, num, "scrot -z /tmp/atlas-shot.png && cat /tmp/atlas-shot.png").await?;
    if png.len() < 100 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(AppError::Internal("screen capture produced no image (display still starting?)".into()));
    }
    Ok(png)
}

/// Drive the screen. `op` is one xdotool line (`mousemove 400 300 click 1`,
/// `type -- hello`, `key Return`) built by the caller.
pub async fn input(state: &AppState, owner_id: Uuid, mind_id: Uuid, op: &str) -> Result<String, AppError> {
    let control: String = sqlx::query_scalar("SELECT control FROM desktop_displays WHERE mind_id = $1")
        .bind(mind_id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(|| "mind".into());
    if control != "mind" {
        return Ok("refused: your owner currently holds the screen (takeover). Watch via screenshots until they hand it back.".into());
    }
    let (num, _, _) = ensure_display(state, owner_id, mind_id).await?;
    let _ = exec_display(state, owner_id, num, &format!("xdotool {op}")).await?;
    Ok("done.".into())
}

/// Store a capture and return its public https URL for the vision model.
pub fn store_shot(state: &AppState, png: Vec<u8>) -> String {
    use rand::RngCore;
    let mut b = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut b);
    let token = hex_token(&b);
    state.desktop_shots.insert(
        token.clone(),
        DesktopShot { png, expires: Instant::now() + SHOT_TTL },
    );
    format!("{}/api/desktop/shot/{token}", state.cfg.desktop_public_base)
}

fn hex_token(b: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for byte in b {
        s.push(HEX[(byte >> 4) as usize] as char);
        s.push(HEX[(byte & 15) as usize] as char);
    }
    s
}

/// Serve a stored capture (public; the token is the auth). Expired tokens
/// are evicted on access.
pub fn take_shot(state: &AppState, token: &str) -> Option<Vec<u8>> {
    let entry = state.desktop_shots.get(token)?;
    if entry.expires < Instant::now() {
        drop(entry);
        state.desktop_shots.remove(token);
        return None;
    }
    Some(entry.png.clone())
}
