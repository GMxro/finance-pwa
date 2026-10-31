CREATE TABLE IF NOT EXISTS account_deletion_receipts (
  request_id TEXT PRIMARY KEY,
  owner_binding TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  user_id TEXT,
  journal_cursor TEXT,
  journal_complete INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_owner_hash ON account_deletion_receipts(owner_hash);

CREATE TABLE IF NOT EXISTS account_deletion_items (
  request_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, transaction_id),
  FOREIGN KEY (request_id) REFERENCES account_deletion_receipts(request_id) ON DELETE CASCADE
);
