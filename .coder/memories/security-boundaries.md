---
name: Security Boundaries
description: Origin validation, rate limits, body limits, and authentication patterns
type: feedback
date: 2026-10-31
review_after: 2027-04-30
---

## Authentication & Session

- **Better Auth** with Google OAuth. Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- **Session middleware** (`src/worker/middleware/session.ts`): Validates cookie, attaches `user` to context. All business routes mounted under this middleware.
- **No API keys / bearer tokens** for user operations. Session cookie only.
- **OAuth tokens**: Never persisted. Better Auth handles refresh internally.

## Same-Origin / CSRF Protection (`src/worker/middleware/same-origin.ts`)

### Current Rule (Fixed A-12)
```typescript
const ALLOWED_ORIGIN = env.BETTER_AUTH_URL; // Explicit allowlist only
// Request origin must EXACTLY match ALLOWED_ORIGIN
```

### What Was Fixed
- **Before**: Accepted origin if it matched `new URL(request.url).origin` OR `BETTER_AUTH_URL`
- **Risk**: Behind proxy/alternate hostname, `request.url` origin may be attacker-controlled
- **After**: Single explicit allowlist from `BETTER_AUTH_URL` (configured per deployment)

### Defense in Depth
- `SameSite=Lax` cookies (blocks most cross-site POST)
- Same-origin middleware on all mutating routes + sync
- Better Auth CSRF protection on auth endpoints
- No `Access-Control-Allow-Credentials: true` with wildcard origin

## Rate Limiting (D1-backed, `src/worker/middleware/rate-limit.ts`)

| Endpoint Class | Limit | Window | Key |
|---|---|---|---|
| Auth (`/api/auth/*`) | 30 | 1 min | IP (`cf-connecting-ip`) |
| Reads (GET transactions, accounts, budgets, categories, stats) | 180 | 1 min | `user_id` |
| Mutations (POST/PATCH/DELETE transactions, accounts, budgets, categories, transfers) | 60 | 1 min | `user_id` |
| Sync push (`/api/sync` POST) | 20 | 1 min | `user_id` |
| Account delete check | 30 | 1 min | IP |

- **Implementation**: Sliding window via D1 `rate_limit_entries(key, window_start, count)`
- **`cf-connecting-ip`**: Trusted header from Cloudflare. Verify ingress config passes it through.
- **Response on limit**: `429 Too Many Requests` with `Retry-After` header

## Body Size Limits

| Endpoint | Limit | Enforced By |
|---|---|---|
| General API (`/api/*`) | 1 MiB | Worker request parsing |
| Sync (`/api/sync`) | 256 KiB | Explicit check in route |
| Sync batch | 50 operations | Explicit count validation |

- Oversized body → `413 Payload Too Large`
- Sync batch > 50 ops → `400` with validation error

## Account Deletion — Saga vs. Built-in (A-7, F-06, F-20)

### App Saga (`/api/account/delete`) — **Use This**
1. Client sends `POST /api/account/delete` with `requestId` (idempotency key)
2. Server creates journal markers in R2 (idempotent by `requestId`)
3. Deletes D1 data in batched transaction (transactions, budgets, categories, accounts, transfers, sync state)
4. Completes R2 journal cleanup (paginated, resumable)
5. Returns receipt; client clears local data **only on confirmed success**

### Better Auth Built-in (`/api/auth/delete-user`) — **Disabled**
```typescript
// worker/auth/auth.ts
user: {
  deleteUser: { enabled: false } // Was true — security risk
}
```

- **Risk**: Bypasses confirmation, R2 journal, local cleanup, `requestId` idempotency
- **Cascades**: Depends on D1 FK constraints (may partial-fail silently)
- **Action**: Keep disabled. All deletions via app saga.

## Sync Endpoint Hardening (A-4)

- **Contract validation**: Each operation validated against `contracts/sync.ts` schemas (create/update/delete per entity)
- **No generic `z.object()`** — strict per-type schemas reused from CRUD contracts
- **Field-level**: Distinguish omitted fields (unchanged) from explicit `null`/`0` (invalid for required)
- **Unknown fields**: Reject (strict mode)

## Data Isolation

- **D1**: Every query filters `WHERE user_id = ?` (parameterized). Composite FKs anchor relations to user.
- **R2**: Journal keys prefixed with `user_${userId}/`
- **IndexedDB**: All tables include `userId`. Full sync/outbox reads **must filter by active `userId`** (A-1 fix)

## Headers (`src/worker/middleware/security-headers.ts`)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.googleapis.com; frame-ancestors 'none';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

- Applied to all responses via middleware

## Local Data Protection (A-10)

- **IndexedDB**: Not encrypted. Accessible to any code running in same origin.
- **Mitigations**:
  - Minimize offline data (only transaction creates)
  - Clear user's data on logout (optional, with warning if pending outbox)
  - `navigator.storage.persist()` requested (not guaranteed)
  - Document limitation in `OFFLINE-SYNC.md` and Settings
- **No false security**: Do not add client-side encryption with key in JS (XSS defeats it)

## Testing Requirements

- Same-origin: Request with spoofed `Origin` header → 403
- Rate limit: Burst requests → 429 with `Retry-After`
- Sync batch: 51 operations → 400; 300 KiB body → 413
- Auth delete endpoint: Direct call → 404/403 (disabled)
- Ownership: User A cannot read/modify User B data via any route (including sync)
- Idempotency: Same `requestId` on delete → same receipt; different payload same `operationId` → conflict