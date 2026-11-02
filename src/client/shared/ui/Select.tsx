import React, { useId, useRef, useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SegmentedControl } from './SegmentedControl';
import { Button } from './Button';
import { Input } from './Input';
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

function SelectSheet({
  open,
  onClose,
  title,
  options,
  value,
  onSelect,
  searchable = false
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: SelectOption[];
  value: string;
  onSelect: (value: string) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, searchable]);

  if (!open) return null;

  return createPortal(
    <div className="ui-select-sheet-overlay" onClick={onClose} role="presentation">
      <div
        ref={contentRef}
        className="ui-select-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-sheet-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-select-sheet__header">
          <h2 id="select-sheet-title" className="ui-select-sheet__title">{title}</h2>
          <button type="button" className="ui-select-sheet__close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        {searchable && (
          <div className="ui-select-sheet__search">
            <Input
              ref={searchRef}
              placeholder="Buscar..."
              value={query}
              onChange={setQuery}
              autoFocus
            />
          </div>
        )}
        <div className="ui-select-sheet__list">
          {filteredOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`ui-select-sheet__item ${value === opt.value ? 'is-selected' : ''}`}
              onClick={() => {
                onSelect(opt.value);
                onClose();
              }}
            >
              <span>{opt.label}</span>
              {value === opt.value && <ChevronDown size={16} className="ui-select-sheet__check" />}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="ui-select-sheet__empty">Sin resultados</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isSegmented = options.length <= 3 && !searchable;

  const handleOpenSheet = () => {
    if (disabled) return;
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    triggerRef.current?.focus();
  };

  const handleSelect = (newValue: string) => {
    onChange?.(newValue);
  };

  if (isSegmented) {
    return (
      <div className={`ui-field ${className}`}>
        {label && (
          <label className="ui-field__label">
            {label}
            {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
          </label>
        )}
        <SegmentedControl
          id={selectId}
          value={value}
          onChange={handleSelect}
          options={options}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
        />
        {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
        {helperText && !error && <span id={helperId} className="ui-field__hint">{helperText}</span>}
        <SelectSheet
          open={false}
          onClose={handleCloseSheet}
          title={label || 'Seleccionar'}
          options={options}
          value={value}
          onSelect={handleSelect}
        />
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
      <SelectSheet
        open={sheetOpen}
        onClose={handleCloseSheet}
        title={label || 'Seleccionar'}
        options={options}
        value={value}
        onSelect={handleSelect}
        searchable={searchable || options.length > 10}
      />
    </div>
  );
}