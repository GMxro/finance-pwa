-- Cuentas propias y transferencias entre ellas.
-- Una transferencia mueve plata entre cuentas del mismo usuario: no es ingreso
-- ni gasto, por eso vive en su propia tabla y nunca entra en los totales.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'wallet', 'other')),
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, id)
);

CREATE INDEX idx_accounts_user_sort ON accounts(user_id, archived_at, sort_order);

-- Cada movimiento pertenece a una cuenta. Queda nullable para poder migrar
-- datos existentes; el bootstrap asigna la cuenta por defecto y la aplicación
-- exige una cuenta al crear movimientos nuevos.
ALTER TABLE transactions ADD COLUMN account_id TEXT;

CREATE TABLE transfers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  from_amount_minor INTEGER NOT NULL CHECK (from_amount_minor > 0),
  from_currency_code TEXT NOT NULL CHECK (from_currency_code IN ('ARS', 'USD')),
  to_amount_minor INTEGER NOT NULL CHECK (to_amount_minor > 0),
  to_currency_code TEXT NOT NULL CHECK (to_currency_code IN ('ARS', 'USD')),
  occurred_on TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (from_account_id <> to_account_id),
  FOREIGN KEY (user_id, from_account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, to_account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_transfers_user_occurred ON transfers(user_id, occurred_on DESC, id);
CREATE INDEX idx_transfers_user_from ON transfers(user_id, from_account_id);
CREATE INDEX idx_transfers_user_to ON transfers(user_id, to_account_id);

CREATE INDEX idx_transactions_user_account ON transactions(user_id, account_id, occurred_on DESC);
