import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { api, canUseStaleData } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { BudgetWithSpent } from '@contracts/budget';
import type { AccountWithBalances } from '@contracts/account';
import type { CurrencyCode } from '@domain/money';
import { addMonths, todayLocalISO } from '@domain/date';
import { computeAllCurrenciesSummary } from '@domain/summary';
import { mergeWithCache, readCached } from '@local-data/transaction-store';
import { Page, PageHeader, Section, Grid, Stack, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Text } from '@shared/ui/Text';
import { Money } from '@shared/ui/Money';
import { MonthStepper } from '@shared/ui/MonthStepper';
import { SegmentedControl } from '@shared/ui/SegmentedControl';
import { ButtonLink } from '@shared/ui/Button';
import { Notice } from '@shared/ui/Notice';
import { LedgerList } from '@shared/ui/LedgerList';
import { BudgetList } from '@shared/ui/BudgetList';
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
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => todayLocalISO().slice(0, 7));
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [showAmounts] = useState<boolean>(getInitialShowAmounts);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'current' | 'cached' | 'partial' | 'unavailable'>('unavailable');
  const [budgetLoadError, setBudgetLoadError] = useState(false);
  const [previousTransactions, setPreviousTransactions] = useState<any[]>([]);

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
      const [currentSummary, previousSummary, catRes, budgetRes, currentTxRes, previousTxRes, accountRes] = await Promise.all([
        api.getMonthlySummary(month, currency),
        api.getMonthlySummary(previousMonth, currency),
        api.listCategories(),
        api.listBudgets(month),
        api.listTransactions({ period: month, page: 1, limit: TRANSACTION_PAGE_SIZE }),
        api.listTransactions({ period: previousMonth, page: 1, limit: TRANSACTION_PAGE_SIZE }),
        api.listAccounts()
      ]);
      const mergeRows = async (rows: any[]) => {
        try {
          return await mergeWithCache(user.id, rows);
        } catch {
          return rows;
        }
      };

      const transactionErrors = [currentTxRes.error, previousTxRes.error].filter(Boolean);
      const mayUseCache = transactionErrors.some((item) => canUseStaleData(item));
      const cached = mayUseCache ? await readCached(user.id) : [];
      const cachedCurrent = cached.filter((tx) => !tx.deletedAt && tx.occurredOn?.startsWith(month));
      const cachedPrevious = cached.filter((tx) => !tx.deletedAt && tx.occurredOn?.startsWith(previousMonth));
      const currentRows = currentTxRes.data !== null
        ? (await mergeRows(currentTxRes.data ?? [])).filter((tx) => tx.occurredOn?.startsWith(month))
        : currentTxRes.error && canUseStaleData(currentTxRes.error) ? cachedCurrent : [];
      const previousRows = previousTxRes.data !== null
        ? (await mergeRows(previousTxRes.data ?? [])).filter((tx) => tx.occurredOn?.startsWith(previousMonth))
        : previousTxRes.error && canUseStaleData(previousTxRes.error) ? cachedPrevious : [];
      
      setTransactions(currentRows);
      setPreviousTransactions(previousRows);
      
     const currentAvailable = currentSummary.data !== null || (currentSummary.error && canUseStaleData(currentSummary.error) && cachedCurrent.length > 0);
     setDataStatus(!currentAvailable
       ? 'unavailable'
       : currentSummary.data === null
         ? 'cached'
         : previousSummary.data === null
           ? 'partial'
           : 'current');
     if (currentSummary.error || previousSummary.error) {
       const failure = currentSummary.error ?? previousSummary.error;
       const message = (failure as any)?.message ?? 'error de conexión';
       setError(currentSummary.data === null && currentAvailable
         ? `No se pudo actualizar el período actual (${message}). Se muestran datos guardados en este dispositivo y pueden estar desactualizados.`
         : !currentAvailable
           ? `No se pudo cargar el período actual (${message}). No se muestran importes sin confirmar.`
           : `No se pudo cargar la comparación mensual (${message}). Los importes del período actual sí fueron actualizados.`);
     }

      const auxiliaryErrors = [catRes.error?.message, budgetRes.error?.message].filter(Boolean);
      if (catRes.error) setCategories([]);
      else setCategories(catRes.data ?? []);
      if (budgetRes.error) {
        setBudgets([]);
        setBudgetLoadError(true);
      } else {
        setBudgets(budgetRes.data ?? []);
      }
      setAccounts(accountRes.error ? [] : accountRes.data ?? []);
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
  }, [month, user, currency]);

  useEffect(() => { void load(); }, [load]);

  const previousMonth = addMonths(month, -1) ?? month;
  const summaries = useMemo(
    () => computeAllCurrenciesSummary(transactions as any, month),
    [transactions, month]
  );
  const summary = summaries.find((s: { currency: CurrencyCode }) => s.currency === currency) ?? summaries[0]!;
  const previousSummaries = useMemo(
    () => computeAllCurrenciesSummary(previousTransactions as any, previousMonth),
    [previousTransactions, previousMonth]
  );
  const previousSummary = previousSummaries.find((s: { currency: CurrencyCode }) => s.currency === currency) ?? previousSummaries[0]!;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _previousSummary = previousSummary;
  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);

 const KIND_LABELS: Record<'income' | 'expense', string> = { income: 'Ingresos', expense: 'Gastos' };

  return (
    <Page className="overview-page">
      <PageHeader
        title="Resumen"
        actions={
          <Inline justify="end" gap="sm">
            <SegmentedControl
              value={currency}
              onChange={(v) => setCurrency(v as CurrencyCode)}
              label="Moneda"
              options={[
                { value: 'ARS', label: 'ARS' },
                { value: 'USD', label: 'USD' }
              ]}
            />
          </Inline>
        }
      />
      <div className="overview-period"><MonthStepper month={month} onChange={setMonth} /></div>

      <div className="overview-summary">
        <Panel tone="ink" radius="panel" padding="md" className="overview-net">
          <Stack gap="xs">
            <Text variant="small" tone="on-ink-muted">Saldo neto</Text>
            <Money amountMinor={summary.netMinor} currency={currency} sign="auto" tone="onInk" size="xl" censored={!showAmounts} />
            <Text variant="small" tone="on-ink-muted">{dataStatus === 'unavailable' ? '—' : dataStatus === 'cached' ? 'Datos locales (pueden estar desactualizados)' : dataStatus === 'partial' ? 'Comparación sin actualizar' : 'Actualizado'}</Text>
          </Stack>
        </Panel>
        <Grid columns={2} gap="sm" className="overview-income-expense">
          <Link className="overview-summary-link" to={`/movimientos?period=${month}&kind=income`} aria-label={`Ver ingresos de ${month}`}>
            <Panel tone="paper" radius="card" padding="md" className="overview-amount-card">
              <Stack gap="xs">
                <Text variant="small" tone="stone">{KIND_LABELS.income}</Text>
                <Money amountMinor={summary.incomeMinor} currency={currency} sign="plus" tone="ink" size="md" censored={!showAmounts} />
              </Stack>
            </Panel>
          </Link>
          <Link className="overview-summary-link" to={`/movimientos?period=${month}&kind=expense`} aria-label={`Ver gastos de ${month}`}>
            <Panel tone="paper" radius="card" padding="md" className="overview-amount-card">
              <Stack gap="xs">
                <Text variant="small" tone="stone">{KIND_LABELS.expense}</Text>
                <Money amountMinor={summary.expenseMinor} currency={currency} sign="minus" tone="ink" size="md" censored={!showAmounts} />
              </Stack>
            </Panel>
          </Link>
        </Grid>
      </div>

      <Section title="Presupuestos" action={<ButtonLink to="/presupuestos" variant="ghost" size="sm">Ver todos</ButtonLink>}>
        <BudgetList
          items={budgets.map(b => ({
            id: b.id,
            categoryId: b.categoryId,
            currency: b.currency,
            limitMinor: b.limitMinor,
            spentMinor: b.spentMinor,
            remainingMinor: b.remainingMinor,
            isOverBudget: b.isOverBudget
          }))}
          categoryName={id => categoriesById.get(id)?.name ?? '—'}
          categoryIcon={id => categoriesById.get(id)?.iconKey ?? '📁'}
          censored={!showAmounts}
          onSelect={item => navigate(`/movimientos?period=${month}&kind=expense&categoryId=${item.categoryId}`)}
          emptyLabel={budgetLoadError ? 'No se pudieron cargar los presupuestos.' : 'Todavía no definiste presupuestos para este mes.'}
          emptyAction={!budgetLoadError && (
            <ButtonLink to="/presupuestos" variant="primary" size="sm">
              Definir mi primer presupuesto
            </ButtonLink>
          )}
        />
      </Section>

      <Section title="Movimientos recientes" className="overview-recent" action={<ButtonLink to={`/movimientos?period=${month}`} variant="ghost" size="sm">Ver historial</ButtonLink>}>
        <LedgerList
          items={transactions.slice(0, 8).map(t => ({
            id: t.id,
            kind: t.kind,
            amountMinor: t.amountMinor,
            currency: t.currency,
            occurredOn: t.occurredOn,
            note: t.note,
            categoryId: t.categoryId,
            accountName: t.accountId ? accountsById.get(t.accountId) : undefined,
            pending: !t.synced
          }))}
          categoryName={id => categoriesById.get(id)?.name ?? '—'}
          categoryIcon={id => categoriesById.get(id)?.iconKey ?? '📁'}
          onEdit={item => navigate(`/movimientos?period=${month}&edit=${encodeURIComponent(item.id)}`)}
          censored={!showAmounts}
          emptyLabel={dataStatus === 'unavailable' ? 'No se pudieron cargar los movimientos.' : 'Todavía no hay movimientos en este mes.'}
        />
      </Section>

      {error && <Notice tone="strong">{error}</Notice>}
    </Page>
  );
}
