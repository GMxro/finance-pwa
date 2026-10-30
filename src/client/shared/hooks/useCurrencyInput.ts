import { useCallback, useMemo, useRef, useState } from 'react';

export interface UseCurrencyInputOptions {
  /** Código de moneda: 'ARS' | 'USD' */
  currency: 'ARS' | 'USD';
  /** Valor inicial en minor units (centavos) */
  initialValue?: number | null;
  /** Callback cuando cambia el valor numérico limpio */
  onChange?: (valueMinor: number | null) => void;
  /** Si permitir valor vacío (null) */
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
  /** Handler para onBlur - completa a 2 decimales */
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

/**
 * Hook para input de moneda con formateo en vivo argentino (es-AR).
 * 
 * Comportamiento:
 * - Mientras se tipea: formatea solo miles con punto (ej: "2.500.000")
 * - Si el usuario escribe coma: permite hasta 2 decimales (ej: "2.500.000,50")
 * - En blur: completa a 2 decimales si había coma, o deja sin decimales si no
 * - Mantiene posición del cursor inteligentemente
 * - Guarda valor limpio en minor units (centavos)
 * - Teclado numérico con coma decimal (inputMode="decimal")
 */
export function useCurrencyInput({
  currency,
  initialValue,
  onChange,
  allowEmpty = true
}: UseCurrencyInputOptions): UseCurrencyInputReturn {
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US'; // USD usa es-AR también para formato consistente
  const exponent = 2; // ARS y USD tienen 2 decimales
  
  const [displayValue, setDisplayValueState] = useState<string>('');
  const [valueMinor, setValueMinorState] = useState<number | null>(null);
  const cursorPosRef = useRef<number>(0);
  const hadCommaRef = useRef<boolean>(false);
  const isComposingRef = useRef<boolean>(false);

  // Formatear número a string con separador de miles (punto) y opcional decimales
  const formatForDisplay = useCallback((minor: number | null, forceDecimals = false): string => {
    if (minor === null || minor === undefined) return '';
    const major = Math.abs(minor) / Math.pow(10, exponent);
    
    // Verificar si tiene decimales
    const hasDecimals = minor % Math.pow(10, exponent) !== 0;
    
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: (hasDecimals || forceDecimals) ? exponent : 0,
      maximumFractionDigits: exponent,
      useGrouping: true
    }).format(major);
  }, [locale, exponent]);

  // Parsear string formateado a minor units
  const parseFromDisplay = useCallback((formatted: string): number | null => {
    if (!formatted || formatted.trim() === '') return allowEmpty ? null : 0;
    
    // Normalizar: quitar puntos de miles, reemplazar coma por punto
    const normalized = formatted.trim().replace(/\./g, '').replace(',', '.');
    
    // Validar formato
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    
    const [intPart, decPart = ''] = normalized.split('.');
    const paddedDec = (decPart + '00').slice(0, exponent);
    return parseInt(intPart + paddedDec, 10);
  }, [allowEmpty, exponent]);

  // Actualizar ambos estados
  const updateValue = useCallback((minor: number | null, display: string) => {
    setValueMinorState(minor);
    setDisplayValueState(display);
    onChange?.(minor);
  }, [onChange]);

  // Handler para onChange del input
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposingRef.current) return; // Ignorar durante composición IME
    
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart ?? rawValue.length;
    
    // Detectar si hay coma en el valor actual
    const hasComma = rawValue.includes(',');
    hadCommaRef.current = hasComma;
    
    // Guardar posición del cursor relativa al final
    const distanceFromEnd = rawValue.length - selectionStart;
    
    // Parsear a minor units
    const parsed = parseFromDisplay(rawValue);
    
    // Formatear para mostrar (sin forzar decimales mientras se tipea)
    const formatted = parsed !== null ? formatForDisplay(parsed, false) : '';
    
    // Actualizar estado
    setValueMinorState(parsed);
    setDisplayValueState(formatted);
    onChange?.(parsed);
    
    // Restaurar posición del cursor en el próximo render
    cursorPosRef.current = formatted.length - distanceFromEnd;
  }, [parseFromDisplay, formatForDisplay, onChange]);

  // Handler para onBlur - completar a 2 decimales
  const handleBlur = useCallback(() => {
    if (valueMinor !== null && valueMinor !== undefined) {
      const hasDecimals = valueMinor % 100 !== 0;
      if (hadCommaRef.current || hasDecimals) {
        // Forzar 2 decimales en display
        const formatted = formatForDisplay(valueMinor, true);
        setDisplayValueState(formatted);
      }
    }
  }, [valueMinor, formatForDisplay]);

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
  
  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    // Procesar el valor final después de composición
    const input = e.target as HTMLInputElement;
    const rawValue = input.value;
    const parsed = parseFromDisplay(rawValue);
    const formatted = parsed !== null ? formatForDisplay(parsed, false) : '';
    setValueMinorState(parsed);
    setDisplayValueState(formatted);
    onChange?.(parsed);
  }, [parseFromDisplay, formatForDisplay, onChange]);

  // Setear valor programáticamente (en minor units)
  const setValueMinor = useCallback((minor: number | null) => {
    if (minor === null || minor === undefined) {
      if (allowEmpty) {
        updateValue(null, '');
      }
      return;
    }
    const hasDecimals = minor % 100 !== 0;
    const formatted = formatForDisplay(minor, hasDecimals);
    updateValue(minor, formatted);
  }, [allowEmpty, formatForDisplay, updateValue]);

  // Setear valor desde string formateado
  const setDisplayValue = useCallback((formatted: string) => {
    const parsed = parseFromDisplay(formatted);
    const display = parsed !== null ? formatForDisplay(parsed, false) : '';
    updateValue(parsed, display);
  }, [parseFromDisplay, formatForDisplay, updateValue]);

  // Limpiar
  const clear = useCallback(() => {
    updateValue(allowEmpty ? null : 0, '');
  }, [allowEmpty, updateValue]);

  // Inicializar con valor inicial
  const initialized = useRef(false);
  if (!initialized.current && initialValue !== undefined) {
    initialized.current = true;
    if (initialValue !== null && initialValue !== 0) {
      const hasDecimals = initialValue % 100 !== 0;
      const formatted = formatForDisplay(initialValue, hasDecimals);
      setValueMinorState(initialValue);
      setDisplayValueState(formatted);
    }
  }

  // Handler para onChange que acepta string directamente (compatibilidad con Input component)
  const handleChangeString = useCallback((value: string) => {
    // Simular un evento para reutilizar la lógica de handleChange
    const mockEvent = {
      target: { value },
      currentTarget: { value }
    } as React.ChangeEvent<HTMLInputElement>;
    handleChange(mockEvent);
  }, [handleChange]);

  // Props para spread en el input
  const inputProps = useMemo(() => ({
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
  }), [displayValue, handleChange, handleBlur, handleFocus, handleCompositionStart, handleCompositionEnd]);

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