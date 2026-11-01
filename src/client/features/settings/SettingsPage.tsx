import React, { useEffect, useRef, useState } from 'react';
import { Download, LogOut, ChevronRight, Layers, RefreshCw } from 'lucide-react';
import { useAuth } from '../../app/providers';
import { performAccountDeletion } from '../../app/account-deletion';
import { APP_VERSION, api } from '@shared/api/client';
import { ARGENTINA_TZ } from '@domain/date';
import { Page, PageHeader, Stack, Inline, Divider } from '@shared/ui/Layout';
import { Panel } from '@shared/ui/Panel';
import { Text } from '@shared/ui/Text';
import { Button } from '@shared/ui/Button';
import { Status } from '@shared/ui/Status';
import { Notice } from '@shared/ui/Notice';
import { DangerZone } from '@shared/ui/DangerZone';
import { ListRow } from '@shared/ui/ListRow';
import './SettingsPage.css';

export function SettingsPage() {
  const { user, logout, syncState, syncNow, defaultCurrency } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutPrompt, setLogoutPrompt] = useState<{
    pendingCount: number;
    offline: boolean;
    step: 'choice' | 'discard-confirmation';
  } | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const logoutDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = logoutDialog.current;
    if (logoutPrompt && dialog && !dialog.open) dialog.showModal();
    if (!logoutPrompt && dialog?.open) dialog.close();
  }, [logoutPrompt]);

const exportCSV = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await api.exportCSV();
      if (response.error) throw new Error(response.error.message);
      const blob = response.data as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finanzas-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos exportar los datos.');
    } finally {
      setExporting(false);
    }
  };

  const syncLabel = syncState.error
    ? `${syncState.pendingCount} pendiente${syncState.pendingCount === 1 ? '' : 's'} · Error de sincronización`
    : syncState.status === 'syncing'
      ? 'Sincronizando…'
      : syncState.pendingCount > 0
        ? `${syncState.pendingCount} cambio${syncState.pendingCount === 1 ? '' : 's'} pendiente${syncState.pendingCount === 1 ? '' : 's'}`
        : 'Todo sincronizado';

  const lastSync = syncState.lastSync
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(syncState.lastSync))
    : 'Todavía no sincronizaste';

  const handleSync = async () => {
    setError(null);
    try {
      await syncNow();
    } catch {
      setError(syncState.pendingCount > 0
        ? `No se pudo sincronizar. Tus ${syncState.pendingCount} cambios siguen pendientes en este dispositivo.`
        : 'No se pudo completar la sincronización. Volvé a intentar.');
    }
  };

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      if (!user) throw new Error('No pudimos identificar la cuenta activa.');
      await performAccountDeletion(user.id, logout);
    } finally {
      setDeletingAccount(false);
    }
  };

  const requestLogout = async () => {
    setError(null);
    setLogoutBusy(true);
    try {
      const result = await logout();
      if (result.status === 'pending-confirmation') {
        setLogoutPrompt({ ...result, step: 'choice' });
      }
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cerrar la sesión. Tus cambios siguen guardados.');
    } finally {
      setLogoutBusy(false);
    }
  };

  const finishPendingLogout = async (pendingAction: 'preserve' | 'discard') => {
    setLogoutBusy(true);
    setError(null);
    try {
      const result = await logout({ pendingAction });
      if (result.status === 'pending-confirmation') {
        setLogoutPrompt({ ...result, step: 'choice' });
      } else {
        setLogoutPrompt(null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cerrar la sesión. Los cambios siguen guardados.');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <Page className="settings-page">
      <PageHeader
        eyebrow="Tu cuenta"
        title="Ajustes"
        description="Preferencias, datos y estado de la aplicación."
      />

      {error && <Notice tone="strong" onDismiss={() => setError(null)}>{error}</Notice>}

      <Stack gap="lg">
        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="lg">
            <Inline justify="between" gap="md">
              <Inline gap="md">
                <span className="settings-avatar" aria-hidden="true">
                  {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                </span>
                <div>
                  <Text variant="subtitle">{user?.name || 'Tu cuenta'}</Text>
                  <Text variant="small" tone="stone">{user?.email}</Text>
                </div>
              </Inline>
              <Button variant="secondary" leftIcon={<LogOut size={16} />} onClick={() => void requestLogout()} disabled={logoutBusy} loading={logoutBusy}>
                Cerrar sesión
              </Button>
            </Inline>
          </Stack>
        </Panel>

        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="md">
            <Text variant="subtitle">Organización</Text>
            <ListRow
              to="/ajustes/categorias"
              leading={<span className="settings-leading"><Layers size={18} /></span>}
              title="Categorías"
              subtitle="Administrá tus categorías de ingresos y gastos"
              trailing={<ChevronRight size={18} />}
            />
            <Divider />
            <Inline justify="between" gap="md">
              <div>
                <Text variant="small">Sincronización</Text>
                <Text variant="caption" tone="stone">{lastSync}</Text>
              </div>
              <Inline gap="md">
                <Status label={syncLabel} tone={syncState.error ? 'danger' : 'neutral'} />
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw size={15} />}
                  onClick={() => void handleSync()}
                  disabled={syncState.status === 'syncing'}
                >
                  Sincronizar
                </Button>
              </Inline>
            </Inline>
            {syncState.pendingCount > 0 && (
              <Text variant="caption" tone="stone">
                Los cambios pendientes están guardados en este navegador. Si borrás los datos del sitio antes de sincronizarlos, no se podrán recuperar.
              </Text>
            )}
          </Stack>
        </Panel>

        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="md">
            <Text variant="subtitle">Datos</Text>
            <Inline justify="between" gap="md">
              <Text variant="small" tone="stone">
                Exportá movimientos, categorías y presupuestos en CSV.
              </Text>
              <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => void exportCSV()} loading={exporting}>
                Exportar CSV
              </Button>
            </Inline>
          </Stack>
        </Panel>

        <Panel tone="paper" radius="panel" padding="lg">
          <Stack gap="md">
            <Text variant="subtitle">Información</Text>
            <div className="settings-grid">
              <div className="settings-field">
                <span className="settings-field__label">Versión</span>
                <span className="settings-field__value">{APP_VERSION}</span>
              </div>
              <div className="settings-field">
                <span className="settings-field__label">Moneda base</span>
                <span className="settings-field__value">{defaultCurrency}</span>
              </div>
              <div className="settings-field">
                <span className="settings-field__label">Zona horaria</span>
                <span className="settings-field__value">{ARGENTINA_TZ}</span>
              </div>
            </div>
            <Inline gap="md">
              <a className="settings-link" href="/terminos">Términos de servicio</a>
              <a className="settings-link" href="/privacidad">Política de privacidad</a>
            </Inline>
          </Stack>
        </Panel>

        <Panel tone="paper" radius="panel" padding="lg">
          <DangerZone
            title="Eliminar cuenta"
            description="Se eliminan permanentemente tu cuenta, movimientos, categorías, presupuestos y preferencias. No se puede deshacer."
            actionLabel="Eliminar mi cuenta"
            confirmText="ELIMINAR MI CUENTA"
            onAction={deleteAccount}
            loading={deletingAccount}
          />
        </Panel>
      </Stack>

      <dialog
        ref={logoutDialog}
        className="settings-logout-dialog"
        aria-labelledby="settings-logout-title"
        onCancel={(event) => {
          event.preventDefault();
          setLogoutPrompt(null);
        }}
      >
        {logoutPrompt?.step === 'choice' ? (
          <>
            <h2 id="settings-logout-title">Tenés {logoutPrompt.pendingCount} cambio{logoutPrompt.pendingCount === 1 ? '' : 's'} sin enviar</h2>
            <p>
              {logoutPrompt.offline
                ? 'No hay conexión. Podés conservarlos en este dispositivo; solo se sincronizan cuando vuelva a entrar la misma cuenta.'
                : 'No se pudieron sincronizar todos los cambios. Podés conservarlos en este dispositivo o descartarlos.'}
            </p>
            <div className="settings-logout-dialog__actions">
              <Button variant="secondary" onClick={() => setLogoutPrompt(null)} disabled={logoutBusy}>Cancelar</Button>
              <Button variant="primary" onClick={() => void finishPendingLogout('preserve')} disabled={logoutBusy}>
                Cerrar sesión y conservar
              </Button>
              <Button variant="danger" onClick={() => setLogoutPrompt({ ...logoutPrompt, step: 'discard-confirmation' })} disabled={logoutBusy}>
                Cerrar y descartar
              </Button>
            </div>
          </>
        ) : logoutPrompt ? (
          <>
            <h2 id="settings-logout-title">¿Descartar los cambios sin enviar?</h2>
            <p>Se borrarán los {logoutPrompt.pendingCount} cambios pendientes de esta cuenta y sus registros locales sin enviar. No se tocarán los de otras cuentas.</p>
            <div className="settings-logout-dialog__actions">
              <Button variant="secondary" onClick={() => setLogoutPrompt({ ...logoutPrompt, step: 'choice' })} disabled={logoutBusy}>Volver</Button>
              <Button variant="danger" onClick={() => void finishPendingLogout('discard')} disabled={logoutBusy} loading={logoutBusy}>
                Descartar y cerrar sesión
              </Button>
            </div>
          </>
        ) : null}
      </dialog>
    </Page>
  );
}
