// Condición reutilizable para excluir movimientos de saldo inicial
// de los agregados de ingresos/gastos del período.
export const INITIAL_SOURCE_TYPE = 'initial';

export function excludeInitialSql(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}source_type <> '${INITIAL_SOURCE_TYPE}'`;
}
