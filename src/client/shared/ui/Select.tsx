import React, { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SegmentedControl } from './SegmentedControl';
import { Input } from './Input';
import { Modal } from './Modal';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: (value: string) => void;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
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
  disabled,
  value = '',
  searchable = false
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isSegmented = options.length <= 3 && !searchable;

  const handleOpenSheet = () => {
    if (disabled) return;
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const handleSelect = (newValue: string) => {
    onChange?.(newValue);
  };

  if (isSegmented) {
    // SegmentedControl expone el grupo con aria-label, pero no acepta
    // aria-required; el requisito viaja en el nombre accesible del grupo.
    const segmentedLabel = label && required ? `${label} (obligatorio)` : label;

    return (
      <div className={`ui-field ${className}`}>
        {label && (
          <span className="ui-field__label">
            {label}
            {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
          </span>
        )}
        <SegmentedControl
          id={selectId}
          value={value}
          onChange={handleSelect}
          options={options}
          disabled={disabled}
          label={segmentedLabel}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
        />
        {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
        {helperText && !error && <span id={helperId} className="ui-field__hint">{helperText}</span>}
      </div>
    );
  }

  return (
    <div className={`ui-field ${className}`}>
      {label && (
        <label htmlFor={selectId} className="ui-field__label">
          {label}
          {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        className={`ui-select-trigger ${error ? 'ui-select-trigger--error' : ''} ${disabled ? 'ui-select-trigger--disabled' : ''}`}
        onClick={handleOpenSheet}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={sheetOpen}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
      >
        <span className="ui-select-trigger__value">
          {value ? options.find(o => o.value === value)?.label : placeholder || 'Seleccionar'}
        </span>
        <ChevronDown size={18} className="ui-select-trigger__arrow" aria-hidden="true" />
      </button>
      {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
      {helperText && !error && <span id={helperId} className="ui-field__hint">{helperText}</span>}
      <Modal
        open={sheetOpen}
        onClose={handleCloseSheet}
        title={label || 'Seleccionar'}
        variant="sheet"
        size="md"
        autoFocusFirstEmpty={false}
      >
        {(searchable || options.length > 10) && (
          <div className="ui-select-sheet__search">
            <Input
              aria-label="Buscar opción"
              placeholder="Buscar..."
              value={query}
              onChange={setQuery}
            />
          </div>
        )}
        <div className="ui-select-sheet__list" role="listbox" aria-labelledby={selectId}>
          {options
            .filter(opt => opt.label.toLowerCase().includes(query.toLowerCase()))
            .map(opt => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={`ui-select-sheet__item ${value === opt.value ? 'is-selected' : ''}`}
                onClick={() => { handleSelect(opt.value); handleCloseSheet(); }}
              >
                <span>{opt.label}</span>
                {value === opt.value && <ChevronDown size={16} className="ui-select-sheet__check" />}
              </button>
            ))}
          {options.filter(opt => opt.label.toLowerCase().includes(query.toLowerCase())).length === 0 && (
            <div className="ui-select-sheet__empty" role="status">Sin resultados</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
