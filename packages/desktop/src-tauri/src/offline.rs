use std::path::Path;
use rusqlite::{params, Connection};
use crate::state::PendingTransaction;
use chrono::Utc;

pub struct OfflineStore {
    pub conn: Connection,
}

pub fn init_offline_db(db_path: &Path) -> rusqlite::Result<OfflineStore> {
    let conn = Connection::open(db_path)?;

    // Create required tables
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS pending_transactions (
            id TEXT PRIMARY KEY,
            transaction_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            retries INTEGER DEFAULT 0,
            status TEXT DEFAULT 'PENDING',
            error TEXT
        );

        CREATE TABLE IF NOT EXISTS cached_bills (
            id TEXT PRIMARY KEY,
            bill_number TEXT NOT NULL,
            bill_data TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_transactions(status);
        CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_transactions(created_at);
        "#,
    )?;

    Ok(OfflineStore { conn })
}

impl OfflineStore {
    /// Save a pending transaction to be synced when online
    pub fn save_pending(&self, tx: &PendingTransaction) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO pending_transactions
             (id, transaction_type, payload, created_at, retries, status, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                tx.id,
                tx.transaction_type,
                tx.payload,
                tx.created_at.to_rfc3339(),
                tx.retries,
                tx.status,
                tx.error,
            ],
        )?;
        Ok(())
    }

    /// Get all pending transactions to sync
    pub fn get_pending(&self) -> rusqlite::Result<Vec<PendingTransaction>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, transaction_type, payload, created_at, retries, status, error
             FROM pending_transactions WHERE status = 'PENDING' ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let tx_type: String = row.get(1)?;
            let payload: String = row.get(2)?;
            let created_at_str: String = row.get(3)?;
            let retries: i32 = row.get(4)?;
            let status: String = row.get(5)?;
            let error: Option<String> = row.get(6)?;

            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(PendingTransaction {
                id,
                transaction_type: tx_type,
                payload,
                created_at,
                retries,
                status,
                error,
            })
        })?;

        let mut pending = Vec::new();
        for r in rows {
            pending.push(r?);
        }
        Ok(pending)
    }

    /// Mark a transaction as synced
    pub fn mark_synced(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE pending_transactions SET status = 'SYNCED' WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Increment retry count
    pub fn increment_retry(&self, id: &str, error: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE pending_transactions
             SET retries = retries + 1, error = ?2
             WHERE id = ?1",
            params![id, error],
        )?;
        Ok(())
    }

    /// Cache a bill
    pub fn cache_bill(&self, bill_id: &str, bill_number: &str, data: &str) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR REPLACE INTO cached_bills (id, bill_number, bill_data, cached_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![bill_id, bill_number, data, now],
        )?;
        Ok(())
    }

    /// Get pending count
    pub fn pending_count(&self) -> rusqlite::Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pending_transactions WHERE status = 'PENDING'",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Set/Get config
    pub fn set_config(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO app_config (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_config(&self, key: &str) -> rusqlite::Result<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
