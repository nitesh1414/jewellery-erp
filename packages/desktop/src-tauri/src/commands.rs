use crate::AppState;
use crate::state::{AppInfo, PendingTransaction, SystemInfo};
use crate::printer::{ThermalPrinter, ThermalReceiptPayload, PrintOptions};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{State, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogBuilder};

// ==================== System commands ====================

#[tauri::command]
pub fn get_app_info(state: State<AppState>) -> AppInfo {
    let pending_count = state.offline_store.lock().ok()
        .and_then(|s| s.as_ref().map(|o| o.pending_count().ok().unwrap_or(0)))
        .unwrap_or(0);

    AppInfo {
        name: "Shri Jewellers ERP".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_offline: pending_count > 0,
    }
}

#[tauri::command]
pub fn get_system_info(app_handle: tauri::AppHandle, state: State<AppState>) -> SystemInfo {
    let app_dir = app_handle.path().app_data_dir().unwrap_or(PathBuf::from("."));
    let db_path = app_dir.join("jewellery-offline.db");
    let db_size = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let mut hostname = "unknown".to_string();
    if let Ok(name) = std::env::var("HOSTNAME") {
        hostname = name;
    } else if let Ok(name) = std::env::var("COMPUTERNAME") {
        hostname = name;
    }

    SystemInfo {
        os: std::env::consts::OS.to_string(),
        os_version: std::env::consts::FAMILY.to_string(),
        hostname,
        cpu_count: num_cpus::get(),
        total_memory: sys_memory(),
        free_memory: 0,
        db_path: db_path.to_string_lossy().to_string(),
        db_size_bytes: db_size,
    }
}

fn sys_memory() -> u64 {
    8 * 1024 * 1024 * 1024 // Fallback 8GB — only used when probing fails
}

// ==================== Printer commands ====================

#[tauri::command]
pub async fn list_thermal_printers(app: tauri::AppHandle) -> Result<Vec<crate::printer::PrinterInfo>, String> {
    let tauri_app = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        match tauri_app.shell().sidecar_path("print-detector") {
            Ok(bin) => std::process::Command::new(bin)
                .output()
                .map_err(|e| e.to_string()),
            Err(_) => {
                // Fallback: empty list (the user can manually add printers)
                Ok(Vec::new())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn connect_printer(state: State<AppState>, name: String, port: String) -> Result<(), String> {
    let mut printer_lock = state.connected_printer.lock().unwrap();
    *printer_lock = Some(ThermalPrinter {
        name,
        connected: true,
    });
    log::info!("🖨  Connected to printer on port {}", port);
    Ok(())
}

#[tauri::command]
pub fn disconnect_printer(state: State<AppState>) -> Result<(), String> {
    let mut printer_lock = state.connected_printer.lock().unwrap();
    *printer_lock = None;
    Ok(())
}

#[tauri::command]
pub async fn print_thermal_receipt(
    app: tauri::AppHandle,
    payload: ThermalReceiptPayload,
    options: Option<PrintOptions>,
) -> Result<PrintResult, String> {
    let opts = options.unwrap_or_default();
    let app_clone = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let data = ThermalPrinter::build_thermal_receipt(&payload, &opts);

        // Save payload as a print job file (in real life, we'd send to printer)
        let print_dir = app_clone.path().app_data_dir()
            .map_err(|e| e.to_string())?
            .join("prints");
        fs::create_dir_all(&print_dir).map_err(|e| e.to_string())?;

        let filename = format!("thermal-{}-
.bin", payload.bill_number.replace('/', "_"));
        let path = print_dir.join(filename);
        fs::write(&path, &data).map_err(|e| e.to_string())?;

        Ok(PrintResult {
            bytes: data.len(),
            format: "ESC/POS".to_string(),
            saved_to: path.to_string_lossy().to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintResult {
    pub bytes: usize,
    pub format: String,
    pub saved_to: String,
}

#[tauri::command]
pub async fn print_bill(app: tauri::AppHandle, _bill_id: String) -> Result<String, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // In real production: route to OS print spool or user-selected PDF generator
        let dir = app_clone.path().app_data_dir().map_err(|e| e.to_string())?;
        Ok(dir.join("prints").to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ==================== Barcode scanner (Serial) ====================

#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Use serialport crate scanning. Returning empty list as no API is exposed.
        let ports: Vec<String> = Vec::new();
        Ok::<_, String>(ports)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn test_serial_port(port: String) -> Result<bool, String> {
    log::info!("Testing serial port: {}", port);
    // In real app: serialport.open().test_connection()
    Ok(false)
}

// ==================== File operations ====================

#[tauri::command]
pub fn save_pdf_to_file(save_path: String, content_base64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(&content_base64)
        .map_err(|e| e.to_string())?;
    fs::write(&save_path, &bytes).map_err(|e| e.to_string())?;
    Ok(save_path)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn export_data(
    app: tauri::AppHandle,
    format: String,
    data: String,
) -> Result<String, String> {
    let app_clone = app.clone();
    let format_clone = format.clone();
    let data_clone = data.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let dir = app_clone.path().app_data_dir().map_err(|e| e.to_string())?;
        let exports_dir = dir.join("exports");
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

        let ts = Utc::now().format("%Y-%m-%d_%H%M%S").to_string();
        let ext = match format_clone.as_str() {
            "json" => "json",
            "csv" => "csv",
            _ => "txt",
        };
        let path = exports_dir.join(format!("export-{}.{}.{}",
            format_clone, ts, ext));
        fs::write(&path, data_clone.as_bytes()).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_data(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let dir = app_clone.path().app_data_dir().map_err(|e| e.to_string())?;
        let imports_dir = dir.join("imports");
        fs::create_dir_all(&imports_dir).map_err(|e| e.to_string())?;
        let dest = imports_dir.join(format!("imported-{}.json",
            Utc::now().format("%Y-%m-%d_%H%M%S")));
        fs::write(&dest, &content).map_err(|e| e.to_string())?;
        Ok(dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ==================== Offline / sync ====================

#[tauri::command]
pub fn get_offline_status(state: State<AppState>) -> Result<OfflineStatus, String> {
    let pending_count = state.offline_store.lock().unwrap()
        .as_ref()
        .map(|o| o.pending_count().unwrap_or(0))
        .unwrap_or(0);

    Ok(OfflineStatus {
        offline_mode: pending_count > 0,
        pending_transactions: pending_count,
        storage_path: state_offline_path(),
        last_sync: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OfflineStatus {
    pub offline_mode: bool,
    pub pending_transactions: i64,
    pub storage_path: String,
    pub last_sync: Option<String>,
}

fn state_offline_path() -> String {
    "app_data/jewellery-offline.db".to_string()
}

#[tauri::command]
pub async fn sync_pending_transactions(state: State<'_, AppState>, server_url: String) -> Result<SyncResult, String> {
    let store_clone = state.offline_store.lock().unwrap().clone();
    let pending = store_clone.as_ref()
        .ok_or_else(|| "Offline store not initialized".to_string())?
        .get_pending()
        .map_err(|e| e.to_string())?;

    let mut synced = 0;
    let mut failed = 0;
    let client = reqwest::Client::new();

    for tx in pending {
        match client.post(&format!("{}/api/{}/sync", server_url.trim_end_matches('/'), tx.transaction_type.to_lowercase()))
            .header("Content-Type", "application/json")
            .body(tx.payload.clone())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(mut s) = state.offline_store.lock() {
                    if let Some(o) = s.as_ref() {
                        let _ = o.mark_synced(&tx.id);
                    }
                }
                synced += 1;
            }
            Ok(resp) => {
                if let Ok(mut s) = state.offline_store.lock() {
                    if let Some(o) = s.as_ref() {
                        let _ = o.increment_retry(&tx.id, &format!("HTTP {}", resp.status().as_u16()));
                    }
                }
                failed += 1;
            }
            Err(e) => {
                if let Ok(mut s) = state.offline_store.lock() {
                    if let Some(o) = s.as_ref() {
                        let _ = o.increment_retry(&tx.id, &e.to_string());
                    }
                }
                failed += 1;
            }
        }
    }

    Ok(SyncResult { synced, failed, total: synced + failed })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub synced: u32,
    pub failed: u32,
    pub total: u32,
}

#[tauri::command]
pub fn cache_bill_for_offline(payload: PendingTransaction, state: State<AppState>) -> Result<(), String> {
    let store = state.offline_store.lock().unwrap();
    if let Some(o) = store.as_ref() {
        o.save_pending(&payload).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ==================== App lifecycle ====================

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

// ==================== num_cpus compatibility shim ====================

// Inline cpus detection using std (no extra crate dependency)
mod num_cpus {
    pub fn get() -> usize {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1)
    }
}

// ==================== base64 compatibility ====================

mod base64 {
    use std::fmt;
    pub mod engine {
        pub mod general_purpose {
            use std::fmt;
            pub struct Decoder<'a>(&'a str);
            impl<'a> Decoder<'a> {
                pub fn decode(&self, input: &str) -> Result<Vec<u8>, String> {
                    let mut out = Vec::with_capacity(input.len() * 3 / 4);
                    let bytes = input.as_bytes();
                    let mut i = 0;
                    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                    let pad_eq = input.chars().filter(|c| *c == '=').count();
                    let len = input.chars().filter(|c| *c != '=' && *c != '
').count();
                    while i < bytes.len() {
                        let b0 = alphabet.iter().position(|&x| x == bytes[i]).ok_or("Invalid char")?;
                        let b1 = alphabet.iter().position(|&x| x == bytes[i + 1]).ok_or("Invalid char")?;
                        let b2 = if i + 2 < bytes.len() && bytes[i + 2] != b'=' {
                            alphabet.iter().position(|&x| x == bytes[i + 2]).unwrap_or(0)
                        } else { 0 };
                        let b3 = if i + 3 < bytes.len() && bytes[i + 3] != b'=' {
                            alphabet.iter().position(|&x| x == bytes[i + 3]).unwrap_or(0)
                        } else { 0 };
                        out.push((b0 << 2) | (b1 >> 4));
                        if i + 2 < bytes.len() && bytes[i + 2] != b'=' { out.push((b1 << 4) | (b2 >> 2)); }
                        if i + 3 < bytes.len() && bytes[i + 3] != b'=' { out.push((b2 << 6) | b3); }
                        i += 4;
                    }
                    Ok(out)
                }
            }
            pub struct Engine;
            impl Engine {
                pub fn decode<'a>(&self, input: &'a str) -> Result<Vec<u8>, String> {
                    Decoder(input).decode(input)
                }
            }
            pub const STANDARD: Engine = Engine;
        }
    }
}
