import React from 'react';
import { Button } from '@shared/ui/Button';
import { FinancialRangeError } from '@domain/money';
import './ErrorBoundary.css';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ui-error-screen">
          <div className="ui-error-card">
            <p className="ui-error-kicker">Error inesperado</p>
            <h1>{this.state.error instanceof FinancialRangeError ? 'El total excede el rango seguro.' : 'Algo salió mal.'}</h1>
            <p className="ui-error-text">
              {this.state.error instanceof FinancialRangeError
                ? 'No podemos calcular este total con exactitud. Tus movimientos siguen guardados; revisá los importes o contactá soporte.'
                : 'No pudimos mostrar esta pantalla. Tus datos siguen guardados. Probá recargar; si vuelve a pasar, avisanos.'}
            </p>
            <div className="ui-error-actions">
              <Button onClick={() => window.location.reload()}>Recargar</Button>
              <Button variant="ghost" onClick={() => window.location.assign('/')}>Volver al inicio</Button>
            </div>
            {(import.meta as any).env?.DEV && (
              <details className="ui-error-details">
                <summary>Detalle técnico</summary>
                <pre>{this.state.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
