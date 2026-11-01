import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { APP_UPDATE_REQUIRED_EVENT, APP_VERSION } from '@shared/api/client';
import { isVersionAtLeast, REQUIRED_APP_VERSION_KEY } from './version-policy';
import './AppUpdateNotice.css';

// Timeout para la activación del Service Worker (ms)
// Si el SW no activa en este tiempo, forzamos recarga
const ACTIVATION_TIMEOUT_MS = 15000;

function hasRequiredUpdate(): boolean {
  try {
    const minimum = localStorage.getItem(REQUIRED_APP_VERSION_KEY);
    if (!minimum) return false;
    if (isVersionAtLeast(APP_VERSION, minimum)) {
      localStorage.removeItem(REQUIRED_APP_VERSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function AppUpdateNotice() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [activating, setActivating] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(hasRequiredUpdate);
  const [updateError, setUpdateError] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const registrationPromiseRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const mandatoryRef = useRef(upgradeRequired);
  const activationRequested = useRef(false);
  const gateRef = useRef<HTMLDialogElement>(null);
  const activationTimeoutRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const onUpdateRequired = () => {
      mandatoryRef.current = true;
      setUpgradeRequired(true);
      setUpdateError(false);
    };

    window.addEventListener(APP_UPDATE_REQUIRED_EVENT, onUpdateRequired);
    return () => window.removeEventListener(APP_UPDATE_REQUIRED_EVENT, onUpdateRequired);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    };

    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (activationTimeoutRef.current) {
        window.clearTimeout(activationTimeoutRef.current);
        activationTimeoutRef.current = null;
      }
      window.location.reload();
    };

    const activate = (worker: ServiceWorker) => {
      setActivating(true);
      setUpdateError(false);
      worker.postMessage({ type: 'SKIP_WAITING' });
      // Timeout de seguridad: si el SW no activa en ACTIVATION_TIMEOUT_MS,
      // forzamos recarga para no dejar al usuario colgado en "Actualizando..."
      // Usamos activationRequested.current (ref) en lugar del estado activating
      // porque el closure captura el valor inicial.
      activationTimeoutRef.current = window.setTimeout(() => {
        activationTimeoutRef.current = null;
        if (activationRequested.current) {
          window.location.reload();
        }
      }, ACTIVATION_TIMEOUT_MS);
    };

    const watchRegistration = (currentRegistration: ServiceWorkerRegistration) => {
      registration = currentRegistration;
      registrationRef.current = currentRegistration;
      if (currentRegistration.active && currentRegistration.waiting) {
        setWaitingWorker(currentRegistration.waiting);
      }

      currentRegistration.addEventListener('updatefound', () => {
        const installingWorker = currentRegistration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (
            installingWorker.state === 'installed' &&
            currentRegistration.active &&
            currentRegistration.waiting
          ) {
            const waiting = currentRegistration.waiting;
            setWaitingWorker(waiting);
            if (waiting && mandatoryRef.current && activationRequested.current) activate(waiting);
          } else if (installingWorker.state === 'redundant' && activationRequested.current) {
            activationRequested.current = false;
            setActivating(false);
            setUpdateError(true);
            if (activationTimeoutRef.current) {
              window.clearTimeout(activationTimeoutRef.current);
              activationTimeoutRef.current = null;
            }
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);

    const registrationPromise = navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    registrationPromiseRef.current = registrationPromise;
    registrationPromise
      .then((currentRegistration) => {
        if (disposed) return;
        watchRegistration(currentRegistration);
        currentRegistration.update().catch(() => {});
      })
      .catch(() => {
        if (registrationPromiseRef.current === registrationPromise) registrationPromiseRef.current = null;
      });

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (activationTimeoutRef.current) {
        window.clearTimeout(activationTimeoutRef.current);
        activationTimeoutRef.current = null;
      }
      registrationRef.current = null;
      registrationPromiseRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const gate = gateRef.current;
    if (!gate) return;
    if (upgradeRequired && !gate.open) gate.showModal();
    if (!upgradeRequired && gate.open) gate.close();
  }, [upgradeRequired]);

  const activateUpdate = async () => {
    if (activating) return;
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    if (waitingWorker) {
      activationRequested.current = true;
      setActivating(true);
      setUpdateError(false);
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      activationTimeoutRef.current = window.setTimeout(() => {
        activationTimeoutRef.current = null;
        if (activationRequested.current) {
          window.location.reload();
        }
      }, ACTIVATION_TIMEOUT_MS);
      return;
    }

    activationRequested.current = true;
    setActivating(true);
    setUpdateError(false);
    let registrationAttempt: Promise<ServiceWorkerRegistration> | null = null;
    try {
      registrationAttempt = registrationPromiseRef.current ??
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      registrationPromiseRef.current = registrationAttempt;
      const registration = registrationRef.current ?? await registrationAttempt;
      registrationRef.current = registration;
      await registration.update();
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        activationTimeoutRef.current = window.setTimeout(() => {
          activationTimeoutRef.current = null;
          if (activationRequested.current) {
            window.location.reload();
          }
        }, ACTIVATION_TIMEOUT_MS);
      } else if (!registration.installing) {
        activationRequested.current = false;
        setActivating(false);
        setUpdateError(true);
      }
    } catch {
      if (registrationAttempt && registrationPromiseRef.current === registrationAttempt) {
        registrationPromiseRef.current = null;
      }
      activationRequested.current = false;
      setActivating(false);
      setUpdateError(true);
    }
  };

  if (upgradeRequired) {
    return (
      <dialog
        ref={gateRef}
        className="app-update-gate"
        aria-labelledby="app-update-title"
        onCancel={(event) => event.preventDefault()}
      >
        <h1 id="app-update-title">Hace falta actualizar</h1>
        <p>Esta versión ya no puede usar las funciones de la aplicación. Actualizá para continuar.</p>
        {updateError && (
          <p role="alert">
            No pudimos descargar la actualización. Revisá tu conexión y volvé a intentar. Los datos guardados en este dispositivo no se borraron.
          </p>
        )}
        <button type="button" onClick={() => void activateUpdate()} disabled={activating}>
          {activating ? 'Descargando actualización…' : updateError ? 'Reintentar actualización' : 'Actualizar y continuar'}
        </button>
      </dialog>
    );
  }

  if (!waitingWorker) return null;

  return (
    <aside className="app-update-notice" role="status" aria-live="polite">
      <p>Actualización lista. Guardá lo que estés haciendo y elegí cuándo aplicarla.</p>
      <button type="button" onClick={() => void activateUpdate()} disabled={activating}>
        {activating ? 'Actualizando…' : 'Actualizar'}
      </button>
    </aside>
  );
}
