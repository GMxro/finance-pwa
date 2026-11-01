---
name: Sync Protocol
description: Offline sync engine behavior, idempotency, tombstones, and cursor management
type: feedback
date: 2026-10-31
review_after: 2027-05-01
---

## Overview

Offline-first for **transaction creation only**. Edits and deletes require connectivity. Sync engine (`src/local-data/sync-engine.ts` client, `src/worker/application/sync/sync-engine.ts` server) coordinates push/pull via cursor-based pagination.

## Data Structures

### Local (IndexedDB via Dexie)
- `transactions`: Cached server rows + pending creates (`synced: 0|1`, `deletedAt?`, `localId?`)
- `outbox`: Pending creates only (`operationId`, `entityType: 'transaction'`, `payload`, `userId`, `createdAt`)
- `syncState`: `cursor` (last `change_seq`), `epoch`, `lastPullAt`

### Server (D1)
- `transactions`: Authoritative, `change_seq` monotonic per user, `version` for optimistic locking, `deleted_at` tombstone
- `user_sync_state`: `sequence` (cursor), `epoch`
- `sync_operations`: Idempotency log `(user_id, operation_id, entity_type, entity_id, payload_hash, applied_at, result_json)`

## Push (Client → Server)

1. Client reads outbox for **active user only** (filter by `userId`)
2. Batches ≤ 50 ops, ≤ 256 KiB body
3. Server validates **each op against strict contract** (same as CRUD)
4. Idempotency check: `(user_id, operation_id, entity_type, entity_id)` + payload hash
   - Match + same hash → return previous result (idempotent)
   - Match + different hash → **conflict error** (do not apply)
   - No match → apply, log operation, return new result
5. Response: `{ applied: [{ operationId, entityId, ... }], conflicts: [...] }`
6. Client removes **only confirmed `operationId`s** from outbox in same local transaction as cache update

## Pull (Server → Client)

1. Client sends `cursor` (last `change_seq`) and `epoch`
2. Server returns pages of changes (`change_seq > cursor`) up to limit (100/page)
3. Each change: `{ type: 'upsert'|'delete', entity, change_seq }`
4. **Tombstones (`type: 'delete'`)**:
   - Client MUST apply `deletedAt` to local cache row atomically
   - Row excluded from all queries (`transaction-store.ts` filters `deletedAt`)
   - Do NOT just mark `synced: true` — that leaves stale data visible
7. **Upserts**: Server version wins for synced rows. Local pending creates (with outbox entry) overlay.
8. Client updates `cursor` to max `change_seq` received, persists atomically with cache changes

## Full Sync / Epoch Change

- Triggered on epoch mismatch or manual "Full sync"
- Server returns **all** user's transactions (paginated), including tombstones (`deletedAt`) for removed rows
- Client rebuilds cache: **preserve only outbox items owned by active user**
- **Apply tombstones from the full-sync response** to local cache (set `deletedAt`), same as incremental pull. Do not ignore deletes during full sync — otherwise removed transactions reappear (F-23).
- Critical: Filter `outbox` by `userId` before preserving. Old code preserved all users' pending items (A-1)

## Cursor & Concurrency (Critical)

- `change_seq` assigned via `getNextSequence()` **outside** mutation batch (race risk F-05)
- Two concurrent creates can reserve N/N+1 but commit out of order
- Pull uses `change_seq > cursor` — a late commit with lower seq can be missed
- **Fix needed**: Reserve sequence, mutate, and advance cursor atomically (single transaction or monotonic guarantee)

## Delete Path (Server)

1. Reserve `change_seq` via `getNextSequence()`
2. Write tombstone to R2 (journal)
3. Conditional update `transactions SET deleted_at=..., version=version+1 WHERE id=? AND version=?`
4. **Only on `changes()=1`**: Advance `user_sync_state.sequence` to reserved `change_seq`
5. If version conflict: Do NOT advance cursor. Return conflict to client.

## Error Handling

- Sync engine returns `{ ok: true, ... } | { ok: false, error: SyncError }`
- `SyncError` discriminated: `'network' | 'auth' | 'rate_limit' | 'server' | 'validation' | 'conflict' | 'unknown'`
- Pages **must** check `ok` and show explicit error/stale indicator. Never silently continue on failure (A-13, F-15)

## Background Sync

- Service worker emits `SYNC_WAKEUP` on `sync` event
- Client registers `message` listener in `providers.tsx` (global, not per-page)
- On `online`/`focus`: trigger sync if outbox not empty, deduplicated by `userId`

## Testing Requirements

- Two users same browser: CRUD/sync never cross-leak
- Same `operationId` + same payload → idempotent success
- Same `operationId` + different payload/entity → conflict
- Tombstone received → removed from cache, excluded from totals
- Delete with stale version → conflict, cursor not advanced
- Full sync preserves only active user's outbox items