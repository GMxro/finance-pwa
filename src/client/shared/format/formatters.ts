// Shared: Format helpers
import { formatAmount, formatAmountPlain, type CurrencyCode } from '@domain/money';
import { formatLocalDate, monthKeyFromDate } from '@domain/date';
import type { MonthlySummary } from '@domain/summary';

export function formatCurrency(amountMinor: number, currency: CurrencyCode): string {
  return formatAmount(amountMinor, currency);
}

export function formatCurrencyPlain(amountMinor: number, currency: CurrencyCode): string {
  return formatAmountPlain(amountMinor, currency);
}

export function formatDate(iso: string): string {
  return formatLocalDate(iso);
}

export function getMonthKey(dateISO: string): string | null {
  return monthKeyFromDate(dateISO);
}

export function getPeriodLabel(periodMonth: string): string {
  const parts = periodMonth.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return periodMonth;
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function summarizeByCurrency(summaries: MonthlySummary[]): Record<CurrencyCode, MonthlySummary> {
  const result: Record<string, MonthlySummary> = {};
  for (const s of summaries) {
    result[s.currency] = s;
  }
  return result as Record<CurrencyCode, MonthlySummary>;
}

export function getNetColor(netMinor: number): 'positive' | 'negative' | 'neutral' {
  if (netMinor > 0) return 'positive';
  if (netMinor < 0) return 'negative';
  return 'neutral';
}