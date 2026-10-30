import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, addAmounts, isValidCurrency } from '@domain/money';

describe('money', () => {
  it('parses whole amounts into minor units', () => {
    expect(parseAmount('1500', 'ARS')).toEqual({ amountMinor: 150000, valid: true });
  });

  it('accepts comma decimals and pads', () => {
    expect(parseAmount('12,5', 'ARS').amountMinor).toBe(1250);
    expect(parseAmount('12.05', 'ARS').amountMinor).toBe(1205);
  });

  it('rejects zero, negative and >2 decimals', () => {
    expect(parseAmount('0', 'ARS').valid).toBe(false);
    expect(parseAmount('-10', 'ARS').valid).toBe(false);
    expect(parseAmount('10.123', 'ARS').valid).toBe(false);
    expect(parseAmount('abc', 'ARS').valid).toBe(false);
  });

  it('formats ARS with two decimals', () => {
    const formatted = formatAmount(150000, 'ARS');
    expect(formatted).toContain('1.500,00');
  });

  it('guards integer overflow', () => {
    expect(() => addAmounts(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });

  it('validates currency codes', () => {
    expect(isValidCurrency('ARS')).toBe(true);
    expect(isValidCurrency('USD')).toBe(true);
    expect(isValidCurrency('EUR')).toBe(false);
  });
});