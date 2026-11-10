import React from 'react';
import { formatAmount, censorAmount } from '@domain/money';
import type { CurrencyCode } from '@domain/money';
import './Money.css';

interface MoneyProps {
  amountMinor: number;
  currency: CurrencyCode;
  sign?: 'auto' | 'plus' | 'minus' | 'none';
  tone?: 'ink' | 'onInk' | 'danger' | 'stone';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  censored?: boolean;
  className?: string;
}

export function Money({
  amountMinor,
  currency,
  sign = 'none',
  tone = 'ink',
  size = 'md',
  censored = false,
  className = ''
}: MoneyProps) {
  const prefix = sign === 'auto' ? (amountMinor < 0 ? '−' : amountMinor > 0 ? '+' : '') : sign === 'plus' ? '+' : sign === 'minus' ? '−' : '';
  const displayAmount = censored ? censorAmount(currency) : formatAmount(Math.abs(amountMinor), currency);
  return (
    <span className={`ui-money ui-money--${size} ui-money--${tone} ${className}`}>
      {prefix && <span className="ui-money__sign" aria-hidden="true">{prefix}</span>}
      <span className="ui-money__value">{displayAmount}</span>
    </span>
  );
}
