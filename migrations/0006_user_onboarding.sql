CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id TEXT PRIMARY KEY,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

INSERT INTO user_onboarding (user_id, completed_at)
SELECT id, COALESCE(updatedAt, createdAt, 0) FROM "user" WHERE 1
ON CONFLICT(user_id) DO NOTHING;
