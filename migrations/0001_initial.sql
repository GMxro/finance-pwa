CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE "session" (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_user ON "session"(userId);

CREATE TABLE "account" (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX idx_account_user ON "account"(userId);
CREATE INDEX idx_account_provider ON "account"(providerId, accountId);

CREATE TABLE "verification" (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX idx_verification_identifier ON "verification"(identifier);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'es-AR',
  time_zone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  default_currency TEXT NOT NULL DEFAULT 'ARS',
  deletion_pending_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'credit_card', 'investment')),
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX idx_accounts_user_sort ON accounts(user_id, archived_at, sort_order);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  color_token TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, slug)
);
CREATE UNIQUE INDEX idx_categories_user_id ON categories(user_id, id);
CREATE INDEX idx_categories_user_kind_sort ON categories(user_id, kind, sort_order);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS', 'USD')),
  occurred_on TEXT NOT NULL,
  note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  change_seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'installment', 'recurring', 'initial')),
  source_id TEXT,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_transactions_user_occurred ON transactions(user_id, occurred_on DESC, id);
CREATE INDEX idx_transactions_user_change_seq ON transactions(user_id, change_seq);
CREATE INDEX idx_transactions_user_category_occurred_kind ON transactions(user_id, category_id, occurred_on, kind);
CREATE INDEX idx_transactions_user_account ON transactions(user_id, account_id, occurred_on DESC);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  period_month TEXT NOT NULL,
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS', 'USD')),
  limit_minor INTEGER NOT NULL CHECK (limit_minor > 0),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  UNIQUE(user_id, category_id, period_month, currency_code)
);
CREATE INDEX idx_budgets_user_period_currency ON budgets(user_id, period_month, currency_code);

CREATE TABLE user_sync_state (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_operations (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'transaction',
  entity_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('applied', 'conflict')),
  error_code TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
