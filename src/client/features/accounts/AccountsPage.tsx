import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ArrowRightLeft, Pencil, Archive, Wallet, Landmark, CreditCard, TrendingUp, Trash2 } from 'lucide-react';
import { api } from '@shared/api/client';
import { useAuth } from '../../app/providers';
import type { AccountBalance, AccountKind, AccountWithBalances } from '@contracts/account';
import type { TransferResponse } from '@contracts/transfer';
import { formatAmount, type CurrencyCode } from '@domain/money';
import { todayLocalISO } from '@domain/date';
import { useCurrencyInput } from '@shared/hooks/useCurrencyInput';
import { focusFirstInvalid, hasFieldErrors, type FieldErrors } from '@shared/form/validation';
import { Page, PageHeader, Section, Stack, Grid, Inline } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Button, IconButton } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { SegmentedControl, SegmentedOption } from '@shared/ui/SegmentedControl';
import { Modal } from '@shared/ui/Modal';
import { Notice } from '@shared/ui/Notice';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { ListRow } from '@shared/ui/ListRow';
import { Text } from '@shared/ui/Text';
import '../../app/styles/accounts.css';

const KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  credit_card: 'Tarjeta de crédito',
  investment: 'Inversión'
};

const KIND_ICONS: Record<AccountKind, React.ElementType> = {
  cash: Wallet,
  bank: Landmark,
  credit_card: CreditCard,
  investment: TrendingUp
};

const KIND_OPTIONS: SegmentedOption[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank', label: 'Banco' },
  { value: 'credit_card', label: 'Tarjeta' },
  { value: 'investment', label: 'Inversión' }
];

interface AccountForm {
  name: string;
  description: string;
  kind: AccountKind;
  initialAmountMinor: number | null;
  initialCurrency: CurrencyCode;
}

interface TransferForm {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number | null;
  currency: CurrencyCode;
  crossCurrency: boolean;
  toAmountMinor: number | null;
  toCurrency: CurrencyCode;
  occurredOn: string;
  note: string;
}

const emptyTransferForm = (currency: CurrencyCode): TransferForm => ({
  fromAccountId: '',
  toAccountId: '',
  amountMinor: null,
  currency,
  crossCurrency: false,
  toAmountMinor: null,
  toCurrency: currency === 'ARS' ? 'USD' : 'ARS',
  occurredOn: todayLocalISO(),
  note: ''
});

export function AccountsPage() {
  const { defaultCurrency } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithBalances[]>([]);
  const [transfers, setTransfers] = useState<TransferResponse[]>([]);
  const [transfersPage, setTransfersPage] = useState(1);
  const [hasMoreTransfers, setHasMoreTransfers] = useState(false);
  const [loadingMoreTransfers, setLoadingMoreTransfers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountModal, setAccountModal] = useState<{ mode: 'create' | 'edit'; account?: AccountWithBalances } | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({ name: '', description: '', kind: 'cash', initialAmountMinor: null, initialCurrency: defaultCurrency });
  const [accountFieldErrors, setAccountFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>(() => emptyTransferForm(defaultCurrency));
  const [transferFieldErrors, setTransferFieldErrors] = useState<FieldErrors>({});

  const fromAmountInput = useCurrencyInput({
    currency: transferForm.currency,
    initialValue: transferForm.amountMinor,
    allowEmpty: true,
    onChange: (valueMinor) => {
      setTransferForm(f => ({ ...f, amountMinor: valueMinor }));
      setTransferFieldErrors(errors => (errors.amountMinor ? { ...errors, amountMinor: undefined } : errors));
    }
  });

  const toAmountInput = useCurrencyInput({
    currency: transferForm.toCurrency,
    initialValue: transferForm.toAmountMinor,
    allowEmpty: true,
    onChange: (valueMinor) => {
      setTransferForm(f => ({ ...f, toAmountMinor: valueMinor }));
      setTransferFieldErrors(errors => (errors.toAmountMinor ? { ...errors, toAmountMinor: undefined } : errors));
    }
  });

  const initialAmountInput = useCurrencyInput({
    currency: accountForm.initialCurrency,
    initialValue: accountForm.initialAmountMinor,
    allowEmpty: true,
    onChange: (valueMinor) => {
      setAccountForm(f => ({ ...f, initialAmountMinor: valueMinor }));
      setAccountFieldErrors(errors => (errors.initialAmountMinor ? { ...errors, initialAmountMinor: undefined } : errors));
    }
  });
  const setFromAmountMinor = fromAmountInput.setValueMinor;
  const setToAmountMinor = toAmountInput.setValueMinor;

  function updateAccountField<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setAccountForm(form => ({ ...form, [key]: value }));
    setAccountFieldErrors(errors => (errors[key] ? { ...errors, [key]: undefined } : errors));
  }

  function updateTransferField<K extends keyof TransferForm>(key: K, value: TransferForm[K]) {
    setTransferForm(form => ({ ...form, [key]: value }));
    setTransferFieldErrors(errors => (errors[key] ? { ...errors, [key]: undefined } : errors));
  }

  const [archiveTarget, setArchiveTarget] = useState<AccountWithBalances | null>(null);
  const [archiveHasCommitments, setArchiveHasCommitments] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransferResponse | null>(null);

  const requestArchive = async (account: AccountWithBalances) => {
    try {
      const [plansRes, rulesRes] = await Promise.all([
        api.listInstallmentPlans(),
        api.listRecurringRules()
      ]);
      const hasInstallments = (plansRes.data || []).some((p: any) => p.accountId === account.id);
      const hasRecurring = (rulesRes.data || []).some((r: any) => r.accountId === account.id && r.active);
      setArchiveHasCommitments(hasInstallments || hasRecurring);
    } catch {
      setArchiveHasCommitments(false);
    }
    setArchiveTarget(account);
  };

  useEffect(() => {
    setFromAmountMinor(transferForm.amountMinor);
  }, [transferForm.currency, transferForm.amountMinor, setFromAmountMinor]);

  useEffect(() => {
    setToAmountMinor(transferForm.toAmountMinor);
  }, [transferForm.toCurrency, transferForm.toAmountMinor, setToAmountMinor]);

  useEffect(() => {
    initialAmountInput.setValueMinor(accountForm.initialAmountMinor);
  }, [accountForm.initialCurrency, accountForm.initialAmountMinor, initialAmountInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, transfersRes] = await Promise.all([
        api.listAccounts(true),
        api.listTransfers({ page: 1, limit: 25 })
      ]);
      if (accountsRes.error) throw accountsRes.error;
      if (transfersRes.error) throw transfersRes.error;
      setAccounts(accountsRes.data ?? []);
      setTransfers(transfersRes.data ?? []);
      setTransfersPage(1);
      setHasMoreTransfers((transfersRes.data ?? []).length === 25);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cargar tus cuentas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadMoreTransfers = async () => {
    if (loadingMoreTransfers || !hasMoreTransfers) return;
    setLoadingMoreTransfers(true);
    setError(null);
    const nextPage = transfersPage + 1;
    try {
      const response = await api.listTransfers({ page: nextPage, limit: 25 });
      if (response.error) throw new Error(response.error.message);
      const rows = response.data ?? [];
      setTransfers((current) => {
        const ids = new Set(current.map((transfer) => transfer.id));
        return [...current, ...rows.filter((transfer) => !ids.has(transfer.id))];
      });
      setTransfersPage(nextPage);
      setHasMoreTransfers(rows.length === 25);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos cargar más transferencias.');
    } finally {
      setLoadingMoreTransfers(false);
    }
  };

  const totals = useMemo(() => {
    const byCurrency = new Map<CurrencyCode, number>();
    let overflow = false;
    for (const account of accounts) {
      for (const balance of account.balances) {
        const current = byCurrency.get(balance.currency) ?? 0;
        const next = current + balance.amountMinor;
        if (!Number.isSafeInteger(next)) {
          overflow = true;
          continue;
        }
        byCurrency.set(balance.currency, next);
      }
    }
    if (overflow) {
      setError('Los saldos superan el rango seguro; algunos totales no se muestran.');
    }
    return Array.from(byCurrency.entries())
      .filter(([, amount]) => amount !== 0)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [accounts]);

  const activeAccounts = accounts.filter(a => !a.archivedAt);

  const openCreateAccount = () => {
    setAccountForm({ name: '', description: '', kind: 'cash', initialAmountMinor: null, initialCurrency: defaultCurrency });
    setAccountFieldErrors({});
    setFormError(null);
    setAccountModal({ mode: 'create' });
  };

  const openEditAccount = (account: AccountWithBalances) => {
    setAccountForm({ name: account.name, description: account.description ?? '', kind: account.kind, initialAmountMinor: null, initialCurrency: defaultCurrency });
    setAccountFieldErrors({});
    setFormError(null);
    setAccountModal({ mode: 'edit', account });
  };

  const saveAccount = async () => {
    const nextErrors: FieldErrors = {};
    const trimmedName = accountForm.name.trim();
    if (!trimmedName) {
      nextErrors.name = 'Poné un nombre.';
    } else if (trimmedName.length > 60) {
      nextErrors.name = 'El nombre no puede superar los 60 caracteres.';
    }
    if (
      accountModal?.mode === 'create' &&
      accountForm.initialAmountMinor !== null &&
      accountForm.initialAmountMinor <= 0
    ) {
      nextErrors.initialAmountMinor = 'El importe inicial debe ser mayor a cero.';
    }
    if (hasFieldErrors(nextErrors)) {
      setAccountFieldErrors(nextErrors);
      setFormError(null);
      focusFirstInvalid('account-form');
      return;
    }
    setAccountFieldErrors({});
    setSaving(true);
    setFormError(null);
    try {
      const response = accountModal?.mode === 'edit' && accountModal.account
        ? await api.updateAccount(accountModal.account.id, {
            name: accountForm.name.trim(),
            description: accountForm.description.trim() || null,
            kind: accountForm.kind
          })
        : await api.createAccount({
            id: crypto.randomUUID(),
            name: accountForm.name.trim(),
            description: accountForm.description.trim() || null,
            kind: accountForm.kind,
            sortOrder: 0,
            initialAmountMinor: accountForm.initialAmountMinor ?? undefined,
            initialCurrency: accountForm.initialAmountMinor ? accountForm.initialCurrency : undefined
          });
      if (response.error) throw new Error(response.error.message);
      setAccountModal(null);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'No pudimos guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (account: AccountWithBalances) => {
    setSaving(true);
    try {
      const response = await api.updateAccount(account.id, { isDefault: true });
      if (response.error) {
        setError(response.error.message);
        return;
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos actualizar la cuenta predeterminada.');
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      const response = await api.updateAccount(archiveTarget.id, { archivedAt: Date.now() });
      if (response.error) throw new Error(response.error.message);
      setArchiveTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos archivar la cuenta.');
      setArchiveTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const restoreAccount = async (account: AccountWithBalances) => {
    setSaving(true);
    try {
      const response = await api.updateAccount(account.id, { archivedAt: null });
      if (response.error) throw new Error(response.error.message);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos restaurar la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const openTransfer = () => {
    const from = activeAccounts.find(a => a.isDefault) ?? activeAccounts[0];
    const to = activeAccounts.find(a => a.id !== from?.id);
    setTransferForm({
      ...emptyTransferForm(defaultCurrency),
      fromAccountId: from?.id ?? '',
      toAccountId: to?.id ?? '',
    });
    setTransferFieldErrors({});
    setFormError(null);
    setFromAmountMinor(null);
    setToAmountMinor(null);
    setTransferOpen(true);
  };

  const saveTransfer = async () => {
    const from = activeAccounts.find(a => a.id === transferForm.fromAccountId);
    const to = activeAccounts.find(a => a.id === transferForm.toAccountId);
    const nextErrors: FieldErrors = {};

    if (!from) nextErrors.fromAccountId = 'Elegí la cuenta de origen.';
    if (!to) nextErrors.toAccountId = 'Elegí la cuenta de destino.';
    else if (from?.id === to.id) nextErrors.toAccountId = 'Elegí dos cuentas distintas.';

    const fromAmountMinor = transferForm.amountMinor;
    if (fromAmountMinor === null || fromAmountMinor <= 0) {
      nextErrors.amountMinor = 'El importe debe ser mayor a cero.';
    }

    if (transferForm.crossCurrency) {
      if (transferForm.toCurrency === transferForm.currency) {
        nextErrors.toCurrency = 'En la misma moneda el monto que entra debe ser igual al que sale. Desactivá la opción o elegí otra moneda.';
      } else if (transferForm.toAmountMinor === null || transferForm.toAmountMinor <= 0) {
        nextErrors.toAmountMinor = 'El importe de destino debe ser mayor a cero.';
      }
    }

    if (hasFieldErrors(nextErrors)) {
      setTransferFieldErrors(nextErrors);
      setFormError(null);
      focusFirstInvalid('transfer-form');
      return;
    }

    if (!from || !to || fromAmountMinor === null) return;
    setTransferFieldErrors({});

    const toAmountMinor = transferForm.crossCurrency
      ? transferForm.toAmountMinor ?? undefined
      : undefined;

    setSaving(true);
    setFormError(null);
    try {
      const response = await api.createTransfer({
        id: crypto.randomUUID(),
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor,
        fromCurrency: transferForm.currency,
        toAmountMinor,
        toCurrency: transferForm.crossCurrency ? transferForm.toCurrency : transferForm.currency,
        occurredOn: transferForm.occurredOn,
        note: transferForm.note || undefined
      });
      if (response.error) throw new Error(response.error.message);
      setTransferOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'No pudimos registrar la transferencia.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteTransfer = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await api.deleteTransfer(deleteTarget.id);
      if (response.error) throw new Error(response.error.message);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos eliminar la transferencia.');
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const renderBalances = (balances: AccountBalance[]) => {
    if (balances.length === 0) return <Text variant="caption" tone="stone">Sin movimientos</Text>;
    return (
      <Inline gap="md" className="accounts-balances">
        {balances.map(balance => (
          <span key={balance.currency} className="accounts-balance">
            {formatAmount(balance.amountMinor, balance.currency)}
          </span>
        ))}
      </Inline>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Cuentas"
        description="Las transferencias mueven plata entre tus cuentas: no cuentan como ingreso ni como gasto."
        actions={
          <Inline gap="sm">
            <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={openCreateAccount}>Nueva cuenta</Button>
            <Button leftIcon={<ArrowRightLeft size={16} />} onClick={openTransfer} disabled={activeAccounts.length < 2}>
              Transferir
            </Button>
          </Inline>
        }
      />

      {error && (
        <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => void load() }}>{error}</Notice>
      )}

      {totals.length > 0 && (
        <Panel tone="paper" radius="panel" padding="md">
          <Text variant="caption" tone="stone">Total entre cuentas</Text>
          <Inline gap="lg" className="accounts-totals">
            {totals.map(([currency, amount]) => (
              <span key={currency} className="accounts-total">
                {formatAmount(amount, currency)}
              </span>
            ))}
          </Inline>
        </Panel>
      )}

      {loading && accounts.length === 0 && <LoadingSpinner />}

      {!loading && accounts.length === 0 && !error && (
        <EmptyState
          title="Sin cuentas"
          message="Creá tu primera cuenta para separar efectivo, banco y billeteras."
          action={{ label: 'Crear cuenta', onClick: openCreateAccount }}
        />
      )}

      {activeAccounts.length > 0 && (
        <Section title="Cuentas activas">
          <Panel tone="paper" radius="panel" padding="none">
            <div className="accounts-list">
              {activeAccounts.map(account => {
                const Icon = KIND_ICONS[account.kind];
                return (
                  <ListRow
                    key={account.id}
                    leading={<span className="accounts-icon"><Icon size={19} strokeWidth={1.6} aria-hidden="true" /></span>}
                    title={
                      <Inline gap="sm">
                        <span>{account.name}</span>
                        {account.isDefault && <span className="ui-row__badge accounts-default-badge">Predeterminada</span>}
                      </Inline>
                    }
                    subtitle={KIND_LABELS[account.kind]}
                    meta={renderBalances(account.balances)}
                    trailing={
                      <Inline gap="xs" className="accounts-row-actions">
                        {!account.isDefault && (
                          <Button variant="ghost" size="sm" className="accounts-default-action" onClick={() => void makeDefault(account)} disabled={saving}>
                            Predeterminar
                          </Button>
                        )}
                        <IconButton label={`Editar ${account.name}`} onClick={() => openEditAccount(account)} disabled={saving}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton label={`Archivar ${account.name}`} onClick={() => void requestArchive(account)} disabled={saving}>
                          <Archive size={16} />
                        </IconButton>
                      </Inline>
                    }
                  />
                );
              })}
            </div>
          </Panel>
        </Section>
      )}

      {accounts.some((account) => account.archivedAt) && (
        <Section title="Cuentas archivadas">
          <Panel tone="paper" radius="panel" padding="none">
            <div className="accounts-list">
              {accounts.filter((account) => account.archivedAt).map((account) => {
                const Icon = KIND_ICONS[account.kind];
                return (
                  <ListRow
                    key={account.id}
                    leading={<span className="accounts-icon"><Icon size={19} strokeWidth={1.6} aria-hidden="true" /></span>}
                    title={account.name}
                    subtitle={`${KIND_LABELS[account.kind]} · Archivada`}
                    meta={renderBalances(account.balances)}
                    trailing={(
                      <Button variant="ghost" size="sm" onClick={() => void restoreAccount(account)} loading={saving}>
                        Restaurar
                      </Button>
                    )}
                  />
                );
              })}
            </div>
          </Panel>
        </Section>
      )}

      <Section title="Transferencias">
        {transfers.length === 0 ? (
          <Panel tone="paper" radius="panel" padding="lg">
            <Text variant="body" tone="stone">
              Todavía no registraste transferencias. Mové plata entre tus cuentas sin que cuente como gasto.
            </Text>
          </Panel>
        ) : (
          <Panel tone="paper" radius="panel" padding="none">
            <div className="accounts-list">
              {transfers.map(transfer => (
                <ListRow
                  key={transfer.id}
                  leading={<span className="accounts-icon"><ArrowRightLeft size={18} strokeWidth={1.6} aria-hidden="true" /></span>}
                  title={`${transfer.fromAccountName} → ${transfer.toAccountName}`}
                  subtitle={[transfer.occurredOn, transfer.note].filter(Boolean).join(' · ')}
                  meta={
                    <span className="accounts-balance">
                      {formatAmount(transfer.fromAmountMinor, transfer.fromCurrency)}
                      {(transfer.toCurrency !== transfer.fromCurrency || transfer.toAmountMinor !== transfer.fromAmountMinor) && (
                        <> → {formatAmount(transfer.toAmountMinor, transfer.toCurrency)}</>
                      )}
                    </span>
                  }
                  trailing={
                      <IconButton label="Eliminar transferencia" onClick={() => setDeleteTarget(transfer)} disabled={saving}>
                      <Trash2 size={16} />
                    </IconButton>
                  }
                />
              ))}
            </div>
          </Panel>
        )}
        {hasMoreTransfers && (
          <Inline justify="center">
            <Button variant="secondary" loading={loadingMoreTransfers} onClick={() => void loadMoreTransfers()}>
              Cargar más transferencias
            </Button>
          </Inline>
        )}
      </Section>

      <Modal
         open={accountModal !== null}
         onClose={() => setAccountModal(null)}
         busy={saving}
         title={accountModal?.mode === 'edit' ? 'Editar cuenta' : 'Nueva cuenta'}
         description="Las cuentas agrupan tu plata: efectivo, banco, billeteras."
        footer={
          <>
            {accountModal?.mode === 'edit' && accountModal.account && !accountModal.account.isDefault && (
              <Button
                variant="ghost"
                className="accounts-default-modal-action"
                onClick={() => void makeDefault(accountModal.account!)}
                disabled={saving}
              >
                Predeterminar
              </Button>
            )}
            <Button variant="secondary" onClick={() => setAccountModal(null)} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="account-form" loading={saving}>
              {accountModal?.mode === 'edit' ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="account-form" noValidate onSubmit={event => { event.preventDefault(); void saveAccount(); }}>
          <Stack gap="md">
            {formError && <Notice tone="strong">{formError}</Notice>}
             <Input
               label="Nombre"
               data-autofocus
               value={accountForm.name}
              onChange={value => updateAccountField('name', value)}
              error={accountFieldErrors.name}
              placeholder="Ej.: Banco Nación"
              maxLength={60}
              required
            />
            <SegmentedControl
              label="Tipo"
              value={accountForm.kind}
              onChange={value => updateAccountField('kind', value as AccountKind)}
              options={KIND_OPTIONS}
            />
            <Input
              label="Descripción (opcional)"
              value={accountForm.description}
              onChange={value => updateAccountField('description', value)}
              placeholder="Ej.: Cuenta sueldo"
              maxLength={200}
            />
            {accountModal?.mode === 'create' && (
              <>
                <Input
                  label="Importe inicial (opcional)"
                  value={initialAmountInput.displayValue}
                  onChange={initialAmountInput.onChangeString}
                  onBlur={initialAmountInput.onBlur}
                  onFocus={initialAmountInput.onFocus}
                  placeholder="0"
                  inputMode="decimal"
                  prefix={accountForm.initialCurrency === 'USD' ? 'US$' : '$'}
                  error={accountFieldErrors.initialAmountMinor}
                />
                <Select
                  label="Moneda del importe inicial"
                  value={accountForm.initialCurrency}
                  onChange={value => updateAccountField('initialCurrency', value as CurrencyCode)}
                  options={[
                    { value: 'ARS', label: 'ARS' },
                    { value: 'USD', label: 'USD' }
                  ]}
                />
              </>
            )}
          </Stack>
        </form>
      </Modal>

      <Modal
         open={transferOpen}
         onClose={() => setTransferOpen(false)}
         busy={saving}
         title="Transferir entre cuentas"
         description="Sale de una cuenta y entra en otra. No es gasto ni ingreso."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="transfer-form" loading={saving}>Transferir</Button>
          </>
        }
      >
        <form id="transfer-form" noValidate onSubmit={event => { event.preventDefault(); void saveTransfer(); }}>
          <Stack gap="md">
            {formError && <Notice tone="strong">{formError}</Notice>}
            <Grid columns={2} gap="md">
              <Select
                label="Desde"
                value={transferForm.fromAccountId}
                onChange={value => {
                  setTransferForm(form => ({
                    ...form,
                    fromAccountId: value,
                    toAccountId: form.toAccountId === value
                      ? activeAccounts.find(a => a.id !== value)?.id ?? ''
                      : form.toAccountId
                  }));
                  setTransferFieldErrors(errors => ({ ...errors, fromAccountId: undefined, toAccountId: undefined }));
                }}
                error={transferFieldErrors.fromAccountId}
                options={activeAccounts.map(a => ({ value: a.id, label: a.name }))}
                required
              />
              <Select
                label="Hacia"
                value={transferForm.toAccountId}
                onChange={value => updateTransferField('toAccountId', value)}
                error={transferFieldErrors.toAccountId}
                options={activeAccounts
                  .filter(a => a.id !== transferForm.fromAccountId)
                  .map(a => ({ value: a.id, label: a.name }))}
                required
              />
            </Grid>
            <Grid columns={2} gap="md">
               <div style={{ flex: 1 }}>
                 <Input
                   data-autofocus
                   label="Monto que sale"
                  value={fromAmountInput.displayValue}
                  onChange={fromAmountInput.onChangeString}
                  onBlur={fromAmountInput.onBlur}
                  onFocus={fromAmountInput.onFocus}
                  placeholder="0,00"
                  prefix={transferForm.currency === 'USD' ? 'US$' : '$'}
                  error={transferFieldErrors.amountMinor}
                  required
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <Select
                label="Moneda"
                value={transferForm.currency}
                onChange={value => updateTransferField('currency', value as CurrencyCode)}
                options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
              />
            </Grid>
            <label className="accounts-check">
              <input
                type="checkbox"
                checked={transferForm.crossCurrency}
                onChange={event => setTransferForm(form => ({ ...form, crossCurrency: event.target.checked }))}
              />
              <span>En la cuenta de destino entra otra moneda o distinto importe</span>
            </label>
            {transferForm.crossCurrency && (
              <Grid columns={2} gap="md">
                <div style={{ flex: 1 }}>
                  <Input
                    label="Monto que entra"
                    value={toAmountInput.displayValue}
                    onChange={toAmountInput.onChangeString}
                    onBlur={toAmountInput.onBlur}
                    onFocus={toAmountInput.onFocus}
                    placeholder="0,00"
                    prefix={transferForm.toCurrency === 'USD' ? 'US$' : '$'}
                    error={transferFieldErrors.toAmountMinor}
                    required
                    inputMode="decimal"
                    pattern="[0-9.,]*"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
                <Select
                  label="Moneda destino"
                  value={transferForm.toCurrency}
                  onChange={value => updateTransferField('toCurrency', value as CurrencyCode)}
                  error={transferFieldErrors.toCurrency}
                  options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
                />
              </Grid>
            )}
            <Grid columns={2} gap="md">
              <Input
                label="Fecha"
                type="date"
                value={transferForm.occurredOn}
                onChange={value => updateTransferField('occurredOn', value)}
                required
              />
              <Input
                label="Nota (opcional)"
                value={transferForm.note}
                onChange={value => updateTransferField('note', value)}
                maxLength={120}
                placeholder="Ej.: pago tarjeta"
              />
            </Grid>
          </Stack>
        </form>
      </Modal>

      <Modal
         open={archiveTarget !== null}
         onClose={() => setArchiveTarget(null)}
         busy={saving}
         title="Archivar cuenta"
         description={archiveTarget ? (archiveHasCommitments ? "Estás a punto de archivar una cuenta que tiene compromisos financieros pendientes. ¿Estás seguro de que querés continuar?" : `“${archiveTarget.name}” deja de aparecer al cargar movimientos. Su historial se conserva.`) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmArchive()} loading={saving}>Archivar</Button>
          </>
        }
      >
        <Text variant="body" tone="stone">Podés archivarla igual: los movimientos viejos no se tocan.</Text>
      </Modal>

      <Modal
         open={deleteTarget !== null}
         onClose={() => setDeleteTarget(null)}
         busy={saving}
         title="Eliminar transferencia"
         description={deleteTarget ? `${deleteTarget.fromAccountName} → ${deleteTarget.toAccountName}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmDeleteTransfer()} loading={saving}>Eliminar</Button>
          </>
        }
      >
        <Text variant="body" tone="stone">Los saldos de las dos cuentas vuelven atrás.</Text>
      </Modal>
    </Page>
  );
}
