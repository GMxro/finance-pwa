import { describe, expect, it } from 'vitest';
import { assertSyncItemsOwnedBy } from '../../src/worker/application/sync/ownership';

const SESSION_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('sync operation ownership', () => {
  it('accepts operations for the signed-in account', () => {
    expect(() => assertSyncItemsOwnedBy([
      { userId: SESSION_USER_ID, payload: { amountMinor: 1000 } }
    ], SESSION_USER_ID)).not.toThrow();
  });

  it('rejects a declared owner from another account', () => {
    expect(() => assertSyncItemsOwnedBy([
      { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payload: {} }
    ], SESSION_USER_ID)).toThrow('SYNC_USER_MISMATCH');
  });

  it('rejects a payload owner from another account', () => {
    expect(() => assertSyncItemsOwnedBy([
      { userId: SESSION_USER_ID, payload: { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }
    ], SESSION_USER_ID)).toThrow('SYNC_USER_MISMATCH');
  });
});
