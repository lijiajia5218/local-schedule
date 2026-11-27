use std::fs;
use std::path::{Path, PathBuf};

use chrono::{NaiveDateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::core_schedule::{
    build_fired_key, is_reminder_due_at, parse_time_part, week_end_of, week_start_of, AppSettings,
    BackupPayload, DailyMemo, DailyTask, DayBundle, DueMemoReminder, WeekBundle, WeeklyFocus,
};

const CURRENT_SCHEMA_VERSION: i64 = 3;
const DEFAULT_REMINDER_LEAD_MINUTES: i64 = 10;

pub struct DataStore {
    data_dir: PathBuf,
    conn: Connection,
}

impl DataStore {
    pub fn initialize() -> Result<Self, String> {
        let default_dir = default_data_dir()?;
        let pointer_file = config_pointer_path()?;
        let data_dir = if pointer_file.exists() {
            let saved = fs::read_to_string(&pointer_file)
                .map(|s| PathBuf::from(s.trim()))
                .unwrap_or_else(|_| default_dir.clone());
            if saved.as_os_str().is_empty() {
                default_dir
            } else {
                saved
            }
        } else {
            default_dir
        };

        Self::open_at_dir(data_dir)
    }

    fn open_at_dir(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
        let exports_dir = data_dir.join("exports");
        fs::create_dir_all(&exports_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;

        let db_path = data_dir.join("data.sqlite");
        let conn = Connection::open(&db_path).map_err(|e| format!("打开数据库失败: {}", e))?;

        let mut store = Self { data_dir, conn };
        store.run_migrations()?;
        store.upsert_setting("data_dir", &store.data_dir.to_string_lossy())?;
        Ok(store)
    }

    #[allow(dead_code)]
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn exports_dir(&self) -> PathBuf {
        self.data_dir.join("exports")
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("data.sqlite")
    }

    fn run_migrations(&mut self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER NOT NULL
                );
                ",
            )
            .map_err(|e| format!("初始化 schema_version 失败: {}", e))?;

        let existing_version: Option<i64> = self
            .conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| format!("读取 schema_version 失败: {}", e))?;

        if existing_version.is_none() {
            self.conn
                .execute_batch(
                    "
                    CREATE TABLE IF NOT EXISTS weekly_focus (
                        id TEXT PRIMARY KEY,
                        week_start TEXT NOT NULL,
                        title TEXT NOT NULL,
                        target_text TEXT,
                        status_note TEXT,
                        is_done INTEGER NOT NULL DEFAULT 0,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_weekly_focus_week_start
                        ON weekly_focus(week_start);

                    CREATE TABLE IF NOT EXISTS daily_task (
                        id TEXT PRIMARY KEY,
                        task_date TEXT NOT NULL,
                        start_time TEXT NOT NULL,
                        end_time TEXT NOT NULL,
                        title TEXT NOT NULL,
                        is_done INTEGER NOT NULL DEFAULT 0,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_daily_task_date
                        ON daily_task(task_date);

                    CREATE TABLE IF NOT EXISTS daily_memo (
                        id TEXT PRIMARY KEY,
                        memo_date TEXT NOT NULL,
                        content TEXT NOT NULL,
                        reminder_time TEXT,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_daily_memo_date
                        ON daily_memo(memo_date);

                    CREATE TABLE IF NOT EXISTS memo_reminder_fired (
                        memo_id TEXT PRIMARY KEY,
                        fired_key TEXT NOT NULL,
                        fired_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                    ",
                )
                .map_err(|e| format!("执行数据库建表迁移失败: {}", e))?;

            self.conn
                .execute(
                    "INSERT INTO schema_version (version) VALUES (?1)",
                    params![CURRENT_SCHEMA_VERSION],
                )
                .map_err(|e| format!("写入 schema_version 失败: {}", e))?;
        } else {
            let mut version = existing_version.unwrap_or(1);

            if version < 2 {
                let has_sort_order = self.table_has_column("daily_task", "sort_order")?;
                if !has_sort_order {
                    self.conn
                        .execute(
                            "ALTER TABLE daily_task ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
                            [],
                        )
                        .map_err(|e| format!("升级 daily_task.sort_order 列失败: {}", e))?;
                }

                // Backfill sort_order per task_date preserving chronological order
                let ordered_rows: Vec<(String, String)> = {
                    let mut stmt = self
                        .conn
                        .prepare(
                            "SELECT id, task_date FROM daily_task
                             ORDER BY task_date ASC, start_time ASC, end_time ASC, created_at ASC",
                        )
                        .map_err(|e| format!("查询待办回填排序失败: {}", e))?;
                    let rows = stmt
                        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                        .map_err(|e| format!("读取待办排序数据失败: {}", e))?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| format!("解析待办排序数据失败: {}", e))?;
                    rows
                };

                let tx = self
                    .conn
                    .transaction()
                    .map_err(|e| format!("开启 v2 迁移事务失败: {}", e))?;
                let mut current_date = String::new();
                let mut idx: i64 = 0;
                for (task_id, task_date) in ordered_rows {
                    if task_date != current_date {
                        current_date = task_date;
                        idx = 0;
                    }
                    tx.execute(
                        "UPDATE daily_task SET sort_order = ?1 WHERE id = ?2",
                        params![idx, task_id],
                    )
                    .map_err(|e| format!("回填待办排序失败: {}", e))?;
                    idx += 1;
                }
                tx.execute("UPDATE schema_version SET version = 2", [])
                    .map_err(|e| format!("更新 v2 schema_version 失败: {}", e))?;
                tx.commit()
                    .map_err(|e| format!("提交 v2 迁移事务失败: {}", e))?;
                version = 2;
            }

            if version < 3 {
                let has_reminder_time = self.table_has_column("daily_memo", "reminder_time")?;
                if !has_reminder_time {
                    self.conn
                        .execute("ALTER TABLE daily_memo ADD COLUMN reminder_time TEXT", [])
                        .map_err(|e| format!("升级 daily_memo.reminder_time 列失败: {}", e))?;
                }

                self.conn
                    .execute_batch(
                        "
                        CREATE TABLE IF NOT EXISTS memo_reminder_fired (
                            memo_id TEXT PRIMARY KEY,
                            fired_key TEXT NOT NULL,
                            fired_at TEXT NOT NULL
                        );
                        ",
                    )
                    .map_err(|e| format!("创建 memo_reminder_fired 表失败: {}", e))?;

                self.conn
                    .execute(
                        "UPDATE schema_version SET version = ?1",
                        params![CURRENT_SCHEMA_VERSION],
                    )
                    .map_err(|e| format!("更新 v3 schema_version 失败: {}", e))?;
            }
        }

        Ok(())
    }

    fn table_has_column(&self, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .map_err(|e| format!("检查 {} 表结构失败: {}", table, e))?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| format!("读取 {} 字段失败: {}", table, e))?;
        for col in cols {
            if col.map_err(|e| format!("解析字段名失败: {}", e))? == column {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn read_setting(&self, key: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok()
    }

    fn upsert_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(|e| format!("保存设置失败: {}", e))?;
        Ok(())
    }

    pub fn get_settings(&self) -> Result<AppSettings, String> {
        let version: i64 = self
            .conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap_or(CURRENT_SCHEMA_VERSION);

        let reminder_lead_minutes = self
            .read_setting("reminder_lead_minutes")
            .and_then(|v| v.trim().parse::<i64>().ok())
            .map(|v| v.clamp(0, 1440))
            .unwrap_or(DEFAULT_REMINDER_LEAD_MINUTES);

        let close_to_tray = self
            .read_setting("close_to_tray")
            .map(|v| v.trim() != "false")
            .unwrap_or(true);

        Ok(AppSettings {
            data_dir: self.data_dir.to_string_lossy().to_string(),
            db_path: self.db_path().to_string_lossy().to_string(),
            exports_dir: self.exports_dir().to_string_lossy().to_string(),
            schema_version: version,
            reminder_lead_minutes,
            close_to_tray,
        })
    }

    pub fn update_app_settings(
        &self,
        reminder_lead_minutes: i64,
        close_to_tray: bool,
    ) -> Result<AppSettings, String> {
        if !(0..=1440).contains(&reminder_lead_minutes) {
            return Err("提前提醒时间需在 0 至 1440 分钟之间".to_string());
        }
        self.upsert_setting("reminder_lead_minutes", &reminder_lead_minutes.to_string())?;
        self.upsert_setting(
            "close_to_tray",
            if close_to_tray { "true" } else { "false" },
        )?;
        self.get_settings()
    }

    pub fn update_data_dir(&mut self, new_dir_raw: &str) -> Result<AppSettings, String> {
        let trimmed = new_dir_raw.trim();
        if trimmed.is_empty() {
            return Err("数据目录路径不能为空".to_string());
        }
        let target_dir = expand_tilde(trimmed);
        if target_dir == self.data_dir {
            return self.get_settings();
        }

        fs::create_dir_all(&target_dir).map_err(|e| format!("创建目标目录失败: {}", e))?;
        let target_exports = target_dir.join("exports");
        fs::create_dir_all(&target_exports).map_err(|e| format!("创建导出目录失败: {}", e))?;

        let old_db = self.db_path();
        let new_db = target_dir.join("data.sqlite");

        // Flush and close existing connection before relocating files.
        let placeholder = Connection::open_in_memory()
            .map_err(|e| format!("切换数据库连接失败: {}", e))?;
        let old_conn = std::mem::replace(&mut self.conn, placeholder);
        drop(old_conn);

        if old_db.exists() && !new_db.exists() {
            if fs::rename(&old_db, &new_db).is_err() {
                fs::copy(&old_db, &new_db)
                    .map_err(|e| format!("搬迁数据库文件失败: {}", e))?;
                let _ = fs::remove_file(&old_db);
            }
        }

        let old_exports = self.data_dir.join("exports");
        if old_exports.exists() {
            if let Ok(entries) = fs::read_dir(&old_exports) {
                for entry in entries.flatten() {
                    let src = entry.path();
                    if src.is_file() {
                        if let Some(name) = src.file_name() {
                            let dst = target_exports.join(name);
                            if !dst.exists() {
                                let _ = fs::copy(&src, &dst);
                            }
                        }
                    }
                }
            }
        }

        if let Ok(pointer_file) = config_pointer_path() {
            if let Some(parent) = pointer_file.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&pointer_file, target_dir.to_string_lossy().as_bytes());
        }

        let reopened = Self::open_at_dir(target_dir)?;
        *self = reopened;
        self.get_settings()
    }

    pub fn get_week(&self, any_date_in_week: &str) -> Result<WeekBundle, String> {
        let week_start = week_start_of(any_date_in_week)?;
        let week_end = week_end_of(&week_start)?;

        let mut focus_stmt = self
            .conn
            .prepare(
                "SELECT id, week_start, title, target_text, status_note, is_done, sort_order, created_at, updated_at
                 FROM weekly_focus
                 WHERE week_start = ?1
                 ORDER BY sort_order ASC, created_at ASC",
            )
            .map_err(|e| format!("查询周重点待办失败: {}", e))?;

        let focuses = focus_stmt
            .query_map(params![&week_start], map_focus_row)
            .map_err(|e| format!("读取周重点待办失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析周重点待办失败: {}", e))?;

        let mut task_stmt = self
            .conn
            .prepare(
                "SELECT id, task_date, start_time, end_time, title, is_done, sort_order, created_at, updated_at
                 FROM daily_task
                 WHERE task_date >= ?1 AND task_date <= ?2
                 ORDER BY task_date ASC, sort_order ASC, start_time ASC, end_time ASC, created_at ASC",
            )
            .map_err(|e| format!("查询周任务失败: {}", e))?;

        let tasks = task_stmt
            .query_map(params![&week_start, &week_end], map_task_row)
            .map_err(|e| format!("读取周任务失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析周任务失败: {}", e))?;

        let mut memo_stmt = self
            .conn
            .prepare(
                "SELECT id, memo_date, content, reminder_time, sort_order, created_at, updated_at
                 FROM daily_memo
                 WHERE memo_date >= ?1 AND memo_date <= ?2
                 ORDER BY memo_date ASC, sort_order ASC, created_at ASC",
            )
            .map_err(|e| format!("查询周备忘失败: {}", e))?;

        let memos = memo_stmt
            .query_map(params![&week_start, &week_end], map_memo_row)
            .map_err(|e| format!("读取周备忘失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析周备忘失败: {}", e))?;

        Ok(WeekBundle {
            week_start,
            week_end,
            focuses,
            tasks,
            memos,
        })
    }

    pub fn get_day(&self, date_str: &str) -> Result<DayBundle, String> {
        let mut task_stmt = self
            .conn
            .prepare(
                "SELECT id, task_date, start_time, end_time, title, is_done, sort_order, created_at, updated_at
                 FROM daily_task
                 WHERE task_date = ?1
                 ORDER BY sort_order ASC, start_time ASC, end_time ASC, created_at ASC",
            )
            .map_err(|e| format!("查询日任务失败: {}", e))?;

        let tasks = task_stmt
            .query_map(params![date_str], map_task_row)
            .map_err(|e| format!("读取日任务失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析日任务失败: {}", e))?;

        let mut memo_stmt = self
            .conn
            .prepare(
                "SELECT id, memo_date, content, reminder_time, sort_order, created_at, updated_at
                 FROM daily_memo
                 WHERE memo_date = ?1
                 ORDER BY sort_order ASC, created_at ASC",
            )
            .map_err(|e| format!("查询日备忘失败: {}", e))?;

        let memos = memo_stmt
            .query_map(params![date_str], map_memo_row)
            .map_err(|e| format!("读取日备忘失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析日备忘失败: {}", e))?;

        Ok(DayBundle {
            date: date_str.to_string(),
            tasks,
            memos,
        })
    }

    pub fn upsert_focus(
        &self,
        id: Option<String>,
        week_start_input: String,
        title: String,
        target_text: Option<String>,
        status_note: Option<String>,
        is_done: bool,
        sort_order: Option<i64>,
    ) -> Result<WeeklyFocus, String> {
        let trimmed_title = title.trim().to_string();
        if trimmed_title.is_empty() {
            return Err("周重点待办任务名不能为空".to_string());
        }
        let week_start = week_start_of(&week_start_input)?;
        let now = Utc::now().to_rfc3339();
        let target_clean = target_text.and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() { None } else { Some(t) }
        });
        let note_clean = status_note.and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() { None } else { Some(t) }
        });

        let item_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let existing_created: Option<String> = self
            .conn
            .query_row(
                "SELECT created_at FROM weekly_focus WHERE id = ?1",
                params![&item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("查询重点待办失败: {}", e))?;

        let order_val = match sort_order {
            Some(v) => v,
            None => self
                .conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM weekly_focus WHERE week_start = ?1",
                    params![&week_start],
                    |row| row.get(0),
                )
                .unwrap_or(0),
        };

        let created_at = existing_created.unwrap_or_else(|| now.clone());
        let done_int: i64 = if is_done { 1 } else { 0 };

        self.conn
            .execute(
                "INSERT INTO weekly_focus (id, week_start, title, target_text, status_note, is_done, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    week_start = excluded.week_start,
                    title = excluded.title,
                    target_text = excluded.target_text,
                    status_note = excluded.status_note,
                    is_done = excluded.is_done,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at",
                params![
                    &item_id,
                    &week_start,
                    &trimmed_title,
                    &target_clean,
                    &note_clean,
                    done_int,
                    order_val,
                    &created_at,
                    &now
                ],
            )
            .map_err(|e| format!("保存周重点待办失败: {}", e))?;

        Ok(WeeklyFocus {
            id: item_id,
            week_start,
            title: trimmed_title,
            target_text: target_clean,
            status_note: note_clean,
            is_done,
            sort_order: order_val,
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_focus(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM weekly_focus WHERE id = ?1", params![id])
            .map_err(|e| format!("删除周重点待办失败: {}", e))?;
        Ok(())
    }

    pub fn upsert_task(
        &mut self,
        id: Option<String>,
        task_date: String,
        start_time_raw: String,
        end_time_raw: String,
        title: String,
        is_done: bool,
        sort_order: Option<i64>,
    ) -> Result<DailyTask, String> {
        let trimmed_title = title.trim().to_string();
        if trimmed_title.is_empty() {
            return Err("任务名不能为空".to_string());
        }

        let (start_time, start_min) = parse_time_part(&start_time_raw)?;
        let (end_time, end_min) = parse_time_part(&end_time_raw)?;
        if end_min <= start_min {
            return Err("结束时间必须晚于起始时间，且不支持跨天".to_string());
        }

        let now = Utc::now().to_rfc3339();
        let item_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let existing: Option<(String, i64)> = self
            .conn
            .query_row(
                "SELECT created_at, sort_order FROM daily_task WHERE id = ?1",
                params![&item_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("查询日任务失败: {}", e))?;

        let (created_at, is_new) = match &existing {
            Some((c, _)) => (c.clone(), false),
            None => (now.clone(), true),
        };
        let done_int: i64 = if is_done { 1 } else { 0 };

        let order_val = if let Some(explicit) = sort_order {
            explicit
        } else if let Some((_, existing_order)) = existing {
            existing_order
        } else {
            let siblings: Vec<(String, String)> = {
                let mut stmt = self
                    .conn
                    .prepare(
                        "SELECT id, start_time FROM daily_task
                         WHERE task_date = ?1
                         ORDER BY sort_order ASC, start_time ASC, end_time ASC, created_at ASC",
                    )
                    .map_err(|e| format!("查询当日待办顺序失败: {}", e))?;
                let rows = stmt
                    .query_map(params![&task_date], |row| Ok((row.get(0)?, row.get(1)?)))
                    .map_err(|e| format!("读取当日待办顺序失败: {}", e))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| format!("解析当日待办顺序失败: {}", e))?;
                rows
            };

            let insert_pos = siblings
                .iter()
                .position(|(_, st)| st.as_str() > start_time.as_str())
                .unwrap_or(siblings.len());

            if is_new && insert_pos < siblings.len() {
                let tx = self
                    .conn
                    .transaction()
                    .map_err(|e| format!("开启待办排序事务失败: {}", e))?;
                for (i, (sib_id, _)) in siblings.iter().enumerate() {
                    let target_order = if i >= insert_pos {
                        (i + 1) as i64
                    } else {
                        i as i64
                    };
                    tx.execute(
                        "UPDATE daily_task SET sort_order = ?1 WHERE id = ?2",
                        params![target_order, sib_id],
                    )
                    .map_err(|e| format!("调整待办顺序失败: {}", e))?;
                }
                tx.commit()
                    .map_err(|e| format!("提交待办排序事务失败: {}", e))?;
            }
            insert_pos as i64
        };

        self.conn
            .execute(
                "INSERT INTO daily_task (id, task_date, start_time, end_time, title, is_done, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    task_date = excluded.task_date,
                    start_time = excluded.start_time,
                    end_time = excluded.end_time,
                    title = excluded.title,
                    is_done = excluded.is_done,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at",
                params![
                    &item_id,
                    &task_date,
                    &start_time,
                    &end_time,
                    &trimmed_title,
                    done_int,
                    order_val,
                    &created_at,
                    &now
                ],
            )
            .map_err(|e| format!("保存日任务失败: {}", e))?;

        Ok(DailyTask {
            id: item_id,
            task_date,
            start_time,
            end_time,
            title: trimmed_title,
            is_done,
            sort_order: order_val,
            created_at,
            updated_at: now,
        })
    }

    pub fn reorder_items(&mut self, kind: &str, ordered_ids: Vec<String>) -> Result<(), String> {
        let table = match kind {
            "focus" => "weekly_focus",
            "task" => "daily_task",
            "memo" => "daily_memo",
            _ => return Err(format!("不支持的排序类型: {}", kind)),
        };

        let now = Utc::now().to_rfc3339();
        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("开启拖拽排序事务失败: {}", e))?;

        let sql = format!(
            "UPDATE {} SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            table
        );
        for (idx, item_id) in ordered_ids.iter().enumerate() {
            tx.execute(&sql, params![idx as i64, &now, item_id])
                .map_err(|e| format!("更新排序失败: {}", e))?;
        }
        tx.commit()
            .map_err(|e| format!("提交拖拽排序事务失败: {}", e))?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM daily_task WHERE id = ?1", params![id])
            .map_err(|e| format!("删除日任务失败: {}", e))?;
        Ok(())
    }

    pub fn upsert_memo(
        &self,
        id: Option<String>,
        memo_date: String,
        content: String,
        reminder_time: Option<String>,
        sort_order: Option<i64>,
    ) -> Result<DailyMemo, String> {
        let trimmed_content = content.trim().to_string();
        if trimmed_content.is_empty() {
            return Err("备忘内容不能为空".to_string());
        }

        let normalized_reminder: Option<String> = match reminder_time {
            Some(raw) => {
                let t = raw.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(parse_time_part(t)?.0)
                }
            }
            None => None,
        };

        let now = Utc::now().to_rfc3339();
        let item_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let existing: Option<(String, String, Option<String>)> = self
            .conn
            .query_row(
                "SELECT created_at, memo_date, reminder_time FROM daily_memo WHERE id = ?1",
                params![&item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| format!("查询日备忘失败: {}", e))?;

        let order_val = match sort_order {
            Some(v) => v,
            None => self
                .conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM daily_memo WHERE memo_date = ?1",
                    params![&memo_date],
                    |row| row.get(0),
                )
                .unwrap_or(0),
        };

        let (created_at, should_clear_fired) = match &existing {
            Some((c, old_date, old_rt)) => {
                let schedule_changed = old_date != &memo_date || old_rt != &normalized_reminder;
                (c.clone(), schedule_changed)
            }
            None => (now.clone(), false),
        };

        self.conn
            .execute(
                "INSERT INTO daily_memo (id, memo_date, content, reminder_time, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    memo_date = excluded.memo_date,
                    content = excluded.content,
                    reminder_time = excluded.reminder_time,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at",
                params![
                    &item_id,
                    &memo_date,
                    &trimmed_content,
                    &normalized_reminder,
                    order_val,
                    &created_at,
                    &now
                ],
            )
            .map_err(|e| format!("保存日备忘失败: {}", e))?;

        if should_clear_fired {
            self.conn
                .execute(
                    "DELETE FROM memo_reminder_fired WHERE memo_id = ?1",
                    params![&item_id],
                )
                .map_err(|e| format!("重置备忘提醒去重记录失败: {}", e))?;
        }

        Ok(DailyMemo {
            id: item_id,
            memo_date,
            content: trimmed_content,
            reminder_time: normalized_reminder,
            sort_order: order_val,
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_memo(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM daily_memo WHERE id = ?1", params![id])
            .map_err(|e| format!("删除日备忘失败: {}", e))?;
        self.conn
            .execute("DELETE FROM memo_reminder_fired WHERE memo_id = ?1", params![id])
            .map_err(|e| format!("清理备忘去重记录失败: {}", e))?;
        Ok(())
    }

    pub fn collect_due_memo_reminders(
        &self,
        now_local: NaiveDateTime,
    ) -> Result<Vec<DueMemoReminder>, String> {
        let lead_minutes = self.get_settings()?.reminder_lead_minutes;
        let today = now_local.date().format("%Y-%m-%d").to_string();
        let tomorrow = (now_local.date() + chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();

        let mut stmt = self
            .conn
            .prepare(
                "SELECT m.id, m.memo_date, m.reminder_time, m.content, f.fired_key
                 FROM daily_memo m
                 LEFT JOIN memo_reminder_fired f ON f.memo_id = m.id
                 WHERE m.memo_date IN (?1, ?2)
                   AND m.reminder_time IS NOT NULL
                   AND TRIM(m.reminder_time) <> ''
                 ORDER BY m.memo_date ASC, m.reminder_time ASC, m.sort_order ASC",
            )
            .map_err(|e| format!("查询待提醒备忘失败: {}", e))?;

        let rows = stmt
            .query_map(params![&today, &tomorrow], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| format!("读取待提醒备忘失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析待提醒备忘失败: {}", e))?;

        let mut due = Vec::new();
        for (memo_id, memo_date, reminder_time, content, existing_fired_key) in rows {
            let expected_key = build_fired_key(&memo_date, &reminder_time, lead_minutes);
            // Must compare saved fired_key string, not merely memo_id existence,
            // so changing reminder_lead_minutes can re-arm eligible reminders.
            if existing_fired_key.as_deref() == Some(expected_key.as_str()) {
                continue;
            }
            if let Ok(true) =
                is_reminder_due_at(&memo_date, &reminder_time, lead_minutes, now_local)
            {
                due.push(DueMemoReminder {
                    memo_id,
                    memo_date,
                    reminder_time,
                    content,
                    lead_minutes,
                    fired_key: expected_key,
                });
            }
        }
        Ok(due)
    }

    pub fn mark_memo_reminder_fired(&self, memo_id: &str, fired_key: &str) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        self.conn
            .execute(
                "INSERT INTO memo_reminder_fired (memo_id, fired_key, fired_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(memo_id) DO UPDATE SET
                    fired_key = excluded.fired_key,
                    fired_at = excluded.fired_at",
                params![memo_id, fired_key, now],
            )
            .map_err(|e| format!("写入备忘提醒去重记录失败: {}", e))?;
        Ok(())
    }

    pub fn export_all(&self) -> Result<BackupPayload, String> {
        let mut f_stmt = self
            .conn
            .prepare(
                "SELECT id, week_start, title, target_text, status_note, is_done, sort_order, created_at, updated_at
                 FROM weekly_focus ORDER BY week_start ASC, sort_order ASC",
            )
            .map_err(|e| format!("导出周重点失败: {}", e))?;
        let weekly_focus = f_stmt
            .query_map([], map_focus_row)
            .map_err(|e| format!("读取周重点失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析周重点失败: {}", e))?;

        let mut t_stmt = self
            .conn
            .prepare(
                "SELECT id, task_date, start_time, end_time, title, is_done, sort_order, created_at, updated_at
                 FROM daily_task ORDER BY task_date ASC, sort_order ASC, start_time ASC",
            )
            .map_err(|e| format!("导出日任务失败: {}", e))?;
        let daily_task = t_stmt
            .query_map([], map_task_row)
            .map_err(|e| format!("读取日任务失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析日任务失败: {}", e))?;

        let mut m_stmt = self
            .conn
            .prepare(
                "SELECT id, memo_date, content, reminder_time, sort_order, created_at, updated_at
                 FROM daily_memo ORDER BY memo_date ASC, sort_order ASC",
            )
            .map_err(|e| format!("导出日备忘失败: {}", e))?;
        let daily_memo = m_stmt
            .query_map([], map_memo_row)
            .map_err(|e| format!("读取日备忘失败: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析日备忘失败: {}", e))?;

        Ok(BackupPayload {
            exported_at: Utc::now().to_rfc3339(),
            schema_version: CURRENT_SCHEMA_VERSION,
            weekly_focus,
            daily_task,
            daily_memo,
        })
    }

    pub fn restore_all(&mut self, payload: BackupPayload) -> Result<(), String> {
        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("开启恢复事务失败: {}", e))?;

        tx.execute("DELETE FROM weekly_focus", [])
            .map_err(|e| format!("清空周重点失败: {}", e))?;
        tx.execute("DELETE FROM daily_task", [])
            .map_err(|e| format!("清空日任务失败: {}", e))?;
        tx.execute("DELETE FROM daily_memo", [])
            .map_err(|e| format!("清空日备忘失败: {}", e))?;
        tx.execute("DELETE FROM memo_reminder_fired", [])
            .map_err(|e| format!("清空提醒去重记录失败: {}", e))?;

        for item in payload.weekly_focus {
            tx.execute(
                "INSERT INTO weekly_focus (id, week_start, title, target_text, status_note, is_done, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    item.id,
                    item.week_start,
                    item.title,
                    item.target_text,
                    item.status_note,
                    if item.is_done { 1 } else { 0 },
                    item.sort_order,
                    item.created_at,
                    item.updated_at
                ],
            )
            .map_err(|e| format!("恢复周重点失败: {}", e))?;
        }

        for item in payload.daily_task {
            tx.execute(
                "INSERT INTO daily_task (id, task_date, start_time, end_time, title, is_done, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    item.id,
                    item.task_date,
                    item.start_time,
                    item.end_time,
                    item.title,
                    if item.is_done { 1 } else { 0 },
                    item.sort_order,
                    item.created_at,
                    item.updated_at
                ],
            )
            .map_err(|e| format!("恢复日任务失败: {}", e))?;
        }

        for item in payload.daily_memo {
            tx.execute(
                "INSERT INTO daily_memo (id, memo_date, content, reminder_time, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    item.id,
                    item.memo_date,
                    item.content,
                    item.reminder_time,
                    item.sort_order,
                    item.created_at,
                    item.updated_at
                ],
            )
            .map_err(|e| format!("恢复日备忘失败: {}", e))?;
        }

        tx.commit().map_err(|e| format!("提交恢复事务失败: {}", e))?;
        Ok(())
    }
}

fn expand_tilde(raw: &str) -> PathBuf {
    if raw == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(raw));
    }
    if let Some(rest) = raw.strip_prefix("~/").or_else(|| raw.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(raw)
}

fn default_data_dir() -> Result<PathBuf, String> {
    let base = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "无法定位用户文档目录".to_string())?;
    Ok(base.join("本地日程"))
}

fn config_pointer_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "无法定位应用配置目录".to_string())?;
    Ok(base.join("com.localschedule.app").join("data_dir.txt"))
}

fn map_focus_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WeeklyFocus> {
    let done_int: i64 = row.get(5)?;
    Ok(WeeklyFocus {
        id: row.get(0)?,
        week_start: row.get(1)?,
        title: row.get(2)?,
        target_text: row.get(3)?,
        status_note: row.get(4)?,
        is_done: done_int != 0,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_task_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DailyTask> {
    let done_int: i64 = row.get(5)?;
    Ok(DailyTask {
        id: row.get(0)?,
        task_date: row.get(1)?,
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        title: row.get(4)?,
        is_done: done_int != 0,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_memo_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DailyMemo> {
    Ok(DailyMemo {
        id: row.get(0)?,
        memo_date: row.get(1)?,
        content: row.get(2)?,
        reminder_time: row.get(3)?,
        sort_order: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> (DataStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "local_schedule_test_{}_{}",
            name,
            Uuid::new_v4()
        ));
        let store = DataStore::open_at_dir(dir.clone()).expect("open temp DataStore");
        (store, dir)
    }

    #[test]
    fn test_crud_sorting_weekends_and_backup_restore() {
        let (mut store, dir) = temp_store("mvp");

        // Weekly focus
        let focus = store
            .upsert_focus(
                None,
                "2026-11-25".to_string(),
                "MVP 验收".to_string(),
                Some("1128".to_string()),
                Some("推进中".to_string()),
                false,
                None,
            )
            .unwrap();
        assert_eq!(focus.week_start, "2026-11-23");

        // Tasks added out of order on Sunday (weekend) should return sorted by start_time initially
        let t1 = store
            .upsert_task(
                None,
                "2026-11-29".to_string(),
                "19.30".to_string(),
                "20.30".to_string(),
                "周总结".to_string(),
                false,
                None,
            )
            .unwrap();
        let t2 = store
            .upsert_task(
                None,
                "2026-11-29".to_string(),
                "9".to_string(),
                "10".to_string(),
                "晨读".to_string(),
                true,
                None,
            )
            .unwrap();
        let m1 = store
            .upsert_memo(
                None,
                "2026-11-28".to_string(),
                "周六备忘".to_string(),
                Some("09:00".to_string()),
                None,
            )
            .unwrap();
        assert_eq!(m1.reminder_time.as_deref(), Some("09:00"));

        let week = store.get_week("2026-11-29").unwrap();
        assert_eq!(week.week_start, "2026-11-23");
        assert_eq!(week.focuses.len(), 1);
        assert_eq!(week.tasks.len(), 2);
        assert_eq!(week.tasks[0].start_time, "09:00");
        assert_eq!(week.tasks[1].start_time, "19:30");
        assert_eq!(week.memos.len(), 1);

        // Drag-reorder tasks persists custom order over chronological start_time
        store
            .reorder_items("task", vec![t1.id.clone(), t2.id.clone()])
            .unwrap();
        let reordered_week = store.get_week("2026-11-29").unwrap();
        assert_eq!(reordered_week.tasks[0].id, t1.id);
        assert_eq!(reordered_week.tasks[1].id, t2.id);

        // Reorder memos & focuses
        let m2 = store
            .upsert_memo(
                None,
                "2026-11-28".to_string(),
                "周六备忘2".to_string(),
                None,
                None,
            )
            .unwrap();
        store
            .reorder_items("memo", vec![m2.id.clone(), m1.id.clone()])
            .unwrap();
        let reordered_day = store.get_day("2026-11-28").unwrap();
        assert_eq!(reordered_day.memos[0].id, m2.id);
        assert_eq!(reordered_day.memos[1].id, m1.id);

        // Export & transactional restore
        let backup = store.export_all().unwrap();
        store.delete_focus(&focus.id).unwrap();
        assert_eq!(store.get_week("2026-11-23").unwrap().focuses.len(), 0);

        store.restore_all(backup).unwrap();
        assert_eq!(store.get_week("2026-11-23").unwrap().focuses.len(), 1);
        assert_eq!(store.get_week("2026-11-29").unwrap().tasks[0].id, t1.id);

        drop(store);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_v1_to_v2_migration_backfills_task_sort_order() {
        let dir = std::env::temp_dir().join(format!(
            "local_schedule_mig_{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("data.sqlite");

        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "
                CREATE TABLE schema_version (version INTEGER NOT NULL);
                INSERT INTO schema_version (version) VALUES (1);
                CREATE TABLE weekly_focus (
                    id TEXT PRIMARY KEY,
                    week_start TEXT NOT NULL,
                    title TEXT NOT NULL,
                    target_text TEXT,
                    status_note TEXT,
                    is_done INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE daily_task (
                    id TEXT PRIMARY KEY,
                    task_date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    title TEXT NOT NULL,
                    is_done INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE daily_memo (
                    id TEXT PRIMARY KEY,
                    memo_date TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO daily_task VALUES ('late', '2026-11-25', '15:00', '16:00', '下午', 0, '2026-11-25T01:00:00Z', '2026-11-25T01:00:00Z');
                INSERT INTO daily_task VALUES ('early', '2026-11-25', '09:00', '10:00', '上午', 0, '2026-11-25T02:00:00Z', '2026-11-25T02:00:00Z');
                INSERT INTO daily_memo VALUES ('old-memo', '2026-11-25', '历史带@9:00原文', 0, '2026-11-25T01:00:00Z', '2026-11-25T01:00:00Z');
                ",
            )
            .unwrap();
        }

        let store = DataStore::open_at_dir(dir.clone()).unwrap();
        assert_eq!(store.get_settings().unwrap().schema_version, 3);
        let day = store.get_day("2026-11-25").unwrap();
        assert_eq!(day.tasks.len(), 2);
        assert_eq!(day.tasks[0].id, "early");
        assert_eq!(day.tasks[0].sort_order, 0);
        assert_eq!(day.tasks[1].id, "late");
        assert_eq!(day.tasks[1].sort_order, 1);
        assert_eq!(day.memos.len(), 1);
        assert_eq!(day.memos[0].content, "历史带@9:00原文");
        assert_eq!(day.memos[0].reminder_time, None);

        // Re-opening migrated DB must be idempotent
        drop(store);
        let reopened = DataStore::open_at_dir(dir.clone()).unwrap();
        assert_eq!(reopened.get_settings().unwrap().schema_version, 3);
        assert_eq!(reopened.get_day("2026-11-25").unwrap().memos[0].reminder_time, None);

        drop(reopened);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_v2_to_v3_migration_is_idempotent() {
        let dir = std::env::temp_dir().join(format!(
            "local_schedule_mig_v2_v3_{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("data.sqlite");

        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "
                CREATE TABLE schema_version (version INTEGER NOT NULL);
                INSERT INTO schema_version (version) VALUES (2);
                CREATE TABLE weekly_focus (
                    id TEXT PRIMARY KEY,
                    week_start TEXT NOT NULL,
                    title TEXT NOT NULL,
                    target_text TEXT,
                    status_note TEXT,
                    is_done INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE daily_task (
                    id TEXT PRIMARY KEY,
                    task_date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    title TEXT NOT NULL,
                    is_done INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE daily_memo (
                    id TEXT PRIMARY KEY,
                    memo_date TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO daily_memo VALUES ('m-v2', '2026-11-27', '老数据 @10:00', 0, '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z');
                ",
            )
            .unwrap();
        }

        let store = DataStore::open_at_dir(dir.clone()).unwrap();
        let cfg = store.get_settings().unwrap();
        assert_eq!(cfg.schema_version, 3);
        assert_eq!(cfg.reminder_lead_minutes, 10);
        assert!(cfg.close_to_tray);
        let day = store.get_day("2026-11-27").unwrap();
        assert_eq!(day.memos[0].reminder_time, None);

        drop(store);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_due_memo_reminders_cross_midnight_dedup_key_and_lifecycle() {
        let (mut store, dir) = temp_store("reminders");
        let dt = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap();

        // Create today reminder (09:00) and tomorrow midnight-crossing reminder (00:05)
        let m_today = store
            .upsert_memo(
                None,
                "2026-11-27".to_string(),
                "早会".to_string(),
                Some("9:00".to_string()),
                None,
            )
            .unwrap();
        let m_next = store
            .upsert_memo(
                None,
                "2026-11-28".to_string(),
                "深夜发布".to_string(),
                Some("00:05".to_string()),
                None,
            )
            .unwrap();

        // 1. Default lead=10 -> cross-midnight triggers at 23:55
        let due_cross = store
            .collect_due_memo_reminders(dt("2026-11-27 23:55:10"))
            .unwrap();
        assert_eq!(due_cross.len(), 1);
        assert_eq!(due_cross[0].memo_id, m_next.id);

        // 2. Lead=0 on-time tolerance (09:00:08)
        store.update_app_settings(0, true).unwrap();
        let due_ontime = store
            .collect_due_memo_reminders(dt("2026-11-27 09:00:08"))
            .unwrap();
        assert_eq!(due_ontime.len(), 1);
        assert_eq!(due_ontime[0].memo_id, m_today.id);

        // Fire once at lead=0
        store
            .mark_memo_reminder_fired(&due_ontime[0].memo_id, &due_ontime[0].fired_key)
            .unwrap();

        // Same lead=0 -> deduped
        assert!(store
            .collect_due_memo_reminders(dt("2026-11-27 09:00:30"))
            .unwrap()
            .is_empty());

        // Editing content or reordering must NOT clear fired state
        store
            .upsert_memo(
                Some(m_today.id.clone()),
                "2026-11-27".to_string(),
                "早会（补充材料）".to_string(),
                Some("09:00".to_string()),
                Some(m_today.sort_order),
            )
            .unwrap();
        store.reorder_items("memo", vec![m_today.id.clone()]).unwrap();
        assert!(store
            .collect_due_memo_reminders(dt("2026-11-27 09:00:40"))
            .unwrap()
            .is_empty());

        // Changing lead_minutes changes expected fired_key -> re-arms when in window!
        store.update_app_settings(15, true).unwrap();
        let due_new_lead = store
            .collect_due_memo_reminders(dt("2026-11-27 08:50:00"))
            .unwrap();
        assert_eq!(due_new_lead.len(), 1);
        assert_eq!(due_new_lead[0].fired_key, "2026-11-27|09:00|15");
        store
            .mark_memo_reminder_fired(&due_new_lead[0].memo_id, &due_new_lead[0].fired_key)
            .unwrap();

        // Removing reminder_time clears dedup; re-adding same time allows firing again
        store
            .upsert_memo(
                Some(m_today.id.clone()),
                "2026-11-27".to_string(),
                "早会".to_string(),
                None,
                Some(m_today.sort_order),
            )
            .unwrap();
        store
            .upsert_memo(
                Some(m_today.id.clone()),
                "2026-11-27".to_string(),
                "早会".to_string(),
                Some("09:00".to_string()),
                Some(m_today.sort_order),
            )
            .unwrap();
        let rearmed = store
            .collect_due_memo_reminders(dt("2026-11-27 08:51:00"))
            .unwrap();
        assert_eq!(rearmed.len(), 1);

        // Backup restore clears dedup log cleanly
        let backup = store.export_all().unwrap();
        store
            .mark_memo_reminder_fired(&rearmed[0].memo_id, &rearmed[0].fired_key)
            .unwrap();
        store.restore_all(backup).unwrap();
        assert_eq!(
            store
                .collect_due_memo_reminders(dt("2026-11-27 08:52:00"))
                .unwrap()
                .len(),
            1
        );

        drop(store);
        let _ = fs::remove_dir_all(dir);
    }
}
