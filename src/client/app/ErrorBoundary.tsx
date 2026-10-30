import React from 'react';
import { Button } from '@shared/ui/Button';
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
            <h1>Algo salió mal.</h1>
            <p className="ui-error-text">
              No pudimos mostrar esta pantalla. Tus datos siguen guardados. Probá recargar; si vuelve a pasar, avisanos.
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
