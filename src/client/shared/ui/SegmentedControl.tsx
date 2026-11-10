import React, { useId, useRef } from 'react';
import './SegmentedControl.css';

import { ChoiceOption } from './choice';

export type SegmentedOption = ChoiceOption;

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
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = options.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = options[nextIndex];
    if (next) {
      onChange(next.value);
      const btn = containerRef.current?.querySelector<HTMLButtonElement>(`#${controlId}-${next.value}`);
      btn?.focus();
    }
  };

  return (
    <div className={`ui-segment ${className}`} role="group" aria-label={ariaLabel || label} ref={containerRef}>
      {options.map((opt, index) => {
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
            tabIndex={active ? 0 : -1}
            onClick={() => !disabled && onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}