export const REQUIRED_APP_VERSION_KEY = 'finance-pwa:required-version';

type Version = [number, number, number];

function parseVersion(version: string): Version | null {
  const match = version.trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) return null;
  const parsed: Version = [Number(match[1]), Number(match[2]), Number(match[3])];
  return parsed.every(Number.isSafeInteger) ? parsed : null;
}

export function isVersionAtLeast(installed: string, minimum: string): boolean {
  const current = parseVersion(installed);
  const required = parseVersion(minimum);
  if (!current || !required) return false;

  for (let index = 0; index < current.length; index += 1) {
    if (current[index]! !== required[index]!) return current[index]! > required[index]!;
  }
  return true;
}
