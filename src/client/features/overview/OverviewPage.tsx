import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../app/providers';
import { api, canUseStaleData, formatApiError } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { BudgetWithSpent } from '@contracts/budget';
import type { CurrencyCode } from '@domain/money';
import { addMonths, todayLocalISO } from '@domain/date';
import { computeAllCurrenciesSummary } from '@domain/summary';
import { cacheServerRows, mergeWithCache, readCached } from '@local-data/transaction-store';
import { Page, PageHeader, Section, Grid, Stack, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Text } from '@shared/ui/Text';
import { Money } from '@shared/ui/Money';
import { MonthStepper } from '@shared/ui/MonthStepper';
import { SegmentedControl } from '@shared/ui/SegmentedControl';
import { ButtonLink } from '@shared/ui/Button';
import { TextLink } from '@shared/ui/TextLink';
import { Notice } from '@shared/ui/Notice';
import { LedgerList, type LedgerItem } from '@shared/ui/LedgerList';
import { BudgetList, type BudgetItem } from '@shared/ui/BudgetList';
import '../../app/styles/overview.css';

const STORAGE_KEY = 'finanzas.showAmounts';
const TRANSACTION_PAGE_SIZE = 100;

async function fetchPeriodTransactions(userId: string, period: string): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; ; page++) {
    const response = await api.listTransactions({ period, page, limit: TRANSACTION_PAGE_SIZE });
    if (response.error) throw response.error;
    const pageRows = response.data ?? [];
    await cacheServerRows(userId, pageRows).catch(() => undefined);
    rows.push(...pageRows);
    if (pageRows.length < TRANSACTION_PAGE_SIZE) return rows;
  }
}

function getInitialShowAmounts(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // ignore
  }
  return true; // default: show amounts
}

export function OverviewPage() {
  const { user, defaultCurrency } = useAuth();
  const [month, setMonth] = useState(() => todayLocalISO().slice(0, 7));
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [showAmounts, setShowAmounts] = useState<boolean>(getInitialShowAmounts);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [previousTransactions, setPreviousTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'current' | 'cached' | 'partial' | 'unavailable'>('unavailable');
  const [budgetLoadError, setBudgetLoadError] = useState(false);

  useEffect(() => setCurrency(defaultCurrency), [defaultCurrency]);

  // Persist showAmounts preference
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(showAmounts));
    } catch {
      // ignore
    }
  }, [showAmounts]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setDataStatus('unavailable');
    setBudgetLoadError(false);
    const previousMonth = addMonths(month, -1) ?? month;
    try {
      const loadPeriod = async (period: string) => {
        try {
          return { rows: await fetchPeriodTransactions(user.id, period), error: null as unknown };
        } catch (periodError) {
          return { rows: null, error: periodError };
        }
      };
      const [currentResult, previousResult, catRes, budgetRes] = await Promise.all([
        loadPeriod(month),
        loadPeriod(previousMonth),
        api.listCategories(),
        api.listBudgets(month)
      ]);
      let localCacheReadFailed = false;
      const mergeRows = async (rows: any[]) => {
        try {
          return await mergeWithCache(user.id, rows);
        } catch {
          localCacheReadFailed = true;
          return rows;
        }
      };

      const transactionErrors = [currentResult.error, previousResult.error].filter(Boolean);
      const mayUseCache = transactionErrors.some((item) => canUseStaleData(item));
      const cached = mayUseCache ? await readCached(user.id) : [];
      const cachedCurrent = cached.filter((tx) => !tx.deletedAt && tx.occurredOn.startsWith(month));
      const cachedPrevious = cached.filter((tx) => !tx.deletedAt && tx.occurredOn.startsWith(previousMonth));
      const currentRows = currentResult.rows !== null
        ? (await mergeRows(currentResult.rows)).filter((tx) => tx.occurredOn.startsWith(month))
        : currentResult.error && canUseStaleData(currentResult.error) ? cachedCurrent : [];
      const previousRows = previousResult.rows !== null
        ? (await mergeRows(previousResult.rows)).filter((tx) => tx.occurredOn.startsWith(previousMonth))
        : previousResult.error && canUseStaleData(previousResult.error) ? cachedPrevious : [];

      setTransactions(currentRows);
      setPreviousTransactions(previousRows);
      const currentAvailable = currentResult.rows !== null ||
        Boolean(currentResult.error && canUseStaleData(currentResult.error) && cachedCurrent.length > 0);
      setDataStatus(!currentAvailable
        ? 'unavailable'
        : currentResult.rows === null
          ? 'cached'
          : previousResult.rows === null
            ? 'partial'
            : 'current');
      const transactionErrorMessages = [
        currentResult.error && (currentAvailable
          ? `Mes actual: ${formatApiError(currentResult.error, 'error de conexión')}. Se muestran datos locales y pueden estar desactualizados.`
          : `Mes actual: ${formatApiError(currentResult.error, 'no se pudo cargar')}. No se muestran importes sin confirmar.`),
        previousResult.error && `Comparación mensual: ${formatApiError(previousResult.error, 'no se pudo actualizar')}.`
      ].filter(Boolean);
      if (localCacheReadFailed) {
        setDataStatus((status) => status === 'current' ? 'partial' : status);
        transactionErrorMessages.push('No se pudo leer la cola local; los movimientos offline pendientes podrían no aparecer en estos totales.');
      }
      if (transactionErrorMessages.length > 0) setError(transactionErrorMessages.join(' '));

      const auxiliaryErrors = [
        catRes.error && formatApiError(catRes.error, 'categorías no disponibles'),
        budgetRes.error && formatApiError(budgetRes.error, 'presupuestos no disponibles')
      ].filter(Boolean);
      if (catRes.error) setCategories([]);
      else setCategories(catRes.data ?? []);
      if (budgetRes.error) {
        setBudgets([]);
        setBudgetLoadError(true);
      } else {
        setBudgets(budgetRes.data ?? []);
      }
      if (auxiliaryErrors.length > 0) {
        setDataStatus((status) => status === 'current' ? 'partial' : status);
        setError((currentError) => [currentError, `No se pudieron actualizar categorías o presupuestos: ${auxiliaryErrors.join('; ')}`]
          .filter(Boolean).join(' '));
      }
    } catch (loadError) {
      setTransactions([]);
      setPreviousTransactions([]);
      setDataStatus('unavailable');
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar tu resumen.');
    } finally {
      setLoading(false);
    }
  }, [month, user]);

  useEffect(() => { void load(); }, [load]);

  const previousMonth = useMemo(() => addMonths(month, -1) ?? month, [month]);
  const summaries = useMemo(
    () => computeAllCurrenciesSummary(transactions as any, month),
    [transactions, month]
  );
  const summary = summaries.find(s => s.currency === currency) ?? summaries[0]!;
  const previousSummaries = useMemo(
    () => computeAllCurrenciesSummary(previousTransactions as any, previousMonth),
    [previousTransactions, previousMonth]
  );
  const previousSummary = previousSummaries.find(s => s.currency === currency) ?? previousSummaries[0]!;
  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const expenseComparison = useMemo(() => {
    if (dataStatus === 'unavailable') return null;
    if (summary.transactionCount === 0 || previousSummary.transactionCount === 0) return null;
    if (summary.expenseMinor <= 0 || previousSummary.expenseMinor <= 0) return null;
    const change = Math.round(
      ((summary.expenseMinor - previousSummary.expenseMinor) / previousSummary.expenseMinor) * 100
    );
    if (change === 0) return 'Gastos iguales al mes anterior';
    return change > 0
      ? `Gastos ${Math.abs(change)}% por encima del mes anterior`
      : `Gastos ${Math.abs(change)}% por debajo del mes anterior`;
  }, [summary, previousSummary, dataStatus]);

  const recent: LedgerItem[] = transactions.slice(0, 6).map(tx => ({
    id: tx.id,
    kind: tx.kind,
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    occurredOn: tx.occurredOn,
    note: tx.note,
    categoryId: tx.categoryId,
    pending: tx.synced === false || tx.pendingOp != null
  }));

  const budgetItems: BudgetItem[] = budgets
    .filter(b => b.currency === currency)
    .slice(0, 3)
    .map(b => ({
      id: b.id,
      categoryId: b.categoryId,
      currency: b.currency,
      limitMinor: b.limitMinor,
      spentMinor: b.spentMinor,
      remainingMinor: b.remainingMinor,
      isOverBudget: b.isOverBudget
    }));

  const categoryName = (id: string) => categoriesById.get(id)?.name ?? 'Sin categoría';
  const categoryIcon = (id: string) => categoriesById.get(id)?.iconKey ?? 'tag';

  return (
    <Page>
      <PageHeader
        eyebrow={<span className="overview-eyebrow">Tu mes, de un vistazo</span>}
        title="Resumen"
        actions={<MonthStepper month={month} onChange={setMonth} />}
      />

      {loading && <span className="sr-only" role="status">Cargando resumen</span>}

      {error && <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>{error}</Notice>}

      <Grid layout="split" gap="lg">
        <Panel tone="ink" radius="panel" padding="lg">
          <Stack gap="lg">
            <div className={`overview-hero__head ${!loading && summary.transactionCount === 0 ? 'overview-hero--compact' : ''}`}>
              <Inline justify="between" align="center">
                <span className="overview-hero__label">
                  <span className="overview-hero__dot" aria-hidden="true" />
                  <Text variant="caption" tone="on-ink-muted">Saldo del mes</Text>
                </span>
                <Inline gap="sm" align="center">
                  <SegmentedControl
                    value={currency}
                    onChange={v => setCurrency(v as CurrencyCode)}
                    options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
                    label="Moneda del resumen"
                    tone="onInk"
                  />
                  <button
                    type="button"
                    className="overview-hero__eye"
                    onClick={() => setShowAmounts(prev => !prev)}
                    aria-label={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                    aria-pressed={showAmounts}
                    title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                  >
                    {showAmounts ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
                  </button>
                </Inline>
              </Inline>
              <div className="overview-hero__amount">
                {loading ? (
                  <span className="overview-skeleton overview-skeleton--onInk overview-skeleton--hero-amount" aria-hidden="true" />
                ) : dataStatus === 'unavailable' ? (
                  <Text variant="title" tone="on-ink-muted">—</Text>
                ) : (
                  <Money amountMinor={summary.netMinor} currency={currency} sign="auto" tone="onInk" size="xl" censored={!showAmounts} />
                )}
              </div>
              {!loading && expenseComparison && (
                <Text variant="caption" tone="on-ink-muted" className="overview-hero__comparison">
                  {expenseComparison}
                </Text>
              )}
            </div>

            <div className="overview-hero__rows">
              <div className="overview-hero__row">
                <Text variant="small" tone="on-ink-muted">Ingresos</Text>
                {loading ? (
                  <span className="overview-skeleton overview-skeleton--onInk overview-skeleton--value" aria-hidden="true" />
                ) : dataStatus === 'unavailable' ? (
                  <Text variant="small" tone="on-ink-muted">—</Text>
                ) : (
                  <Money amountMinor={summary.incomeMinor} currency={currency} sign="plus" tone="onInk" size="md" censored={!showAmounts} />
                )}
              </div>
              <div className="overview-hero__row">
                <Text variant="small" tone="on-ink-muted">Gastos</Text>
                {loading ? (
                  <span className="overview-skeleton overview-skeleton--onInk overview-skeleton--value" aria-hidden="true" />
                ) : dataStatus === 'unavailable' ? (
                  <Text variant="small" tone="on-ink-muted">—</Text>
                ) : (
                  <Money amountMinor={summary.expenseMinor} currency={currency} sign="minus" tone="onInk" size="md" censored={!showAmounts} />
                )}
              </div>
            </div>

            <ButtonLink to="/movimientos?new=expense" variant="onInk" leftIcon={<Plus size={17} />}>
              Nuevo movimiento
            </ButtonLink>
          </Stack>
        </Panel>

        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="md">
            <Inline justify="between" align="baseline">
              <Text variant="subtitle">Presupuestos</Text>
              <TextLink to="/presupuestos">Ver todos</TextLink>
            </Inline>
            {loading ? (
              <div className="overview-skeleton-stack" aria-hidden="true">
                {[0, 1, 2].map(i => (
                  <span key={i} className="overview-skeleton overview-skeleton--budget" />
                ))}
              </div>
            ) : (
              <BudgetList
                items={budgetItems}
                categoryName={categoryName}
                categoryIcon={categoryIcon}
                compact
                censored={!showAmounts}
                emptyLabel={budgetLoadError ? 'No se pudieron cargar los presupuestos.' : 'Todavía no definiste presupuestos para este mes.'}
                emptyAction={!budgetLoadError && (
                  <ButtonLink to="/presupuestos" variant="primary" size="sm">
                    Definir mi primer presupuesto
                  </ButtonLink>
                )}
              />
            )}
          </Stack>
        </Panel>
      </Grid>

      <Section
        title="Últimos movimientos"
        action={<TextLink to="/movimientos">Ver todos</TextLink>}
        className="overview-recent"
      >
        <Panel tone="paper" radius="panel" padding="none">
          {loading ? (
            <div className="overview-skeleton-stack overview-skeleton-stack--ledger" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <span key={i} className="overview-skeleton overview-skeleton--ledger" />
              ))}
            </div>
          ) : (
            <LedgerList
              items={recent}
              categoryName={categoryName}
              categoryIcon={categoryIcon}
              censored={!showAmounts}
              emptyLabel={dataStatus === 'unavailable' ? 'No se pudieron cargar los movimientos.' : 'Todavía no hay movimientos en este mes.'}
              emptyAction={dataStatus !== 'unavailable' && (
                <ButtonLink to="/movimientos?new=expense" variant="primary" size="sm">
                  Registrar un movimiento
                </ButtonLink>
              )}
            />
          )}
        </Panel>
      </Section>
    </Page>
  );
}
