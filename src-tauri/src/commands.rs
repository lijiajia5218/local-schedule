use std::sync::Mutex;

use tauri::State;

use crate::core_schedule::{
    AppSettings, BackupPayload, DailyMemo, DailyTask, DayBundle, WeekBundle, WeeklyFocus,
};
use crate::data_store::DataStore;
use crate::export_service::{write_json_backup, write_week_markdown};

pub type StoreState<'a> = State<'a, Mutex<DataStore>>;

#[tauri::command]
pub fn get_week(state: StoreState<'_>, date: String) -> Result<WeekBundle, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.get_week(&date)
}

#[tauri::command]
pub fn get_day(state: StoreState<'_>, date: String) -> Result<DayBundle, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.get_day(&date)
}

#[tauri::command]
pub fn upsert_focus(
    state: StoreState<'_>,
    id: Option<String>,
    week_start: String,
    title: String,
    target_text: Option<String>,
    status_note: Option<String>,
    is_done: bool,
    sort_order: Option<i64>,
) -> Result<WeeklyFocus, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.upsert_focus(
        id,
        week_start,
        title,
        target_text,
        status_note,
        is_done,
        sort_order,
    )
}

#[tauri::command]
pub fn delete_focus(state: StoreState<'_>, id: String) -> Result<(), String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.delete_focus(&id)
}

#[tauri::command]
pub fn upsert_task(
    state: StoreState<'_>,
    id: Option<String>,
    task_date: String,
    start_time: String,
    end_time: String,
    title: String,
    is_done: bool,
    sort_order: Option<i64>,
) -> Result<DailyTask, String> {
    let mut store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.upsert_task(
        id,
        task_date,
        start_time,
        end_time,
        title,
        is_done,
        sort_order,
    )
}

#[tauri::command]
pub fn reorder_items(
    state: StoreState<'_>,
    kind: String,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.reorder_items(&kind, ordered_ids)
}

#[tauri::command]
pub fn delete_task(state: StoreState<'_>, id: String) -> Result<(), String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.delete_task(&id)
}

#[tauri::command]
pub fn upsert_memo(
    state: StoreState<'_>,
    id: Option<String>,
    memo_date: String,
    content: String,
    sort_order: Option<i64>,
) -> Result<DailyMemo, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.upsert_memo(id, memo_date, content, sort_order)
}

#[tauri::command]
pub fn delete_memo(state: StoreState<'_>, id: String) -> Result<(), String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.delete_memo(&id)
}

#[tauri::command]
pub fn get_settings(state: StoreState<'_>) -> Result<AppSettings, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.get_settings()
}

#[tauri::command]
pub fn update_data_dir(state: StoreState<'_>, new_dir: String) -> Result<AppSettings, String> {
    let mut store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.update_data_dir(&new_dir)
}

#[tauri::command]
pub fn export_week_markdown(state: StoreState<'_>, week_start: String) -> Result<String, String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    let week = store.get_week(&week_start)?;
    write_week_markdown(&store.exports_dir(), &week)
}

#[tauri::command]
pub fn export_json_backup(state: StoreState<'_>) -> Result<(String, BackupPayload), String> {
    let store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    let payload = store.export_all()?;
    let path = write_json_backup(&store.exports_dir(), &payload)?;
    Ok((path, payload))
}

#[tauri::command]
pub fn restore_json_backup(state: StoreState<'_>, payload: BackupPayload) -> Result<(), String> {
    let mut store = state.lock().map_err(|_| "获取数据库锁失败".to_string())?;
    store.restore_all(payload)
}
