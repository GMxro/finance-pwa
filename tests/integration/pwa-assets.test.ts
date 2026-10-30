import { describe, expect, it } from 'vitest';
import app from '../../src/worker/index';

describe('PWA asset proxy', () => {
  it('serves a cached icon when the browser revalidates its ETag', async () => {
    const assets = {
      async fetch(request: Request) {
        if (request.headers.get('if-none-match') === '"icon-etag"') {
          return new Response(null, {
            status: 304,
            headers: { 'content-type': 'image/png', etag: '"icon-etag"' }
          });
        }

        return new Response('png image bytes', {
          status: 200,
          headers: { 'content-type': 'image/png', etag: '"icon-etag"' }
        });
      }
    };

    const request = new Request('https://finance-pwa.test/icons/icon-96.png', {
      headers: { 'if-none-match': '"icon-etag"' }
    });
    const response = await app.fetch(request, { ASSETS: assets } as never, undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('png image bytes');
  });
});
