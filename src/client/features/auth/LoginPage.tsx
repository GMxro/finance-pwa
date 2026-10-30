import { useState } from 'react';
import { useAuth } from '../../app/providers';
import { Button } from '@shared/ui/Button';
import { AuthLayout } from '@shared/ui/AuthLayout';
import { Stack } from '@shared/ui/Layout';
import { Notice } from '@shared/ui/Notice';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.5 34.7 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C41.3 35.6 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

export function LoginPage() {
  const { login, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      await login();
    } catch {
      setError('No pudimos iniciar sesión. Probá de nuevo.');
    }
  };

  return (
    <AuthLayout
      artTitle="Cada peso, en su lugar."
      artText="Un registro simple de lo que entra y lo que sale. Sin planillas, sin ruido y sin depender de la conexión."
    >
      <Stack gap="lg">
        <div>
          <h1 className="ui-auth-title">
            Tus finanzas,<br />
            <span>en orden.</span>
          </h1>
          <p className="ui-auth-lead">
            Ingresos, gastos y presupuestos en una sola vista, en pesos y en dólares.
          </p>
        </div>

        {error && <Notice tone="strong">{error}</Notice>}

        <div className="ui-auth-actions">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleLogin}
            disabled={loading}
            aria-busy={loading}
            leftIcon={loading ? undefined : <GoogleMark />}
          >
            {loading ? 'Iniciando sesión…' : 'Continuar con Google'}
          </Button>
        </div>

        <p className="ui-auth-legal">
          Al continuar aceptás los <a href="/terminos">Términos</a> y la{' '}
          <a href="/privacidad">Política de privacidad</a>. Solo usamos tu cuenta de Google para identificarte: no accedemos a tu correo, Drive ni otros datos.
        </p>
      </Stack>
    </AuthLayout>
  );
}
