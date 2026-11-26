mod commands;
mod core_schedule;
mod data_store;
mod export_service;

use std::sync::Mutex;

use data_store::DataStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = DataStore::initialize().expect("初始化本地 SQLite 数据库失败");

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(store))
        .invoke_handler(tauri::generate_handler![
            commands::get_week,
            commands::get_day,
            commands::upsert_focus,
            commands::delete_focus,
            commands::upsert_task,
            commands::delete_task,
            commands::upsert_memo,
            commands::delete_memo,
            commands::reorder_items,
            commands::get_settings,
            commands::update_data_dir,
            commands::export_week_markdown,
            commands::export_json_backup,
            commands::restore_json_backup,
        ])
        .run(tauri::generate_context!())
        .expect("启动本地日程桌面应用失败");
}
