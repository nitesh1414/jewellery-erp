use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Pending offline transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingTransaction {
    pub id: String,
    pub transaction_type: String, // SALE, PURCHASE, etc.
    pub payload: String, // JSON string of full transaction data
    pub created_at: DateTime<Utc>,
    pub retries: i32,
    pub status: String, // PENDING, SYNCED, FAILED
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
    pub arch: String,
    pub is_offline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub total_memory: u64,
    pub free_memory: u64,
    pub db_path: String,
    pub db_size_bytes: u64,
}
