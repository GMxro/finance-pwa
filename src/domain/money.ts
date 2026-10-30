// Domain: Money handling - exact arithmetic in minor units (cents)

export type CurrencyCode = 'ARS' | 'USD';

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
  const amountMinor = parseInt(intPart + paddedDec, 10);
  if (amountMinor <= 0) {
    return { amountMinor: 0, valid: false, error: 'El importe debe ser mayor a cero.' };
  }
  if (amountMinor > Number.MAX_SAFE_INTEGER) {
    return { amountMinor: 0, valid: false, error: 'Importe fuera de rango seguro.' };
  }
  return { amountMinor, valid: true };
}

export function formatAmount(amountMinor: number, currency: CurrencyCode, options: Intl.NumberFormatOptions = {}): string {
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
  const sum = a + b;
  if (sum > Number.MAX_SAFE_INTEGER || sum < Number.MIN_SAFE_INTEGER) {
    throw new Error('Desbordamiento en suma de importes');
  }
  return sum;
}

export function subtractAmounts(a: number, b: number): number {
  return a - b;
}

export function isValidCurrency(code: string): code is CurrencyCode {
  return code === 'ARS' || code === 'USD';
}