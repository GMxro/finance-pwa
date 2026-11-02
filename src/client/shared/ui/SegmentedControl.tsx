import React, { useId } from 'react';
import './SegmentedControl.css';

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: 'true' | 'false';
  'aria-describedby'?: string;
}

export function SegmentedControl({
  value,
  onChange,
  options,
  label,
  id,
  disabled,
  className = '',
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy
}: SegmentedControlProps) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <div className={`ui-segment ${className}`} role="group" aria-label={ariaLabel || label}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            id={`${controlId}-${opt.value}`}
            className={`ui-segment__item ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
            aria-pressed={active}
            aria-disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}