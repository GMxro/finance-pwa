// Pages: Commitments
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Input,
  ListRow,
  LoadingSpinner,
  Modal,
  Money,
  MonthStepper,
  Notice,
  Page,
  PageHeader,
  Panel,
  SegmentedControl,
  Section,
  Stack,
  Text
} from '@shared/ui';
import { api, formatApiError } from '@shared/api/client';
import { formatLocalDate, getMonthBounds, todayLocalISO } from '@domain/date';
import type { CurrencyCode } from '@domain/money';
import type { Commitment, CommitmentsSummary } from '@contracts/commitment';
import type { InstallmentPlanResponse } from '@contracts/installment';
import type { RecurringRuleResponse } from '@contracts/recurring';
import { getPeriodLabel } from '@shared/format/formatters';
import { FREQUENCY_LABELS } from '@shared/format/frequency';
import { useCurrencyInput } from '@shared/hooks/useCurrencyInput';
import './CommitmentsPage.css';

type Tab = 'upcoming' | 'installments' | 'recurring';
type InstallmentPlanRow = Omit<InstallmentPlanResponse, 'items'>;
type CancelTarget =
  | { type: 'plan'; item: InstallmentPlanRow }
  | { type: 'rule'; item: RecurringRuleResponse };

const CURRENCIES: CurrencyCode[] = ['ARS', 'USD'];
const ZERO_FIGURES = { committedExpenseMinor: 0, committedIncomeMinor: 0 };
const TAB_OPTIONS = [
  { value: 'upcoming', label: 'Próximos' },
  { value: 'installments', label: 'Cuotas' },
  { value: 'recurring', label: 'Recurrentes' }
];

function installmentLabel(count: number) {
  return `${count} ${count === 1 ? 'cuota' : 'cuotas'}`;
}

export function CommitmentsPage() {
  const [month, setMonth] = useState(todayLocalISO().slice(0, 7));
  const [summary, setSummary] = useState<CommitmentsSummary | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [plans, setPlans] = useState<InstallmentPlanRow[]>([]);
  const [rules, setRules] = useState<RecurringRuleResponse[]>([]);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingRule, setEditingRule] = useState<RecurringRuleResponse | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editEndOn, setEditEndOn] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const amountInput = useCurrencyInput({
    currency: editingRule?.currency ?? 'ARS',
    allowEmpty: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bounds = getMonthBounds(month);
      const from = bounds?.start ?? `${month}-01`;
      const to = bounds?.end ?? from;
      const [summaryRes, commitmentsRes, plansRes, rulesRes] = await Promise.all([
        api.getCommitmentsSummary(month),
        api.listCommitments(from, to),
        api.listInstallmentPlans(),
        api.listRecurringRules()
      ]);
      const failure = [summaryRes, commitmentsRes, plansRes, rulesRes].find(res => res.error);
      if (failure?.error) throw failure.error;
      setSummary((summaryRes.data as CommitmentsSummary | null) ?? null);
      setCommitments((commitmentsRes.data as Commitment[] | null) ?? []);
      setPlans((plansRes.data as InstallmentPlanRow[] | null) ?? []);
      setRules((rulesRes.data as RecurringRuleResponse[] | null) ?? []);
    } catch (e) {
      setError(formatApiError(e, 'No pudimos cargar los compromisos.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRules = rules.filter(rule => rule.active);
  const monthReady = summary?.month === month;
  const hasAnyData =
    commitments.length > 0 || plans.length > 0 || activeRules.length > 0 || monthReady;
  const initialLoading = loading && !hasAnyData;

  const closeCancelModal = () => {
    if (cancelBusy) return;
    setCancelTarget(null);
    setCancelError(null);
  };

  const confirmCancel = async () => {
    const target = cancelTarget;
    if (!target) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res =
        target.type === 'plan'
          ? await api.cancelInstallmentPlan(target.item.id, target.item.version)
          : await api.cancelRecurringRule(target.item.id, target.item.version);
      if (res.error) throw res.error;
      setCancelTarget(null);
      await load();
    } catch (e) {
      setCancelError(formatApiError(e, 'No pudimos cancelar. Probá de nuevo.'));
    } finally {
      setCancelBusy(false);
    }
  };

  const openEditRule = (rule: RecurringRuleResponse) => {
    setEditingRule(rule);
    setEditConcept(rule.concept);
    setEditEndOn(rule.endOn ?? '');
    setEditError(null);
    amountInput.setValueMinor(rule.amountMinor);
  };

  const closeEditRule = () => {
    if (savingRule) return;
    setEditingRule(null);
    setEditError(null);
  };

  const saveEditRule = async () => {
    if (!editingRule) return;
    const concept = editConcept.trim();
    const amountMinor = amountInput.valueMinor;
    if (!concept) {
      setEditError('Escribí un concepto.');
      return;
    }
    if (!amountMinor || amountMinor <= 0) {
      setEditError('Ingresá un importe mayor a cero.');
      return;
    }
    setSavingRule(true);
    setEditError(null);
    try {
      const res = await api.updateRecurringRule(editingRule.id, {
        concept,
        amountMinor,
        endOn: editEndOn || null,
        version: editingRule.version
      });
      if (res.error) throw res.error;
      setEditingRule(null);
      await load();
    } catch (e) {
      setEditError(formatApiError(e, 'No pudimos guardar los cambios.'));
    } finally {
      setSavingRule(false);
    }
  };

  const renderUpcoming = () => {
    if (!monthReady) {
      return loading ? (
        <div className="commitments-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : null;
    }
    if (commitments.length === 0) {
      return (
        <EmptyState
          title="Sin vencimientos próximos"
          message={`No hay cuotas ni recurrencias con vencimiento en ${getPeriodLabel(month)}.`}
        />
      );
    }
    return (
      <Panel tone="paper" radius="card" padding="none">
        <div className="commitments-list">
          {commitments.map(c => (
            <ListRow
              key={`${c.source}-${c.sourceId}-${c.date}`}
              title={c.label}
              subtitle={formatLocalDate(c.date)}
              meta={
                <div className="commitments-row-meta">
                  <Money amountMinor={c.amountMinor} currency={c.currency} size="sm" />
                  {c.isFuture && <span className="ui-row__badge">Previsto</span>}
                </div>
              }
            />
          ))}
        </div>
      </Panel>
    );
  };

  const renderInstallments = () => {
    if (plans.length === 0) {
      return loading ? (
        <div className="commitments-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <EmptyState
          title="Sin planes de cuotas"
          message="Cuando registres una compra en cuotas, el plan y su total van a aparecer acá."
        />
      );
    }
    return (
      <Panel tone="paper" radius="card" padding="none">
        <div className="commitments-list">
          {plans.map(plan => (
            <ListRow
              key={plan.id}
              title={plan.concept}
              subtitle={installmentLabel(plan.installmentsCount)}
              meta={<Money amountMinor={plan.totalMinor} currency={plan.currency} size="sm" />}
              trailing={
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Cancelar plan ${plan.concept}`}
                  onClick={() => {
                    setCancelError(null);
                    setCancelTarget({ type: 'plan', item: plan });
                  }}
                >
                  Cancelar
                </Button>
              }
            />
          ))}
        </div>
      </Panel>
    );
  };

  const renderRecurring = () => {
    if (activeRules.length === 0) {
      return loading ? (
        <div className="commitments-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : (
        <EmptyState
          title="Sin recurrencias activas"
          message="Las reglas activas aparecen acá con su frecuencia y próximo vencimiento."
        />
      );
    }
    return (
      <Panel tone="paper" radius="card" padding="none">
        <div className="commitments-list">
          {activeRules.map(rule => {
            const frequency = FREQUENCY_LABELS[rule.frequency] ?? rule.frequency;
            return (
              <ListRow
                key={rule.id}
                title={rule.concept}
                subtitle={`${frequency} · Próximo vencimiento: ${formatLocalDate(rule.nextDueOn)}`}
                meta={<Money amountMinor={rule.amountMinor} currency={rule.currency} size="sm" />}
                trailing={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar ${rule.concept}`}
                      onClick={() => openEditRule(rule)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Cancelar ${rule.concept}`}
                      onClick={() => {
                        setCancelError(null);
                        setCancelTarget({ type: 'rule', item: rule });
                      }}
                    >
                      Cancelar
                    </Button>
                  </>
                }
              />
            );
          })}
        </div>
      </Panel>
    );
  };

  const cancelIsPlan = cancelTarget?.type === 'plan';
  const cancelConcept = cancelTarget?.item.concept ?? '';

  return (
    <Page className="commitments-page">
      <PageHeader
        title="Compromisos"
        description="Cuotas pendientes, recurrencias y próximos vencimientos."
        actions={<MonthStepper month={month} onChange={setMonth} />}
      />

      {error && (
        <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>
          {error}
        </Notice>
      )}

      {initialLoading && (
        <div className="commitments-loading">
          <LoadingSpinner />
        </div>
      )}

      {monthReady && summary && (
        <Panel tone="paper" radius="card" padding="md" className="commitments-summary">
          <div className="commitments-summary__head">
            <Text variant="subtitle">Comprometido · {getPeriodLabel(month)}</Text>
            {loading && (
              <Text variant="caption" tone="stone">
                Actualizando…
              </Text>
            )}
          </div>
          <div className="commitments-summary__grid">
            {CURRENCIES.map(currency => {
              const figures = summary.byCurrency[currency] ?? ZERO_FIGURES;
              return (
                <div className="commitments-summary__currency" key={currency}>
                  <Text variant="caption" tone="stone" className="commitments-summary__currency-label">
                    {currency}
                  </Text>
                  <div className="commitments-summary__figures">
                    <div className="commitments-figure">
                      <Text variant="caption" tone="stone">
                        Gastos comprometidos
                      </Text>
                      <Money
                        amountMinor={figures.committedExpenseMinor}
                        currency={currency}
                        size="md"
                      />
                    </div>
                    <div className="commitments-figure">
                      <Text variant="caption" tone="stone">
                        Ingresos previstos
                      </Text>
                      <Money
                        amountMinor={figures.committedIncomeMinor}
                        currency={currency}
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {!initialLoading && (hasAnyData || !error) && (
        <Section>
          <div className="commitments-toolbar">
            <SegmentedControl
              value={tab}
              onChange={value => setTab(value as Tab)}
              options={TAB_OPTIONS}
              aria-label="Vista de compromisos"
              className="commitments-tabs"
            />
          </div>
          {tab === 'upcoming' && renderUpcoming()}
          {tab === 'installments' && renderInstallments()}
          {tab === 'recurring' && renderRecurring()}
        </Section>
      )}

      <Modal
        open={cancelTarget !== null}
        onClose={closeCancelModal}
        busy={cancelBusy}
        title={cancelIsPlan ? 'Cancelar plan de cuotas' : 'Cancelar recurrencia'}
        description={cancelConcept || undefined}
        footer={
          <>
            <Button variant="secondary" onClick={closeCancelModal} disabled={cancelBusy}>
              Cerrar
            </Button>
            <Button variant="danger" onClick={() => void confirmCancel()} loading={cancelBusy}>
              {cancelError ? 'Reintentar' : cancelIsPlan ? 'Cancelar plan' : 'Cancelar recurrencia'}
            </Button>
          </>
        }
      >
        <Stack gap="md">
          {cancelError && <Notice tone="strong">{cancelError}</Notice>}
          <Text variant="body" tone="stone">
            {cancelIsPlan
              ? `Se van a cancelar las cuotas pendientes de “${cancelConcept}”. Las cuotas ya registradas no se modifican.`
              : `“${cancelConcept}” va a dejar de generar movimientos. Los movimientos ya registrados no se modifican.`}
          </Text>
        </Stack>
      </Modal>

      <Modal
        open={editingRule !== null}
        onClose={closeEditRule}
        busy={savingRule}
        title="Editar recurrencia"
        description={
          editingRule
            ? `${editingRule.concept} · ${FREQUENCY_LABELS[editingRule.frequency]}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeEditRule} disabled={savingRule}>
              Cancelar
            </Button>
            <Button onClick={() => void saveEditRule()} loading={savingRule}>
              Guardar
            </Button>
          </>
        }
      >
        <Stack gap="md">
          {editError && <Notice tone="strong">{editError}</Notice>}
          <Input label="Concepto" value={editConcept} onChange={setEditConcept} />
          <Input
            label="Importe"
            prefix={editingRule?.currency === 'USD' ? 'US$' : '$'}
            value={amountInput.displayValue}
            onChange={amountInput.onChangeString}
            onBlur={amountInput.onBlur}
            onFocus={amountInput.onFocus}
            inputMode="decimal"
            pattern="[0-9.,]*"
          />
          <Input
            label="Fecha de fin (opcional)"
            type="date"
            value={editEndOn}
            onChange={setEditEndOn}
          />
        </Stack>
      </Modal>
    </Page>
  );
}
