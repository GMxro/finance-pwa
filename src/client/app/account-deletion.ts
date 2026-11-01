import { api } from '@shared/api/client';
import type { LogoutOptions } from './providers';
import type { LogoutFlowResult } from './logout-flow';

export async function performAccountDeletion(
  userId: string,
  logout: (options?: LogoutOptions) => Promise<LogoutFlowResult>
): Promise<void> {
  const key = `finance-pwa:account-deletion:${userId}`;
  let savedId: string | null;
  let requestId: string;
  try {
    savedId = localStorage.getItem(key);
    requestId = savedId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(savedId)
      ? savedId
      : crypto.randomUUID();
    localStorage.setItem(key, requestId);
  } catch {
    throw new Error('No se inició el borrado: el navegador no permitió guardar la clave de recuperación. Habilitá el almacenamiento del sitio e intentá de nuevo.');
  }

  const finish = async () => {
    localStorage.removeItem(key);
    await logout({ accountDeleted: true });
  };

  if (savedId === requestId) {
    const previous = await api.waitForAccountDeletion({ requestId });
    if (previous.data?.completed) return finish();
    if (previous.error) throw new Error(previous.error.message);
  }

  const response = await api.deleteAccount('ELIMINAR MI CUENTA', requestId);
  if (response.error) {
    const status = await api.waitForAccountDeletion({ requestId });
    if (status.data?.completed) return finish();
    throw new Error(status.error?.message ?? response.error.message);
  }
  if (!response.data?.completed) {
    const status = await api.waitForAccountDeletion({ requestId });
    if (!status.data?.completed) throw new Error(status.error?.message ?? 'El borrado sigue en proceso. Volvé a intentar.');
  }
  await finish();
}
