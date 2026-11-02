import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { api, canUseStaleData, formatApiError } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { CurrencyCode } from '@domain/money';
import { addMonths, todayLocalISO } from '@domain/date';
import { computeMonthlySummary } from '@domain/summary';
import { mergeWithCache, readCached } from '@local-data/transaction-store';
import { Page, PageHeader, Grid, Stack, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Text } from '@shared/ui/Text';
import { Money } from '@shared/ui/Money';
import { MonthStepper } from '@shared/ui/MonthStepper';
import { SegmentedControl, SegmentedOption } from '@shared/ui/SegmentedControl';
import { CategoryIcon } from '@shared/ui/CategoryIcon';
import { Progress } from '@shared/ui/Progress';
import { Notice } from '@shared/ui/Notice';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { getPeriodLabel } from '@shared/format/formatters';
import '../../app/styles/statistics.css';

const MAX_PAGES = 20;

async function fetchMonth(period: string): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await api.listTransactions({ period, page, limit: 100 });
    if (response.error) throw response.error;
    const batch = response.data ?? [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  if (rows.length === MAX_PAGES * 100) {
    throw new Error('El período supera el máximo de movimientos consultable; las estadísticas no están completas.');
  }
  return rows;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function ComparisonRow({ label, change }: { label: string; change: number | null }) {
  const Icon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="stats-compare__row">
      <Text variant="body" tone="stone">{label}</Text>
      <span className={`stats-change ${change === null || change === 0 ? 'stats-change--flat' : ''}`}>
        <Icon size={15} aria-hidden="true" />
        {change === null ? 'Sin datos' : `${Math.abs(change)}%`}
      </span>
    </div>
  );
}

const currencyOptions: SegmentedOption[] = [
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' }
];

export function StatisticsPage() {
  const { user, defaultCurrency } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => todayLocalISO().slice(0, 7));
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [previousTransactions, setPreviousTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setCurrency(defaultCurrency), [defaultCurrency]);

  const previousMonth = useMemo(() => addMonths(month, -1) ?? month, [month]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [currentRows, previousRows, catRes] = await Promise.all([
        fetchMonth(month),
        fetchMonth(previousMonth),
        api.listCategories(true)
      ]);
      if (catRes.error) throw catRes.error;

      let localCacheReadFailed = false;
      const mergeRows = async (rows: any[]) => {
        try {
          return await mergeWithCache(user.id, rows);
        } catch {
          localCacheReadFailed = true;
          return rows;
        }
      };
      const [current, previous] = await Promise.all([mergeRows(currentRows), mergeRows(previousRows)]);
      setTransactions(current.filter((tx) => tx.occurredOn.startsWith(month)));
      setPreviousTransactions(previous.filter((tx) => tx.occurredOn.startsWith(previousMonth)));
      setCategories(catRes.data ?? []);
      if (localCacheReadFailed) {
        setError('No se pudo leer la cola local; los movimientos offline pendientes podrían no aparecer en estas estadísticas.');
      }
    } catch (e: any) {
      if (canUseStaleData(e)) {
        const cached = await readCached(user.id).catch(() => []);
        const current = cached.filter(tx => tx.occurredOn?.startsWith(month));
        setTransactions(current);
        setPreviousTransactions(cached.filter(tx => tx.occurredOn?.startsWith(previousMonth)));
        setError(current.length > 0
          ? `No se pudieron actualizar las estadísticas (${formatApiError(e, 'error de conexión')}). Se muestran datos locales que pueden estar desactualizados.`
          : `No se pudieron cargar las estadísticas (${formatApiError(e, 'error de conexión')}). No se muestran cifras sin confirmar.`);
      } else {
        setTransactions([]);
        setPreviousTransactions([]);
        setCategories([]);
        setError(formatApiError(e, 'No pudimos cargar las estadísticas.'));
      }
    } finally {
      setLoading(false);
    }
  }, [month, previousMonth, user]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(
    () => computeMonthlySummary(transactions as any, month, currency),
    [transactions, month, currency]
  );
  const previousSummary = useMemo(
    () => computeMonthlySummary(previousTransactions as any, previousMonth, currency),
    [previousTransactions, previousMonth, currency]
  );

  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const categoryName = (id: string) => categoriesById.get(id)?.name ?? 'Sin categoría';
  const categoryIcon = (id: string) => categoriesById.get(id)?.iconKey ?? 'tag';

  const topCategories = useMemo(
    () => summary.byCategory
      .filter(c => c.kind === 'expense')
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, 3),
    [summary]
  );

  const hasPrevious = previousSummary.transactionCount > 0;
  const expenseChange = hasPrevious ? percentChange(summary.expenseMinor, previousSummary.expenseMinor) : null;
  const incomeChange = hasPrevious ? percentChange(summary.incomeMinor, previousSummary.incomeMinor) : null;

  const maxFlow = Math.max(summary.incomeMinor, summary.expenseMinor, 1);
  const incomeWidth = (summary.incomeMinor / maxFlow) * 100;
  const expenseWidth = (summary.expenseMinor / maxFlow) * 100;

  const today = todayLocalISO();
  const isCurrentMonth = month === today.slice(0, 7);
  const daysInMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  ).getUTCDate();
  const daysCounted = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;
  const dailyAverageMinor = daysCounted > 0 ? Math.round(summary.expenseMinor / daysCounted) : 0;

  const hasData = summary.transactionCount > 0;

  return (
    <Page>
      <PageHeader
        title="Estadísticas"
        actions={<MonthStepper month={month} onChange={setMonth} />}
      />

      <Inline justify="between" gap="md" className="stats-toolbar">
        <SegmentedControl
          value={currency}
          onChange={v => setCurrency(v as CurrencyCode)}
          options={currencyOptions}
          label="Moneda de las estadísticas"
        />
        <Text variant="caption" tone="stone">Comparado con {getPeriodLabel(previousMonth)}</Text>
      </Inline>

      {error && (
        <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>
          {error}
        </Notice>
      )}

      {loading && <LoadingSpinner />}

      {!loading && !error && !hasData && (
        <EmptyState
          title={`Sin datos en ${getPeriodLabel(month)}`}
          message={`No hay movimientos en ${currency} para este mes. Registrá uno para ver tus estadísticas.`}
          action={{ label: 'Registrar un movimiento', onClick: () => navigate('/movimientos?new=expense') }}
        />
      )}

      {!loading && hasData && (
        <div className="stats-sections">
          <Grid layout="split" gap="lg">
            <Panel tone="paper" radius="panel" padding="lg">
              <Stack gap="lg">
                <Text variant="section-title">Ingresos vs. gastos</Text>
                <div className="stats-bars">
                  <div className="stats-bar">
                    <div className="stats-bar__head">
                      <Text variant="caption" tone="stone">Ingresos</Text>
                      <Money amountMinor={summary.incomeMinor} currency={currency} size="sm" />
                    </div>
                    <div className="stats-bar__track" aria-hidden="true">
                      <span className="stats-bar__fill stats-bar__fill--income" style={{ width: `${incomeWidth}%` }} />
                    </div>
                  </div>
                  <div className="stats-bar">
                    <div className="stats-bar__head">
                      <Text variant="caption" tone="stone">Gastos</Text>
                      <Money amountMinor={summary.expenseMinor} currency={currency} size="sm" />
                    </div>
                    <div className="stats-bar__track" aria-hidden="true">
                      <span className="stats-bar__fill stats-bar__fill--expense" style={{ width: `${expenseWidth}%` }} />
                    </div>
                  </div>
                </div>
              </Stack>
            </Panel>

            <Panel tone="paper" radius="panel" padding="lg">
              <Stack gap="lg">
                <Text variant="section-title">Comparación vs. mes anterior</Text>
                <div className="stats-compare">
                  <ComparisonRow label="Gastos" change={expenseChange} />
                  <ComparisonRow label="Ingresos" change={incomeChange} />
                </div>
                {!hasPrevious && (
                  <Text variant="caption" tone="stone">
                    No hay datos de {getPeriodLabel(previousMonth)} para comparar.
                  </Text>
                )}
              </Stack>
            </Panel>
          </Grid>

          <Grid columns={2} gap="lg">
            <Panel tone="paper" radius="panel" padding="lg">
              <Stack gap="md">
                <Text variant="section-title">Top 3 categorías de gasto</Text>
                {topCategories.length === 0 ? (
                  <Text variant="body" tone="stone">Sin gastos registrados este mes.</Text>
                ) : (
                  <ul className="stats-top">
                    {topCategories.map(category => {
                      const share = summary.expenseMinor > 0
                        ? (category.amountMinor / summary.expenseMinor) * 100
                        : 0;
                      const name = categoryName(category.categoryId);
                      return (
                        <li className="stats-top__item" key={category.categoryId}>
                          <CategoryIcon iconKey={categoryIcon(category.categoryId)} size="sm" />
                          <div className="stats-top__main">
                            <div className="stats-top__head">
                              <span className="stats-top__name">{name}</span>
                              <Money amountMinor={category.amountMinor} currency={currency} size="sm" />
                            </div>
                            <Progress value={share} label={`${name}: ${Math.round(share)}% de los gastos`} />
                            <span className="stats-top__pct">{Math.round(share)}% del total de gastos</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Stack>
            </Panel>

            <Panel tone="paper" radius="panel" padding="lg">
              <Stack gap="sm">
                <Text variant="section-title">Gasto diario promedio</Text>
                <div className="stats-average">
                  <Money amountMinor={dailyAverageMinor} currency={currency} size="lg" />
                  <Text variant="body" tone="stone">por día</Text>
                </div>
                <Text variant="caption" tone="stone">
                  {isCurrentMonth
                    ? `Sobre ${daysCounted} días transcurridos`
                    : `Sobre ${daysCounted} días del mes`}
                </Text>
              </Stack>
            </Panel>
          </Grid>
        </div>
      )}
    </Page>
  );
}