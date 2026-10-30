import React from 'react';
import { X } from 'lucide-react';
import './Notice.css';

interface NoticeProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'strong';
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

export function Notice({ children, tone = 'neutral', action, onDismiss }: NoticeProps) {
  return (
    <div className={`ui-notice ui-notice--${tone}`} role="status">
      <div className="ui-notice__content">{children}</div>
      {action && (
        <button type="button" className="ui-notice__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button type="button" className="ui-notice__close" onClick={onDismiss} aria-label="Cerrar aviso">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
