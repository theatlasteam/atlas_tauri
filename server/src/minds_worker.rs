//! 24/7 background worker for autonomous Compass Minds.
//!
//! Ticks every 30 seconds to find any enabled `mind_schedules` that are due
//! (`next_run_at <= now()`). For each due schedule:
//! 1. Locks and advances `next_run_at` using cron evaluation so other workers won't double-fire.
//! 2. Runs the Mind in its isolated sandbox with tools (browser, web_fetch, shell, message_owner).
//! 3. Logs the execution into `mind_runs` with full input, output, and tool call traces.
//! 4. Delivers any `message_owner` findings to the owner's chat via the official bot.

use std::time::Duration;
use chrono::{DateTime, Datelike, Timelike, Utc};
use uuid::Uuid;

use crate::state::AppState;
use crate::routes::minds::mind_system_prompt;

/// Spawn the background scheduler loop.
pub fn spawn_worker(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            if let Err(e) = tick_due_schedules(&state).await {
                tracing::error!(error = %e, "minds worker tick error");
            }
        }
    });
}

/// Compute the next execution timestamp for standard 5-part cron expression (min hour dom mon dow)
pub fn next_cron_occurrence(cron_expr: &str, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let parts: Vec<&str> = cron_expr.split_whitespace().collect();
    if parts.len() != 5 {
        return None;
    }

    // Step forward minute by minute up to 1 month ahead to find next matching timestamp
    let mut cur = after + chrono::Duration::minutes(1);
    cur = cur.with_second(0).and_then(|t| t.with_nanosecond(0))?;

    for _ in 0..(60 * 24 * 31) {
        if matches_field(parts[0], cur.minute() as u32, 0, 59)
            && matches_field(parts[1], cur.hour() as u32, 0, 23)
            && matches_field(parts[2], cur.day() as u32, 1, 31)
            && matches_field(parts[3], cur.month() as u32, 1, 12)
            && matches_field(parts[4], cur.weekday().num_days_from_sunday() as u32, 0, 6)
        {
            return Some(cur);
        }
        cur = cur + chrono::Duration::minutes(1);
    }
    None
}

fn matches_field(pattern: &str, val: u32, min_val: u32, max_val: u32) -> bool {
    let p = pattern.trim();
    if p == "*" {
        return true;
    }
    // Handle step syntax: */15, 0-30/5
    if let Some((range_part, step_str)) = p.split_once('/') {
        let step: u32 = match step_str.parse() {
            Ok(s) if s > 0 => s,
            _ => return false,
        };
        if range_part == "*" {
            return (val >= min_val && val <= max_val) && ((val - min_val) % step == 0);
        }
    }
    // Handle comma list: 1,2,3
    for sub in p.split(',') {
        let sub = sub.trim();
        if let Ok(exact) = sub.parse::<u32>() {
            if exact == val {
                return true;
            }
        }
        // Range: 9-17
        if let Some((start_s, end_s)) = sub.split_once('-') {
            if let (Ok(start), Ok(end)) = (start_s.parse::<u32>(), end_s.parse::<u32>()) {
                if val >= start && val <= end {
                    return true;
                }
            }
        }
    }
    false
}

#[derive(sqlx::FromRow)]
struct DueSchedule {
    schedule_id: Uuid,
    mind_id: Uuid,
    label: String,
    cron_expr: String,
    task: String,
    owner_id: Uuid,
    mind_name: String,
    mind_prompt: String,
    mind_color: String,
    mind_color_end: String,
    mind_tools: serde_json::Value,
    mind_is_active: bool,
}

async fn tick_due_schedules(state: &AppState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();

    // Query due schedules where mind is active and schedule is enabled
    let due: Vec<DueSchedule> = sqlx::query_as(
        "SELECT 
            s.id AS schedule_id,
            s.mind_id,
            s.label,
            s.cron_expr,
            s.task,
            m.owner_id,
            m.name AS mind_name,
            m.prompt AS mind_prompt,
            m.color AS mind_color,
            m.color_end AS mind_color_end,
            m.tools AS mind_tools,
            m.is_active AS mind_is_active
         FROM mind_schedules s
         JOIN minds m ON m.id = s.mind_id
         WHERE s.enabled = true
           AND m.is_active = true
           AND (s.next_run_at IS NULL OR s.next_run_at <= $1)
         LIMIT 10",
    )
    .bind(now)
    .fetch_all(&state.db)
    .await?;

    for item in due {
        // Calculate next run immediately to prevent stampedes
        let next_run = next_cron_occurrence(&item.cron_expr, now);
        sqlx::query(
            "UPDATE mind_schedules 
             SET last_run_at = $2, next_run_at = $3 
             WHERE id = $1",
        )
        .bind(item.schedule_id)
        .bind(now)
        .bind(next_run)
        .execute(&state.db)
        .await?;

        let state_clone = state.clone();
        tokio::spawn(async move {
            execute_scheduled_job(state_clone, item, now).await;
        });
    }

    Ok(())
}

async fn execute_scheduled_job(state: AppState, item: DueSchedule, started_at: DateTime<Utc>) {
    let mind_dto = crate::routes::minds::MindDto {
        id: item.mind_id,
        name: item.mind_name.clone(),
        color: item.mind_color,
        color_end: item.mind_color_end,
        prompt: item.mind_prompt,
        is_active: item.mind_is_active,
        tools: item.mind_tools.clone(),
        last_status: "running".into(),
        last_run_at: Some(started_at),
        created_at: started_at,
    };

    let system = mind_system_prompt(
        &mind_dto,
        &format!("This is a scheduled 24/7 background task: '{}'. Do the work with your tools and report findings to your owner.", item.label),
    );

    let mut allowed_tools = vec!["browser", "web_fetch", "shell", "set_schedule", "message_owner"];
    if let Some(obj) = item.mind_tools.as_object() {
        allowed_tools.retain(|tool| {
            obj.get(*tool).and_then(|v| v.as_bool()).unwrap_or(true)
        });
    }

    let input = if item.task.trim().is_empty() {
        format!("Scheduled trigger for task: {}", item.label)
    } else {
        item.task.clone()
    };

    let res = crate::compass::run_autonomous_agent(
        &state,
        item.mind_id,
        item.owner_id,
        &item.mind_name,
        system,
        format!("Scheduled Task: {input}"),
        &allowed_tools,
    ).await;

    let finished_at = Utc::now();
    let run_id = Uuid::new_v4();
    let tool_calls_json = serde_json::json!(res.tool_calls_log);

    let _ = sqlx::query(
        "INSERT INTO mind_runs (id, mind_id, trigger, input, output, tool_calls, status, error, started_at, finished_at)
         VALUES ($1,$2,'schedule',$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(run_id)
    .bind(item.mind_id)
    .bind(&input)
    .bind(&res.output)
    .bind(&tool_calls_json)
    .bind(&res.status)
    .bind(&res.error)
    .bind(started_at)
    .bind(finished_at)
    .execute(&state.db)
    .await;

    let _ = sqlx::query("UPDATE minds SET last_run_at = $2, last_status = $3 WHERE id = $1")
        .bind(item.mind_id)
        .bind(finished_at)
        .bind(&res.status)
        .execute(&state.db)
        .await;
}
