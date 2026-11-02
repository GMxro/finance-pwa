// Domain: Recurring
import { isValidISODate } from './date';

export type RecurringFrequency =
  | 'never'
  | 'daily'
  | 'weekly_days'
  | 'weekend'
  | 'weekly'
  | 'biweekly'
  | 'four_weekly'
  | 'monthly'
  | 'month_end'
  | 'bimonthly'
  | 'trimonthly'
  | 'fourmonthly'
  | 'sixmonthly'
  | 'yearly';

function addDaysISO(iso: string, days: number): string | null {
  if (!isValidISODate(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsISO(iso: string, months: number): string | null {
  if (!isValidISODate(iso)) return null;
  const _p = iso.split('-').map(Number); const y = _p[0]!; const m = _p[1]!; const day = _p[2]!;
  const targetMonth = m - 1 + months;
  const targetYear = y + Math.floor(targetMonth / 12);
  const targetMonth0 = ((targetMonth % 12) + 12) % 12;
  const last = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  const d = Math.min(day, last);
  const date = new Date(Date.UTC(targetYear, targetMonth0, d));
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonthISO(iso: string): string | null {
  if (!isValidISODate(iso)) return null;
  const _p = iso.split('-').map(Number); const y = _p[0]!; const m = _p[1]!;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function dayOfWeek(iso: string): number {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.getUTCDay(); // 0=Sun..6=Sat
}

export function computeNextDue(frequency: RecurringFrequency, current: string, rule: any = {}): string | null {
  if (!isValidISODate(current)) return null;
  switch (frequency) {
    case 'daily':
      return addDaysISO(current, 1);
    case 'weekly':
      return addDaysISO(current, 7);
    case 'biweekly':
      return addDaysISO(current, 14);
    case 'four_weekly':
      return addDaysISO(current, 28);
    case 'monthly':
      return addMonthsISO(current, rule.intervalMonths ?? 1);
    case 'month_end':
      return lastDayOfMonthISO(addMonthsISO(current, rule.intervalMonths ?? 1) ?? current);
    case 'bimonthly':
      return addMonthsISO(current, 2);
    case 'trimonthly':
      return addMonthsISO(current, 3);
    case 'fourmonthly':
      return addMonthsISO(current, 4);
    case 'sixmonthly':
      return addMonthsISO(current, 6);
    case 'yearly':
      return addMonthsISO(current, 12);
    case 'weekly_days': {
      const mask = typeof rule.daysOfWeek === 'number' ? rule.daysOfWeek : 0;
      let next = addDaysISO(current, 1);
      let guard = 0;
      while (next && guard < 8) {
        const dow = dayOfWeek(next);
        if (mask & (1 << dow)) return next;
        next = addDaysISO(next, 1);
        guard++;
      }
      return addDaysISO(current, 7);
    }
    case 'weekend': {
      let next = addDaysISO(current, 1);
      let guard = 0;
      while (next && guard < 8) {
        const dow = dayOfWeek(next);
        if (dow === 0 || dow === 6) return next;
        next = addDaysISO(next, 1);
        guard++;
      }
      return addDaysISO(current, 7);
    }
    case 'never':
      return null;
    default:
      return null;
  }
}

export function projectOccurrences(rule: any, from: string, to: string, max = 365): string[] {
  const results: string[] = [];
  if (!isValidISODate(from) || !isValidISODate(to)) return results;
  let current = rule.nextDueOn && isValidISODate(rule.nextDueOn) ? rule.nextDueOn : rule.startOn;
  let count = 0;
  while (current && current <= to && count < max) {
    if (current >= from) {
      if (!rule.endOn || current <= rule.endOn) results.push(current);
    }
    const next = computeNextDue(rule.frequency, current, rule);
    if (!next || next === current) break;
    current = next;
    count++;
    if (rule.endOn && current > rule.endOn) break;
  }
  return results;
}

export function validateRecurringRule(input: any): { valid: boolean; error?: string } {
  if (!input.concept || input.concept.length === 0) return { valid: false, error: 'Concepto requerido' };
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return { valid: false, error: 'Importe inválido' };
  if (!['ARS', 'USD'].includes(input.currency)) return { valid: false, error: 'Moneda inválida' };
  if (!['income', 'expense'].includes(input.kind)) return { valid: false, error: 'Tipo inválido' };
  if (!isValidISODate(input.startOn)) return { valid: false, error: 'Fecha inválida' };
  const freqs = ['never','daily','weekly_days','weekend','weekly','biweekly','four_weekly','monthly','month_end','bimonthly','trimonthly','fourmonthly','sixmonthly','yearly'];
  if (!freqs.includes(input.frequency)) return { valid: false, error: 'Frecuencia inválida' };
  if (input.frequency === 'weekly_days') {
    if (!Number.isInteger(input.daysOfWeek) || input.daysOfWeek < 1 || input.daysOfWeek > 127) return { valid: false, error: 'Días de la semana inválidos' };
  }
  if (input.endOn && !isValidISODate(input.endOn)) return { valid: false, error: 'Fecha fin inválida' };
  return { valid: true };
}
