// Pages: Calendar
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CurrencyCode } from '@domain/money';
import { formatLocalDate, todayLocalISO } from '@domain/date';
import { api, formatApiError } from '@shared/api/client';
import {
  Page,
  PageHeader,
  Panel,
  Section,
  MonthStepper,
  LoadingSpinner,
  Notice,
  EmptyState,
  Text,
  Money,
  ListRow
} from '@shared/ui';
import './CalendarPage.css';

interface CurrencyTotals {
  incomeMinor: number;
  expenseMinor: number;
}

interface CalendarTransaction {
  id: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: CurrencyCode;
  note?: string;
  occurredOn: string;
}

interface CalendarCommitment {
  date: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: CurrencyCode;
  label: string;
  source: 'installment' | 'recurring';
  sourceId: string | null;
  isFuture: boolean;
}

interface CalendarDay {
  date: string;
  transactions: CalendarTransaction[];
  commitments: CalendarCommitment[];
  byCurrency: Record<string, CurrencyTotals>;
  isFuture: boolean;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const CURRENCY_ORDER: CurrencyCode[] = ['ARS', 'USD'];

function monthDayCount(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return 0;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function firstWeekdayOffset(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return 0;
  const sundayBased = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  return (sundayBased + 6) % 7;
}

function initialSelection(month: string, today: string): string {
  return today.slice(0, 7) === month ? today : `${month}-01`;
}

function dayAriaLabel(day: CalendarDay): string {
  const parts = [formatLocalDate(day.date)];
  if (day.transactions.length > 0) {
    parts.push(`${day.transactions.length} ${day.transactions.length === 1 ? 'movimiento' : 'movimientos'}`);
  }
  if (day.commitments.length > 0) {
    parts.push(`${day.commitments.length} ${day.commitments.length === 1 ? 'previsto' : 'previstos'}`);
  }
  return parts.join(', ');
}

export function CalendarPage() {
  const navigate = useNavigate();
  const today = todayLocalISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDays([]);
    setSelected(null);

    api.getCalendarMonth(month)
      .then((res) => {
        if (cancelled) return;
        if (res.error || !res.data) {
          setError(formatApiError(res.error, 'No pudimos cargar el calendario.'));
          return;
        }
        setDays(res.data as CalendarDay[]);
        setSelected(initialSelection(month, todayLocalISO()));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, reloadToken]);

  const selectedDay = days.find((day) => day.date === selected) ?? null;
  const offset = firstWeekdayOffset(month);
  const calendarCells = Math.ceil((offset + monthDayCount(month)) / 7) * 7;

  return (
    <Page className="calendar-page">
      <PageHeader title="Calendario" />

      <Panel padding="sm" className="calendar-toolbar">
        <MonthStepper month={month} onChange={setMonth} />
      </Panel>

      {error && (
        <div className="calendar-notice">
          <Notice action={{ label: 'Reintentar', onClick: () => setReloadToken((value) => value + 1) }}>
            {error}
          </Notice>
        </div>
      )}

      {!error && (
        <div className="calendar-layout">
          <Panel padding="none" className="calendar-card">
            <div className="calendar-weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar-grid" role="group" aria-label="Calendario mensual" aria-busy={loading}>
              {loading ? (
                <>
                  {Array.from({ length: offset }).map((_, index) => (
                    <span key={`blank-${index}`} className="calendar-day calendar-day--blank" aria-hidden="true" />
                  ))}
                  {Array.from({ length: calendarCells - offset }).map((_, index) => (
                    <span key={`skeleton-${index}`} className="calendar-day calendar-day--skeleton" aria-hidden="true" />
                  ))}
                </>
              ) : (
                days.map((day) => {
                  const hasActivity = day.transactions.length > 0 || day.commitments.length > 0;
                  const isSelected = day.date === selected;
                  const classes = ['calendar-day'];
                  if (isSelected) classes.push('is-selected');
                  if (day.isFuture) classes.push('is-future');
                  if (day.date === today) classes.push('is-today');
                  if (hasActivity) classes.push('has-activity');
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={classes.join(' ')}
                      onClick={() => setSelected(day.date)}
                      aria-pressed={isSelected}
                      aria-label={dayAriaLabel(day)}
                    >
                      <span className="calendar-day__number" aria-hidden="true">{Number(day.date.slice(8))}</span>
                      {hasActivity && <span className="calendar-day__dot" aria-hidden="true" />}
                    </button>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel className="calendar-detail">
            <div aria-busy={loading}>
              {loading ? (
                <div className="calendar-detail__loading">
                  <LoadingSpinner size="sm" />
                </div>
              ) : selectedDay ? (
                <CalendarDayDetail day={selectedDay} />
              ) : (
                <EmptyState title="Sin datos" message="No hay información para este mes." />
              )}
            </div>
          </Panel>
        </div>
      )}
    </Page>
  );
}

function CalendarDayDetail({ day }: { day: CalendarDay }) {
  const navigate = useNavigate();
  const currencies = CURRENCY_ORDER.filter((currency) => {
    const totals = day.byCurrency[currency];
    return totals !== undefined && totals.incomeMinor + totals.expenseMinor > 0;
  });
  const hasActivity = day.transactions.length > 0 || day.commitments.length > 0;

  return (
    <div className="calendar-detail__body">
      <div className="calendar-detail__head">
        <Text variant="subtitle">{formatLocalDate(day.date)}</Text>
        {day.isFuture && <Text variant="caption" tone="stone">Día futuro</Text>}
      </div>

      {currencies.length > 0 && (
        <div className="calendar-totals">
          {currencies.map((currency) => {
            const totals = day.byCurrency[currency];
            if (!totals) return null;
            return (
              <div key={currency} className="calendar-total">
                <Text variant="caption" tone="stone">{currency}</Text>
                <div className="calendar-total__line">
                  <Text variant="small">Ingresos</Text>
                  <Money amountMinor={totals.incomeMinor} currency={currency} size="sm" />
                </div>
                <div className="calendar-total__line">
                  <Text variant="small">Gastos</Text>
                  <Money amountMinor={totals.expenseMinor} currency={currency} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {day.transactions.length > 0 && (
        <Section title="Movimientos">
          <div className="calendar-rows">
            {day.transactions.map((transaction) => (
              <ListRow
                key={transaction.id}
                title={transaction.note || 'Sin descripción'}
                subtitle={transaction.kind === 'income' ? 'Ingreso' : 'Gasto'}
                trailing={
                  <Money
                    amountMinor={transaction.amountMinor}
                    currency={transaction.currency}
                    sign={transaction.kind === 'income' ? 'plus' : 'minus'}
                    size="sm"
                  />
                }
              />
            ))}
          </div>
        </Section>
      )}

      {day.commitments.length > 0 && (
        <Section title="Previstos">
          <div className="calendar-rows">
            {day.commitments.map((commitment) => (
              <ListRow
                key={`${commitment.sourceId ?? commitment.label}-${commitment.date}`}
                title={commitment.label}
                subtitle={commitment.kind === 'income' ? 'Ingreso' : 'Gasto'}
                trailing={
                  <>
                    {commitment.isFuture && <span className="ui-row__badge">Previsto</span>}
                    <Money
                      amountMinor={commitment.amountMinor}
                      currency={commitment.currency}
                      sign={commitment.kind === 'income' ? 'plus' : 'minus'}
                      size="sm"
                    />
                  </>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {!hasActivity && (
        <EmptyState title="Sin movimientos" message="No hay movimientos ni previstos para este día." action={{ label: 'Nuevo movimiento', onClick: () => navigate('/movimientos?new=expense') }} />
      )}
    </div>
  );
}
