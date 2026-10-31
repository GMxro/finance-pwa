---
name: Audit Methodology
description: How to conduct thorough static audits for this finance PWA
type: feedback
date: 2026-10-31
review_after: 2027-04-30
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

11. **Run typecheck, lint, and tests after every change batch**: The project has `--max-warnings 0`; any new warning blocks CI. Fix ESLint issues (missing deps, unused vars) immediately.

12. **Document gaps explicitly**: Distinguish "confirmed defect in code" from "risk not reproducible statically." Note what was not verified (browser, production D1/R2, concurrent load).