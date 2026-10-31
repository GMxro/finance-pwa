-- Índices para mejorar rendimiento de consultas de sincronización
CREATE INDEX IF NOT EXISTS idx_transactions_user_sync ON transactions(user_id, deleted_at, change_seq);
CREATE INDEX IF NOT EXISTS idx_transactions_user_sync_seq ON transactions(user_id, change_seq);
CREATE INDEX IF NOT EXISTS idx_sync_operations_user_op ON sync_operations(user_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, period_month);
CREATE INDEX IF NOT EXISTS idx_transfers_user_period ON transfers(user_id, occurred_on);