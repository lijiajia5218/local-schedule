use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyFocus {
    pub id: String,
    pub week_start: String,
    pub title: String,
    pub target_text: Option<String>,
    pub status_note: Option<String>,
    pub is_done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTask {
    pub id: String,
    pub task_date: String,
    pub start_time: String,
    pub end_time: String,
    pub title: String,
    pub is_done: bool,
    #[serde(default)]
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyMemo {
    pub id: String,
    pub memo_date: String,
    pub content: String,
    #[serde(default)]
    pub reminder_time: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekBundle {
    pub week_start: String,
    pub week_end: String,
    pub focuses: Vec<WeeklyFocus>,
    pub tasks: Vec<DailyTask>,
    pub memos: Vec<DailyMemo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayBundle {
    pub date: String,
    pub tasks: Vec<DailyTask>,
    pub memos: Vec<DailyMemo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub data_dir: String,
    pub db_path: String,
    pub exports_dir: String,
    pub schema_version: i64,
    pub reminder_lead_minutes: i64,
    pub close_to_tray: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPayload {
    pub exported_at: String,
    pub schema_version: i64,
    pub weekly_focus: Vec<WeeklyFocus>,
    pub daily_task: Vec<DailyTask>,
    pub daily_memo: Vec<DailyMemo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DueMemoReminder {
    pub memo_id: String,
    pub memo_date: String,
    pub reminder_time: String,
    pub content: String,
    pub lead_minutes: i64,
    pub fired_key: String,
}

pub fn build_fired_key(memo_date: &str, reminder_time: &str, lead_minutes: i64) -> String {
    format!("{}|{}|{}", memo_date, reminder_time, lead_minutes)
}

/// Checks whether a scheduled memo reminder falls within `[event_dt - lead_minutes, event_dt + 60s]`.
/// The +60s tolerance ensures `lead_minutes = 0` (on-time reminders) never miss a 15-second poll tick,
/// while preventing historical memos older than `event_dt + 60s` from firing after wake/launch.
pub fn is_reminder_due_at(
    memo_date: &str,
    reminder_time: &str,
    lead_minutes: i64,
    now_local: NaiveDateTime,
) -> Result<bool, String> {
    let date = NaiveDate::parse_from_str(memo_date, "%Y-%m-%d")
        .map_err(|_| format!("无效备忘日期: {}", memo_date))?;
    let time = NaiveTime::parse_from_str(reminder_time, "%H:%M")
        .map_err(|_| format!("无效提醒时间: {}", reminder_time))?;
    let event_dt = date.and_time(time);
    let trigger_dt = event_dt - chrono::Duration::minutes(lead_minutes);
    let expiry_dt = event_dt + chrono::Duration::seconds(60);
    Ok(now_local >= trigger_dt && now_local <= expiry_dt)
}

/// Parses a single time token in `H`, `HH`, `H:MM`, `HH:MM`, or `H.MM`/`HH.MM` format into normalized `HH:MM`.
pub fn parse_time_part(raw: &str) -> Result<(String, u32), String> {
    let normalized_colon = raw.trim().replace(['：', '.', '。'], ":");
    let trimmed = normalized_colon.as_str();
    if trimmed.is_empty() {
        return Err("时间不能为空".to_string());
    }

    let (hour_str, min_str) = match trimmed.split_once(':') {
        Some((h, m)) => {
            if m.len() != 2 || !m.chars().all(|c| c.is_ascii_digit()) {
                return Err(format!("无效分钟格式「{}」，应为两位数字", trimmed));
            }
            (h, m)
        }
        None => (trimmed, "00"),
    };

    if hour_str.is_empty() || hour_str.len() > 2 || !hour_str.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("无效小时格式「{}」", trimmed));
    }

    let hour: u32 = hour_str
        .parse()
        .map_err(|_| format!("无效小时「{}」", trimmed))?;
    let minute: u32 = min_str
        .parse()
        .map_err(|_| format!("无效分钟「{}」", trimmed))?;

    if hour > 23 {
        return Err(format!("小时「{}」超出 0-23 范围（不支持跨天）", hour));
    }
    if minute > 59 {
        return Err(format!("分钟「{}」超出 00-59 范围", minute));
    }

    let normalized = format!("{:02}:{:02}", hour, minute);
    Ok((normalized, hour * 60 + minute))
}

/// Parses a time range like `9-10` or `10:30-11:30`. Enforces `end > start` on the same day.
#[allow(dead_code)]
pub fn parse_time_range(raw: &str) -> Result<(String, String), String> {
    let normalized_dash = raw.trim().replace(['－', '–'], "-");
    let trimmed = normalized_dash.as_str();
    let parts: Vec<&str> = trimmed.split('-').collect();
    if parts.len() != 2 {
        return Err("时间段格式应为「起始-结束」，例如 9-10 或 10:30-11:30".to_string());
    }

    let (start_str, start_min) = parse_time_part(parts[0])?;
    let (end_str, end_min) = parse_time_part(parts[1])?;

    if end_min <= start_min {
        return Err("结束时间必须晚于起始时间，且不支持跨天".to_string());
    }

    Ok((start_str, end_str))
}

/// Strips an optional leading todo marker (`【】`, `【 】`, `【x】`, `【√】`, `[]`, `[x]`).
#[allow(dead_code)]
pub fn extract_todo_prefix(raw: &str) -> (bool, bool, &str) {
    let trimmed = raw.trim_start();
    let pairs = [
        ("【", '】'),
        ("[", ']'),
    ];
    for (open, close) in pairs {
        if let Some(after_open) = trimmed.strip_prefix(open) {
            if let Some(close_idx) = after_open.find(close) {
                let inner = after_open[..close_idx].trim();
                let is_valid_marker = inner.is_empty()
                    || matches!(inner, "x" | "X" | "√" | "✓");
                if is_valid_marker {
                    let rest = after_open[close_idx + close.len_utf8()..].trim_start();
                    return (true, !inner.is_empty(), rest);
                }
            }
        }
    }
    (false, false, raw)
}

/// Parses a shorthand line `【】9-10｜周会` or `9-10|周会` by splitting at the first `|` or `｜`.
#[allow(dead_code)]
pub fn parse_shorthand_task(raw: &str) -> Result<(String, String, String), String> {
    let (has_prefix, _is_done, rest) = extract_todo_prefix(raw);
    let (time_part, title_part) = rest
        .split_once(|c| c == '|' || c == '｜')
        .ok_or_else(|| {
            if has_prefix {
                "待办需包含时间段，格式：【】9-10｜任务名".to_string()
            } else {
                "请使用「【】9-10｜任务名」或「9-10|任务名」格式".to_string()
            }
        })?;

    let (start_time, end_time) = parse_time_range(time_part)?;
    let title = title_part.trim();
    if title.is_empty() {
        return Err("任务名称不能为空".to_string());
    }

    Ok((start_time, end_time, title.to_string()))
}

#[derive(Debug, PartialEq)]
#[allow(dead_code)]
pub struct ParsedWeeklyFocus {
    pub title: String,
    pub target_text: Option<String>,
    pub status_note: Option<String>,
    pub is_done: bool,
}

/// Parses `【】任务名 @目标时间 - 状态备注` (also supports `（目标时间）` and `//状态备注`).
#[allow(dead_code)]
pub fn parse_weekly_focus_line(raw: &str) -> Result<ParsedWeeklyFocus, String> {
    let (has_prefix, is_done, rest) = extract_todo_prefix(raw);
    if !has_prefix {
        return Err("周重点请以「【】」开头，格式：【】任务名 @目标时间 - 状态备注".to_string());
    }

    let mut main_part = rest.to_string();
    let mut status_note: Option<String> = None;

    for sep in [" - ", " － ", " //", "//"] {
        if let Some(idx) = rest.find(sep) {
            let before = &rest[..idx];
            if sep.starts_with(' ') || before.chars().last().map(|c| c.is_whitespace()).unwrap_or(true) {
                main_part = before.to_string();
                let note = rest[idx + sep.len()..].trim().to_string();
                if !note.is_empty() {
                    status_note = Some(note);
                }
                break;
            }
        }
    }

    let mut title_part = main_part.trim().to_string();
    let mut target_text: Option<String> = None;

    if let Some(at_pos) = main_part.find('@') {
        let after_at = &main_part[at_pos + 1..];
        let token_len = after_at
            .find(char::is_whitespace)
            .unwrap_or(after_at.len());
        let token = after_at[..token_len].trim();
        if !token.is_empty() {
            target_text = Some(token.to_string());
            let mut combined = String::new();
            combined.push_str(main_part[..at_pos].trim_end());
            combined.push(' ');
            combined.push_str(after_at[token_len..].trim_start());
            title_part = combined.trim().to_string();
        }
    }

    if title_part.is_empty() {
        return Err("周重点任务名不能为空".to_string());
    }

    Ok(ParsedWeeklyFocus {
        title: title_part,
        target_text,
        status_note,
        is_done,
    })
}

/// Computes the Monday `YYYY-MM-DD` for the week containing `date_str`.
pub fn week_start_of(date_str: &str) -> Result<String, String> {
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|_| format!("无效日期格式「{}」，应为 YYYY-MM-DD", date_str))?;
    let offset = date.weekday().num_days_from_monday() as i64;
    let monday = date - chrono::Duration::days(offset);
    Ok(monday.format("%Y-%m-%d").to_string())
}

pub fn week_end_of(week_start_str: &str) -> Result<String, String> {
    let monday = NaiveDate::parse_from_str(week_start_str, "%Y-%m-%d")
        .map_err(|_| format!("无效周一日期「{}」", week_start_str))?;
    let sunday = monday + chrono::Duration::days(6);
    Ok(sunday.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_time_part() {
        assert_eq!(parse_time_part("9").unwrap(), ("09:00".to_string(), 540));
        assert_eq!(parse_time_part("09").unwrap(), ("09:00".to_string(), 540));
        assert_eq!(parse_time_part("9:05").unwrap(), ("09:05".to_string(), 545));
        assert_eq!(parse_time_part("10:30").unwrap(), ("10:30".to_string(), 630));
        assert_eq!(parse_time_part("10.30").unwrap(), ("10:30".to_string(), 630));
        assert_eq!(parse_time_part("9.05").unwrap(), ("09:05".to_string(), 545));
        assert!(parse_time_part("9.5").is_err());
        assert!(parse_time_part("24:00").is_err());
        assert!(parse_time_part("9:60").is_err());
    }

    #[test]
    fn test_parse_time_range() {
        assert_eq!(
            parse_time_range("9-10").unwrap(),
            ("09:00".to_string(), "10:00".to_string())
        );
        assert_eq!(
            parse_time_range("10:30-11:30").unwrap(),
            ("10:30".to_string(), "11:30".to_string())
        );
        assert_eq!(
            parse_time_range("10.30-11.45").unwrap(),
            ("10:30".to_string(), "11:45".to_string())
        );
        assert!(parse_time_range("10-9").is_err());
        assert!(parse_time_range("10-10").is_err());
    }

    #[test]
    fn test_parse_shorthand_task() {
        assert_eq!(
            parse_shorthand_task("9-10|周会").unwrap(),
            ("09:00".to_string(), "10:00".to_string(), "周会".to_string())
        );
        assert_eq!(
            parse_shorthand_task("【】9-10｜周会").unwrap(),
            ("09:00".to_string(), "10:00".to_string(), "周会".to_string())
        );
        assert_eq!(
            parse_shorthand_task("【x】10：30－11：30｜评审|补充").unwrap(),
            (
                "10:30".to_string(),
                "11:30".to_string(),
                "评审|补充".to_string()
            )
        );
        assert!(parse_shorthand_task("9-10 周会").is_err());
        assert!(parse_shorthand_task("【】周会").is_err());
        assert!(parse_shorthand_task("9-10|   ").is_err());
    }

    #[test]
    fn test_parse_weekly_focus_line() {
        assert_eq!(
            parse_weekly_focus_line("【】季度同步会 @0315以后 - 延至下月").unwrap(),
            ParsedWeeklyFocus {
                title: "季度同步会".to_string(),
                target_text: Some("0315以后".to_string()),
                status_note: Some("延至下月".to_string()),
                is_done: false,
            }
        );
        assert_eq!(
            parse_weekly_focus_line("【x】Web-UI 性能测试 @0315").unwrap(),
            ParsedWeeklyFocus {
                title: "Web-UI 性能测试".to_string(),
                target_text: Some("0315".to_string()),
                status_note: None,
                is_done: true,
            }
        );
        assert!(parse_weekly_focus_line("纯文本重点").is_err());
    }

    #[test]
    fn test_week_start_of() {
        assert_eq!(week_start_of("2026-11-23").unwrap(), "2026-11-23");
        assert_eq!(week_start_of("2026-11-25").unwrap(), "2026-11-23");
        assert_eq!(week_start_of("2026-11-29").unwrap(), "2026-11-23");
    }

    #[test]
    fn test_reminder_window_ontime_cross_midnight_and_expiry() {
        let dt = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap();

        // N = 0 (on-time) includes 60s tolerance window so 15s polling at 09:00:07 fires cleanly
        assert!(!is_reminder_due_at("2026-11-27", "09:00", 0, dt("2026-11-27 08:59:59")).unwrap());
        assert!(is_reminder_due_at("2026-11-27", "09:00", 0, dt("2026-11-27 09:00:07")).unwrap());
        assert!(is_reminder_due_at("2026-11-27", "09:00", 0, dt("2026-11-27 09:01:00")).unwrap());
        assert!(!is_reminder_due_at("2026-11-27", "09:00", 0, dt("2026-11-27 09:01:01")).unwrap());

        // Cross-midnight: tomorrow 00:05 with lead 10 min triggers at today 23:55
        assert!(is_reminder_due_at("2026-11-28", "00:05", 10, dt("2026-11-27 23:55:04")).unwrap());
        assert!(!is_reminder_due_at("2026-11-28", "00:05", 10, dt("2026-11-27 23:54:59")).unwrap());

        // 1440 min (24h) ahead
        assert!(is_reminder_due_at("2026-11-28", "10:00", 1440, dt("2026-11-27 10:00:08")).unwrap());
    }
}
