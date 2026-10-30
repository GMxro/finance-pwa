import React from 'react';
import { Button } from './Button';
import './EmptyState.css';

export interface EmptyStateProps {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  icon?: React.ReactNode;
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__icon" aria-hidden="true">
        {icon || (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 7h16M4 12h10M4 17h7" />
          </svg>
        )}
      </div>
      <div className="ui-empty__text">
        <h3 className="ui-empty__title">{title}</h3>
        <p className="ui-empty__message">{message}</p>
      </div>
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
