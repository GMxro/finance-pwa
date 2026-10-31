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
      const [currentSummary, previousSummary, catRes, budgetRes, currentTxRes, previousTxRes] = await Promise.all([
        api.getMonthlySummary(month, currency),
        api.getMonthlySummary(previousMonth, currency),
        api.listCategories(),
        api.listBudgets(month),
        api.listTransactions({ period: month, page: 1, limit: TRANSACTION_PAGE_SIZE }),
        api.listTransactions({ period: previousMonth, page: 1, limit: TRANSACTION_PAGE_SIZE })
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

      const currentSummaryOk = currentSummary.data !== null;
      const previousSummaryOk = previousSummary.data !== null;

      const currentTxError = currentTxRes.error;
      const previousTxError = previousTxRes.error;
      const mayUseCache = [currentTxError, previousTxError].some((item) => item && canUseStaleData(item));
      const cached = mayUseCache ? await readCached(user.id) : [];
      const cachedCurrent = cached.filter((tx) => !tx.deletedAt && tx.occurredOn?.startsWith(month));
      const cachedPrevious = cached.filter((tx) => !tx.deletedAt && tx.occurredOn?.startsWith(previousMonth));

      const currentRows = currentTxRes.data !== null
        ? (await mergeRows(currentTxRes.data ?? [])).filter((tx) => tx.occurredOn?.startsWith(month))
        : currentTxError && canUseStaleData(currentTxError) ? cachedCurrent : [];
      const previousRows = previousTxRes.data !== null
        ? (await mergeRows(previousTxRes.data ?? [])).filter((tx) => tx.occurredOn?.startsWith(previousMonth))
        : previousTxError && canUseStaleData(previousTxError) ? cachedPrevious : [];

      setTransactions(currentRows);
      setPreviousTransactions(previousRows);
      const currentAvailable = currentTxRes.data !== null || (currentTxError && canUseStaleData(currentTxError) && cachedCurrent.length > 0);
      setDataStatus(!currentAvailable
        ? 'unavailable'
        : !currentSummary.data
          ? 'cached'
          : !previousSummary.data
            ? 'partial'
            : 'current');
      const transactionErrorMessages = [
        currentTxError && (currentAvailable
          ? `Mes actual: ${formatApiError(currentTxError, 'error de conexión')}. Se muestran datos locales y pueden estar desactualizados.`
          : `Mes actual: ${formatApiError(currentTxError, 'no se pudo cargar')}. No se muestran importes sin confirmar.`),
        previousTxError && `Comparación mensual: ${formatApiError(previousTxError, 'no se pudo actualizar')}.`
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
        const messages = [catRes.error && formatApiError(catRes.error, 'categorías no disponibles'), budgetRes.error && formatApiError(budgetRes.error, 'presupuestos no disponibles')].filter(Boolean);
        setError((currentError) => [currentError, `No se pudieron actualizar algunos datos: ${messages.join('; ')}`]
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
  }, [month, user, currency, defaultCurrency]);

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

  const KIND_LABELS: Record<'income' | 'expense', string> = { income: 'Ingresos', expense: 'Gastos' };
  const KIND_ICONS: Record<'income' | 'expense', React.ComponentType<{ size?: number; strokeWidth?: number; ariaHidden?: boolean }>> = { income: Plus, expense: EyeOff };

  const renderBalances = (balances: Array<{ currency: CurrencyCode; amountMinor: number }>) => {
    if (!balances.length) return <Text variant="small" tone="stone">—</Text>;
    return balances.map((b) => (
      <Text key={b.currency} variant="small" tone="stone">
        <Money amountMinor={b.amountMinor} currency={b.currency} sign="auto" censored={!showAmounts} />
      </Text>
    ));
  };

  return (
    <Page className="overview-page">
      <PageHeader
        title="Resumen"
        action={
          <Inline justify="end" gap="sm">
            <SegmentedControl
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'ARS', label: 'ARS' },
                { value: 'USD', label: 'USD' }
              ]}
              size="sm"
            />
            <ButtonLink to="/movimientos?new=expense" variant="primary" size="sm">
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Nuevo
            </ButtonLink>
          </Inline>
        }
      />
      <MonthStepper value={month} onChange={setMonth} />

      <Grid columns="repeat(auto-fit, minmax(200px, 1fr))" gap="md">
        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="xs">
            <Text variant="small" tone="stone">Saldo neto</Text>
            <Money amountMinor={summary.netMinor} currency={currency} sign="auto" tone="onInk" size="xl" censored={!showAmounts} />
            <Text variant="small" tone="stone">{dataStatus === 'unavailable' ? '—' : dataStatus === 'cached' ? 'Datos locales (pueden estar desactualizados)' : dataStatus === 'partial' ? 'Comparación sin actualizar' : 'Actualizado'}</Text>
          </Stack>
        </Panel>
        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="xs">
            <Text variant="small" tone="stone">{KIND_LABELS.income}</Text>
            <Money amountMinor={summary.incomeMinor} currency={currency} sign="plus" tone="onInk" size="xl" censored={!showAmounts} />
          </Stack>
        </Panel>
        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="xs">
            <Text variant="small" tone="stone">{KIND_LABELS.expense}</Text>
            <Money amountMinor={summary.expenseMinor} currency={currency} sign="minus" tone="onInk" size="xl" censored={!showAmounts} />
          </Stack>
        </Panel>
      </Grid>

      <Section title="Presupuestos">
        <BudgetList
          budgets={budgets}
          categoriesById={categoriesById}
          censored={!showAmounts}
          emptyLabel={budgetLoadError ? 'No se pudieron cargar los presupuestos.' : 'Todavía no definiste presupuestos para este mes.'}
          emptyAction={!budgetLoadError && (
            <ButtonLink to="/presupuestos" variant="primary" size="sm">
              Definir mi primer presupuesto
            </ButtonLink>
          )}
        />
      </Section>

      <Section title="Movimientos recientes">
        <LedgerList
          items={transactions}
          categoriesById={categoriesById}
          censored={!showAmounts}
          emptyLabel={dataStatus === 'unavailable' ? 'No se pudieron cargar los movimientos.' : 'Todavía no hay movimientos en este mes.'}
          emptyAction={dataStatus !== 'unavailable' && (
            <ButtonLink to="/movimientos?new=expense" variant="primary" size="sm">
              Registrar un movimiento
            </ButtonLink>
          )}
        />
      </Section>

      {error && <Notice tone="critical">{error}</Notice>}
    </Page>
  );
}