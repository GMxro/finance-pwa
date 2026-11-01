---
name: Project Conventions
description: Coding patterns, validation rules, and architectural decisions established during audit fixes
type: feedback
date: 2026-10-31
review_after: 2027-05-01
---

## Architecture & Layering

- **Worker routes** (`src/worker/routes/*.ts`): Thin HTTP layer — parse, validate contract, call application service, return response. No business logic.
- **Application services** (`src/worker/application/*/*.ts`): Pure business logic, D1 transactions, R2 operations. Reusable by routes and sync engine.
- **Contracts** (`src/contracts/*.ts`): Single source of truth for request/response schemas. Shared by client API, worker routes, and sync engine.
- **Domain utilities** (`src/domain/*.ts`): Pure functions (money, date, summary, transaction, budget). No side effects, fully testable.
- **Client API** (`src/client/shared/api/client.ts`): Centralized fetch wrapper with error normalization (`{data, error}`), auth headers, base URL.

## Validation Rules

- **All dates**: Validate real calendar date via `domain/date.ts` (`parseDateStrict`), not just regex `YYYY-MM-DD`. Reject `2024-02-31`, `2024-13-01`.
- **All amounts**: Integer minor units (cents). `money.ts` enforces `Number.isSafeInteger`, range ±999,999,999,999. Reject floats, strings, `null`.
- **Pagination**: `limit` max 100, min 1, default 20. Validate in contract, not just service. Reject negative/zero/overflow.
- **Category invariants** (centralized in `transactions.ts` and `budgets.ts`): Must be owned by user, `archived_at IS NULL`, `kind` matches movement type (`expense` for budgets/expenses, `income` for incomes).
- **Transfer amounts**: If `fromCurrency === toCurrency`, `toAmountMinor` MUST equal `fromAmountMinor` (server enforces + contract `refine` + client validation). Contract allows distinct only when currencies differ.

## Financial Calculations

- **Aggregations**: Use `bigint` or checked `number` accumulation in `domain/summary.ts`. Detect overflow before `Number.MAX_SAFE_INTEGER`. Return error if sum exceeds product limit (e.g., ±10^12 minor units).
- **Budget spent**: Compute server-side per period/category/currency via SQL `SUM`. Never trust client-provided `spentMinor` on write responses.
- **Precision**: All internal math in minor units (integers). Format for display only at UI layer via `useCurrencyInput` / `formatAmount`.

## Sync Protocol (see sync-protocol.md)

- **Outbox**: `create` only. `update`/`delete` require online; no local queue for mutations.
- **Full sync**: Partition by `userId`. Preserve only outbox items owned by active user.
- **Tombstones**: Apply `deletedAt` to local cache atomically. Exclude from all queries/aggregations.
- **Merge policy**: Server wins for synced rows. Local outbox items (with matching outbox entry) overlay. No silent stale-data precedence.
- **Idempotency key**: `(user_id, operation_id, entity_type, entity_id)`. Payload hash also stored. Mismatch → conflict.

## Security Boundaries (see security-boundaries.md)

- **Same-origin**: Allowlist only `BETTER_AUTH_URL` (explicit). Do not accept `origin` derived from request URL.
- **Rate limits**: D1-backed, per-user for authenticated, per-IP for auth endpoints. Sync push: 20/min; mutations: 60/min; reads: 180/min.
- **Body limits**: API 1 MiB, Sync 256 KiB, max 50 operations/batch.
- **Better Auth**: `user.deleteUser.enabled = false` (use app's `/api/account/delete` saga). OAuth tokens never persisted.
- **CSRF**: SameSite=Lax cookies + same-origin check. No token in body needed for mutating endpoints.

## React / Client Patterns

- **Hooks**: `useCurrencyInput` must not emit `onChange` when value unchanged (caused render loop F-01). Use `const` for hook results in effects.
- **Error handling**: Check `error` from `apiClient` before using `data`. Show explicit offline/stale indicator when falling back to cache.
- **Date defaults**: Always use `todayLocalISO()` / `currentMonthISO()` from `domain/date.ts`. Never `new Date().toISOString().slice()`.
- **Sync listener**: Global `online`/`focus` listener in `providers.tsx`, not per-page. Deduplicate by `userId`.
- **Modal backdrop**: Close only when `event.target === event.currentTarget` (click on overlay), never on clicks inside content (F-08).
- **Modal busy guard**: Modals accept a `busy` prop; while busy, Escape, overlay click, and close button are disabled (F-24 second pass). Parent sets `busy` during async save/delete.
- **Session bootstrap**: Set `user`/`session` in auth context **only after** bootstrap succeeds; on failure keep unauthenticated and surface error (F-03).
- **Legal acceptance**: After `acceptLegalDocuments` succeeds, update in-memory `legalAcceptance` state; don't require re-fetch to reflect acceptance (F-04).
- **Currency locale**: All currencies format with `es-AR` locale in `useCurrencyInput` (USD was `en-US` — F-02). Keep consistent.
- **DangerZone**: When `onAction` returns a promise, track internal `busy` state and disable controls; don't rely solely on parent `loading` (F-20).
- **Error propagation**: Pages that fall back to cache must propagate the fetch error (e.g. Overview movements) so the UI can show retry, not swallow it (F-13).
- **Known dead/unfinished**: Overview import toggle has state without setter (decide feature or remove); transfers have no UI in TransactionsPage; `getMonthlySummary` returns only first currency. Document, don't assume.

## Testing Standards

- **Unit**: Domain utilities (money, date, summary, budget) — pure functions, exhaustive cases.
- **Integration**: Sync engine (ownership, tombstones, idempotency, conflict), bootstrap, transactions, version.
- **Contract tests**: Validate request/response schemas against actual handler behavior.
- **No React DOM tests yet** — critical gap (F-01 render loop not caught). Add when possible.

## Migration & Deployment

- **Migrations**: Sequential (0001, 0002, 0004, 0005). No 0003 in repo — verify remote state before deploy.
- **Dexie schema**: Current v3. `upgrade` drops all tables — destructive for any pre-v3 clients. Plan version bump + migration if needed.
- **MIN_APP_VERSION**: Must be set in `wrangler.jsonc` to block stale clients.
- **Build**: `prebuild` deletes `dist/`. Use isolated `outDir` for Cloudflare build verification before cleaning.

## UI / Overview (Home)
- **Multi-currency (no conversion)**: Home shows ARS and USD simultaneously and independently; never convert or sum across currencies. Net balance = ingresos − gastos del período (not account available balance). Formats: `+$2.000.000,00` (ARS) and `+US$350,00` (USD) — USD neto always uses `US$` prefix, never bare `$`.
- **Layout**: one black main card (net balance) + two compact white cards (Ingresos/Gastos) side by side. Black card: two columns, label ("Pesos · ARS"/"Dólares · USD") above amount, both left-aligned; eye button top-right aligned with title. No "Actualizado" text.
- **Privacy**: reuse existing `showAmounts` (persisted in localStorage) via setter; don't create a new mechanism. Eye button hides ALL overview amounts consistently; accessible (`aria-pressed`, `aria-label`), clear visual state.
- **Sign-only coloring**: on income/expense cards color only the sign (+ green soft, − red soft, AA contrast); amount stays normal text color. Arrows are visual support, not color-only.
- **Interactive amounts**: each amount is a link opening Movimientos pre-filtered by period, type, and currency. Movements page reads `currency` query param.
- **CSS specificity trap**: `.ui-section:first-of-type { margin-top: 0 }` (Layout.css) and `.ui-page .ui-section.overview-recent` override `.overview-section-spaced`. Use higher specificity (`.ui-page .ui-section.overview-section-spaced`) for section top spacing.
- **Spacing stacking**: `.ui-section` default `margin-top: 48px` + `.overview-section-spaced` 28px = 76px total. Fix: use 28px only. Empty states compacted to 8px gap/padding to avoid "duplicated space" feeling. Multiple vertical gaps stack (margin-top + margin-bottom + padding-top); audit all three when adjusting spacing.
- **Empty states**: align left with section title (same x, no extra padding). Compact spacing (8px gap/padding).
- **"Ver todos"/"Ver historial"**: align to right edge of cards (same right padding as content, not ~25px before).
- **MonthStepper**: disable right arrow (reduced opacity, no hover, `aria-disabled`) when displayed month === current month.

## Sidebar (AppShell)
- **Email overflow**: apply `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to email container.
- **Sync indicator**: renamed "Al día" → "Sincronizado" with tooltip ("Tus datos están guardados y al día").