import React, { useId, forwardRef } from 'react';
import { Field } from './Field';
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

export const Input = forwardRef<HTMLInputElement, InputProps>(({
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
}, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const prefixWidth = prefix ? Math.max(28, 14 + prefix.length * 9) : undefined;

  return (
    <Field
      label={label}
      error={error}
      helperText={helperText}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      <div
        className="ui-field__input-wrap"
        style={prefixWidth !== undefined ? ({ '--prefix-w': `${prefixWidth}px` } as React.CSSProperties) : undefined}
      >
        {prefix && <span className="ui-field__prefix" aria-hidden="true">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`ui-field__input ${prefix ? 'ui-field__input--with-prefix' : ''} ${error ? 'ui-field__input--error' : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          {...props}
        />
        {rightIcon && <span className="ui-field__icon ui-field__icon--right" aria-hidden="true">{rightIcon}</span>}
      </div>
    </Field>
  );
});

Input.displayName = 'Input';
