import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, isValidMonth } from '@domain/date';
import { getPeriodLabel } from '@shared/format/formatters';
import './MonthStepper.css';

interface MonthStepperProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthStepper({ month, onChange }: MonthStepperProps) {
  const shift = (delta: number) => {
    const next = addMonths(month, delta);
    if (next && isValidMonth(next)) onChange(next);
  };

  return (
    <div className="ui-month">
      <button type="button" className="ui-month__button" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft size={18} />
      </button>
      <span className="ui-month__label" aria-live="polite">{getPeriodLabel(month)}</span>
      <button type="button" className="ui-month__button" onClick={() => shift(1)} aria-label="Mes siguiente">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
