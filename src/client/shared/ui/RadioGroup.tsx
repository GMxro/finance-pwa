import React, { useId } from 'react';
import './RadioGroup.css';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioGroupProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  inline?: boolean;
  error?: string;
  required?: boolean;
}

export function RadioGroup({ label, value, onChange, options, inline = false, error, required }: RadioGroupProps) {
  const name = useId();
  const errorId = `${name}-error`;

  return (
    <fieldset className="ui-radio" aria-describedby={error ? errorId : undefined}>
      {label && <legend className="ui-field__label">{label}{required && <span className="ui-field__required"> *</span>}</legend>}
      <div className={`ui-radio__options ${inline ? 'ui-radio__options--inline' : ''}`}>
        {options.map(opt => {
          const checked = value === opt.value;
          return (
            <label key={opt.value} className={`ui-radio__option ${checked ? 'is-checked' : ''}`}>
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="ui-radio__input"
                required={required}
              />
              <span className="ui-radio__dot" aria-hidden="true" />
              <span className="ui-radio__text">
                <span className="ui-radio__label">{opt.label}</span>
                {opt.description && <span className="ui-radio__description">{opt.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
    </fieldset>
  );
}
