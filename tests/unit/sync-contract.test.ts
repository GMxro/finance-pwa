import { describe, expect, it } from 'vitest';
import { syncPushSchema } from '../../src/contracts/sync';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createItem(overrides: Record<string, unknown> = {}) {
  return {
    id,
    operationId,
    userId,
    type: 'create',
    payload: {
      id,
      kind: 'expense',
      amountMinor: 100,
      currency: 'ARS',
      categoryId: 'food',
      occurredOn: '2026-10-01',
      note: null
    },
    ...overrides
  };
}

describe('sync push contract', () => {
  it('accepts the nullable note shape produced by offline capture', () => {
    expect(syncPushSchema.safeParse({ epoch: userId, items: [createItem()] }).success).toBe(true);
  });

  it('rejects an entity ID that differs from the payload ID', () => {
    const result = syncPushSchema.safeParse({ epoch: userId, items: [createItem({ id: operationId })] });
    expect(result.success).toBe(false);
  });

  it('rejects zero amounts and unknown fields rather than stripping them', () => {
    const zero = createItem({
      payload: { ...(createItem().payload as object), amountMinor: 0 }
    });
    const extra = createItem({ payload: { ...(createItem().payload as object), isAdmin: true } });
    expect(syncPushSchema.safeParse({ epoch: userId, items: [zero] }).success).toBe(false);
    expect(syncPushSchema.safeParse({ epoch: userId, items: [extra] }).success).toBe(false);
  });

  it('caps a batch at fifty operations', () => {
    const items = Array.from({ length: 51 }, (_, index) => createItem({ operationId: `${index}` }));
    expect(syncPushSchema.safeParse({ epoch: userId, items }).success).toBe(false);
  });
});
