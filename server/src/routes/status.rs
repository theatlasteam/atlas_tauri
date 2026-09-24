//! Public status document for status.atlasmsg.app.
//!
//! The VPS control panel is the writer (`STATUS_PATH`). This route only
//! reads that file and turns checks plus incidents into the bars the page
//! draws. A missing file is an empty history: every day reads as "no data".

use std::collections::BTreeMap;

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

const WINDOW_DAYS: i64 = 90;

#[derive(Clone, Deserialize)]
struct Doc {
    #[serde(default)]
    components: Vec<ComponentIn>,
    #[serde(default)]
    checks: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)]
    incidents: Vec<IncidentIn>,
}

#[derive(Clone, Deserialize)]
struct ComponentIn {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncidentIn {
    id: String,
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    component_ids: Vec<String>,
    started_at: String,
    #[serde(default)]
    resolved_at: Option<String>,
    #[serde(default)]
    severity: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicStatus {
    updated_at: String,
    overall: &'static str,
    components: Vec<PublicComponent>,
    incidents: Vec<PublicIncident>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicComponent {
    id: String,
    name: String,
    description: String,
    status: &'static str,
    /// Share of the window that was up, ignoring stretches explicitly marked as no data.
    uptime_pct: Option<f64>,
    sections: Vec<Section>,
}

#[derive(Serialize)]
struct Section {
    label: String,
    /// `up` | `miss` | `down`
    state: &'static str,
    /// Length of this stretch in minutes. The bar splits once per change of state.
    weight: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicIncident {
    id: String,
    title: String,
    body: String,
    component_ids: Vec<String>,
    started_at: String,
    resolved_at: Option<String>,
    severity: String,
}

fn defaults() -> Vec<ComponentIn> {
    vec![
        ComponentIn { id: "api".into(), name: "Atlas API".into(), description: "Accounts, chats, and messages".into() },
        ComponentIn { id: "realtime".into(), name: "Realtime".into(), description: "WebSocket delivery".into() },
        ComponentIn { id: "calls".into(), name: "Calls".into(), description: "Voice and video (TURN)".into() },
        ComponentIn { id: "site".into(), name: "Website".into(), description: "atlasmsg.app and the web app".into() },
        ComponentIn { id: "database".into(), name: "Database".into(), description: "Message and account storage".into() },
    ]
}

fn load(path: &str) -> Doc {
    let raw = std::fs::read_to_string(path).unwrap_or_default();
    let mut doc: Doc = serde_json::from_str(&raw).unwrap_or(Doc {
        components: vec![],
        checks: BTreeMap::new(),
        incidents: vec![],
    });
    if doc.components.is_empty() {
        doc.components = defaults();
    }
    doc.components.truncate(12);
    doc.incidents.truncate(80);
    doc
}

fn parse_day(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn applies(inc: &IncidentIn, component: &str) -> bool {
    inc.component_ids.is_empty() || inc.component_ids.iter().any(|id| id == component)
}

fn parse_ts(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|| parse_day(s).and_then(|d| d.and_hms_opt(0, 0, 0)).map(|d| Utc.from_utc_datetime(&d)))
}

fn month_label(d: NaiveDate) -> String {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    format!("{} {}", MONTHS[d.month0() as usize], d.day())
}

fn stretch_label(start: DateTime<Utc>, end: DateTime<Utc>) -> String {
    let whole_days = start.time().hour() == 0
        && start.time().minute() == 0
        && end.time().hour() == 23
        && end.time().minute() >= 59;
    if !whole_days {
        if start.date_naive() == end.date_naive() {
            return format!(
                "{} {} {:02}:{:02}–{:02}:{:02}",
                month_name(start.date_naive()),
                start.day(),
                start.hour(),
                start.minute(),
                end.hour(),
                end.minute()
            );
        }
        return format!(
            "{} {:02}:{:02} – {} {:02}:{:02}",
            month_label(start.date_naive()),
            start.hour(),
            start.minute(),
            month_label(end.date_naive()),
            end.hour(),
            end.minute()
        );
    }
    section_label(start.date_naive(), end.date_naive())
}

fn section_label(start: NaiveDate, end: NaiveDate) -> String {
    if start.month() == end.month() && start.year() == end.year() {
        format!("{} {}–{}", month_name(start), start.day(), end.day())
    } else {
        format!("{} – {}", month_label(start), month_label(end))
    }
}

fn month_name(d: NaiveDate) -> &'static str {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    MONTHS[d.month0() as usize]
}

/// Down outranks a missed check, which outranks the default (up).
struct Mark {
    start: i64,
    end: i64,
    rank: u8,
}

fn clip(start: i64, end: i64, win_s: i64, win_e: i64) -> Option<(i64, i64)> {
    let start = start.max(win_s);
    let end = end.min(win_e);
    (end > start).then_some((start, end))
}

fn sections_for(comp_id: &str, doc: &Doc, now: DateTime<Utc>) -> (Vec<Section>, u64, u64) {
    let win_e = now.timestamp();
    let win_s = (now - Duration::days(WINDOW_DAYS)).timestamp();
    let mut marks: Vec<Mark> = Vec::new();
    if let Some(checks) = doc.checks.get(comp_id) {
        for (day, state) in checks {
            let rank = match state.as_str() {
                "down" => 2,
                "miss" => 1,
                _ => continue,
            };
            let Some(date) = parse_day(day) else { continue };
            let Some(start_naive) = date.and_hms_opt(0, 0, 0) else { continue };
            let Some(end_naive) = (date + Duration::days(1)).and_hms_opt(0, 0, 0) else { continue };
            let start = Utc.from_utc_datetime(&start_naive).timestamp();
            let end = Utc.from_utc_datetime(&end_naive).timestamp();
            if let Some((start, end)) = clip(start, end, win_s, win_e) {
                marks.push(Mark { start, end, rank });
            }
        }
    }
    for inc in &doc.incidents {
        if !applies(inc, comp_id) {
            continue;
        }
        let Some(start) = parse_ts(&inc.started_at) else { continue };
        let end = inc.resolved_at.as_deref().and_then(parse_ts).unwrap_or(now);
        if let Some((start, end)) = clip(start.timestamp(), end.timestamp(), win_s, win_e) {
            marks.push(Mark { start, end, rank: 2 });
        }
    }

    let mut points = vec![win_s, win_e];
    for mark in &marks {
        points.push(mark.start);
        points.push(mark.end);
    }
    points.sort_unstable();
    points.dedup();

    let mut raw: Vec<(i64, i64, &'static str)> = Vec::new();
    for pair in points.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if b <= a {
            continue;
        }
        let mut rank = 0u8;
        for mark in &marks {
            if mark.start <= a && b <= mark.end {
                rank = rank.max(mark.rank);
            }
        }
        let state = match rank {
            2 => "down",
            1 => "miss",
            _ => "up",
        };
        if let Some(last) = raw.last_mut() {
            if last.2 == state && last.1 == a {
                last.1 = b;
                continue;
            }
        }
        raw.push((a, b, state));
    }

    let mut up_secs = 0u64;
    let mut down_secs = 0u64;
    let sections = raw
        .into_iter()
        .map(|(a, b, state)| {
            let secs = (b - a) as u64;
            match state {
                "down" => down_secs += secs,
                "up" => up_secs += secs,
                _ => {}
            }
            let start = Utc.timestamp_opt(a, 0).single().unwrap_or(now);
            let end = Utc.timestamp_opt(b.saturating_sub(1).max(a), 0).single().unwrap_or(now);
            Section {
                label: stretch_label(start, end),
                state,
                weight: (secs / 60).max(1),
            }
        })
        .collect();
    (sections, up_secs, down_secs)
}

fn build(doc: &Doc) -> PublicStatus {
    let now = Utc::now();
    let today = now.date_naive();
    let mut components = Vec::new();
    for comp in &doc.components {
        let checks = doc.checks.get(&comp.id);
        let (sections, up_secs, down_secs) = sections_for(&comp.id, doc, now);
        let monitored = up_secs + down_secs;
        let uptime_pct = if monitored == 0 {
            None
        } else {
            Some(((up_secs as f64) / (monitored as f64) * 1000.0).round() / 10.0)
        };
        let open = doc.incidents.iter().any(|inc| {
            applies(inc, &comp.id)
                && inc.resolved_at.as_deref().map(|s| s.is_empty()).unwrap_or(true)
                && parse_ts(&inc.started_at).is_some_and(|start| start <= now)
        });
        let today_key = today.format("%Y-%m-%d").to_string();
        let today_mark = checks.and_then(|m| m.get(&today_key)).map(String::as_str);
        let status = if open || today_mark == Some("down") {
            "outage"
        } else if today_mark == Some("miss") {
            "unknown"
        } else {
            "operational"
        };
        components.push(PublicComponent {
            id: comp.id.clone(),
            name: comp.name.clone(),
            description: comp.description.clone(),
            status,
            uptime_pct,
            sections,
        });
    }
    let overall = if components.iter().any(|c| c.status == "outage") {
        "outage"
    } else if components.iter().any(|c| c.status == "unknown") {
        "unknown"
    } else if components.is_empty() {
        "unknown"
    } else {
        "operational"
    };
    PublicStatus {
        updated_at: Utc::now().to_rfc3339(),
        overall,
        components,
        incidents: doc
            .incidents
            .iter()
            .rev()
            .take(40)
            .map(|inc| PublicIncident {
                id: inc.id.clone(),
                title: inc.title.clone(),
                body: inc.body.clone(),
                component_ids: inc.component_ids.clone(),
                started_at: inc.started_at.clone(),
                resolved_at: inc.resolved_at.clone(),
                severity: if inc.severity == "minor" { "minor".into() } else { "major".into() },
            })
            .collect(),
    }
}

pub async fn get_status(State(state): State<AppState>) -> Json<serde_json::Value> {
    let doc = load(&state.cfg.status_path);
    Json(serde_json::to_value(build(&doc)).unwrap_or(serde_json::json!({ "overall": "unknown", "components": [], "incidents": [] })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiet_window_is_one_green_bar() {
        let doc = Doc {
            components: vec![ComponentIn { id: "api".into(), name: "API".into(), description: "".into() }],
            checks: BTreeMap::new(),
            incidents: vec![],
        };
        let view = build(&doc);
        let sections = &view.components[0].sections;
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].state, "up");
        assert_eq!(view.components[0].uptime_pct, Some(100.0));
        assert_eq!(view.components[0].status, "operational");
    }

    #[test]
    fn downtime_is_only_the_red_slice() {
        let today = Utc::now().date_naive();
        let day = (today - Duration::days(3)).format("%Y-%m-%d").to_string();
        let doc = Doc {
            components: vec![ComponentIn { id: "api".into(), name: "API".into(), description: "".into() }],
            checks: BTreeMap::from([("api".into(), BTreeMap::from([(day.clone(), "miss".into())]))]),
            incidents: vec![IncidentIn {
                id: "1".into(),
                title: "out".into(),
                body: "".into(),
                component_ids: vec!["api".into()],
                started_at: format!("{day}T10:00:00Z"),
                resolved_at: Some(format!("{day}T12:00:00Z")),
                severity: "major".into(),
            }],
        };
        let view = build(&doc);
        let sections = &view.components[0].sections;
        let down: u64 = sections.iter().filter(|s| s.state == "down").map(|s| s.weight).sum();
        let up: u64 = sections.iter().filter(|s| s.state == "up").map(|s| s.weight).sum();
        let miss: u64 = sections.iter().filter(|s| s.state == "miss").map(|s| s.weight).sum();
        assert!(down > 0 && down < up, "red slice {down} should be shorter than the green {up}");
        assert!(miss > down, "the rest of the missed day stays orange");
        assert!(view.components[0].uptime_pct.unwrap() > 99.0);
    }
}
