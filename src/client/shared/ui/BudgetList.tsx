import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CurrencyCode } from '@domain/money';
import { Money } from './Money';
import { Progress } from './Progress';
import { CategoryIcon } from './CategoryIcon';
import { IconButton } from './Button';
import { Status } from './Status';
import './BudgetList.css';

export interface BudgetItem {
  id: string;
  categoryId: string;
  currency: CurrencyCode;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  isOverBudget: boolean;
}

interface BudgetListProps {
  items: BudgetItem[];
  categoryName: (id: string) => string;
  categoryIcon: (id: string) => string;
  onEdit?: (item: BudgetItem) => void;
  onDelete?: (item: BudgetItem) => void;
  onSelect?: (item: BudgetItem) => void;
  compact?: boolean;
  emptyLabel?: string;
  emptyAction?: React.ReactNode;
  censored?: boolean;
}

export function BudgetList({
  items,
  categoryName,
  categoryIcon,
  onEdit,
  onDelete,
  onSelect,
  compact = false,
  emptyLabel = 'Sin presupuestos para este mes',
  emptyAction,
  censored = false
}: BudgetListProps) {
  if (items.length === 0) {
    return (
      <div className="ui-budgets__empty-state">
        <p className="ui-budgets__empty">{emptyLabel}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={`ui-budgets ${compact ? 'ui-budgets--compact' : ''}`}>
      {items.map(item => {
        const progress = item.limitMinor > 0 ? (item.spentMinor / item.limitMinor) * 100 : 0;
        return (
          <div className={`ui-budget ${item.isOverBudget ? 'is-over' : ''}`} key={item.id}>
            <div className="ui-budget__top">
              <div className="ui-budget__identity">
                {onSelect ? (
                  <button type="button" className="ui-budget__select" onClick={() => onSelect(item)}>
                    <CategoryIcon iconKey={categoryIcon(item.categoryId)} size="sm" />
                    <span className="ui-budget__name">{categoryName(item.categoryId)}</span>
                    {item.isOverBudget && <Status label="Excedido" tone="danger" />}
                  </button>
                ) : <CategoryIcon iconKey={categoryIcon(item.categoryId)} size="sm" />}
                {!onSelect && <div className="ui-budget__name">
                  <span>{categoryName(item.categoryId)}</span>
                  {!compact && (
                    <Status
                      label={item.isOverBudget ? 'Excedido' : 'En rango'}
                      tone={item.isOverBudget ? 'danger' : 'neutral'}
                    />
                  )}
                </div>}
              </div>
              <div className="ui-budget__amounts">
                <Money amountMinor={item.spentMinor} currency={item.currency} size="sm" censored={censored} />
                <span className="ui-budget__limit">
                  de <Money amountMinor={item.limitMinor} currency={item.currency} size="sm" tone="stone" censored={censored} />
                </span>
              </div>
            </div>
            <Progress value={progress} tone={item.isOverBudget ? 'danger' : 'ink'} label={`${categoryName(item.categoryId)}: ${Math.round(progress)}%`} />
            <div className="ui-budget__foot">
              {item.isOverBudget ? (
                <span className="ui-budget__over">
                  Excedido por <Money amountMinor={Math.abs(item.remainingMinor)} currency={item.currency} size="sm" tone="danger" censored={censored} />
                </span>
              ) : (
                <span>
                  Disponible <Money amountMinor={item.remainingMinor} currency={item.currency} size="sm" tone="stone" censored={censored} />
                </span>
              )}
              {!compact && (onEdit || onDelete) && (
                <div className="ui-budget__actions">
                  {onEdit && (
                    <IconButton label="Editar presupuesto" size="sm" onClick={() => onEdit(item)}>
                      <Pencil size={16} />
                    </IconButton>
                  )}
                  {onDelete && (
                    <IconButton label="Eliminar presupuesto" size="sm" tone="danger" onClick={() => onDelete(item)}>
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
