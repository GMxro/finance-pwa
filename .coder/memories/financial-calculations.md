---
name: Financial Calculations
description: Precision rules, overflow guards, and aggregation patterns for monetary values
type: feedback
date: 2026-10-31
review_after: 2027-05-01
---

## Core Principle

**All monetary values stored and computed as integer minor units (cents/centavos).** No floating point in storage, aggregation, or business logic. Formatting for display only at UI layer.

## Individual Amount Guards (`src/domain/money.ts`)

```typescript
const MINOR_MAX = 999_999_999_999n; // ~1 trillion minor units
const MINOR_MIN = -MINOR_MAX;

function assertMinorUnits(value: number): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error('Amount must be a safe integer');
  if (value > Number(MINOR_MAX) || value < Number(MINOR_MIN)) throw new Error('Amount exceeds range');
}
```

- Rejects: `NaN`, `Infinity`, floats (`10.5`), strings, `null`, values outside ±999,999,999,999
- Used in: transaction create/update, transfer create, budget create/update, category (none), account (none)

## Aggregation Overflow Risk (Confirmed A-9, F-03)

Individual guards **do not protect sums**. `summary.ts`, `budgets.ts`, `accounts.ts` accumulate with `+=` on `number`.

### Danger Zones
| Location | Operation | Risk |
|---|---|---|
| `domain/summary.ts:29-42` | `income += t.amountMinor` per transaction | 2,000+ txns × 1M minor → overflow |
| `worker/application/budgets/budgets.ts:28,43` | `SUM(amount_minor)` → `Number()` | SQL sum can exceed safe integer |
| `worker/application/accounts/accounts.ts:33-56` | Balance aggregation per currency | Multi-account sum unbounded |
| `src/client/features/accounts/AccountsPage.tsx` | Client-side total per currency | Must use checked accumulation with overflow detection (F-21) |

### Required Pattern (apply to all aggregations)

```typescript
function safeAddSum(current: number, addend: number): number {
  const result = current + addend;
  if (!Number.isSafeInteger(result)) {
    throw new Error('Aggregation overflow: sum exceeds safe integer range');
  }
  return result;
}

// Or use bigint internally:
function sumMinorUnits(amounts: number[]): bigint {
  return amounts.reduce((acc, v) => acc + BigInt(v), 0n);
}
```

### Product Limits (enforce at aggregation boundary)
- Max transactions per query: 100 (paginated), but summary pulls 2 pages → 200 max per call
- Max budget period spend: ±10^12 minor units (≈ 10 billion ARS/USD)
- Max account balance per currency: ±10^12 minor units
- Reject/flag any aggregation exceeding limit — **do not silently wrap**

## Budget Spent Calculation

- **Server-side only**: `SUM(amount_minor)` grouped by `category_id`, `period`, `currency` with `user_id` filter
- Write responses (`createBudget`, `updateBudget`) **must return real `spentMinor`**, not `0` (F-11)
- Client reloads after write, but contract must be correct for any consumer

## Transfer Amounts

- `fromAmountMinor` always stored
- `toAmountMinor` stored; if same currency, server **enforces equality** (F-08)
- Conversion rates: not implemented. If added, store rate as rational (numerator/denominator bigint) to avoid float drift

## Statistics & Reports

- `StatisticsPage` caps at 20 pages × 100 = 2,000 transactions (F-16). Shows truncation warning if more exist.
- `OverviewPage` (summary) now uses the server monthly summary when available; falls back to cached movements only if the summary fails, propagating the error (F-03/F-13). Do not re-introduce client-side aggregation over the first 100 cached rows.
- `getMonthlySummary` (worker) now validates `SUM(amount_minor)` with `Number.isSafeInteger` and throws `ValidationError` on overflow (pass 2). Keep the guard; do not revert to unchecked accumulation.
- Daily average: `totalMinor / daysInPeriod` — use integer division with remainder handling, not float.

## Currency Handling

- Base currency: `default_currency` per user (stored in `user_preferences`, default `ARS`)
- All amounts in minor units of their currency. No auto-conversion.
- Multi-currency aggregates: **keep separate by currency**. Never sum ARS + USD directly.

## Testing Requirements

- `money.test.ts`: Individual guards (safe integer, range, type rejection)
- Aggregation tests: 10,000 transactions at max amount → verify overflow detection
- Budget spent: SQL sum matches manual iteration
- Transfer same-currency: `toAmountMinor === fromAmountMinor` enforced
- Cross-currency: amounts kept separate, no implicit conversion