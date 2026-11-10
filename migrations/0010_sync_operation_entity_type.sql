-- Migration 0010: add entity_type to sync_operations (SYNC-08)
-- Adds the missing entity_type column for idempotency scoping.
-- Idempotent: safe to run on databases that already have the column.
ALTER TABLE sync_operations ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'transaction';
