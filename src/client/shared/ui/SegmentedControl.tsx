import React, { useId } from 'react';
import './SegmentedControl.css';

interface Option {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label: string;
  tone?: 'light' | 'onInk';
  className?: string;
}

export function SegmentedControl({ value, onChange, options, label, tone = 'light', className = '' }: SegmentedControlProps) {
  const id = useId();
  return (
    <div className={`ui-segment ui-segment--${tone} ${className}`} role="group" aria-label={label}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            id={`${id}-${opt.value}`}
            className={`ui-segment__item ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
