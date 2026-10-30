import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: (value: string) => void;
}

export function Select({
  label,
  error,
  helperText,
  options,
  placeholder,
  onChange,
  className = '',
  id,
  required,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  return (
    <div className={`ui-field ${className}`}>
      {label && (
        <label htmlFor={selectId} className="ui-field__label">
          {label}
          {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className={`ui-field__control ui-select ${error ? 'is-invalid' : ''}`}>
        <select
          id={selectId}
          className="ui-field__input ui-select__input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={18} className="ui-select__arrow" aria-hidden="true" />
      </div>
      {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
      {helperText && !error && <span id={helperId} className="ui-field__helper">{helperText}</span>}
    </div>
  );
}
