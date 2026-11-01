// Pages: Calendar
import { useEffect, useState } from 'react';
import { Page, PageHeader, Panel, Text, Money, MonthStepper, EmptyState } from '@shared/ui';
import { api } from '@shared/api/client';
import { todayLocalISO } from '@domain/date';

export function CalendarPage() {
  const today = todayLocalISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getCalendarMonth(month).then((res) => {
      if (mounted && res.data) {
        setDays(res.data as any[]);
        setSelected(res.data[0]?.date ?? null);
      }
    }).finally(() => setLoading(false));
    return () => { mounted = false; };
  }, [month]);

  const selectedDay = days.find(d => d.date === selected);

  return (
    <Page>
      <PageHeader title="Calendario" description="Movimientos e ingresos/gastos previstos por día" />
      <Panel>
        <MonthStepper month={month} onChange={setMonth} />
      </Panel>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
            {days.map((d) => (
              <button key={d.date} onClick={() => setSelected(d.date)} style={{ border: d.date === selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: '8px', padding: '0.5rem', background: d.isFuture ? 'var(--color-surface-subtle)' : 'transparent', textAlign: 'left' }}>
                <Text variant="small">{d.date.slice(8)}</Text>
                <div><Money amountMinor={d.incomeMinor} currency="ARS" /></div>
                <div><Money amountMinor={d.expenseMinor} currency="ARS" /></div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          {selectedDay ? (
            <div>
              <Text variant="subtitle">{selectedDay.date}</Text>
              <Text variant="small">Transacciones</Text>
              {(selectedDay.transactions || []).map((t: any) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                  <Text>{t.note || '-'}</Text>
                  <Money amountMinor={t.amountMinor} currency={t.currency} />
                </div>
              ))}
              <Text variant="small">Previstos</Text>
              {(selectedDay.commitments || []).map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', opacity: 0.7 }}>
                  <Text>{c.label}</Text>
                  <Money amountMinor={c.amountMinor} currency={c.currency} />
                </div>
              ))}
            </div>
          ) : <EmptyState title="Sin datos" message="No hay movimientos para este mes." />}
        </Panel>
      </div>
    </Page>
  );
}
