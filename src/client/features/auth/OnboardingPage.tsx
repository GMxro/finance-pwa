import React, { useState } from 'react';
import { useAuth } from '../../app/providers';
import { Button } from '@shared/ui/Button';
import { Select } from '@shared/ui/Select';
import { AuthLayout } from '@shared/ui/AuthLayout';
import { Stack, Divider } from '@shared/ui/Layout';
import { Notice } from '@shared/ui/Notice';
import type { CurrencyCode } from '@domain/money';
import './OnboardingPage.css';

const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'Peso argentino (ARS)' },
  { value: 'USD', label: 'Dólar estadounidense (USD)' }
];

export function OnboardingPage() {
  const { completeOnboarding, defaultCurrency } = useAuth();
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setLoading(true);
    setError(null);
    try {
      await completeOnboarding(currency);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos guardar tus preferencias.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <AuthLayout
        artTitle="Listo para empezar."
        artText="Tu cuenta queda configurada con categorías iniciales para ingresos y gastos. Podés editarlas cuando quieras."
      >
        <Stack gap="lg">
          <div>
            <p className="ui-onboarding__step">Paso 2 de 2</p>
            <h1 className="ui-auth-title">Todo listo.</h1>
            <p className="ui-auth-lead">
              Vas a arrancar con moneda {currency === 'ARS' ? 'peso argentino' : 'dólar estadounidense'} y categorías comunes ya creadas.
            </p>
          </div>
          {error && <Notice tone="strong">{error}</Notice>}
          <Button size="lg" fullWidth onClick={finish} loading={loading}>
            Comenzar
          </Button>
          <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
            Volver
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      artTitle="Primero, lo básico."
      artText="Elegí cómo querés ver tus totales. Después vas a poder registrar movimientos en pesos y en dólares."
    >
      <Stack gap="lg">
        <div>
          <p className="ui-onboarding__step">Paso 1 de 2</p>
          <h1 className="ui-auth-title">Configuremos<br /><span>tu cuenta.</span></h1>
          <p className="ui-auth-lead">Son dos pasos y arrancás.</p>
        </div>

        <div className="ui-onboarding__list">
          <div className="ui-onboarding__item">
            <Select
              label="Moneda principal"
              value={currency}
              onChange={(value) => setCurrency(value as CurrencyCode)}
              options={CURRENCY_OPTIONS}
              helperText="Los totales se muestran por moneda; podés usar ambas en cada movimiento."
            />
          </div>
          <Divider />
          <div className="ui-onboarding__item ui-onboarding__item--static">
            <div>
              <div className="ui-onboarding__label">Período presupuestario</div>
              <p className="ui-onboarding__text">Mes calendario en Argentina. Los presupuestos se reinician cada mes.</p>
            </div>
          </div>
          <Divider />
          <div className="ui-onboarding__item ui-onboarding__item--static">
            <div>
              <div className="ui-onboarding__label">Categorías iniciales</div>
              <p className="ui-onboarding__text">Se crean categorías comunes para ingresos y gastos. Podés editarlas después.</p>
            </div>
          </div>
        </div>

        <Button size="lg" fullWidth onClick={() => setStep(2)}>
          Continuar
        </Button>
      </Stack>
    </AuthLayout>
  );
}
