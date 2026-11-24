use std::fs;
use std::path::PathBuf;

use chrono::{Datelike, NaiveDate, Weekday};

use crate::core_schedule::{BackupPayload, WeekBundle};

fn weekday_cn(wd: Weekday) -> &'static str {
    match wd {
        Weekday::Mon => "周一",
        Weekday::Tue => "周二",
        Weekday::Wed => "周三",
        Weekday::Thu => "周四",
        Weekday::Fri => "周五",
        Weekday::Sat => "周六",
        Weekday::Sun => "周日",
    }
}

pub fn render_week_markdown(week: &WeekBundle) -> Result<String, String> {
    let start_date = NaiveDate::parse_from_str(&week.week_start, "%Y-%m-%d")
        .map_err(|_| format!("无效周起点日期: {}", week.week_start))?;

    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("# {} 所在周", week.week_start));
    lines.push(String::new());
    lines.push("## 周重点待办".to_string());

    if week.focuses.is_empty() {
        lines.push("- （暂无重点待办）".to_string());
    } else {
        for focus in &week.focuses {
            let mark = if focus.is_done { "x" } else { " " };
            let target = focus
                .target_text
                .as_ref()
                .map(|t| format!("（{}）", t))
                .unwrap_or_default();
            let note = focus
                .status_note
                .as_ref()
                .map(|n| format!("  {}", n))
                .unwrap_or_default();
            lines.push(format!("- [{}] {}{}{}", mark, focus.title, target, note));
        }
    }

    for offset in 0..7 {
        let day = start_date + chrono::Duration::days(offset);
        let date_str = day.format("%Y-%m-%d").to_string();
        let mm_dd = day.format("%m-%d").to_string();
        let wd = weekday_cn(day.weekday());

        lines.push(String::new());
        lines.push(format!("## {} {}", mm_dd, wd));

        let day_tasks: Vec<_> = week
            .tasks
            .iter()
            .filter(|t| t.task_date == date_str)
            .collect();
        let day_memos: Vec<_> = week
            .memos
            .iter()
            .filter(|m| m.memo_date == date_str)
            .collect();

        if day_tasks.is_empty() && day_memos.is_empty() {
            lines.push("- （无日程记录）".to_string());
            continue;
        }

        for task in day_tasks {
            let mark = if task.is_done { "x" } else { " " };
            lines.push(format!(
                "- [{}] {}-{} {}",
                mark, task.start_time, task.end_time, task.title
            ));
        }
        for memo in day_memos {
            lines.push(format!("  - {}", memo.content));
        }
    }

    lines.push(String::new());
    Ok(lines.join("\n"))
}

pub fn write_week_markdown(exports_dir: &PathBuf, week: &WeekBundle) -> Result<String, String> {
    fs::create_dir_all(exports_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
    let content = render_week_markdown(week)?;
    let target_path = exports_dir.join(format!("{}.md", week.week_start));
    fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("写入 Markdown 文件失败: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
}

pub fn write_json_backup(exports_dir: &PathBuf, payload: &BackupPayload) -> Result<String, String> {
    fs::create_dir_all(exports_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
    let json = serde_json::to_string_pretty(payload)
        .map_err(|e| format!("序列化 JSON 备份失败: {}", e))?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target_path = exports_dir.join(format!("backup-{}.json", stamp));
    fs::write(&target_path, json.as_bytes())
        .map_err(|e| format!("写入 JSON 备份失败: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
}
