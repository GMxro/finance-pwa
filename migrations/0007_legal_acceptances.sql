CREATE TABLE legal_acceptances (
  user_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, terms_version, privacy_version),
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
