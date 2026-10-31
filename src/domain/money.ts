// Domain: Money handling - exact arithmetic in minor units (cents)

export type CurrencyCode = 'ARS' | 'USD';
export const MAX_MINOR_UNITS = Number.MAX_SAFE_INTEGER;

export class FinancialRangeError extends RangeError {
  constructor() {
    super('El total excede el rango exacto admitido.');
    this.name = 'FinancialRangeError';
  }
}

export const CURRENCIES: Record<CurrencyCode, { exponent: number; symbol: string; locale: string }> = {
  ARS: { exponent: 2, symbol: '$', locale: 'es-AR' },
  USD: { exponent: 2, symbol: 'US$', locale: 'es-AR' }
};

export function parseAmount(input: string, currency: CurrencyCode): { amountMinor: number; valid: boolean; error?: string } {
  const trimmed = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { amountMinor: 0, valid: false, error: 'Formato inválido. Use números con hasta 2 decimales.' };
  }
  const [intPart, decPart = ''] = trimmed.split('.');
  const exponent = CURRENCIES[currency].exponent;
  const paddedDec = (decPart + '00').slice(0, exponent);
  const amountMinor = Number(intPart + paddedDec);
  if (!Number.isSafeInteger(amountMinor)) {
    return { amountMinor: 0, valid: false, error: 'Importe fuera de rango seguro.' };
  }
  if (amountMinor <= 0) {
    return { amountMinor: 0, valid: false, error: 'El importe debe ser mayor a cero.' };
  }
  return { amountMinor, valid: true };
}

export function formatAmount(amountMinor: number, currency: CurrencyCode, options: Intl.NumberFormatOptions = {}): string {
  assertSafeMinorUnits(amountMinor);
  const { exponent, locale, symbol } = CURRENCIES[currency];
  const major = Math.abs(amountMinor) / Math.pow(10, exponent);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    ...options
  }).format(major);
  return `${amountMinor < 0 ? '−' : ''}${symbol}\u00A0${formatted}`;
}

export function formatAmountPlain(amountMinor: number, currency: CurrencyCode): string {
  assertSafeMinorUnits(amountMinor);
  const { exponent, locale } = CURRENCIES[currency];
  const major = amountMinor / Math.pow(10, exponent);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent
  }).format(major);
}

/**
 * Censura un importe para mostrarlo como "$ ••••••" o "US$ ••••••"
 * Se usa cuando el usuario activa el modo de privacidad (ojo tachado).
 */
export function censorAmount(currency: CurrencyCode): string {
  const { symbol } = CURRENCIES[currency];
  return `${symbol}\u00A0\u2022\u2022\u2022\u2022\u2022\u2022`;
}

export function addAmounts(a: number, b: number): number {
  assertSafeMinorUnits(a);
  assertSafeMinorUnits(b);
  const sum = a + b;
  assertSafeMinorUnits(sum);
  return sum;
}

export function subtractAmounts(a: number, b: number): number {
  assertSafeMinorUnits(a);
  assertSafeMinorUnits(b);
  const difference = a - b;
  assertSafeMinorUnits(difference);
  return difference;
}

export function assertSafeMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount)) throw new FinancialRangeError();
}

export function isValidCurrency(code: string): code is CurrencyCode {
  return code === 'ARS' || code === 'USD';
}
