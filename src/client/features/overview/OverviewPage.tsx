import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
import { ButtonLink } from '@shared/ui/Button';
import { Notice } from '@shared/ui/Notice';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => todayLocalISO().slice(0, 7));
  const [showAmounts, setShowAmounts] = useState<boolean>(getInitialShowAmounts);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [serverSummaryARS, setServerSummaryARS] = useState<any | null>(null);
  const [serverSummaryUSD, setServerSummaryUSD] = useState<any | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'current' | 'cached' | 'partial' | 'unavailable'>('unavailable');
  const [budgetLoadError, setBudgetLoadError] = useState(false);
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
      const [currentSummaryARS, currentSummaryUSD, previousSummaryARS, previousSummaryUSD, catRes, budgetRes, currentTxRes, accountRes] = await Promise.all([
        api.getMonthlySummary(month, 'ARS'),
        api.getMonthlySummary(month, 'USD'),
        api.getMonthlySummary(previousMonth, 'ARS'),
        api.getMonthlySummary(previousMonth, 'USD'),
        api.listCategories(),
        api.listBudgets(month),
        api.listTransactions({ period: month, page: 1, limit: TRANSACTION_PAGE_SIZE }),
        api.listAccounts()
      ]);
      setServerSummaryARS(currentSummaryARS.data ?? null);
      setServerSummaryUSD(currentSummaryUSD.data ?? null);
      const mergeRows = async (rows: any[]) => {
        try {
          return await mergeWithCache(user.id, rows);
        } catch {
          return rows;
        }
      };

      const transactionErrors = [currentTxRes.error].filter(Boolean);
      const mayUseCache = transactionErrors.some((item) => canUseStaleData(item));
      const cached = mayUseCache ? await readCached(user.id).catch((error) => { console.error('cache read failed', error); return []; }) : [];
      const cachedCurrent = cached.filter((tx) => !tx.deletedAt && tx.occurredOn?.startsWith(month));

      const currentRows = currentTxRes.data !== null
        ? (await mergeRows(currentTxRes.data ?? [])).filter((tx) => tx.occurredOn?.startsWith(month))
        : currentTxRes.error && canUseStaleData(currentTxRes.error) ? cachedCurrent : [];

      setTransactions(currentRows);

      const arsAvailable = currentSummaryARS.data !== null || (Boolean(currentSummaryARS.error) && canUseStaleData(currentSummaryARS.error) && cachedCurrent.some((tx: any) => tx.currency === 'ARS'));
      const usdAvailable = currentSummaryUSD.data !== null || (Boolean(currentSummaryUSD.error) && canUseStaleData(currentSummaryUSD.error) && cachedCurrent.some((tx: any) => tx.currency === 'USD'));
      const currentAvailable = arsAvailable || usdAvailable;
      setDataStatus(!currentAvailable
        ? 'unavailable'
        : (currentSummaryARS.data === null || currentSummaryUSD.data === null)
          ? 'cached'
          : (previousSummaryARS.data === null || previousSummaryUSD.data === null)
            ? 'partial'
            : 'current');
      const summaryErrors = [currentSummaryARS.error, currentSummaryUSD.error, previousSummaryARS.error, previousSummaryUSD.error].filter(Boolean);
      if (summaryErrors.length > 0 || transactionErrors.length > 0) {
        const failure = summaryErrors[0] ?? transactionErrors[0];
        const message = (failure as any)?.message ?? 'error de conexión';
        if (!currentAvailable) {
          setError(`No se pudo cargar el período actual (${message}). No se muestran importes sin confirmar.`);
        } else if (transactionErrors.length > 0) {
          setError(`No se pudieron cargar todos los movimientos del período (${message}). Los totales pueden estar incompletos.`);
        } else if (currentSummaryARS.data === null || currentSummaryUSD.data === null) {
          setError(`No se pudo actualizar el período actual (${message}). Se muestran datos guardados en este dispositivo y pueden estar desactualizados.`);
        } else {
          setError(`No se pudo cargar la comparación mensual (${message}). Los importes del período actual sí fueron actualizados.`);
        }
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
      setDataStatus('unavailable');
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar tu resumen.');
    } finally {
      setLoading(false);
    }
  }, [month, user]);

  useEffect(() => { void load(); }, [load]);

  const summaries = useMemo(
    () => computeAllCurrenciesSummary(transactions as any, month),
    [transactions, month]
  );
  const arsSummary = useMemo(() => {
    if (serverSummaryARS) return { incomeMinor: serverSummaryARS.incomeMinor, expenseMinor: serverSummaryARS.expenseMinor, netMinor: serverSummaryARS.netMinor };
    const client = summaries.find((s: { currency: CurrencyCode }) => s.currency === 'ARS') ?? summaries[0]!;
    return { incomeMinor: client.incomeMinor, expenseMinor: client.expenseMinor, netMinor: client.netMinor };
  }, [serverSummaryARS, summaries]);
  const usdSummary = useMemo(() => {
    if (serverSummaryUSD) return { incomeMinor: serverSummaryUSD.incomeMinor, expenseMinor: serverSummaryUSD.expenseMinor, netMinor: serverSummaryUSD.netMinor };
    const client = summaries.find((s: { currency: CurrencyCode }) => s.currency === 'USD') ?? summaries[0]!;
    return { incomeMinor: client.incomeMinor, expenseMinor: client.expenseMinor, netMinor: client.netMinor };
  }, [serverSummaryUSD, summaries]);

  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);

  const budgetItems = useMemo(() => budgets.map(b => ({
    id: b.id,
    categoryId: b.categoryId,
    currency: b.currency,
    limitMinor: b.limitMinor,
    spentMinor: b.spentMinor,
    remainingMinor: b.remainingMinor,
    isOverBudget: b.isOverBudget
  })), [budgets]);

  const recentItems = useMemo(() => transactions.slice(0, 8).map(t => ({
    id: t.id,
    kind: t.kind,
    amountMinor: t.amountMinor,
    currency: t.currency,
    occurredOn: t.occurredOn,
    note: t.note,
    categoryId: t.categoryId,
    accountName: t.accountId ? accountsById.get(t.accountId) : undefined,
    pending: !t.synced
  })), [transactions, accountsById]);

  const categoryName = useCallback((id: string | undefined) => categoriesById.get(id ?? '')?.name ?? '—', [categoriesById]);
  const categoryIcon = useCallback((id: string | undefined) => categoriesById.get(id ?? '')?.iconKey ?? '📁', [categoriesById]);

  const KIND_LABELS: Record<'income' | 'expense', string> = { income: 'Ingresos', expense: 'Gastos' };

  return (
    <Page className="overview-page">
      <PageHeader
        title="Resumen"
      />
      <div className="overview-period"><MonthStepper month={month} onChange={setMonth} /></div>
      {loading && <LoadingSpinner />}

      <div className="overview-summary">
        <Panel tone="ink" radius="panel" padding="md" className="overview-net">
          <Stack gap="sm">
            <Inline justify="between" align="center">
              <Text variant="body" tone="on-ink-muted">Saldo neto</Text>
              <button
                type="button"
                className="overview-hero__eye"
                onClick={() => setShowAmounts((prev) => !prev)}
                aria-label={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                aria-pressed={showAmounts}
                title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
              >
                {showAmounts ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
              </button>
            </Inline>
            <div className="overview-net__amounts">
              <div className="overview-net__column">
                <Text variant="caption" tone="on-ink-muted">Pesos · ARS</Text>
                <Money amountMinor={arsSummary.netMinor} currency="ARS" sign="auto" tone="onInk" size="xl" censored={!showAmounts} className={arsSummary.netMinor < 0 ? 'overview-net__amount--negative' : ''} />
              </div>
              <div className="overview-net__column">
                <Text variant="caption" tone="on-ink-muted">Dólares · USD</Text>
                <Money amountMinor={usdSummary.netMinor} currency="USD" sign="auto" tone="onInk" size="xl" censored={!showAmounts} className={usdSummary.netMinor < 0 ? 'overview-net__amount--negative' : ''} />
              </div>
            </div>
            {dataStatus !== 'current' && (
              <Text variant="body" tone="on-ink-muted">{dataStatus === 'unavailable' ? '—' : dataStatus === 'cached' ? 'Datos locales (pueden estar desactualizados)' : 'Comparación sin actualizar'}</Text>
            )}
          </Stack>
        </Panel>
        <Grid columns={2} gap="sm" className="overview-income-expense">
          <Panel tone="paper" radius="card" padding="md" className="overview-amount-card overview-amount-card--income">
            <Stack gap="xs">
              <Text variant="body" tone="stone">{KIND_LABELS.income}</Text>
              <div className="overview-amount-card__values">
                <Link className="overview-amount-link" to={`/movimientos?period=${month}&kind=income&currency=ARS`} aria-label={`Ver ingresos en ARS de ${month}`}>
                  <Money amountMinor={arsSummary.incomeMinor} currency="ARS" sign="plus" tone="ink" size="lg" censored={!showAmounts} />
                </Link>
                <Link className="overview-amount-link" to={`/movimientos?period=${month}&kind=income&currency=USD`} aria-label={`Ver ingresos en USD de ${month}`}>
                  <Money amountMinor={usdSummary.incomeMinor} currency="USD" sign="plus" tone="ink" size="lg" censored={!showAmounts} />
                </Link>
              </div>
            </Stack>
          </Panel>
          <Panel tone="paper" radius="card" padding="md" className="overview-amount-card overview-amount-card--expense">
            <Stack gap="xs">
              <Text variant="body" tone="stone">{KIND_LABELS.expense}</Text>
              <div className="overview-amount-card__values">
                <Link className="overview-amount-link" to={`/movimientos?period=${month}&kind=expense&currency=ARS`} aria-label={`Ver gastos en ARS de ${month}`}>
                  <Money amountMinor={arsSummary.expenseMinor} currency="ARS" sign="minus" tone="ink" size="lg" censored={!showAmounts} />
                </Link>
                <Link className="overview-amount-link" to={`/movimientos?period=${month}&kind=expense&currency=USD`} aria-label={`Ver gastos en USD de ${month}`}>
                  <Money amountMinor={usdSummary.expenseMinor} currency="USD" sign="minus" tone="ink" size="lg" censored={!showAmounts} />
                </Link>
              </div>
            </Stack>
          </Panel>
        </Grid>
      </div>

      <Section title="Presupuestos" className="overview-section-spaced" action={<ButtonLink to="/presupuestos" variant="ghost" size="sm" className="overview-section-action">Ver todos</ButtonLink>}>
        <BudgetList
          items={budgetItems}
          categoryName={categoryName}
          categoryIcon={categoryIcon}
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

      <Section title="Movimientos recientes" className="overview-recent overview-section-spaced" action={<ButtonLink to={`/movimientos?period=${month}`} variant="ghost" size="sm" className="overview-section-action">Ver historial</ButtonLink>}>
        <LedgerList
          items={recentItems}
          categoryName={categoryName}
          categoryIcon={categoryIcon}
          onEdit={item => navigate(`/movimientos?period=${month}&edit=${encodeURIComponent(item.id)}`)}
          censored={!showAmounts}
          emptyLabel={dataStatus === 'unavailable' ? 'No se pudieron cargar los movimientos.' : 'Todavía no hay movimientos en este mes.'}
        />
      </Section>

      {error && <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>{error}</Notice>}
    </Page>
  );
}