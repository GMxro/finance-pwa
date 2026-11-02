import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@shared/api/client';
import { useAuth } from '../../app/providers';
import type { BudgetWithSpent } from '@contracts/budget';
import type { CategoryResponse } from '@contracts/category';
import type { CurrencyCode } from '@domain/money';
import { todayLocalISO } from '@domain/date';
import { useCurrencyInput } from '@shared/hooks/useCurrencyInput';
import { Page, PageHeader, Stack, Inline, Grid } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { Modal } from '@shared/ui/Modal';
import { MonthStepper } from '@shared/ui/MonthStepper';
import { Notice } from '@shared/ui/Notice';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { BudgetList, type BudgetItem } from '@shared/ui/BudgetList';
import { Text } from '@shared/ui/Text';
import '../../app/styles/budgets.css';

interface BudgetForm {
  categoryId: string;
  currency: CurrencyCode;
  limitMinor: number | null;
}

const emptyForm = (categoryId: string, currency: CurrencyCode): BudgetForm => ({ categoryId, currency, limitMinor: null });

export function BudgetsPage() {
  const { defaultCurrency } = useAuth();
  const [month, setMonth] = useState(() => todayLocalISO().slice(0, 7));
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetWithSpent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BudgetForm>(() => emptyForm('', defaultCurrency));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetWithSpent | null>(null);

  // Hook para input de moneda con formateo ARS en vivo
  const limitInput = useCurrencyInput({
    currency: form.currency,
    initialValue: form.limitMinor,
    allowEmpty: true,
    onChange: (valueMinor) => setForm(f => ({ ...f, limitMinor: valueMinor }))
  });
  const setLimitMinor = limitInput.setValueMinor;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetRes, categoryRes] = await Promise.all([
        api.listBudgets(month),
        api.listCategories(true)
      ]);
      if (budgetRes.error) throw budgetRes.error;
      if (categoryRes.error) throw categoryRes.error;
      setBudgets(budgetRes.data ?? []);
      setCategories(categoryRes.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cargar los presupuestos.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const expenseCategories = useMemo(
    () => categories.filter(c => c.kind === 'expense' && !c.archivedAt),
    [categories]
  );
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const budgetCategoryOptions = useMemo(() => {
    const selected = categoryById.get(form.categoryId);
    if (editing && selected && (selected.archivedAt || selected.kind !== 'expense')) {
      return [...expenseCategories, selected];
    }
    return expenseCategories;
  }, [categoryById, editing, expenseCategories, form.categoryId]);
  const categoryName = (id: string) => categoryById.get(id)?.name ?? 'Sin categoría';
  const categoryIcon = (id: string) => categoryById.get(id)?.iconKey ?? 'tag';

  const items: BudgetItem[] = budgets.map(b => ({
    id: b.id,
    categoryId: b.categoryId,
    currency: b.currency,
    limitMinor: b.limitMinor,
    spentMinor: b.spentMinor,
    remainingMinor: b.remainingMinor,
    isOverBudget: b.isOverBudget
  }));

  const openCreate = () => {
    setForm(emptyForm(expenseCategories[0]?.id ?? '', defaultCurrency));
    setLimitMinor(null);
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (item: BudgetItem) => {
    const budget = budgets.find(b => b.id === item.id);
    if (!budget) return;
    setForm({
      categoryId: budget.categoryId,
      currency: budget.currency,
      limitMinor: budget.limitMinor
    });
    setLimitMinor(budget.limitMinor);
    setFormError(null);
    setEditing(budget);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!form.categoryId) {
      setFormError('Elegí una categoría.');
      return;
    }
    const limitMinor = form.limitMinor;
    if (limitMinor === null || limitMinor <= 0) {
      setFormError('El límite debe ser mayor a cero.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const response = await api.updateBudget(editing.id, {
          categoryId: form.categoryId,
          currency: form.currency,
          limitMinor,
          version: editing.version
        });
        if (response.error) throw new Error(response.error.message);
      } else {
        const response = await api.upsertBudget({
          id: crypto.randomUUID(),
          categoryId: form.categoryId,
          periodMonth: month,
          currency: form.currency,
          limitMinor
        });
        if (response.error) throw new Error(response.error.message);
      }
      closeModal();
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'No pudimos guardar el presupuesto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await api.deleteBudget(deleteTarget.id, deleteTarget.version);
      if (response.error) throw new Error(response.error.message);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos eliminar el presupuesto.');
      setDeleteTarget(null);
    }
  };

  const modalOpen = creating || editing !== null;

  return (
    <Page>
      <PageHeader
        eyebrow="Límites por categoría"
        title="Presupuestos"
        actions={<Button leftIcon={<Plus size={17} />} onClick={openCreate}>Nuevo presupuesto</Button>}
      />

      <Inline justify="between" className="budgets-toolbar">
        <MonthStepper month={month} onChange={setMonth} />
        <Text variant="caption" tone="stone" className="budgets-count">
          {items.length} {items.length === 1 ? 'presupuesto' : 'presupuestos'}
        </Text>
      </Inline>

      {error && (
        <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>
          {error}
        </Notice>
      )}

      {loading && items.length === 0 && <LoadingSpinner />}

      {!loading && items.length === 0 && !error && (
        <EmptyState
          title="Sin presupuestos este mes"
          message="Definí un límite por categoría para ver cuánto te queda disponible."
          action={{ label: 'Crear el primero', onClick: openCreate }}
        />
      )}

      {items.length > 0 && (
        <Panel tone="paper" radius="panel" padding="none">
          <BudgetList
            items={items}
            categoryName={categoryName}
            categoryIcon={categoryIcon}
            onEdit={openEdit}
            onDelete={item => setDeleteTarget(budgets.find(b => b.id === item.id) ?? null)}
          />
        </Panel>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        description={editing ? undefined : 'El presupuesto se reinicia cada mes calendario.'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="budget-form" loading={saving}>{editing ? 'Guardar' : 'Crear'}</Button>
          </>
        }
      >
        <form id="budget-form" onSubmit={e => { e.preventDefault(); void handleSubmit(); }}>
          <Stack gap="md">
            {formError && <Notice tone="strong">{formError}</Notice>}
            <Select
              label="Categoría"
              value={form.categoryId}
              onChange={v => setForm(f => ({ ...f, categoryId: v }))}
              options={budgetCategoryOptions.map(c => ({
                value: c.id,
                label: c.archivedAt ? `${c.name} (archivada)` : c.kind !== 'expense' ? `${c.name} (tipo anterior)` : c.name
              }))}
              placeholder="Elegí una categoría"
              required
            />
            <Grid columns={2} gap="md">
              <Input
                label="Límite mensual"
                value={limitInput.displayValue}
                onChange={limitInput.onChangeString}
                onBlur={limitInput.onBlur}
                onFocus={limitInput.onFocus}
                placeholder="0,00"
                prefix="$"
                required
                inputMode="decimal"
                pattern="[0-9.,]*"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <Select
                label="Moneda"
                value={form.currency}
                onChange={v => setForm(f => ({ ...f, currency: v as CurrencyCode }))}
                options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
              />
            </Grid>
            <Text variant="caption" tone="stone" className="budgets-count">Período: {month}</Text>
          </Stack>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar presupuesto"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void handleDelete()}>Eliminar</Button>
          </>
        }
      >
        <p className="budgets-confirm">El presupuesto se elimina de este mes. Los movimientos no se modifican.</p>
      </Modal>
    </Page>
  );
}