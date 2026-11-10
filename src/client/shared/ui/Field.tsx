import React, { useId, forwardRef } from 'react';
import './Input.css';

export interface FieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
  /** Optional id for the error element (defaults to `${htmlFor}-error`). */
  errorId?: string;
  /** Optional id for the helper element (defaults to `${htmlFor}-helper`). */
  helperId?: string;
}

/**
 * Shared field wrapper: label + (children) + error/hint.
 * Used by Input, Select and RadioGroup to keep markup, aria wiring and
 * spacing consistent (ARCH-02).
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(({
  label,
  error,
  helperText,
  required,
  htmlFor,
  className = '',
  children,
  errorId,
  helperId
}, ref) => {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const resolvedErrorId = errorId || `${id}-error`;
  const resolvedHelperId = helperId || `${id}-helper`;

  return (
    <div ref={ref} className={`ui-field ${className}`}>
      {label && (
        <label htmlFor={id} className="ui-field__label">
          {label}
          {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error && <span id={resolvedErrorId} className="ui-field__error" role="alert">{error}</span>}
      {helperText && !error && <span id={resolvedHelperId} className="ui-field__hint">{helperText}</span>}
    </div>
  );
});

Field.displayName = 'Field';
