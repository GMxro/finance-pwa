import { describe, expect, it, vi } from 'vitest';
import { sameOriginGuard } from '../../src/worker/middleware/same-origin';

function context(method: string, url: string, origin?: string) {
  return {
    req: {
      method,
      url,
      header: (name: string) => name.toLowerCase() === 'origin' ? origin : undefined
    },
    env: { BETTER_AUTH_URL: 'https://finance.example.com' },
    json: vi.fn(() => 'blocked'),
    header: vi.fn()
  };
}

describe('same-origin guard', () => {
  it('rejects a request whose supplied Host and Origin are both attacker-controlled', async () => {
    const c = context('POST', 'https://attacker.example/api/transactions', 'https://attacker.example');
    const next = vi.fn();
    await sameOriginGuard(c as any, next);
    expect(c.json).toHaveBeenCalledWith({ code: 'FORBIDDEN_ORIGIN', message: 'Origen no permitido' }, 403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects mutations without an Origin header rather than trusting request Host', async () => {
    const c = context('POST', 'https://finance.example.com/api/transactions');
    const next = vi.fn();
    await sameOriginGuard(c as any, next);
    expect(c.json).toHaveBeenCalledWith({ code: 'FORBIDDEN_ORIGIN', message: 'Origen no permitido' }, 403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the configured origin and leaves safe requests available', async () => {
    const next = vi.fn();
    await sameOriginGuard(context('POST', 'https://attacker.example/api/x', 'https://finance.example.com') as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    const safeNext = vi.fn();
    await sameOriginGuard(context('GET', 'https://attacker.example/api/x', 'https://attacker.example') as any, safeNext);
    expect(safeNext).toHaveBeenCalledTimes(1);
  });
});
