import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../../src/local-data/database';

describe('browser storage persistence request', () => {
  it('does not request persistence again when the browser already granted it', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() };
    await expect(requestPersistentStorage(storage)).resolves.toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('reports denial without deleting or blocking local data', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) };
    await expect(requestPersistentStorage(storage)).resolves.toBe(false);
    expect(storage.persist).toHaveBeenCalledTimes(1);
  });

  it('treats unavailable storage APIs as a non-persistent browser', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(false);
  });
});
