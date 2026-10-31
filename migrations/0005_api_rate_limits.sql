CREATE TABLE IF NOT EXISTS api_rate_limits (
  actor_key TEXT NOT NULL,
  user_id TEXT,
  bucket TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (actor_key, bucket),
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_started_at);
