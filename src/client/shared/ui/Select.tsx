import React, { useId, useRef, useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SegmentedControl } from './SegmentedControl';
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

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null);
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const searchId = useId();

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = searchable ? searchRef.current : closeRef.current;
    (target ?? contentRef.current)?.focus();
  }, [open, searchable]);

  // Restaurar el overflow solo si este sheet lo bloqueó (si ya estaba en
  // 'hidden' es porque hay un Modal abierto y su efecto es el dueño).
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const wasLocked = body.style.overflow === 'hidden';
    const previousOverflow = body.style.overflow;
    if (!wasLocked) body.style.overflow = 'hidden';
    return () => {
      if (!wasLocked) body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Si el foco llegó a escaparse del sheet, el primer Tab lo devuelve adentro.
  useEffect(() => {
    if (!open) return;

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (contentRef.current?.contains(document.activeElement)) return;

      const [first] = getFocusableElements(contentRef.current);
      if (!first) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      first.focus();
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true);
  }, [open]);

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // El listener de Escape del Modal padre vive en document y en fase de
      // burbuja. Cortamos el evento en captura para que solo cierre el sheet.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    // El Modal padre escucha Tab en document y, como el sheet vive en un
    // portal, vería el foco "fuera" y lo devolvería al modal. Cortamos la
    // propagación para que el trap del sheet sea el único dueño del Tab.
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();

    const focusables = getFocusableElements(contentRef.current);
    if (focusables.length === 0) {
      event.preventDefault();
      contentRef.current?.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;

    const active = document.activeElement;
    if (!contentRef.current?.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="ui-select-sheet-overlay" onClick={onClose} role="presentation">
      <div
        ref={contentRef}
        className="ui-select-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDownCapture={handleKeyDownCapture}
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-select-sheet__header">
          <h2 id={titleId} className="ui-select-sheet__title">{title}</h2>
          <button ref={closeRef} type="button" className="ui-select-sheet__close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        {searchable && (
          <div className="ui-select-sheet__search">
            <Input
              ref={searchRef}
              id={searchId}
              aria-label="Buscar opción"
              placeholder="Buscar..."
              value={query}
              onChange={setQuery}
            />
          </div>
        )}
        {/* Semántica elegida (b): listbox + option. Los botones conservan
            Tab/Enter/Space y el trap cíclico mantiene el foco adentro. */}
        <div className="ui-select-sheet__list" role="listbox" aria-labelledby={titleId}>
          {filteredOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
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
            <div className="ui-select-sheet__empty" role="status">Sin resultados</div>
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
