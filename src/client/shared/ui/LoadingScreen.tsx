import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import './LoadingScreen.css';

export function LoadingScreen() {
  return (
    <div className="ui-loading-screen" role="status" aria-label="Cargando la aplicación">
      <div className="ui-loading-screen__brand">
        <img src="/icons/icon-96.png" alt="" width="32" height="32" />
        <span>Finanzas</span>
      </div>
      <LoadingSpinner size="md" />
    </div>
  );
}
