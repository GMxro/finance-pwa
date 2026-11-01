---
name: Audit Methodology
description: How to conduct thorough static audits for this finance PWA
type: feedback
date: 2026-10-31
review_after: 2027-05-01
---

**Conduct multi-pass static audits with concrete evidence**

1. **Inventory every declared route/screen** from router and navigation, not just main features. Cross-reference with actual API endpoints and handler code.

2. **Trace each feature end-to-end**: UI → client API → worker route → application service → database migration/contract. Verify persistence, not just "code exists."

3. **Test offline/sync paths separately**: The outbox/IndexedDB behavior differs from online CRUD. Check full sync, pull, push, tombstones, cursor logic, and merge policies independently.

4. **Validate contracts at boundaries**: Every endpoint must use the same strict schemas (Zod/valibot) for sync, CRUD, and bootstrap. No generic `object()` validation that bypasses business rules.

5. **Check idempotency keys for full identity**: `(user_id, operation_id, entity_type, entity_id)` not just `(user_id, operation_id)`. Mismatched payloads with same ID must return conflict, not silent acceptance.

6. **Audit financial aggregation paths**: Individual amounts have guards (`money.ts`), but sums across pages (`summary.ts`, `budgets.ts`, `accounts.ts`) can overflow `Number.MAX_SAFE_INTEGER`. Impose product limits and detect overflow at aggregation time.

7. **Verify date handling uses local TZ**: Defaults using `new Date().toISOString()` produce UTC dates that shift at 21:00 Argentina time. All date defaults must use `todayLocalISO()` from `domain/date.ts`.

8. **Test ownership isolation under user switching**: Local storage (IndexedDB) is multi-user. Full sync, logout, and login must filter/partition by active `userId`. No global reads that leak data across accounts.

9. **Check for alternate auth routes**: Better Auth's built-in `user.deleteUser` may bypass app-level saga. Disable or integrate with app's confirmation/journal flow.

10. **Verify error propagation**: Sync engine must return discriminated `{ok, error}` not just set internal state. Consumers (pages) must handle and display error vs. stale cache distinctly.

11. **Run typecheck, lint, and tests after every change batch**: The project has `--max-warnings 0`; any new warning blocks CI. Fix ESLint issues (missing deps, unused vars) immediately. Also re-verify after each audit pass: corrections themselves can introduce compile/lint errors (observed TS2552/TS2304 in OverviewPage after pass 1; fixed in pass 2). Never assume a prior pass left the codebase clean.

12. **Document gaps explicitly**: Distinguish "confirmed defect in code" from "risk not reproducible statically." Note what was not verified (browser, production D1/R2, concurrent load).

## Parallel Subagent Coordination
- Up to 6 subagents in parallel. Assign by screen/related interfaces, balanced by real complexity.
- Avoid multiple agents editing the same file simultaneously; centralize shared-component fixes in the main agent.
- Main agent consolidates diagnostics, resolves cross-interface issues, performs final review.

## Per-Element Diagnosis (button-by-button)
- For each interactive element determine: expected behavior, actual behavior, full flow (event → final effects), dependencies (state/hooks/validations/services/API/persistence/sync), diagnosis (functional/partial/defective/unimplemented), correction.
- A button with an attached handler is **not** functional by itself. Follow the complete flow, including conditions that can block execution, silent errors, and post-update UI refresh.

## Regression Investigation Checklist
When recent security/performance/architecture changes may have broken interactions, check:
- Validations or permissions blocking legitimate operations.
- Auth/session changes.
- Endpoint/contract changes between frontend and backend.
- State not updating correctly (hooks/contexts/shared components).
- Incorrect error handling; async operations failing silently.
- Sync/persistence issues.
- Visually enabled elements that execute no action.
- Layers/overlays/styles blocking interaction.

## Correction Priority & Final Review
- Restore full functionality before optimizations/refactors.
- Respect existing architecture; keep legitimate security protections; don't disable necessary validations.
- No unnecessary compatibility, temp code, artificial fallbacks, or superficial fixes.
- Centralize fixes in shared components to avoid duplication.
- Final: no screen left unaudited; interaction inventory; which were broken vs working; verify corrections by code inspection; cross-screen consistency; document residual uncertainty.