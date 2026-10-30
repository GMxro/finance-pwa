// Domain: Date handling - local dates in Argentina timezone

export const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

export function nowInArgentina(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: ARGENTINA_TZ }));
}

export function todayLocalISO(): string {
  const now = nowInArgentina();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(iso: string, locale = 'es-AR'): string {
  const date = parseLocalDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function getMonthBounds(isoMonth: string): { start: string; end: string } | null {
  const match = isoMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

export function monthKeyFromDate(dateISO: string): string | null {
  const match = dateISO.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

export function addMonths(isoMonth: string, delta: number): string | null {
  const match = isoMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + delta;
  const newYear = year + Math.floor(month / 12);
  const newMonth = ((month % 12) + 12) % 12 + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

export function compareMonths(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isValidMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && parseMonth(month) !== null;
}

function parseMonth(month: string): { year: number; month: number } | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { year: Number(match[1]), month: m } : null;
}