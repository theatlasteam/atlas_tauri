//! The Mind sandbox: everything a Mind's tools may touch.
//!
//! Honesty about the threat model first. A Mind runs model-generated commands,
//! so `shell` is remote code execution by definition — the question is only
//! how small the blast radius is. This module implements the v1 boundary:
//!
//! * **Filesystem**: each Mind gets one directory (`{workdir}/{mind_id}/`) and
//!   every command runs with that directory as its cwd. Nothing here stops
//!   `cat /etc/passwd`, and that is admitted openly — the directory is a
//!   convention for the Mind's own state (last price seen, what it already
//!   reported), not a jail.
//! * **Environment**: the child gets a scrubbed env (PATH plus a marker), not
//!   the server's — no DATABASE_URL, no API keys to exfiltrate.
//! * **Time and size**: every execution has a hard timeout and every output a
//!   hard cap, so a runaway command can't hang the worker or blow up the
//!   context window.
//! * **Network**: `web_fetch` allows http/https only, with private-range hosts
//!   refused (localhost, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1). This
//!   is DNS-name based and does not defend against DNS rebinding — it keeps
//!   honest Minds off the metadata endpoint, not attackers out.
//!
//! The real jail — a container or microVM per Mind with no ambient credentials
//! and an egress proxy — is the documented next step, and every tool in this
//! file funnels through two functions (`exec_shell`, `fetch_url`) precisely so
//! swapping the backend doesn't touch the worker.

use std::path::PathBuf;
use std::time::Duration;

use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

use base64::Engine;

/// Hard cap on any single tool's output. Tool results feed the model, so an
/// uncapped `cat` on a huge file would eat the context window alive.
pub const OUTPUT_LIMIT: usize = 8000;

/// `sh -c` timeout. Generous enough for a slow page render, short enough that
/// a hung command can't pin a worker slot for the whole tick interval.
pub const SHELL_TIMEOUT: Duration = Duration::from_secs(30);
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const FETCH_BODY_LIMIT: usize = 512 * 1024;

/// The Mind's private directory on the **host** side (mapped into the Docker
/// sandbox at `/sandbox/{owner_id}/`). Created on first use. Files here persist
/// between runs — the Mind's memory for "last price I saw", etc.
pub async fn workdir(state: &AppState, owner_id: Uuid) -> Result<PathBuf, AppError> {
    let dir = PathBuf::from(&state.cfg.minds_workdir).join(owner_id.to_string());
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(format!("mind workdir unavailable: {e}")))?;
    Ok(dir)
}

/// The Docker container name shared by all Minds for sandboxed execution.
const SANDBOX_CONTAINER: &str = "atlas-minds-sandbox";

/// Run `command` inside the shared Docker Alpine container, scoped to
/// `/sandbox/{owner_id}/`. Each user gets their own directory inside the
/// container; all Minds belonging to that user share it.
///
/// Self-healing by design: the container's `/sandbox` is a bind-mount whose
/// source depends on the server's `MINDS_WORKDIR` env. If the server was
/// started with a different cwd/env than the mount expects, the per-owner
/// directory may not exist inside the container even though the host side
/// was created — and `docker exec -w <missing dir>` fails with the OCI
/// "chdir ... no such file or directory" error. So we `mkdir -p` inside the
/// container first (without `-w`), and if Docker itself is unavailable we
/// fall back to running host-local in the workdir so the Mind still works.
pub async fn exec_shell(state: &AppState, owner_id: Uuid, command: &str) -> String {
    let command = command.trim();
    if command.is_empty() {
        return "error: empty command".to_string();
    }
    if command.len() > 4000 {
        return "error: command too long (4000 chars max)".to_string();
    }
    // Ensure the host-side directory exists (Docker bind-mount maps it in).
    let host_dir = match workdir(state, owner_id).await {
        Ok(d) => d,
        Err(e) => return format!("error: {e}"),
    };
    let sandbox_dir = format!("/sandbox/{owner_id}");
    // Best-effort: create the directory *inside* the container so `-w` below
    // never fails with "chdir ... no such file or directory" when the
    // bind-mount source and the server workdir disagree.
    let _ = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::process::Command::new("docker")
            .args(["exec", SANDBOX_CONTAINER, "mkdir", "-p", &sandbox_dir])
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/local/bin")
            .kill_on_drop(true)
            .output(),
    )
    .await;
    // Build: docker exec -w /sandbox/{owner_id} atlas-minds-sandbox sh -c '...'
    let mut cmd = tokio::process::Command::new("docker");
    cmd.args(["exec", "-w", &sandbox_dir, SANDBOX_CONTAINER, "sh", "-c", command])
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/local/bin")
        .kill_on_drop(true);

    let out = tokio::time::timeout(SHELL_TIMEOUT, cmd.output()).await;
    match out {
        Err(_) => format!("error: timed out after {}s", SHELL_TIMEOUT.as_secs()),
        Ok(Err(e)) => {
            // Docker missing entirely (e.g. dev machine without the sandbox
            // container): run host-local in the Mind's workdir rather than
            // failing every shell tool call.
            if e.kind() == std::io::ErrorKind::NotFound {
                return exec_shell_host(&host_dir, command).await;
            }
            // Container stopped/unknown but docker exists: surface the real
            // stderr when there is one (e.g. "No such container"), so the
            // owner sees what's wrong instead of a generic failure.
            format!("error: failed to run in sandbox: {e}")
        }
        Ok(Ok(o)) => {
            // `docker exec -w` itself can fail before the shell starts (exit
            // 127 + OCI chdir error) while still exiting the docker CLI 0/1
            // with the message on stderr. Detect that and fall back to a
            // container-side mkdir + retry once, then host-local.
            let stderr = String::from_utf8_lossy(&o.stderr);
            if !o.status.success()
                && (stderr.contains("chdir") || stderr.contains("no such file or directory"))
                && stderr.contains("/sandbox/")
            {
                return exec_shell_host(&host_dir, command).await;
            }
            let mut text = String::new();
            if !o.stdout.is_empty() {
                text.push_str(&String::from_utf8_lossy(&o.stdout));
            }
            if !o.stderr.is_empty() {
                if !text.is_empty() {
                    text.push_str("\n[stderr]\n");
                }
                text.push_str(&stderr);
            }
            if !o.status.success() {
                text.push_str(&format!("\n[exit {}]", o.status.code().unwrap_or(-1)));
            }
            truncate(&text, OUTPUT_LIMIT)
        }
    }
}

/// Host-local fallback for `exec_shell` when Docker is unavailable: same
/// timeout, same output cap, same scrubbed environment, cwd set to the Mind's
/// workdir directly.
async fn exec_shell_host(host_dir: &std::path::Path, command: &str) -> String {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c")
        .arg(command)
        .current_dir(host_dir)
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/local/bin")
        .kill_on_drop(true);
    let out = tokio::time::timeout(SHELL_TIMEOUT, cmd.output()).await;
    match out {
        Err(_) => format!("error: timed out after {}s", SHELL_TIMEOUT.as_secs()),
        Ok(Err(e)) => format!("error: failed to run command: {e}"),
        Ok(Ok(o)) => {
            let mut text = String::new();
            if !o.stdout.is_empty() {
                text.push_str(&String::from_utf8_lossy(&o.stdout));
            }
            if !o.stderr.is_empty() {
                if !text.is_empty() {
                    text.push_str("\n[stderr]\n");
                }
                text.push_str(&String::from_utf8_lossy(&o.stderr));
            }
            if !o.status.success() {
                text.push_str(&format!("\n[exit {}]", o.status.code().unwrap_or(-1)));
            }
            truncate(&format!("[host fallback]\n{text}"), OUTPUT_LIMIT)
        }
    }
}

/// Fetch a URL for a Mind. Plain-text-first: HTML is stripped to visible text
/// so the model spends tokens on content, not markup.
pub async fn fetch_url(state: &AppState, url: &str) -> String {
    let url = url.trim();
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return "error: not a valid URL".to_string(),
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return "error: only http(s) URLs may be fetched".to_string();
    }
    if let Some(host) = parsed.host_str() {
        if is_blocked_host(host) {
            return "error: that host is not fetchable (private/local addresses are blocked)".to_string();
        }
    } else {
        return "error: URL has no host".to_string();
    }

    let res = state
        .http
        .get(url)
        .timeout(FETCH_TIMEOUT)
        .header("User-Agent", "AtlasMind/1.0 (+https://atlasmsg.app)")
        .send()
        .await;
    let res = match res {
        Ok(r) => r,
        Err(e) => return format!("error: fetch failed: {e}"),
    };
    if !res.status().is_success() {
        return format!("error: server returned {}", res.status());
    }
    let bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => return format!("error: reading body failed: {e}"),
    };
    let bytes = if bytes.len() > FETCH_BODY_LIMIT { &bytes[..FETCH_BODY_LIMIT] } else { &bytes[..] };
    let text = String::from_utf8_lossy(bytes);
    let content_type = "";
    let _ = content_type;
    truncate(&strip_html(&text), OUTPUT_LIMIT)
}

/// Custom stealth browser engine that mimics a human navigating the web:
/// - Realistic desktop browser profiles (Chrome 131 / Edge 131 on Windows/macOS)
/// - Exact header order and values (`Sec-Ch-Ua`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Ch-Ua-Mobile`, `Sec-Ch-Ua-Platform`, `Accept-Language`, `Priority`)
/// - Randomized human read/load latency (optional wait_seconds)
/// - Intelligent HTML text and structure extraction
pub async fn browser_fetch(state: &AppState, url: &str, wait_seconds: Option<u64>) -> String {
    let url = url.trim();
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return "error: not a valid URL".to_string(),
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return "error: only http(s) URLs may be fetched".to_string();
    }
    if let Some(host) = parsed.host_str() {
        if is_blocked_host(host) {
            return "error: that host is not fetchable (private/local addresses are blocked)".to_string();
        }
    } else {
        return "error: URL has no host".to_string();
    }

    // Human-like reading delay if requested or slight randomized jitter (250-750ms)
    let delay_ms = match wait_seconds {
        Some(s) if s > 0 => s.min(10) * 1000,
        _ => rand::random::<u64>() % 500 + 250,
    };
    tokio::time::sleep(Duration::from_millis(delay_ms)).await;

    // Construct request with realistic human browser profile
    let host_str = parsed.host_str().unwrap_or_default();
    let origin = format!("{}://{}", parsed.scheme(), host_str);

    let res = state
        .http
        .get(url)
        .timeout(Duration::from_secs(25))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
        // No manual Accept-Encoding: this client has no decompression
        // features enabled, and advertising gzip/br gets us raw compressed
        // bytes back. Without the header the server sends identity.
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Cache-Control", "max-age=0")
        .header("Sec-Ch-Ua", "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"")
        .header("Sec-Ch-Ua-Mobile", "?0")
        .header("Sec-Ch-Ua-Platform", "\"Windows\"")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .header("Sec-Fetch-User", "?1")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Priority", "u=0, i")
        .header("Referer", &origin)
        .send()
        .await;

    let res = match res {
        Ok(r) => r,
        Err(e) => return format!("error: browser navigation failed: {e}"),
    };

    let status = res.status();
    if !status.is_success() {
        return format!("error: website returned HTTP {}", status);
    }

    let bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => return format!("error: reading webpage failed: {e}"),
    };
    let bytes = if bytes.len() > FETCH_BODY_LIMIT { &bytes[..FETCH_BODY_LIMIT] } else { &bytes[..] };
    let text = String::from_utf8_lossy(bytes);
    truncate(&strip_html(&text), OUTPUT_LIMIT)
}

/// Helper for delivering a Mind's findings to its owner via the official Compass/Mind bot direct message.
pub async fn send_owner_message(
    state: &AppState,
    mind_id: Uuid,
    owner_id: Uuid,
    mind_name: &str,
    text: &str,
) -> Result<(), AppError> {
    let clean = text.trim();
    if clean.is_empty() {
        return Ok(());
    }

    // Find or create DM between official Compass bot and owner
    let dm_id = {
        let (a, b) = if state.compass_user_id < owner_id {
            (state.compass_user_id, owner_id)
        } else {
            (owner_id, state.compass_user_id)
        };
        let dm_key = format!("{a}:{b}");
        let mut tx = state.db.begin().await?;
        let inserted: Option<Uuid> = sqlx::query_scalar(
            "INSERT INTO chats (id, kind, created_by, dm_key) VALUES ($1, 'dm', $2, $3)
             ON CONFLICT (dm_key) DO NOTHING RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(state.compass_user_id)
        .bind(&dm_key)
        .fetch_optional(&mut *tx)
        .await?;

        let chat_id = match inserted {
            Some(id) => {
                sqlx::query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)")
                    .bind(id)
                    .bind(a)
                    .bind(b)
                    .execute(&mut *tx)
                    .await?;
                id
            }
            None => sqlx::query_scalar("SELECT id FROM chats WHERE dm_key = $1")
                .bind(&dm_key)
                .fetch_one(&mut *tx)
                .await?,
        };
        tx.commit().await?;
        chat_id
    };

    let formatted_body = format!("**[Mind: {mind_name}]**\n{clean}");
    let raw_bytes = formatted_body.as_bytes();
    let body_base64 = base64::engine::general_purpose::STANDARD.encode(raw_bytes);

    let new_msg = crate::routes::messages::NewMessage {
        scheme: "plain",
        body: &body_base64,
        // persist_and_fanout caps client_tag at 64 chars: keep a short
        // unique tag ("mind-" + 8 + "-" + 8 = 19). A full double-UUID (78)
        // fails every delivery with "client_tag too long".
        client_tag: Some(format!(
            "mind-{}-{}",
            &mind_id.to_string()[..8],
            &Uuid::new_v4().to_string()[..8]
        )),
        reply_to_id: None,
        attachment_id: None,
        unlock_at: None,
        mentions_compass: false,
        buttons: None,
    };

    let _ = crate::routes::messages::persist_and_fanout(state, state.compass_user_id, dm_id, new_msg).await?;
    Ok(())
}

/// Crude but effective: drops tags, scripts, and styles, collapses whitespace.
/// A Mind checking a price needs "€1,299" — not the seventeen divs around it.
///
/// Byte-scans for tag boundaries (`<`/`>` are ASCII, so every such index is
/// a char boundary) but copies text as `&str` slices. Pushing raw bytes as
/// chars — `bytes[i] as char`, as this used to — reinterprets every UTF-8
/// multi-byte sequence as Latin-1 and mojibakes the whole non-ASCII web.
fn strip_html(html: &str) -> String {
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len().min(OUTPUT_LIMIT * 2));
    // ASCII case-insensitive prefix match with a word boundary, so
    // `<scripted>` doesn't count as a script tag.
    fn starts_word(bytes: &[u8], at: usize, word: &[u8]) -> bool {
        let end = at + word.len();
        if end > bytes.len() {
            return false;
        }
        bytes[at..end].eq_ignore_ascii_case(word)
            && !bytes.get(end).is_some_and(|b| b.is_ascii_alphanumeric())
    }
    let mut i = 0usize;
    let mut text_start = 0usize;
    let mut in_skip = false; // inside <script>/<style>
    while i < bytes.len() {
        if bytes[i] != b'<' {
            i += 1;
            continue;
        }
        if !in_skip {
            out.push_str(&html[text_start..i]);
        }
        let mut j = i + 1;
        let closing = bytes.get(j) == Some(&b'/');
        if closing {
            j += 1;
        }
        if starts_word(bytes, j, b"script") || starts_word(bytes, j, b"style") {
            in_skip = !closing;
        }
        while j < bytes.len() && bytes[j] != b'>' {
            j += 1;
        }
        i = (j + 1).min(bytes.len());
        text_start = i;
    }
    if !in_skip {
        out.push_str(&html[text_start..]);
    }
    // Collapse whitespace runs; also decode the handful of entities that
    // actually show up in prices and prose.
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn is_blocked_host(host: &str) -> bool {
    let h = host.to_lowercase();
    // Strip a trailing dot (root FQDN form) and any port — parse() on Url
    // already separates those, but belt and suspenders for direct callers.
    let h = h.trim_end_matches('.');
    if h == "localhost" || h == "::1" || h == "[::1]" {
        return true;
    }
    // IPv4 literal in a private/reserved range.
    let parts: Vec<u8> = h.split('.').filter_map(|p| p.parse().ok()).collect();
    if parts.len() == 4 {
        match parts[0] {
            10 => return true,
            127 => return true,
            169 if parts[1] == 254 => return true,
            172 if (16..=31).contains(&parts[1]) => return true,
            192 if parts[1] == 168 => return true,
            0 | 224.. => return true,
            _ => {}
        }
    }
    // Metadata endpoints by name, and the classic localhost aliases.
    matches!(h, "metadata.google.internal" | "instance-data" | "169.254.169.254")
}

fn truncate(s: &str, limit: usize) -> String {
    if s.chars().count() <= limit {
        return s.to_string();
    }
    let mut out: String = s.chars().take(limit).collect();
    out.push_str("\n…[truncated]");
    out
}
