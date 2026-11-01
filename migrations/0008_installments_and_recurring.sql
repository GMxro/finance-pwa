-- Migración 0008: Cuotas, recurrencias, compromisos y origen de transacciones

-- Planes de cuotas (metadata; las cuotas son transacciones)
CREATE TABLE IF NOT EXISTS installment_plans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  installments_count INTEGER NOT NULL CHECK (installments_count >= 2 AND installments_count <= 999),
  category_id TEXT NOT NULL,
  account_id TEXT,
  first_due_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_installment_plans_user ON installment_plans(user_id, cancelled_at);

-- Items de cuota (tracking; transacción ya existe)
CREATE TABLE IF NOT EXISTS installment_items (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_on TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('posted','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (plan_id, installment_number),
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_installment_items_user_due ON installment_items(user_id, due_on);
CREATE INDEX IF NOT EXISTS idx_installment_items_plan ON installment_items(plan_id);

-- Reglas recurrentes
CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  concept TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  category_id TEXT NOT NULL,
  account_id TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('never','daily','weekly_days','weekend','weekly','biweekly','four_weekly','monthly','month_end','bimonthly','trimonthly','fourmonthly','sixmonthly','yearly')),
  day_of_month INTEGER,
  days_of_week INTEGER,
  month_of_year INTEGER,
  start_on TEXT NOT NULL,
  end_on TEXT,
  next_due_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_active ON recurring_rules(user_id, active, next_due_on);

-- Ocurrencias recurrentes materializadas
CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('posted','cancelled','skipped')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (rule_id, due_on),
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_user_due ON recurring_occurrences(user_id, due_on);

-- Origen en transacciones (para identificación y filtrado)
ALTER TABLE transactions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','installment','recurring'));
ALTER TABLE transactions ADD COLUMN source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_user_source ON transactions(user_id, source_type, source_id);
