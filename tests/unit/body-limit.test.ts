import { describe, expect, it, vi } from 'vitest';
import { apiBodyLimit } from '../../src/worker/middleware/body-limit';

function ctx(request: Request) {
  return {
    req: {
      method: request.method,
      raw: request,
      header: (name: string) => request.headers.get(name) ?? undefined
    },
    json: vi.fn((body, status) => ({ body, status }))
  };
}

describe('API request body limit', () => {
  it('rejects a body above one mebibyte even without a trustworthy content-length', async () => {
    const c = ctx(new Request('https://finance.example/api/transactions', {
      method: 'POST', body: 'x'.repeat(1_048_577)
    }));
    const next = vi.fn();

    await apiBodyLimit(c as any, next);

    expect(c.json).toHaveBeenCalledWith({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'El cuerpo de la solicitud supera el tamaño permitido.'
    }, 413);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not read or limit safe methods', async () => {
    const c = ctx(new Request('https://finance.example/api/transactions'));
    const next = vi.fn();
    await apiBodyLimit(c as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
