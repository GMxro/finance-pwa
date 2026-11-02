-- Cuentas propias y transferencias entre ellas.
-- Una transferencia mueve plata entre cuentas del mismo usuario: no es ingreso
-- ni gasto, por eso vive en su propia tabla y nunca entra en los totales.

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

