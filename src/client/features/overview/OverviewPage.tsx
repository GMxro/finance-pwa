import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../app/providers';
import { api } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { BudgetWithSpent } from '@contracts/budget';
import type { CurrencyCode } from '@domain/money';
import { addMonths } from '@domain/date';
import { computeAllCurrenciesSummary } from '@domain/summary';
import { readCached } from '@local-data/transaction-store';
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

function getInitialShowAmounts(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // ignore
  }
  return true; // default: show amounts
}

function mergeMonthRows(rows: any[], cached: any[], month: string) {
  const byId = new Map<string, any>();
  for (const tx of cached) {
    if (tx.occurredOn?.startsWith(month)) byId.set(tx.id, tx);
  }
  for (const tx of rows) {
    if (!byId.has(tx.id)) byId.set(tx.id, tx);
  }
  return Array.from(byId.values()).sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
}

export function OverviewPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState<CurrencyCode>('ARS');
  const [showAmounts, setShowAmounts] = useState<boolean>(getInitialShowAmounts);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [previousTransactions, setPreviousTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const previousMonth = addMonths(month, -1) ?? month;
    try {
      const [txRes, prevRes, catRes, budgetRes, cached] = await Promise.all([
        api.listTransactions({ period: month, limit: 100 }),
        api.listTransactions({ period: previousMonth, limit: 100 }),
        api.listCategories(),
        api.listBudgets(month),
        readCached(user.id)
      ]);

      setTransactions(mergeMonthRows(txRes.data ?? [], cached, month));
      setPreviousTransactions(mergeMonthRows(prevRes.data ?? [], cached, previousMonth));
      setCategories(catRes.data ?? []);
      setBudgets(budgetRes.data ?? []);
    } catch {
      setError('No pudimos cargar tu resumen. Probá de nuevo.');
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
    if (summary.transactionCount === 0 || previousSummary.transactionCount === 0) return null;
    if (summary.expenseMinor <= 0 || previousSummary.expenseMinor <= 0) return null;
    const change = Math.round(
      ((summary.expenseMinor - previousSummary.expenseMinor) / previousSummary.expenseMinor) * 100
    );
    if (change === 0) return 'Gastos iguales al mes anterior';
    return change > 0
      ? `Gastos ${Math.abs(change)}% por encima del mes anterior`
      : `Gastos ${Math.abs(change)}% por debajo del mes anterior`;
  }, [summary, previousSummary]);

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
                ) : (
                  <Money amountMinor={summary.incomeMinor} currency={currency} sign="plus" tone="onInk" size="md" censored={!showAmounts} />
                )}
              </div>
              <div className="overview-hero__row">
                <Text variant="small" tone="on-ink-muted">Gastos</Text>
                {loading ? (
                  <span className="overview-skeleton overview-skeleton--onInk overview-skeleton--value" aria-hidden="true" />
                ) : (
                  <Money amountMinor={summary.expenseMinor} currency={currency} sign="minus" tone="onInk" size="md" censored={!showAmounts} />
                )}
              </div>
              <div className="overview-hero__row">
                <Text variant="caption" tone="on-ink-muted">Movimientos</Text>
                {loading ? (
                  <span className="overview-skeleton overview-skeleton--onInk overview-skeleton--count" aria-hidden="true" />
                ) : (
                  <Text variant="caption" tone="on-ink-muted">{summary.transactionCount}</Text>
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
                emptyLabel="Todavía no definiste presupuestos para este mes."
                emptyAction={
                  <ButtonLink to="/presupuestos" variant="primary" size="sm">
                    Definir mi primer presupuesto
                  </ButtonLink>
                }
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
              emptyLabel="Todavía no hay movimientos en este mes."
              emptyAction={
                <ButtonLink to="/movimientos?new=expense" variant="primary" size="sm">
                  Registrar un movimiento
                </ButtonLink>
              }
            />
          )}
        </Panel>
      </Section>
    </Page>
  );
}
