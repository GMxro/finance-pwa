import { describe, expect, it } from 'vitest';
import app from '../../src/worker/index';

const baseEnv = {
  BETTER_AUTH_URL: 'https://finance-pwa.test'
};

async function requestHealth(minimumVersion: string | undefined, appVersion?: string) {
  const headers = new Headers();
  if (appVersion !== undefined) headers.set('X-App-Version', appVersion);

  return app.fetch(
    new Request('https://finance-pwa.test/api/health', { headers }),
    { ...baseEnv, MIN_APP_VERSION: minimumVersion } as never,
    undefined
  );
}

describe('minimum app version', () => {
  it('rejects a missing client version when a minimum is configured', async () => {
    const response = await requestHealth('0.2.0');

    expect(response.status).toBe(426);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UPDATE_REQUIRED',
      minimumVersion: '0.2.0'
    });
  });

  it('rejects clients below the configured minimum', async () => {
    const response = await requestHealth('0.2.0', '0.1.9');

    expect(response.status).toBe(426);
  });

  it('rejects malformed and out-of-range client versions', async () => {
    const malformed = await requestHealth('0.2.0', '0.2');
    const oversized = await requestHealth('0.2.0', '999999999999999999999.0.0');

    expect(malformed.status).toBe(426);
    expect(oversized.status).toBe(426);
  });

  it('accepts the minimum and newer client versions', async () => {
    const minimum = await requestHealth('0.2.0', '0.2.0');
    const newer = await requestHealth('0.2.0', '0.10.0');

    expect(minimum.status).toBe(200);
    expect(newer.status).toBe(200);
  });

  it('lets the browser return from Google OAuth without an app-version header', async () => {
    const response = await app.fetch(
      new Request('https://finance-pwa.test/api/auth/callback/google'),
      { ...baseEnv, MIN_APP_VERSION: '0.2.0' } as never,
      undefined
    );

    expect(response.status).not.toBe(426);
  });

  it('does not block clients when no minimum is configured', async () => {
    const response = await requestHealth(undefined);

    expect(response.status).toBe(200);
  });

  it('does not block clients when the configured minimum is empty', async () => {
    const response = await requestHealth('');

    expect(response.status).toBe(200);
  });

  it('fails closed when the configured minimum is malformed', async () => {
    const response = await requestHealth('not-a-version', '0.2.0');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'VERSION_POLICY_INVALID' });
  });
});
