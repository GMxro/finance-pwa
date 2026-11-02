import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type CurrencyCode = 'ARS' | 'USD';

export interface CurrencyInputParseResult {
  /** Valor listo para mostrar en el input (miles con punto, coma decimal) */
  display: string;
  /** Valor en minor units (centavos), null si el input está vacío */
  valueMinor: number | null;
  /** Si el usuario escribió un separador decimal */
  hadDecimal: boolean;
}

export interface UseCurrencyInputOptions {
  /** Código de moneda: 'ARS' | 'USD' */
  currency: CurrencyCode;
  /** Valor inicial en minor units (centavos) */
  initialValue?: number | null;
  /** Callback cuando cambia el valor numérico limpio */
  onChange?: (valueMinor: number | null) => void;
  /**
   * Se conserva por compatibilidad. El vacío siempre vale null, nunca 0.
   */
  allowEmpty?: boolean;
}

export interface UseCurrencyInputReturn {
  /** Valor formateado para mostrar en el input (ej: "2.500.000" o "2.500.000,50") */
  displayValue: string;
  /** Valor numérico limpio en minor units (centavos), null si vacío */
  valueMinor: number | null;
  /** Handler para onChange del input (evento React estándar) */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Handler para onChange que acepta string directamente (compatibilidad con Input component) */
  onChangeString: (value: string) => void;
  /** Handler para onBlur - completa a 2 decimales si hubo separador */
  onBlur: () => void;
  /** Handler para onFocus - selecciona todo el texto */
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Setear valor programáticamente (en minor units) */
  setValueMinor: (value: number | null) => void;
  /** Setear valor desde string formateado */
  setDisplayValue: (value: string) => void;
  /** Resetear a vacío */
  clear: () => void;
  /** Props para spread directamente en el <input> */
  inputProps: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
    onCompositionStart: () => void;
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void;
    inputMode: 'decimal';
    pattern: string;
    autoComplete: string;
    autoCorrect: string;
    autoCapitalize: 'off';
    spellCheck: boolean;
  };
}

const DECIMAL_DIGITS = 2;

function groupThousands(digits: string): string {
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Convierte lo que el usuario tipeó en un valor mostrable y en centavos.
 *
 * Reglas del separador decimal:
 * - La coma siempre es decimal (formato es-AR). "2500," -> decimal incompleto,
 *   no se borra el campo; "2500,5" -> 250050.
 * - El punto es decimal si le siguen 0 a 2 dígitos ("100.50" -> 10050); con 3
 *   o más dígitos es separador de miles ("2.500" -> 250000).
 * - Más de 2 decimales se recortan a 2, para que tipear sobre un valor ya
 *   completado no lo multiplique por 1000.
 * - El vacío siempre devuelve null (nunca 0).
 */
export function parseCurrencyInput(raw: string, _currency: CurrencyCode): CurrencyInputParseResult {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) {
    return { display: '', valueMinor: null, hadDecimal: false };
  }

  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let integerDigits: string;
  let decimalDigits = '';
  let hadDecimal = false;

  if (lastSeparator === -1) {
    integerDigits = cleaned;
  } else {
    const tail = cleaned.slice(lastSeparator + 1);
    const isDecimalSeparator = cleaned[lastSeparator] === ',' || tail.length <= DECIMAL_DIGITS;
    if (isDecimalSeparator) {
      hadDecimal = true;
      integerDigits = cleaned.slice(0, lastSeparator).replace(/[.,]/g, '');
      decimalDigits = tail.slice(0, DECIMAL_DIGITS);
    } else {
      integerDigits = cleaned.replace(/[.,]/g, '');
    }
  }

  if (integerDigits === '') integerDigits = '0';
  const paddedDecimals = (decimalDigits + '00').slice(0, DECIMAL_DIGITS);
  const valueMinor = Number.parseInt(integerDigits, 10) * 100 + Number.parseInt(paddedDecimals, 10);

  return {
    display: groupThousands(integerDigits) + (hadDecimal ? `,${decimalDigits}` : ''),
    valueMinor,
    hadDecimal
  };
}

/**
 * Formatea minor units para mostrar. ARS y USD comparten locale es-AR
 * (punto de miles, coma decimal).
 */
export function formatCurrencyInput(
  minor: number | null | undefined,
  _currency: CurrencyCode,
  forceDecimals = false
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '';
  const hasDecimals = minor % 100 !== 0;
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: hasDecimals || forceDecimals ? DECIMAL_DIGITS : 0,
    maximumFractionDigits: DECIMAL_DIGITS,
    useGrouping: true
  }).format(Math.abs(minor) / 100);
}

interface PendingCaret {
  element: HTMLInputElement;
  position: number;
}

function caretPosition(
  raw: string,
  selectionStart: number,
  display: string,
  hadDecimal: boolean
): number {
  const beforeCaret = raw.slice(0, selectionStart);
  const digitCount = beforeCaret.replace(/\D/g, '').length;
  const lastSeparator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  const decimalBeforeCaret = hadDecimal && lastSeparator >= 0 && lastSeparator < selectionStart;
  const significant = digitCount + (decimalBeforeCaret ? 1 : 0);
  if (significant <= 0) return 0;

  let seen = 0;
  for (let index = 0; index < display.length; index += 1) {
    const char = display[index]!;
    if ((char >= '0' && char <= '9') || char === ',') {
      seen += 1;
      if (seen >= significant) return index + 1;
    }
  }
  return display.length;
}

/**
 * Hook para input de moneda con formateo en vivo argentino (es-AR).
 *
 * Comportamiento:
 * - Mientras se tipea: agrupa miles con punto (ej: "2.500.000")
 * - Acepta coma o punto como decimal si es el último separador con 1-2 dígitos
 * - Un separador decimal incompleto no borra el campo ("2500," -> "2.500,")
 * - En blur: completa a 2 decimales si hubo separador
 * - Restaura el cursor cuando se edita en el medio del valor
 * - Guarda valor limpio en minor units (centavos)
 * - Teclado numérico con coma decimal (inputMode="decimal")
 */
export function useCurrencyInput({
  currency,
  initialValue,
  onChange
}: UseCurrencyInputOptions): UseCurrencyInputReturn {
  const [displayValue, setDisplayValueState] = useState<string>('');
  const [valueMinor, setValueMinorState] = useState<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingCaretRef = useRef<PendingCaret | null>(null);
  const hadDecimalRef = useRef<boolean>(false);
  const isComposingRef = useRef<boolean>(false);
  const lastEmittedRef = useRef<number | null | undefined>(undefined);

  const emitChange = useCallback((minor: number | null) => {
    if (lastEmittedRef.current === minor) return;
    lastEmittedRef.current = minor;
    onChangeRef.current?.(minor);
  }, []);

  const commitParsed = useCallback(
    (raw: string, element?: HTMLInputElement | null, selectionStart?: number) => {
      const parsed = parseCurrencyInput(raw, currency);
      hadDecimalRef.current = parsed.hadDecimal;
      setValueMinorState(parsed.valueMinor);
      setDisplayValueState(parsed.display);
      emitChange(parsed.valueMinor);

      if (element && selectionStart !== undefined && selectionStart < raw.length) {
        pendingCaretRef.current = {
          element,
          position: caretPosition(raw, selectionStart, parsed.display, parsed.hadDecimal)
        };
      }
    },
    [currency, emitChange]
  );

  // Restaurar el cursor después de que React pinta el valor formateado.
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    pendingCaretRef.current = null;
    if (document.activeElement === pending.element) {
      pending.element.setSelectionRange(pending.position, pending.position);
    }
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isComposingRef.current) return; // Ignorar durante composición IME
      const input = e.target;
      const selectionStart = input.selectionStart ?? input.value.length;
      commitParsed(input.value, input, selectionStart);
    },
    [commitParsed]
  );

  const handleChangeString = useCallback(
    (value: string) => {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const element = active instanceof HTMLInputElement ? active : null;
      const selectionStart = element?.selectionStart ?? value.length;
      commitParsed(value, element, selectionStart);
    },
    [commitParsed]
  );

  // Completar a 2 decimales si el usuario escribió separador decimal.
  const handleBlur = useCallback(() => {
    if (valueMinor === null) return;
    if (hadDecimalRef.current || valueMinor % 100 !== 0) {
      setDisplayValueState(formatCurrencyInput(valueMinor, currency, true));
    }
  }, [valueMinor, currency]);

  // Handler para onFocus - seleccionar todo
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // Seleccionar todo el texto para facilitar reemplazo
    window.setTimeout(() => {
      e.target.select();
    }, 0);
  }, []);

  // Handler para composition events (IME, teclado móvil)
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      const input = e.target as HTMLInputElement;
      commitParsed(input.value);
    },
    [commitParsed]
  );

  // Setear valor programáticamente (en minor units)
  const setValueMinor = useCallback(
    (minor: number | null) => {
      if (minor === null || minor === undefined) {
        hadDecimalRef.current = false;
        setValueMinorState(null);
        setDisplayValueState('');
        return;
      }
      const hasDecimals = minor % 100 !== 0;
      hadDecimalRef.current = hasDecimals;
      setValueMinorState(minor);
      setDisplayValueState(formatCurrencyInput(minor, currency, hasDecimals));
    },
    [currency]
  );

  // Setear valor desde string formateado
  const setDisplayValue = useCallback(
    (formatted: string) => {
      commitParsed(formatted);
    },
    [commitParsed]
  );

  // Limpiar
  const clear = useCallback(() => {
    hadDecimalRef.current = false;
    setValueMinorState(null);
    setDisplayValueState('');
    emitChange(null);
  }, [emitChange]);

  // Inicializar con valor inicial
  const initialized = useRef(false);
  if (!initialized.current && initialValue !== undefined) {
    initialized.current = true;
    if (initialValue !== null && initialValue !== 0) {
      const hasDecimals = initialValue % 100 !== 0;
      hadDecimalRef.current = hasDecimals;
      setValueMinorState(initialValue);
      setDisplayValueState(formatCurrencyInput(initialValue, currency, hasDecimals));
      lastEmittedRef.current = initialValue;
    }
  }

  // Props para spread en el input
  const inputProps = useMemo(
    () => ({
      value: displayValue,
      onChange: handleChange,
      onBlur: handleBlur,
      onFocus: handleFocus,
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      inputMode: 'decimal' as const,
      pattern: '[0-9.,]*',
      autoComplete: 'off',
      autoCorrect: 'off',
      autoCapitalize: 'off' as const,
      spellCheck: false
    }),
    [displayValue, handleChange, handleBlur, handleFocus, handleCompositionStart, handleCompositionEnd]
  );

  return {
    displayValue,
    valueMinor,
    onChange: handleChange,
    onChangeString: handleChangeString,
    onBlur: handleBlur,
    onFocus: handleFocus,
    setValueMinor,
    setDisplayValue,
    clear,
    inputProps
  };
}
