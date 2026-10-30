import React from 'react';
import './LoadingSpinner.css';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`ui-spinner ui-spinner--${size} ${className}`} role="status" aria-label="Cargando">
      <span className="ui-spinner__ring" aria-hidden="true" />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}

export function LoadingOverlay({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="ui-loading-overlay" role="status" aria-label={message}>
      <LoadingSpinner size="lg" />
      <p>{message}</p>
    </div>
  );
}
