// Shared formatting: recurrence frequency labels
import type { RecurringFrequency } from '@domain/recurring';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  never: 'Una sola vez',
  daily: 'Todos los días',
  weekly_days: 'Días de la semana',
  weekend: 'Fines de semana',
  weekly: 'Cada semana',
  biweekly: 'Cada 2 semanas',
  four_weekly: 'Cada 4 semanas',
  monthly: 'Cada mes',
  month_end: 'Fin de mes',
  bimonthly: 'Cada 2 meses',
  trimonthly: 'Cada 3 meses',
  fourmonthly: 'Cada 4 meses',
  sixmonthly: 'Cada 6 meses',
  yearly: 'Cada año'
};
