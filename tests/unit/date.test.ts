import { describe, it, expect } from 'vitest';
import { getMonthBounds, monthKeyFromDate, formatLocalDate, addMonths, isValidMonth, isValidISODate } from '@domain/date';

describe('date', () => {
  it('computes month bounds without timezone drift', () => {
    expect(getMonthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-03-01' });
    expect(getMonthBounds('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });

  it('derives month key from a local date', () => {
    expect(monthKeyFromDate('2026-10-31')).toBe('2026-10');
    expect(monthKeyFromDate('not-a-date')).toBeNull();
  });

  it('formats a local date deterministically', () => {
    expect(formatLocalDate('2026-10-05')).toBe('05/10/2026');
  });

  it('adds months across year boundaries', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('validates month keys', () => {
    expect(isValidMonth('2026-10')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
  });

  it('rejects impossible calendar dates and accepts leap days only in leap years', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2025-02-29')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('0000-01-01')).toBe(false);
    expect(monthKeyFromDate('2026-02-31')).toBeNull();
  });

  it('rejects invalid months in month-bound and arithmetic helpers', () => {
    expect(getMonthBounds('2026-13')).toBeNull();
    expect(addMonths('2026-13', 1)).toBeNull();
    expect(isValidMonth('0000-01')).toBe(false);
  });
});
