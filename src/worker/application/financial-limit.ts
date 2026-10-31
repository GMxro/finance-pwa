export function currencyFlowTotalSql(excludeTransaction = false): string {
  const exclusion = excludeTransaction ? 'AND id <> ?' : '';
  return `
    COALESCE((SELECT SUM(amount_minor) FROM transactions
      WHERE user_id = ? AND currency_code = ? AND deleted_at IS NULL ${exclusion}), 0)
    + COALESCE((SELECT SUM(from_amount_minor) FROM transfers
      WHERE user_id = ? AND from_currency_code = ? AND deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(to_amount_minor) FROM transfers
      WHERE user_id = ? AND to_currency_code = ? AND deleted_at IS NULL), 0)
  `;
}

export function currencyFlowBindings(userId: string, currency: string, excludedTransactionId?: string): unknown[] {
  return excludedTransactionId === undefined
    ? [userId, currency, userId, currency, userId, currency]
    : [userId, currency, excludedTransactionId, userId, currency, userId, currency];
}
