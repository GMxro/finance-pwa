import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@client/app/providers';
import { performAccountDeletion } from '@client/app/account-deletion';
import { api } from '@shared/api/client';
import { AuthLayout } from '@shared/ui/AuthLayout';
import { Button } from '@shared/ui/Button';
import { DangerZone } from '@shared/ui/DangerZone';
import { Notice } from '@shared/ui/Notice';
import { Stack } from '@shared/ui/Layout';
import { todayLocalISO } from '@domain/date';
import { LoadingScreen } from '@shared/ui/LoadingScreen';
import './LegalAcceptancePage.css';

export function LegalAcceptancePage() {
  const { user, loading, legalAcceptance, acceptLegalDocuments, logout } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (legalAcceptance?.accepted) return <Navigate to="/" replace />;

  const canContinue = Boolean(legalAcceptance) && termsAccepted && privacyAcknowledged && adultConfirmed && !submitting && !exporting && !deletingAccount;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptLegalDocuments({ termsAccepted: true, privacyAcknowledged: true, adultConfirmed: true });
      window.location.replace('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No pudimos guardar tu aceptación. Probá de nuevo.');
      setSubmitting(false);
    }
  };

  const exportAvailableData = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await api.exportCSV();
      if (response.error || !response.data) throw new Error(response.error?.message ?? 'No pudimos exportar los datos.');
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finanzas-${todayLocalISO()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'No pudimos exportar los datos.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeletingAccount(true);
    setError(null);
    try {
      await performAccountDeletion(user.id, logout);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No pudimos eliminar la cuenta. Probá de nuevo.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <AuthLayout
      artTitle="Tus finanzas, con claridad."
      artText="Revisá estos documentos antes de empezar a usar la aplicación."
    >
      <Stack gap="md">
        <div>
          <h1 className="ui-auth-title">Antes de continuar</h1>
          <p className="ui-auth-lead">Leé los documentos vigentes y confirmá las condiciones del servicio.</p>
          {legalAcceptance && (
            <p className="legal-acceptance__note">
              Términos {legalAcceptance.termsVersion} · Privacidad {legalAcceptance.privacyVersion}
            </p>
          )}
        </div>

        {!legalAcceptance && (
          <Notice tone="strong" action={{ label: 'Reintentar', onClick: () => window.location.reload() }}>
            No pudimos verificar qué versiones están vigentes. Necesitás conexión para comprobarlo y aceptar.
          </Notice>
        )}
        {error && <Notice tone="strong">{error}</Notice>}

        <section className="legal-acceptance__summary" aria-labelledby="legal-acceptance-summary-title">
          <h2 id="legal-acceptance-summary-title">Puntos principales</h2>
          <ul>
            <li>El servicio es solo para personas de 18 años o más; la edad no se verifica automáticamente.</li>
            <li>La Aplicación guarda los movimientos que ingresás, no se conecta con bancos ni ejecuta pagos.</li>
            <li>Podés descargar un CSV parcial o solicitar el borrado de la cuenta; algunos registros técnicos de borrado permanecen.</li>
          </ul>
        </section>

        <form className="legal-acceptance" onSubmit={handleSubmit}>
          <label className="legal-acceptance__check">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>Leí y acepto los <Link to="/terminos">Términos y Condiciones</Link> vigentes.</span>
          </label>
          <label className="legal-acceptance__check">
            <input type="checkbox" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} />
            <span>Leí la <Link to="/privacidad">Política de Privacidad</Link> vigente y tomo conocimiento de la información allí indicada.</span>
          </label>
          <label className="legal-acceptance__check">
            <input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} />
            <span>Confirmo que tengo 18 años o más. La aplicación no verifica automáticamente mi edad.</span>
          </label>

          <p className="legal-acceptance__note">
            La constancia de lectura de la Política no es un consentimiento general para tratar tus datos. Si un tratamiento requiriera tu consentimiento, se pediría por separado.
          </p>
          <div className="legal-acceptance__actions">
            <Button type="submit" fullWidth disabled={!canContinue} loading={submitting}>
              Aceptar y continuar
            </Button>
            <Button type="button" variant="ghost" fullWidth disabled={submitting || exporting || deletingAccount} onClick={() => void logout().catch((logoutError) => setError(logoutError instanceof Error ? logoutError.message : 'No pudimos cerrar la sesión.'))}>
              Salir sin aceptar
            </Button>
          </div>
        </form>
        <section className="legal-acceptance__exit" aria-label="Opciones si no aceptás">
          <p className="legal-acceptance__note">
            Si salís, los datos que ya estén en este navegador no se sincronizan ni se borran automáticamente. Podés exportar los datos disponibles o solicitar el borrado de la cuenta sin aceptar estos documentos.
          </p>
          <Button type="button" variant="secondary" fullWidth loading={exporting} disabled={exporting || deletingAccount} onClick={() => void exportAvailableData()}>
            Descargar CSV disponible
          </Button>
          <DangerZone
            title="Eliminar cuenta"
            description="El borrado de la cuenta está disponible aunque no aceptes la nueva versión de los documentos. La acción no se puede deshacer."
            actionLabel="Eliminar mi cuenta"
            confirmText="ELIMINAR MI CUENTA"
            onAction={deleteAccount}
            loading={deletingAccount}
            disabled={exporting || submitting}
          />
        </section>
      </Stack>
    </AuthLayout>
  );
}
