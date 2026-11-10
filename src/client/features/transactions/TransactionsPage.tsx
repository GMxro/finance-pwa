import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Filter, WifiOff, CloudOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../../app/providers';
import { api } from '@shared/api/client';
import type { CategoryResponse } from '@contracts/category';
import type { AccountWithBalances } from '@contracts/account';
import type { CurrencyCode } from '@domain/money';
import type { RecurringFrequency } from '@domain/recurring';
import { isValidMonth, todayLocalISO } from '@domain/date';
import { mergeWithCache, cacheServerRows, readCached, savePendingCreate } from '@local-data/transaction-store';
import { Page, PageHeader, Grid, Stack, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { SegmentedControl, SegmentedOption } from '@shared/ui/SegmentedControl';
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
import { FREQUENCY_LABELS } from '@shared/format/frequency';
import { focusFirstInvalid, hasFieldErrors, type FieldErrors } from '@shared/form/validation';
import '../../app/styles/transactions.css';

type TransactionKind = 'income' | 'expense';
type EntryMode = 'manual' | 'installment' | 'recurring';

const RECURRING_FREQUENCY_OPTIONS: SegmentedOption[] = (Object.keys(FREQUENCY_LABELS) as RecurringFrequency[])
  .filter(frequency => frequency !== 'never')
  .map(frequency => ({ value: frequency, label: FREQUENCY_LABELS[frequency] }));

const VALID_RECURRING_FREQUENCIES = new Set(RECURRING_FREQUENCY_OPTIONS.map(option => option.value));

const REPETITION_OPTIONS: SegmentedOption[] = [
  { value: 'manual', label: 'Único' },
  { value: 'installment', label: 'Cuotas' },
  { value: 'recurring', label: 'Recurrente' }
];

const WEEKDAY_OPTIONS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((label, index) => ({
  label,
  bit: 1 << index
}));

interface TxFormData {
  amountMinor: number | null;
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [accountsReady, setAccountsReady] = useState(false);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('tag');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  const lastAccountByKind = useRef<Record<TransactionKind, string>>({ income: '', expense: '' });
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [repeatMenuOpen, setRepeatMenuOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [installmentsCount, setInstallmentsCount] = useState('2');
  const [firstDueOn, setFirstDueOn] = useState(todayLocalISO());
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [recurringDaysOfWeek, setRecurringDaysOfWeek] = useState<number>(1 << new Date().getDay());
  const [recurringEndOn, setRecurringEndOn] = useState('');

  const clearFieldError = (field: string) => {
    setFieldErrors(previous => (previous[field] ? { ...previous, [field]: undefined } : previous));
  };

  const resetRecurrenceFields = useCallback(() => {
    setInstallmentsCount('2');
    setFirstDueOn(todayLocalISO());
    setRecurringFrequency('monthly');
    setRecurringDaysOfWeek(1 << new Date().getDay());
    setRecurringEndOn('');
  }, []);

  // Hook para input de moneda con formateo ARS en vivo
  const amountInput = useCurrencyInput({
    currency: formData.currency,
    initialValue: formData.amountMinor,
    allowEmpty: true,
    onChange: (valueMinor) => {
      setFormData(f => ({ ...f, amountMinor: valueMinor }));
      if (valueMinor !== null && valueMinor > 0) clearFieldError('amount');
    }
  });
  const setAmountMinor = amountInput.setValueMinor;

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }, []);

  const changeEntryMode = (value: string) => {
    const mode = value as EntryMode;
    if (mode === entryMode) return;
    setEntryMode(mode);
    resetRecurrenceFields();
    setFieldErrors(previous => ({
      ...previous,
      installmentsCount: undefined,
      firstDueOn: undefined,
      recurringFrequency: undefined,
      recurringEndOn: undefined
    }));
  };

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
    setCategoriesReady(true);
  }, []);

  const loadAccounts = useCallback(async () => {
    const response = await api.listAccounts();
    if (!response.error) setAccounts(response.data || []);
    setAccountsReady(true);
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    setPage(1);
    void loadData(false, 1);
  }, [filters, month, user]);

  useEffect(() => {
    if (page > 1) void loadData(true, page);
  }, [page]);

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

  const resetNewCategory = useCallback(() => {
    setNewCategoryOpen(false);
    setNewCategoryName('');
    setNewCategoryError(null);
  }, []);

  const closeModal = useCallback(() => {
    if (deleteTarget) return;
    setEditingTx(null);
    setFieldErrors({});
    resetNewCategory();
  }, [resetNewCategory, deleteTarget]);

  const openCreate = (kind: TransactionKind = 'expense') => {
    const firstCategory = categories.find(c => c.kind === kind && !c.archivedAt);
    const remembered = lastAccountByKind.current[kind];
    const defaultAccount = accounts.find(a => a.isDefault) ?? accounts[0];
    const accountId = remembered || defaultAccount?.id || '';
    const newForm = { ...emptyForm(kind, defaultCurrency), categoryId: firstCategory?.id ?? '', accountId };
    setFormData(newForm);
    setAmountMinor(null);
    setFormError(null);
    setFieldErrors({});
    setEntryMode('manual');
    setDescription('');
    setNotes('');
    setShowNotes(false);
    resetRecurrenceFields();
    resetNewCategory();
    setEditingTx({ kind });
  };

  const startEdit = useCallback((item: LedgerItem) => {
    const tx = transactions.find(t => t.id === item.id);
    if (!tx) return;
    lastAccountByKind.current[tx.kind as TransactionKind] = tx.accountId ?? '';
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
    setDescription(tx.note ?? '');
    setNotes('');
    setShowNotes(false);
    setEntryMode('manual');
    setFormError(null);
    setFieldErrors({});
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
        clearFieldError('categoryId');
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

  useEffect(() => {
    const mode = searchParams.get('new');
    if (mode !== 'expense' && mode !== 'income') return;
    // Esperamos a que cuentas y categorías estén disponibles para preseleccionar
    // antes de limpiar el parámetro. Si falló la carga, seguimos igual para no
    // bloquear el deep link.
    if (!accountsReady || !categoriesReady) return;

    const kind = mode as TransactionKind;
    const remembered = lastAccountByKind.current[kind];
    const defaultAccount = accounts.find(a => a.isDefault) ?? accounts[0];
    const accountId = remembered || defaultAccount?.id || '';
    const firstCategory = categories.find(c => c.kind === kind && !c.archivedAt);

    setFormData({
      ...emptyForm(kind, defaultCurrency),
      categoryId: firstCategory?.id ?? '',
      accountId
    });
    setAmountMinor(null);
    setFormError(null);
    setFieldErrors({});
    setEntryMode('manual');
    setDescription('');
    setNotes('');
    setShowNotes(false);
    resetRecurrenceFields();
    resetNewCategory();
    setEditingTx({ kind });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('new');
    setSearchParams(nextParams, { replace: true });
  }, [
    searchParams,
    setSearchParams,
    accounts,
    accountsReady,
    categories,
    categoriesReady,
    setAmountMinor,
    defaultCurrency,
    resetNewCategory,
    resetRecurrenceFields
  ]);

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

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (formData.amountMinor === null || formData.amountMinor === undefined || formData.amountMinor <= 0) {
      errors.amount = 'Ingresá un importe mayor a cero.';
    }
    if (!formData.accountId) errors.accountId = 'Elegí una cuenta.';
    if (!formData.categoryId) errors.categoryId = 'Elegí una categoría.';
    if (!formData.occurredOn) errors.occurredOn = 'Elegí una fecha.';

    if (entryMode === 'installment') {
      const count = Number(installmentsCount);
      if (!Number.isInteger(count) || count < 2 || count > 999) {
        errors.installmentsCount = 'Ingresá una cantidad entre 2 y 999.';
      }
      if (!firstDueOn) errors.firstDueOn = 'Elegí el primer vencimiento.';
    }

    if (entryMode === 'recurring') {
      if (!VALID_RECURRING_FREQUENCIES.has(recurringFrequency)) {
        errors.recurringFrequency = 'Elegí una frecuencia válida.';
      } else if (recurringFrequency === 'weekly_days' && recurringDaysOfWeek === 0) {
        errors.recurringFrequency = 'Elegí al menos un día de repetición.';
      }
      if (recurringEndOn && recurringEndOn < todayLocalISO()) {
        errors.recurringEndOn = 'La fecha de fin no puede ser anterior a hoy.';
      }
    }

    return errors;
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!user || !editingTx) { setFormError("No se pudo identificar la cuenta o el movimiento."); return; }
    const errors = validate();
    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      focusFirstInvalid('tx-form');
      return;
    }
    setFieldErrors({});
    const amountMinor = formData.amountMinor!;
    setSaving(true);
    setFormError(null);

    try {
      if (editingTx.id) {
        if (editingTx.sourceType === 'installment' && (editingTx.occurredOn ?? '') > todayLocalISO()) {
          const response = await api.updateInstallmentItem(editingTx.sourceId ?? editingTx.id, {
            amountMinor,
            occurredOn: formData.occurredOn,
            note: [description, notes ? `Notas: ${notes}` : ''].filter(Boolean).join('\n') || null,
            version: editingTx.version
          });
          if (response.error) throw new Error(response.error.message);
        } else {
          const response = await api.updateTransaction(editingTx.id, {
            kind: formData.kind,
            amountMinor,
            currency: formData.currency,
            categoryId: formData.categoryId,
            accountId: formData.accountId || undefined,
            occurredOn: formData.occurredOn,
            note: [description, notes ? `Notas: ${notes}` : ''].filter(Boolean).join('\n') || undefined,
            version: editingTx.version
          });
          if (response.error) throw new Error(response.error.message);
        }
      } else if (entryMode === 'installment') {
        const response = await api.createInstallmentPlan({
          concept: description || 'Compra en cuotas',
          totalMinor: amountMinor,
          currency: formData.currency,
          installmentsCount: Number(installmentsCount) || 2,
          categoryId: formData.categoryId,
          accountId: formData.accountId || undefined,
          firstDueOn: firstDueOn
        });
        if (response.error) throw new Error(response.error.message);
      } else if (entryMode === 'recurring') {
        const response = await api.createRecurringRule({
          kind: formData.kind,
          concept: description || 'Movimiento recurrente',
          amountMinor,
          currency: formData.currency,
          categoryId: formData.categoryId,
          accountId: formData.accountId || undefined,
          frequency: recurringFrequency,
          daysOfWeek: recurringFrequency === 'weekly_days' ? recurringDaysOfWeek : recurringFrequency === 'weekend' ? 65 : undefined,
          startOn: formData.occurredOn,
          endOn: recurringEndOn || null
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
          note: [description, notes ? `Notas: ${notes}` : ''].filter(Boolean).join('\n') || undefined
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
       setEditingTx(null);
       resetNewCategory();
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
    sourceType: tx.sourceType,
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

  const kindOptions: SegmentedOption[] = [
    { value: 'income', label: 'Ingreso' },
    { value: 'expense', label: 'Gasto' }
  ];

  const currencyOptions: SegmentedOption[] = [
    { value: 'ARS', label: 'ARS' },
    { value: 'USD', label: 'USD' }
  ];

  const accountOptions = accounts.filter(a => !a.archivedAt).map(a => ({ value: a.id, label: a.name }));

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
        <Panel tone="paper" radius="panel" padding="md" className="tx-filters">
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
          autoFocusFirstEmpty
          footer={
            <>
              {editingTx?.id && (
                <Button
                  variant="ghost"
                  className="tx-modal-delete"
                  onClick={() => {
                    setDeleteTarget(editingTx);
                  }}
                >
                  Eliminar
                </Button>
              )}
              <Button type="submit" form="tx-form" loading={saving} onClick={() => void handleSubmit()} className="tx-compact-submit">{editingTx?.id ? "Guardar" : "Crear"}</Button>
            </>
          }
       >
         <form id="tx-form" onSubmit={e => { e.preventDefault(); void handleSubmit(); }} className={`tx-compact-form tx-compact-form--${formData.kind}`}>
           {formError && <Notice tone="strong">{formError}</Notice>}

           <div className="tx-compact-type">
             <SegmentedControl
               value={formData.kind}
               onChange={v => {
                 const kind = v as TransactionKind;
                 lastAccountByKind.current[formData.kind] = formData.accountId;
                 const first = categories.find(c => c.kind === kind && !c.archivedAt) ?? categories.find(c => c.kind === kind);
                 const remembered = lastAccountByKind.current[kind];
                 const defaultAccount = accounts.find(a => a.isDefault) ?? accounts[0];
                 const accountId = remembered || defaultAccount?.id || '';
                 resetNewCategory();
                 setFormData(f => ({ ...f, kind, categoryId: first?.id ?? '', accountId }));
                 if (accountId) clearFieldError('accountId');
                 if (first?.id) clearFieldError('categoryId');
               }}
               options={kindOptions}
             />
           </div>

           <div className="tx-compact-amount-row">
             <input
               type="text"
               inputMode="decimal"
               value={amountInput.displayValue}
               onChange={e => amountInput.onChangeString(e.target.value)}
               onBlur={amountInput.onBlur}
               onFocus={amountInput.onFocus}
               placeholder="0,00"
               data-autofocus
               pattern="[0-9.,]*"
               autoComplete="off"
               autoCorrect="off"
               autoCapitalize="off"
               spellCheck={false}
               className="tx-compact-amount-input"
             />
             <button
               type="button"
               className="tx-compact-currency-chip"
               onClick={() => {
                 const newCurrency = formData.currency === 'ARS' ? 'USD' : 'ARS';
                 setFormData(f => ({ ...f, currency: newCurrency }));
               }}
             >
               {formData.currency}
             </button>
           </div>
           {fieldErrors.amount && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.amount}</p>}

           <div className="tx-compact-row">
             <span className="tx-compact-label">Fecha</span>
             <div className="tx-compact-value">
               <button
                 type="button"
                 className="tx-compact-date-btn"
                 onClick={openDatePicker}
               >
                 {(() => {
                   if (!formData.occurredOn) return '';
                   const [y, m, d] = formData.occurredOn.split('-');
                   if (!y || !m || !d) return formData.occurredOn;
                   return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
                 })()}
               </button>
               <input
                 ref={dateInputRef}
                 className="tx-date-native"
                 type="date"
                 tabIndex={-1}
                 value={formData.occurredOn}
                 onChange={(event) => {
                   setFormData(f => ({ ...f, occurredOn: event.target.value }));
                   if (event.target.value) clearFieldError('occurredOn');
                 }}
               />
               <div className="tx-compact-chips">
                 <button
                   type="button"
                   className={`tx-compact-chip ${formData.occurredOn === todayLocalISO() ? 'is-active' : ''}`}
                   onClick={() => {
                     setFormData(f => ({ ...f, occurredOn: todayLocalISO() }));
                     clearFieldError('occurredOn');
                   }}
                 >
                   Hoy
                 </button>
                 <button
                   type="button"
                   className={`tx-compact-chip ${(() => { const d = new Date(`${todayLocalISO()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() - 1); return formData.occurredOn === d.toISOString().slice(0, 10); })() ? 'is-active' : ''}`}
                   onClick={() => {
                     const d = new Date(`${todayLocalISO()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() - 1);
                     setFormData(f => ({ ...f, occurredOn: d.toISOString().slice(0, 10) }));
                     clearFieldError('occurredOn');
                   }}
                 >
                   Ayer
                 </button>
               </div>
               <button
                 type="button"
                 className="tx-compact-repeat-icon"
                 onClick={() => setRepeatMenuOpen(v => !v)}
                 aria-label="Repetición"
               >
                 <RefreshCw size={16} />
               </button>
             </div>
           </div>
           {fieldErrors.occurredOn && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.occurredOn}</p>}

           {repeatMenuOpen && (
             <div className="tx-compact-repeat-menu">
               {REPETITION_OPTIONS.map(opt => (
                 <button
                   key={opt.value}
                   type="button"
                   className={`tx-compact-repeat-option ${entryMode === opt.value ? 'is-active' : ''}`}
                   onClick={() => {
                     changeEntryMode(opt.value);
                     setRepeatMenuOpen(false);
                   }}
                 >
                   {opt.label}
                 </button>
               ))}
             </div>
           )}

           {entryMode === 'installment' && (
             <>
               <div className="tx-compact-row">
                 <span className="tx-compact-label">Cuotas</span>
                 <div className="tx-compact-value">
                   <input
                     type="number"
                     value={installmentsCount}
                     onChange={e => {
                       setInstallmentsCount(e.target.value);
                       const count = Number(e.target.value);
                       if (Number.isInteger(count) && count >= 2 && count <= 999) clearFieldError('installmentsCount');
                     }}
                     onBlur={() => {
                       const n = Number(installmentsCount);
                       if (isNaN(n) || n < 2) {
                         setInstallmentsCount('2');
                         clearFieldError('installmentsCount');
                       } else if (n > 999) {
                         setInstallmentsCount('999');
                         clearFieldError('installmentsCount');
                       }
                     }}
                     min={2}
                     max={999}
                     className="tx-compact-value-input"
                   />
                 </div>
               </div>
               {fieldErrors.installmentsCount && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.installmentsCount}</p>}
               <div className="tx-compact-row">
                 <span className="tx-compact-label">Primer venc.</span>
                 <div className="tx-compact-value">
                   <input
                     type="date"
                     value={firstDueOn}
                     onChange={e => {
                       setFirstDueOn(e.target.value);
                       if (e.target.value) clearFieldError('firstDueOn');
                     }}
                     className="tx-compact-value-input"
                   />
                 </div>
               </div>
               {fieldErrors.firstDueOn && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.firstDueOn}</p>}
             </>
           )}

           {entryMode === 'recurring' && (
             <>
               <div className="tx-compact-row">
                 <span className="tx-compact-label">Frecuencia</span>
                 <div className="tx-compact-value">
                   <select
                     value={recurringFrequency}
                     onChange={e => {
                       setRecurringFrequency(e.target.value as RecurringFrequency);
                       clearFieldError('recurringFrequency');
                     }}
                     className="tx-compact-value-input"
                   >
                     {RECURRING_FREQUENCY_OPTIONS.map(opt => (
                       <option key={opt.value} value={opt.value}>{opt.label}</option>
                     ))}
                   </select>
                 </div>
               </div>
               {fieldErrors.recurringFrequency && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.recurringFrequency}</p>}
               <div className="tx-compact-row">
                 <span className="tx-compact-label">Fin (opc.)</span>
                 <div className="tx-compact-value">
                   <input
                     type="date"
                     value={recurringEndOn}
                     onChange={e => {
                       setRecurringEndOn(e.target.value);
                       if (!e.target.value || e.target.value >= todayLocalISO()) clearFieldError('recurringEndOn');
                     }}
                     className="tx-compact-value-input"
                   />
                 </div>
               </div>
               {fieldErrors.recurringEndOn && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.recurringEndOn}</p>}
               {recurringFrequency === 'weekly_days' && (
                 <div className="tx-compact-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start', minHeight: 'auto', padding: 'var(--space-2) var(--space-3)' }}>
                   <span className="tx-compact-label">Días</span>
                   <div className="tx-compact-value" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                     <fieldset style={{ border: 'none', padding: 0, margin: 0, width: '100%' }}>
                       <div className="tx-weekdays__options">
                         {WEEKDAY_OPTIONS.map(({ label, bit }) => {
                           const checked = (recurringDaysOfWeek & bit) !== 0;
                           return (
                             <label key={label} className="tx-weekday">
                               <input
                                 type="checkbox"
                                 checked={checked}
                                 onChange={() => {
                                   setRecurringDaysOfWeek(prev => (checked ? prev & ~bit : prev | bit));
                                   clearFieldError('recurringFrequency');
                                 }}
                               />
                               {label}
                             </label>
                           );
                         })}
                       </div>
                     </fieldset>
                   </div>
                 </div>
               )}
             </>
           )}

           <div className="tx-compact-row">
             <span className="tx-compact-label">Categoría</span>
             <div className="tx-compact-value">
               <Select
                 value={formData.categoryId}
                 error={fieldErrors.categoryId}
                 onChange={v => {
                   if (v === '__new__') {
                     setNewCategoryOpen(true);
                     setNewCategoryName('');
                     setNewCategoryIcon(formData.kind === 'income' ? 'briefcase' : 'tag');
                     return;
                   }
                   setFormData(f => ({ ...f, categoryId: v }));
                   if (v) clearFieldError('categoryId');
                 }}
                 options={[
                   ...categories
                     .filter(c => c.kind === formData.kind && (!c.archivedAt || c.id === formData.categoryId))
                     .map(c => ({ value: c.id, label: c.archivedAt ? `${c.name} (archivada)` : c.name })),
                   { value: '__new__', label: 'Crear' }
                  ]}
                 className="tx-compact-select-btn"
                 style={{ flex: 1 }}
               />
             </div>
           </div>
           {fieldErrors.categoryId && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.categoryId}</p>}

           {newCategoryOpen && (
             <div className="tx-new-category">
               <Input
                 label="Nombre de la categoría"
                 value={newCategoryName}
                 onChange={setNewCategoryName}
                 placeholder="Ej. Supermercado"
                 autoFocus
               />
               <div className="tx-new-category__actions">
                 <Button
                   type="button"
                   variant="secondary"
                   onClick={resetNewCategory}
                   disabled={savingCategory}
                 >
                   Cancelar
                 </Button>
                 <Button
                   type="button"
                   onClick={handleCreateCategory}
                   loading={savingCategory}
                   disabled={savingCategory}
                 >
                   Crear
                 </Button>
               </div>
               {newCategoryError && (
                 <p className="ui-field__error" role="alert">{newCategoryError}</p>
               )}
             </div>
           )}

           <div className="tx-compact-row">
             <span className="tx-compact-label">Cuenta</span>
             <div className="tx-compact-value">
               <Select
                 value={formData.accountId}
                 error={fieldErrors.accountId}
                 onChange={v => {
                   setFormData(f => ({ ...f, accountId: v }));
                   lastAccountByKind.current[formData.kind] = v;
                   if (v) clearFieldError('accountId');
                 }}
                 options={accountOptions}
                 className="tx-compact-select-btn"
                 style={{ flex: 1 }}
               />
             </div>
           </div>
           {fieldErrors.accountId && <p className="ui-field__error" role="alert" style={{ padding: '0 var(--space-3)' }}>{fieldErrors.accountId}</p>}

           <div className="tx-compact-row">
             <span className="tx-compact-label">Descripción</span>
             <div className="tx-compact-value">
               <input
                 type="text"
                 value={description}
                 onChange={e => setDescription(e.target.value)}
                 placeholder="Ej: Supermercado"
                 className="tx-compact-value-input"
               />
             </div>
           </div>

           <div className="tx-compact-row">
             <span className="tx-compact-label">Notas</span>
             <div className="tx-compact-value">
               {!showNotes ? (
                 <button
                   type="button"
                   className="tx-compact-add-btn"
                   onClick={() => setShowNotes(true)}
                 >
                   + Agregar
                 </button>
               ) : (
                 <input
                   type="text"
                   value={notes}
                   onChange={e => setNotes(e.target.value)}
                   placeholder="Observación breve"
                   className="tx-compact-value-input"
                 />
               )}
             </div>
           </div>
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
