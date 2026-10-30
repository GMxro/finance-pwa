import React, { useId } from 'react';
import './Input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefix?: string;
  onChange?: (value: string) => void;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  prefix,
  onChange,
  className = '',
  id,
  required,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className={`ui-field ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ui-field__label">
          {label}
          {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className={`ui-field__control ${error ? 'is-invalid' : ''} ${leftIcon ? 'has-left' : ''} ${prefix ? 'has-prefix' : ''}`}>
        {leftIcon && <span className="ui-field__icon" aria-hidden="true">{leftIcon}</span>}
        {prefix && <span className="ui-field__prefix" aria-hidden="true">{prefix}</span>}
        <input
          id={inputId}
          className="ui-field__input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          {...props}
        />
        {rightIcon && <span className="ui-field__icon ui-field__icon--right" aria-hidden="true">{rightIcon}</span>}
      </div>
      {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
      {helperText && !error && <span id={helperId} className="ui-field__helper">{helperText}</span>}
    </div>
  );
}
