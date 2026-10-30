// Domain: Transaction invariants

import type { CurrencyCode } from './money';

export type TransactionKind = 'income' | 'expense';

export interface TransactionInput {
  id: string; // client-generated UUID
  kind: TransactionKind;
  amountMinor: number;
  currency: CurrencyCode;
  categoryId: string;
  occurredOn: string; // YYYY-MM-DD
  note?: string;
}

export interface TransactionStored extends TransactionInput {
  userId: string;
  version: number;
  changeSeq: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export function validateTransaction(input: TransactionInput): { valid: boolean; error?: string } {
  if (!input.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
    return { valid: false, error: 'ID inválido' };
  }
  if (input.kind !== 'income' && input.kind !== 'expense') {
    return { valid: false, error: 'Tipo inválido' };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { valid: false, error: 'Importe inválido' };
  }
  if (input.currency !== 'ARS' && input.currency !== 'USD') {
    return { valid: false, error: 'Moneda inválida' };
  }
  if (!input.categoryId) {
    return { valid: false, error: 'Categoría requerida' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    return { valid: false, error: 'Fecha inválida' };
  }
  if (input.note && input.note.length > 500) {
    return { valid: false, error: 'Nota demasiado larga (máx 500 caracteres)' };
  }
  return { valid: true };
}

export function isDeleted(tx: TransactionStored): boolean {
  return tx.deletedAt !== null;
}

export function canEdit(tx: TransactionStored): boolean {
  return !isDeleted(tx);
}