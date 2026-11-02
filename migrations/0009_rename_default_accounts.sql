-- Migración 0009: Renombrar las cuentas del seed a contenedores (Efectivo, Banco, Otra cuenta).
-- Solo toca las cuentas por defecto del seed, identificadas por nombre, kind y sort_order,
-- y nunca pisa una cuenta con el nombre nuevo que el usuario ya tenga.

UPDATE accounts
SET name = 'Banco',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE name = 'Sueldo'
  AND kind = 'bank'
  AND sort_order = 2
  AND NOT EXISTS (
    SELECT 1 FROM accounts b
    WHERE b.user_id = accounts.user_id AND b.name = 'Banco'
  );

UPDATE accounts
SET name = 'Otra cuenta',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE name = 'Otros ingresos'
  AND kind = 'bank'
  AND sort_order = 3
  AND NOT EXISTS (
    SELECT 1 FROM accounts b
    WHERE b.user_id = accounts.user_id AND b.name = 'Otra cuenta'
  );
