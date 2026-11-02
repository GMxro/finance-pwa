import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CurrencyCode } from '@domain/money';
import { Money } from './Money';
import { IconButton } from './Button';
import { CategoryIcon } from './CategoryIcon';
import { formatDate } from '@shared/format/formatters';
import './LedgerList.css';

export interface LedgerItem {
  id: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: CurrencyCode;
  occurredOn: string;
  note?: string | null;
  categoryId: string;
  accountName?: string;
  pending?: boolean;
}

interface LedgerListProps {
  items: LedgerItem[];
  categoryName: (id: string) => string;
  categoryIcon: (id: string) => string;
  onEdit?: (item: LedgerItem) => void;
  onDelete?: (item: LedgerItem) => void;
  emptyLabel?: string;
  emptyAction?: React.ReactNode;
  censored?: boolean;
}

export function LedgerList({
  items,
  categoryName,
  categoryIcon,
  onEdit,
  onDelete,
  emptyLabel = 'Sin movimientos',
  emptyAction,
  censored = false
}: LedgerListProps) {
  if (items.length === 0) {
    return (
      <div className="ui-ledger__empty-state">
        <p className="ui-ledger__empty">{emptyLabel}</p>
        {emptyAction}
      </div>
    );
  }

  const groups = new Map<string, LedgerItem[]>();
  for (const item of items) {
    const dayItems = groups.get(item.occurredOn) ?? [];
    dayItems.push(item);
    groups.set(item.occurredOn, dayItems);
  }

  return (
    <div className="ui-ledger">
      <div className="ui-ledger__head" aria-hidden="true">
        <span />
        <span>Movimiento</span>
        <span>Monto</span>
        <span />
      </div>
      {[...groups].map(([day, dayItems]) => (
        <section className="ui-ledger__group" key={day} aria-label={formatDate(day)}>
          <h3 className="ui-ledger__day">{formatDate(day)}</h3>
          {dayItems.map(item => (
            <div
              className={`ui-ledger__row ${onEdit ? 'is-clickable' : ''}`}
              key={item.id}
              onClick={onEdit ? () => onEdit(item) : undefined}
              role={onEdit ? 'button' : undefined}
              tabIndex={onEdit ? 0 : undefined}
              onKeyDown={onEdit ? event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onEdit(item);
                }
              } : undefined}
            >
              <div className="ui-ledger__icon">
                <CategoryIcon iconKey={categoryIcon(item.categoryId)} size="sm" />
              </div>
              <div className="ui-ledger__main">
                <span className="ui-ledger__title">{item.note || categoryName(item.categoryId)}</span>
                <span className="ui-ledger__sub">
                  {categoryName(item.categoryId)}
                  {item.accountName && <><span className="ui-ledger__dot" aria-hidden="true">·</span>{item.accountName}</>}
                  {item.pending && <span className="ui-ledger__pending" aria-label="Pendiente de sincronización">Pendiente</span>}
                </span>
              </div>
              <div className="ui-ledger__amount">
                <Money
                  amountMinor={item.amountMinor}
                  currency={item.currency}
                  sign={item.kind === 'income' ? 'plus' : 'minus'}
                  size="sm"
                  censored={censored}
                />
              </div>
              <div className="ui-ledger__actions" onClick={event => event.stopPropagation()}>
                {onEdit && (
                  <IconButton label="Editar movimiento" size="sm" onClick={() => onEdit(item)}>
                    <Pencil size={16} />
                  </IconButton>
                )}
                {onDelete && (
                  <IconButton label="Eliminar movimiento" size="sm" tone="danger" onClick={() => onDelete(item)}>
                    <Trash2 size={16} />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}