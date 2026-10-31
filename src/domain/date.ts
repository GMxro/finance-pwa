// Domain: Date handling - local dates in Argentina timezone

export const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

export function isValidISODate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1]!;
}

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
  if (!isValidISODate(iso)) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatLocalDate(iso: string, locale = 'es-AR'): string {
  const date = parseLocalDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function getMonthBounds(isoMonth: string): { start: string; end: string } | null {
  if (!isValidMonth(isoMonth)) return null;
  const match = isoMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${match[1]}-${String(month).padStart(2, '0')}-01`;
  const nextYear = year + (month === 12 ? 1 : 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

export function monthKeyFromDate(dateISO: string): string | null {
  return isValidISODate(dateISO) ? dateISO.slice(0, 7) : null;
}

export function addMonths(isoMonth: string, delta: number): string | null {
  if (!isValidMonth(isoMonth) || !Number.isInteger(delta)) return null;
  const match = isoMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + delta;
  const newYear = year + Math.floor(month / 12);
  if (newYear < 1 || newYear > 9999) return null;
  const newMonth = ((month % 12) + 12) % 12 + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
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
  const year = Number(match[1]);
  return year >= 1 && m >= 1 && m <= 12 ? { year, month: m } : null;
}
