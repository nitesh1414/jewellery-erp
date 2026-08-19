use std::sync::Mutex;
use tauri::{Manager, State};

pub mod commands;
pub mod offline;
pub mod printer;
pub mod state;

use commands::*;
use offline::{init_offline_db, OfflineStore};
use printer::ThermalPrinter;

/// Application state holder shared across commands
pub struct AppState {
    pub connected_printer: Mutex<Option<ThermalPrinter>>,
    pub offline_store: Mutex<Option<OfflineStore>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Initialize offline database
            let app_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_dir).ok();

            let db_path = app_dir.join("jewellery-offline.db");
            log::info!("📁 App data dir: {:?}", app_dir);
            log::info!("💾 Offline DB path: {:?}", db_path);

            let store = init_offline_db(&db_path).expect("Failed to initialize offline DB");
            app.manage(AppState {
                connected_printer: Mutex::new(None),
                offline_store: Mutex::new(Some(store)),
            });

            // Start background sync service
            app.handle().clone();

            log::info!("✅ Jewellery ERP Desktop started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // System commands
            get_app_info,
            get_system_info,

            // Printer commands
            list_thermal_printers,
            print_thermal_receipt,
            connect_printer,
            disconnect_printer,
            print_bill,

            // Barcode scanner commands
            list_serial_ports,
            test_serial_port,

            // File system commands
            save_pdf_to_file,
            export_data,
            import_data,

            // Offline / sync commands
            get_offline_status,
            sync_pending_transactions,
            cache_bill_for_offline,

            // App lifecycle
            exit_app,
            restart_app,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Allow close for proper app shutdown
                let _ = api;
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
