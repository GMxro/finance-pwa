import React from 'react';
import './Status.css';

type Tone = 'neutral' | 'ink' | 'danger' | 'onInk';

interface StatusProps {
  label: string;
  tone?: Tone;
  dot?: boolean;
}

export function Status({ label, tone = 'neutral', dot = true }: StatusProps) {
  return (
    <span className={`ui-status ui-status--${tone}`}>
      {dot && <span className="ui-status__dot" aria-hidden="true" />}
      {label}
    </span>
  );
}

