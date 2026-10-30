import { describe, expect, it } from 'vitest';
import { isVersionAtLeast } from '../../src/client/app/version-policy';

describe('minimum application version comparison', () => {
  it('allows the minimum version and any greater semantic version', () => {
    expect(isVersionAtLeast('1.2.3', '1.2.3')).toBe(true);
    expect(isVersionAtLeast('1.10.0', '1.2.9')).toBe(true);
  });

  it('requires an update when the installed version is below the minimum', () => {
    expect(isVersionAtLeast('1.2.2', '1.2.3')).toBe(false);
    expect(isVersionAtLeast('0.9.9', '1.0.0')).toBe(false);
  });

  it('fails closed on malformed or out-of-range versions', () => {
    expect(isVersionAtLeast('0.1', '0.1.0')).toBe(false);
    expect(isVersionAtLeast('99999999999999999999.0.0', '0.1.0')).toBe(false);
    expect(isVersionAtLeast('0.2.0', 'not-a-version')).toBe(false);
  });
});
