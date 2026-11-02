// Domain: Installments
import { isValidISODate } from './date';

export function splitInstallmentAmount(totalMinor: number, count: number): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new RangeError('Importe inválido');
  if (!Number.isSafeInteger(count) || count < 2 || count > 999) throw new RangeError('Cantidad de cuotas inválida');
  const base = Math.floor(totalMinor / count);
  const rest = totalMinor % count;
  const amounts: number[] = [];
  for (let i = 0; i < count; i++) {
    amounts.push(i < rest ? base + 1 : base);
  }
  return amounts;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function installmentDueDate(firstDueOn: string, index: number): string | null {
  if (!isValidISODate(firstDueOn)) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  const parts = firstDueOn.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const targetMonth = m - 1 + index;
  const targetYear = y + Math.floor(targetMonth / 12);
  const targetMonth0 = ((targetMonth % 12) + 12) % 12;
  const last = lastDayOfMonth(targetYear, targetMonth0 + 1);
  const day = Math.min(d, last);
  const yy = targetYear;
  const mm = String(targetMonth0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function validateInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 2 && count <= 999;
}