mod commands;
mod core_schedule;
mod data_store;
mod export_service;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use commands::NotificationDeliveryState;
use data_store::DataStore;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_notification::{NotificationExt, PermissionState};

fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

fn setup_tray(app: &AppHandle, shutdown: Arc<AtomicBool>) -> tauri::Result<()> {
    let show_item = MenuItemBuilder::with_id("show", "显示本地日程").build(app)?;
    let update_item = MenuItemBuilder::with_id("check_update", "检查更新").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出本地日程").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show_item, &separator, &update_item, &quit_item])
        .build()?;

    #[cfg(target_os = "macos")]
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
    #[cfg(not(target_os = "macos"))]
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .tooltip("本地日程")
        .menu(&menu);

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true).show_menu_on_left_click(true);
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.show_menu_on_left_click(false);
    }

    builder
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "check_update" => {
                show_main_window(app);
                let _ = app.emit("tray-check-update", ());
            }
            "quit" => {
                shutdown.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                #[cfg(not(target_os = "macos"))]
                show_main_window(tray.app_handle());
                #[cfg(target_os = "macos")]
                let _ = tray;
            }
        })
        .build(app)?;

    Ok(())
}

fn dispatch_due_reminders(app: &AppHandle) {
    let due_items = {
        let store_state = app.state::<Mutex<DataStore>>();
        let Ok(store) = store_state.lock() else {
            return;
        };
        let now_local = chrono::Local::now().naive_local();
        match store.collect_due_memo_reminders(now_local) {
            Ok(items) => items,
            Err(_) => return,
        }
    };

    for item in due_items {
        let title = if item.lead_minutes == 0 {
            format!("备忘提醒 · {}", item.reminder_time)
        } else {
            format!("备忘提醒 · {} 分钟后 ({})", item.lead_minutes, item.reminder_time)
        };
        let body = item.content.clone();

        let delivery_err: Option<String> = match app.notification().permission_state() {
            Ok(PermissionState::Denied) => {
                Some("系统通知权限已被拒绝，请在系统设置中开启「本地日程」通知权限".to_string())
            }
            _ => match app.notification().builder().title(&title).body(&body).show() {
                Ok(_) => None,
                Err(e) => Some(format!("系统通知发送失败: {}", e)),
            },
        };

        if let Some(delivery_state) = app.try_state::<NotificationDeliveryState>() {
            if let Ok(mut guard) = delivery_state.last_error.lock() {
                *guard = delivery_err;
            }
        }

        // Notify open/visible frontend regardless of OS banner status
        let _ = app.emit("memo-reminder", &item);

        // Always record fired_key even if OS notification failed/denied to prevent 15s retry spam
        let store_state = app.state::<Mutex<DataStore>>();
        if let Ok(store) = store_state.lock() {
            let _ = store.mark_memo_reminder_fired(&item.memo_id, &item.fired_key);
        };
    }
}

fn spawn_reminder_scheduler(app: AppHandle, shutdown: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        // Initial sweep shortly after startup so missed-within-60s reminders fire cleanly
        std::thread::sleep(Duration::from_secs(2));
        while !shutdown.load(Ordering::SeqCst) {
            dispatch_due_reminders(&app);
            for _ in 0..15 {
                if shutdown.load(Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = DataStore::initialize().expect("初始化本地 SQLite 数据库失败");
    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_tray = shutdown.clone();
    let shutdown_setup = shutdown.clone();
    let shutdown_run = shutdown.clone();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    let app = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::new(store))
        .manage(NotificationDeliveryState::default())
        .setup(move |app| {
            setup_tray(app.handle(), shutdown_tray.clone())?;
            spawn_reminder_scheduler(app.handle().clone(), shutdown_setup.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let close_to_tray = {
                        let store_state = window.app_handle().state::<Mutex<DataStore>>();
                        store_state
                            .lock()
                            .ok()
                            .and_then(|s| s.get_settings().ok())
                            .map(|cfg| cfg.close_to_tray)
                            .unwrap_or(true)
                    };
                    if close_to_tray {
                        api.prevent_close();
                        hide_main_window(window.app_handle());
                    }
                }
            }
        })
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
            commands::update_app_settings,
            commands::get_notification_delivery_error,
            commands::send_test_notification,
            commands::export_week_markdown,
            commands::export_json_backup,
            commands::restore_json_backup,
        ])
        .build(tauri::generate_context!())
        .expect("构建本地日程桌面应用失败");

    app.run(move |app_handle, event| {
        match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
            }
            tauri::RunEvent::Exit => {
                shutdown_run.store(true, Ordering::SeqCst);
            }
            _ => {
                let _ = app_handle;
            }
        }
    });
}
