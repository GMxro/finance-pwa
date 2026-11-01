import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Filter, WifiOff, CloudOff } from 'lucide-react';
import { useAuth } from '../../app/providers';
import { api } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { AccountWithBalances } from '@contracts/account';
import { type CurrencyCode } from '@domain/money';
import { isValidMonth, todayLocalISO } from '@domain/date';
import { mergeWithCache, cacheServerRows, readCached, savePendingCreate } from '@local-data/transaction-store';
import { Page, PageHeader, Grid, Stack, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { SegmentedControl } from '@shared/ui/SegmentedControl';
import { Modal } from '@shared/ui/Modal';
import { MonthStepper } from '@shared/ui/MonthStepper';
import { Notice } from '@shared/ui/Notice';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { LedgerList, type LedgerItem } from '@shared/ui/LedgerList';
import { Text } from '@shared/ui/Text';
import { CATEGORY_ICON_OPTIONS } from '@shared/ui/category-options';
import { useCurrencyInput } from '@shared/hooks/useCurrencyInput';
import { slugify } from '@shared/format/slug';
import '../../app/styles/transactions.css';

type TransactionKind = 'income' | 'expense';

interface TxFormData {
  amountMinor: number | null; // valor en centavos (minor units)
  currency: CurrencyCode;
  categoryId: string;
  occurredOn: string;
  note: string;
  kind: TransactionKind;
  accountId: string;
}

const emptyForm = (kind: TransactionKind, currency: CurrencyCode): TxFormData => ({
  amountMinor: null,
  currency,
  categoryId: '',
  occurredOn: todayLocalISO(),
  note: '',
  kind,
  accountId: ''
});

export function TransactionsPage() {
  const { user, syncNow, defaultCurrency } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const period = searchParams.get('period');
    return period && isValidMonth(period) ? period : todayLocalISO().slice(0, 7);
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState(() => {
    const urlCurrency = searchParams.get('currency');
    return {
      currency: urlCurrency === 'ARS' || urlCurrency === 'USD' ? urlCurrency : '',
      kind: ['income', 'expense'].includes(searchParams.get('kind') ?? '') ? searchParams.get('kind')! : '',
      categoryId: searchParams.get('categoryId') ?? ''
    };
  });
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(() => Boolean(searchParams.get('kind') || searchParams.get('categoryId') || searchParams.get('currency')));
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [formData, setFormData] = useState<TxFormData>(() => emptyForm('expense', defaultCurrency));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('tag');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  // Hook para input de moneda con formateo ARS en vivo
  const amountInput = useCurrencyInput({
    currency: formData.currency,
    initialValue: formData.amountMinor,
    allowEmpty: true,
    onChange: (valueMinor) => {
      setFormData(f => ({ ...f, amountMinor: valueMinor }));
    }
  });
  const setAmountMinor = amountInput.setValueMinor;

  const loadData = useCallback(async (append = false, nextPage = page) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.listTransactions({
        page: nextPage,
        limit: 50,
        period: month,
        currency: filters.currency ? (filters.currency as CurrencyCode) : undefined,
        kind: filters.kind ? (filters.kind as TransactionKind) : undefined,
        categoryId: filters.categoryId || undefined
      });

      if (response.error) throw response.error;

      const serverRows = response.data || [];
      await cacheServerRows(user.id, serverRows);
      const merged = await mergeWithCache(user.id, serverRows);
      const forMonth = merged.filter((tx: any) => tx.occurredOn?.startsWith(month));

      setTransactions(prev => {
        if (!append) return forMonth;
        const seen = new Set(prev.map(tx => tx.id));
        const added = forMonth.filter(tx => {
          if (seen.has(tx.id)) return false;
          seen.add(tx.id);
          return true;
        });
        return [...prev, ...added];
      });
      setHasMore(serverRows.length === 50);
      setOffline(false);
    } catch (e: any) {
      const cached = user ? await readCached(user.id) : [];
      const cachedForMonth = cached.filter((tx: any) =>
        tx.occurredOn?.startsWith(month) &&
        (!filters.currency || tx.currency === filters.currency) &&
        (!filters.kind || tx.kind === filters.kind) &&
        (!filters.categoryId || tx.categoryId === filters.categoryId)
      );
      const offlineFailure = e?.code === 'NETWORK_ERROR' || e?.code === 'OFFLINE' || (!e?.code && !navigator.onLine);
      if (offlineFailure) {
        setTransactions(cachedForMonth);
        setPage(1);
        setHasMore(false);
        setOffline(true);
        setError(cachedForMonth.length > 0
          ? 'Sin conexión. Se muestran movimientos guardados en este dispositivo; pueden estar desactualizados.'
          : 'Sin conexión y no hay movimientos guardados para estos filtros.');
      } else {
        setOffline(false);
        setHasMore(false);
        if (!append) setTransactions([]);
        setError(e?.message ?? 'No pudimos cargar los movimientos.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters, month, page, user]);

  const loadCategories = useCallback(async () => {
    const response = await api.listCategories(true);
    if (!response.error) setCategories(response.data || []);
  }, []);

  const loadAccounts = useCallback(async () => {
    const response = await api.listAccounts();
    if (!response.error) setAccounts(response.data || []);
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    setPage(1);
    void loadData(false, 1);
  }, [filters, month, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page > 1) void loadData(true, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  useEffect(() => {
    const handleOnline = async () => {
      setOffline(false);
      try {
        await syncNow();
      } catch {
        setError('No se pudo sincronizar. Los cambios pendientes siguen guardados en este dispositivo.');
        return;
      }
      await loadData(false, 1);
    };
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, loadData]);

  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);
  const categoryName = (id: string) => categoriesById.get(id)?.name ?? 'Sin categoría';
  const categoryIcon = (id: string) => categoriesById.get(id)?.iconKey ?? 'tag';

  const resetNewCategory = () => {
    setNewCategoryOpen(false);
    setNewCategoryName('');
    setNewCategoryError(null);
  };

  const closeModal = () => {
    setEditingTx(null);
    resetNewCategory();
  };

  const openCreate = (kind: TransactionKind = 'expense') => {
    const firstCategory = categories.find(c => c.kind === kind && !c.archivedAt);
    const defaultAccount = accounts.find(a => a.isDefault) ?? accounts[0];
    const newForm = { ...emptyForm(kind, defaultCurrency), categoryId: firstCategory?.id ?? '', accountId: defaultAccount?.id ?? '' };
    setFormData(newForm);
    setAmountMinor(null);
    setFormError(null);
    resetNewCategory();
    setEditingTx({ kind });
  };

  const startEdit = useCallback((item: LedgerItem) => {
    const tx = transactions.find(t => t.id === item.id);
    if (!tx) return;
    setFormData({
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      categoryId: tx.categoryId,
      occurredOn: tx.occurredOn,
      note: tx.note || '',
      kind: tx.kind,
      accountId: tx.accountId ?? ''
    });
    setAmountMinor(tx.amountMinor);
    setFormError(null);
    resetNewCategory();
    setEditingTx(tx);
  }, [transactions, setAmountMinor]);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setNewCategoryError('Poné un nombre.');
      return;
    }
    const slug = slugify(name);
    if (!slug) {
      setNewCategoryError('Ese nombre no genera un identificador válido. Probá con otro.');
      return;
    }

    setSavingCategory(true);
    setNewCategoryError(null);
    const kind = formData.kind;
    try {
      const response = await api.createCategory({
        id: crypto.randomUUID(),
        kind,
        name,
        slug,
        iconKey: newCategoryIcon,
        colorToken: kind === 'income' ? 'income-primary' : 'expense-other',
        sortOrder: 0
      });
      if (response.error) throw new Error(response.error.message);
      const created = response.data;
      if (created) {
        setCategories(prev => [...prev, created]);
        setFormData(f => (f.kind === kind ? { ...f, categoryId: created.id } : f));
      }
      resetNewCategory();
    } catch (e: any) {
      setNewCategoryError(
        e?.message === 'Slug ya existe'
          ? 'Ya existe una categoría con ese nombre. Probá con otro.'
          : e?.message ?? 'No pudimos crear la categoría.'
      );
    } finally {
      setSavingCategory(false);
    }
  };

  useEffect(() => {
    if (editingTx && !editingTx.id && !formData.categoryId && categories.length > 0) {
      const first = categories.find(c => c.kind === formData.kind && !c.archivedAt);
      if (first) setFormData(f => ({ ...f, categoryId: first.id }));
    }
  }, [categories, editingTx, formData.categoryId, formData.kind]);

  // El importe se sincroniza explícitamente al abrir el modal (openCreate/startEdit)
  // y al tipear (onChange del hook). No re-formatear aquí para no pisar el cursor.
  useEffect(() => {
    const mode = searchParams.get('new');
    if (mode === 'expense' || mode === 'income') {
      const newForm = {
        ...emptyForm(mode, defaultCurrency),
        categoryId: categories.find(c => c.kind === mode && !c.archivedAt)?.id ?? ''
      };
      setFormData(newForm);
      setAmountMinor(null);
      setEditingTx({ kind: mode });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('new');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, categories, setAmountMinor, defaultCurrency]);

  useEffect(() => {
    const transactionId = searchParams.get('edit');
    if (!transactionId || loading || editingTx?.id === transactionId) return;
    const transaction = transactions.find(tx => tx.id === transactionId);
    if (!transaction) return;
    startEdit({
      id: transaction.id,
      kind: transaction.kind,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      occurredOn: transaction.occurredOn,
      note: transaction.note,
      categoryId: transaction.categoryId,
      accountName: transaction.accountId ? accountsById.get(transaction.accountId) : undefined
    });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, transactions, loading, accountsById, setSearchParams, startEdit, editingTx]);

  const validate = () => {
    if (formData.amountMinor === null || formData.amountMinor === undefined || formData.amountMinor <= 0) {
      return 'El importe debe ser mayor a cero.';
    }
    if (!formData.categoryId) return 'Elegí una categoría.';
    if (!formData.occurredOn) return 'Elegí una fecha.';
    if (accounts.length > 0 && !formData.accountId) return 'Elegí una cuenta.';
    return null;
  };

  const handleSubmit = async () => {
    if (!user || !editingTx) return;
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const amountMinor = formData.amountMinor!;
    setSaving(true);
    setFormError(null);

    try {
      if (editingTx.id) {
        const response = await api.updateTransaction(editingTx.id, {
          kind: formData.kind,
          amountMinor,
          currency: formData.currency,
          categoryId: formData.categoryId,
          accountId: formData.accountId || undefined,
          occurredOn: formData.occurredOn,
          note: formData.note || undefined,
          version: editingTx.version
        });
        if (response.error) throw new Error(response.error.message);
      } else {
        const payload = {
          id: crypto.randomUUID(),
          kind: formData.kind,
          amountMinor,
          currency: formData.currency,
          categoryId: formData.categoryId,
          accountId: formData.accountId,
          occurredOn: formData.occurredOn,
          note: formData.note || undefined
        };
        const response = await api.createTransaction(payload);
        if (response.error?.code === 'NETWORK_ERROR' || (!navigator.onLine && response.error)) {
          await savePendingCreate({ ...payload, userId: user.id });
          setLocalNotice('Guardado en este dispositivo. Se sincroniza al recuperar conexión.');
          setOffline(true);
          closeModal();
          setFormData(emptyForm('expense', defaultCurrency));
          await loadData(false, 1);
          return;
        }
        if (response.error) throw new Error(response.error.message);
      }

      closeModal();
      setFormData(emptyForm('expense', defaultCurrency));
      await loadData(false, 1);
    } catch (e: any) {
      setFormError(e?.message ?? 'No pudimos guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await api.deleteTransaction(deleteTarget.id, deleteTarget.version);
      if (response.error) throw new Error(response.error.message);
      setDeleteTarget(null);
      await loadData(false, 1);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos eliminar el movimiento.');
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const items: LedgerItem[] = transactions.map(tx => ({
    id: tx.id,
    kind: tx.kind,
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    occurredOn: tx.occurredOn,
    note: tx.note,
    categoryId: tx.categoryId,
    accountName: tx.accountId ? accountsById.get(tx.accountId) : undefined,
    pending: tx.synced === false
  }));
  const visibleItems = search.trim()
    ? items.filter(item => `${item.note ?? ''} ${categoryName(item.categoryId)} ${item.accountName ?? ''}`.toLocaleLowerCase('es-AR').includes(search.trim().toLocaleLowerCase('es-AR')))
    : items;

  const categoryOptions = categories
    .filter(c => c.kind === formData.kind && (!c.archivedAt || c.id === formData.categoryId))
    .map(c => ({ value: c.id, label: c.archivedAt ? `${c.name} (archivada)` : c.name }));
  const emptyMessage = search
    ? hasMore ? 'No hay coincidencias entre los movimientos cargados. Cargá más para ampliar la búsqueda.' : 'Probá con otra descripción, categoría o cuenta.'
    : month === todayLocalISO().slice(0, 7)
      ? 'Todavía no registraste movimientos este mes.'
      : 'No hay movimientos en este período con los filtros elegidos.';

  return (
    <Page>
      <PageHeader
        eyebrow="Ingresos y gastos"
        title="Movimientos"
        actions={<Button leftIcon={<Plus size={17} />} onClick={() => openCreate('expense')}>Nuevo movimiento</Button>}
      />

      <Inline justify="between" gap="md" className="tx-toolbar">
        <MonthStepper month={month} onChange={setMonth} />
        <Button
          variant="secondary"
          leftIcon={<Filter size={16} />}
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
        >
          Filtros
        </Button>
      </Inline>

      <Input
        className="tx-search"
        label="Buscar movimientos"
        type="search"
        value={search}
        onChange={setSearch}
        placeholder="Descripción, categoría o cuenta"
      />

      <Stack gap="md" className="tx-notices">
        {offline && (
          <Notice>
            <Inline gap="sm"><WifiOff size={16} /> Sin conexión. Podés seguir registrando movimientos.</Inline>
          </Notice>
        )}
        {localNotice && (
          <Notice onDismiss={() => setLocalNotice(null)}>
            <Inline gap="sm"><CloudOff size={16} /> {localNotice}</Inline>
          </Notice>
        )}
        {error && (
          <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void loadData(false, 1) }}>
            {error}
          </Notice>
        )}
      </Stack>

      {showFilters && (
        <Panel tone="paper" padding="md" className="tx-filters">
          <Grid columns={3} gap="md">
            <Select
              label="Moneda"
              value={filters.currency}
              onChange={v => setFilters(f => ({ ...f, currency: v }))}
              options={[{ value: '', label: 'Todas' }, { value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
            />
            <Select
              label="Tipo"
              value={filters.kind}
              onChange={v => setFilters(f => ({ ...f, kind: v }))}
              options={[{ value: '', label: 'Todos' }, { value: 'income', label: 'Ingresos' }, { value: 'expense', label: 'Gastos' }]}
            />
            <Select
              label="Categoría"
              value={filters.categoryId}
              onChange={v => setFilters(f => ({ ...f, categoryId: v }))}
              options={[{ value: '', label: 'Todas' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
            />
          </Grid>
        </Panel>
      )}

      {loading && transactions.length === 0 && <LoadingSpinner />}

      {!loading && visibleItems.length === 0 && !error && (
        <EmptyState
          title={search ? 'Sin coincidencias' : 'Sin movimientos'}
          message={emptyMessage}
        />
      )}

      {visibleItems.length > 0 && (
        <Panel tone="paper" radius="panel" padding="none">
          <LedgerList
            items={visibleItems}
            categoryName={categoryName}
            categoryIcon={categoryIcon}
            onEdit={startEdit}
            onDelete={item => setDeleteTarget(transactions.find(t => t.id === item.id))}
          />
        </Panel>
      )}

      {hasMore && (
        <div className="tx-more">
          <Button variant="secondary" onClick={() => setPage(p => p + 1)} loading={loading}>
            Cargar más
          </Button>
        </div>
      )}

       <Modal
         open={editingTx !== null}
         onClose={closeModal}
         busy={saving}
         title={editingTx?.id ? 'Editar movimiento' : 'Nuevo movimiento'}
         description="Los importes se guardan en la moneda del movimiento."
         autoFocusFirstEmpty
        footer={
          <>
            {editingTx?.id && (
              <Button
                variant="ghost"
                className="tx-modal-delete"
                onClick={() => {
                  setDeleteTarget(editingTx);
                  closeModal();
                }}
              >
                Eliminar
              </Button>
            )}
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="tx-form" loading={saving}>{editingTx?.id ? 'Guardar' : 'Crear'}</Button>
          </>
        }
      >
        <form id="tx-form" onSubmit={e => { e.preventDefault(); void handleSubmit(); }}>
          <Stack gap="md">
            {formError && <Notice tone="strong">{formError}</Notice>}
            
            {/* 1. Tipo - SegmentedControl */}
            <SegmentedControl
              label="Tipo"
              value={formData.kind}
              onChange={v => {
                const kind = v as TransactionKind;
                const first = categories.find(c => c.kind === kind);
                resetNewCategory();
                setFormData(f => ({ ...f, kind, categoryId: first?.id ?? '' }));
              }}
              options={[{ value: 'income', label: 'Ingreso' }, { value: 'expense', label: 'Gasto' }]}
            />
            
            {/* 2. Importe + Moneda inline */}
            <div className="tx-amount-row">
              <div>
                <Input
                  label="Importe"
                  value={amountInput.displayValue}
                  onChange={amountInput.onChangeString}
                  onBlur={amountInput.onBlur}
                  onFocus={amountInput.onFocus}
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
              </div>
              <SegmentedControl
                label="Moneda"
                value={formData.currency}
                onChange={v => {
                  const newCurrency = v as CurrencyCode;
                  setFormData(f => ({ ...f, currency: newCurrency }));
                }}
                options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
                className="tx-currency-segment"
              />
            </div>
            
            {/* 3. Categoría */}
            <Select
              label="Categoría"
              value={formData.categoryId}
              onChange={v => {
                if (v === '__new__') {
                  setNewCategoryOpen(true);
                  setNewCategoryName('');
                  setNewCategoryIcon(formData.kind === 'income' ? 'briefcase' : 'tag');
                  setNewCategoryError(null);
                  return;
                }
                setFormData(f => ({ ...f, categoryId: v }));
              }}
              options={[...categoryOptions, { value: '__new__', label: '+ Nueva categoría' }]}
              placeholder="Elegí una categoría"
              required
            />
            
            {/* 4. Cuenta - SegmentedControl si ≤3, si no Select */}
            {accounts.length > 0 && accounts.length <= 3 ? (
              <SegmentedControl
                label="Cuenta"
                value={formData.accountId}
                onChange={v => setFormData(f => ({ ...f, accountId: v }))}
                options={accounts.map(a => ({ value: a.id, label: a.name }))}
              />
            ) : accounts.length > 3 ? (
              <Select
                label="Cuenta"
                value={formData.accountId}
                onChange={v => setFormData(f => ({ ...f, accountId: v }))}
                options={accounts.map(a => ({ value: a.id, label: a.name }))}
                placeholder="Elegí una cuenta"
                required
              />
            ) : null}
            
            {/* 5. Fecha + 6. Nota */}
            <Grid columns={2} gap="md">
              <Input
                label="Fecha"
                type="date"
                value={formData.occurredOn}
                onChange={v => setFormData(f => ({ ...f, occurredOn: v }))}
                required
              />
              <Input
                label="Nota (opcional)"
                value={formData.note}
                onChange={v => setFormData(f => ({ ...f, note: v }))}
                placeholder="Descripción"
                maxLength={500}
              />
            </Grid>
            
            {newCategoryOpen && (
              <div className="tx-new-category">
                <Text variant="small">
                  Nueva categoría de {formData.kind === 'income' ? 'ingreso' : 'gasto'}
                </Text>
                <Input
                  label="Nombre"
                  value={newCategoryName}
                  onChange={setNewCategoryName}
                  placeholder="Ej.: Supermercado"
                  maxLength={50}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleCreateCategory();
                    }
                  }}
                />
                <Select
                  label="Ícono"
                  value={newCategoryIcon}
                  onChange={setNewCategoryIcon}
                  options={CATEGORY_ICON_OPTIONS}
                />
                {newCategoryError && <Notice tone="strong">{newCategoryError}</Notice>}
                <div className="tx-new-category__actions">
                  <Button variant="ghost" size="sm" onClick={resetNewCategory} disabled={savingCategory}>
                    Descartar
                  </Button>
                  <Button size="sm" loading={savingCategory} onClick={() => void handleCreateCategory()}>
                    Crear categoría
                  </Button>
                </div>
              </div>
            )}
          </Stack>
        </form>
      </Modal>

       <Modal
         open={deleteTarget !== null}
         onClose={() => setDeleteTarget(null)}
         busy={saving}
         title="Eliminar movimiento"
         size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={saving} disabled={saving}>Eliminar</Button>
          </>
        }
      >
        <p className="tx-confirm">
          ¿Seguro que querés eliminar este movimiento? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </Page>
  );
}
