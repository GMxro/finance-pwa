// Pages: Commitments
import { useEffect, useState } from 'react';
import { Page, PageHeader, Panel, Text, Money, Button, EmptyState, Input, Modal } from '@shared/ui';
import { api } from '@shared/api/client';
import { todayLocalISO } from '@domain/date';
import { useCurrencyInput } from '@shared/hooks/useCurrencyInput';

export function CommitmentsPage() {
  const today = todayLocalISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [summary, setSummary] = useState<any>(null);
  const [commitments, setCommitments] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'installments' | 'recurring'>('upcoming');
  const [loading, setLoading] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editAmountMinor, setEditAmountMinor] = useState<number | null>(null);
  const [editEndOn, setEditEndOn] = useState('');
  const amountInput = useCurrencyInput({ currency: editingRule?.currency ?? 'ARS', initialValue: editAmountMinor, allowEmpty: true, onChange: (v) => setEditAmountMinor(v) });

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, p, r] = await Promise.all([
        api.getCommitmentsSummary(month),
        api.listCommitments(`${month}-01`, (() => { const _p = month.split('-').map(Number); const y = _p[0]!; const m = _p[1]!; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${month}-${String(last).padStart(2, '0')}`; })()),
        api.listInstallmentPlans(),
        api.listRecurringRules()
      ]);
      if (s.data) setSummary(s.data);
      if (c.data) setCommitments(c.data as any[]);
      if (p.data) setPlans(p.data as any[]);
      if (r.data) setRules(r.data as any[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [month]);

  const installments = commitments.filter(c => c.source === 'installment');
  const recurring = commitments.filter(c => c.source === 'recurring');

  const cancelPlan = async (plan: any) => {
    const res = await api.cancelInstallmentPlan(plan.id, plan.version);
    if (!res.error) await load();
  };

  const cancelRule = async (rule: any) => {
    const res = await api.cancelRecurringRule(rule.id, rule.version);
    if (!res.error) await load();
  };

  const openEditRule = (rule: any) => {
    setEditingRule(rule);
    setEditConcept(rule.concept);
    setEditAmountMinor(rule.amountMinor);
    setEditEndOn(rule.endOn ?? '');
    amountInput.setValueMinor(rule.amountMinor);
  };

  const saveEditRule = async () => {
    if (!editingRule) return;
    const res = await api.updateRecurringRule(editingRule.id, {
      concept: editConcept,
      amountMinor: editAmountMinor ?? editingRule.amountMinor,
      endOn: editEndOn || null,
      version: editingRule.version
    });
    if (!res.error) {
      setEditingRule(null);
      await load();
    }
  };

  return (
    <Page>
      <PageHeader title="Compromisos" description="Cuotas pendientes, recurrencias y próximos vencimientos" />
      <Panel>
        {summary ? (
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div>
              <Text variant="small">ARS</Text>
              <div><Money amountMinor={summary.byCurrency?.ARS?.committedExpenseMinor ?? 0} currency="ARS" /></div>
            </div>
            <div>
              <Text variant="small">USD</Text>
              <div><Money amountMinor={summary.byCurrency?.USD?.committedExpenseMinor ?? 0} currency="USD" /></div>
            </div>
          </div>
        ) : <Text variant="small">Sin datos</Text>}
      </Panel>
      <Panel>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Button size="sm" variant={tab === 'upcoming' ? 'primary' : 'ghost'} onClick={() => setTab('upcoming')}>Próximos</Button>
          <Button size="sm" variant={tab === 'installments' ? 'primary' : 'ghost'} onClick={() => setTab('installments')}>Cuotas</Button>
          <Button size="sm" variant={tab === 'recurring' ? 'primary' : 'ghost'} onClick={() => setTab('recurring')}>Recurrentes</Button>
        </div>
        {tab === 'upcoming' && (
          <div>
            {commitments.length === 0 ? <EmptyState title="Sin compromisos" message="No hay compromisos próximos." /> : commitments.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <Text>{c.label} ({c.date})</Text>
                <Money amountMinor={c.amountMinor} currency={c.currency} />
              </div>
            ))}
          </div>
        )}
        {tab === 'installments' && (
          <div>
            {plans.length === 0 ? <EmptyState title="Sin cuotas" message="No hay planes de cuotas." /> : plans.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <Text>{p.concept} ({p.installmentsCount} cuotas)</Text>
                <Button size="sm" variant="ghost" onClick={() => void cancelPlan(p)}>Cancelar</Button>
              </div>
            ))}
          </div>
        )}
        {tab === 'recurring' && (
          <div>
            {rules.length === 0 ? <EmptyState title="Sin recurrentes" message="No hay recurrencias." /> : rules.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <Text>{r.concept} ({r.frequency})</Text>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEditRule(r)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => void cancelRule(r)}>Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={editingRule !== null} onClose={() => setEditingRule(null)} title="Editar recurrencia">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Input label="Concepto" value={editConcept} onChange={setEditConcept} />
          <Input label="Importe" value={amountInput.displayValue} onChange={amountInput.onChangeString} onBlur={amountInput.onBlur} onFocus={amountInput.onFocus} />
          <Input label="Fecha de fin (opcional)" type="date" value={editEndOn} onChange={setEditEndOn} />
          <Button onClick={() => void saveEditRule()}>Guardar</Button>
        </div>
      </Modal>
    </Page>
  );
}
