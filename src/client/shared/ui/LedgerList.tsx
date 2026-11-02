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
  sourceType?: string;
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
          {dayItems.map(item => {
            const isOpening = item.sourceType === 'initial';
            const title = isOpening ? 'Saldo inicial' : item.note || categoryName(item.categoryId);
            const content = (
              <>
                <span className="ui-ledger__icon">
                  <CategoryIcon iconKey={categoryIcon(item.categoryId)} size="sm" />
                </span>
                <span className="ui-ledger__main">
                  <span className="ui-ledger__title">
                    <span className="ui-ledger__title-text">{title}</span>
                    {isOpening && <span className="ui-ledger__badge">Apertura</span>}
                  </span>
                  <span className="ui-ledger__sub">
                    {isOpening ? (
                      item.accountName ?? ''
                    ) : (
                      <>
                        {categoryName(item.categoryId)}
                        {item.accountName && <><span className="ui-ledger__dot" aria-hidden="true">·</span>{item.accountName}</>}
                      </>
                    )}
                    {item.pending && <span className="ui-ledger__pending" aria-label="Pendiente de sincronización">Pendiente</span>}
                  </span>
                </span>
                <span className="ui-ledger__amount">
                  <Money
                    amountMinor={item.amountMinor}
                    currency={item.currency}
                    sign={item.kind === 'income' ? 'plus' : 'minus'}
                    size="sm"
                    censored={censored}
                  />
                </span>
              </>
            );

            if (isOpening) {
              return (
                <div className="ui-ledger__row ui-ledger__row--opening" key={item.id}>
                  <div className="ui-ledger__open">{content}</div>
                  <div className="ui-ledger__actions" aria-hidden="true" />
                </div>
              );
            }

            return (
              <div className={`ui-ledger__row ${onEdit ? 'is-clickable' : ''}`} key={item.id}>
                {onEdit ? (
                  <button
                    type="button"
                    className="ui-ledger__open is-clickable"
                    aria-label={`Abrir ${title}`}
                    onClick={() => onEdit(item)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="ui-ledger__open">{content}</div>
                )}
                <div className="ui-ledger__actions">
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
            );
          })}
        </section>
      ))}
    </div>
  );
}
