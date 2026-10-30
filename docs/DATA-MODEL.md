# Modelo de datos

## Autenticación (gestionada por Better Auth)

| Tabla | Campos principales |
|---|---|
| `user` | `id`, `name`, `email` (único), `emailVerified`, `image`, `createdAt`, `updatedAt` |
| `session` | `id`, `token` (único), `expiresAt`, `userId` → `user.id`, `ipAddress`, `userAgent`, timestamps |
| `account` | `id`, `accountId`, `providerId`, `userId`, tokens OAuth (se persisten vacíos), `password`, timestamps |
| `verification` | `id`, `identifier`, `value`, `expiresAt`, timestamps |

Las columnas usan los nombres por defecto de Better Auth. No renombrarlas sin actualizar
la configuración de la biblioteca: valida el esquema al iniciar.

## Finanzas

### `user_preferences`

`user_id` PK/FK → `user.id`, `locale` (`es-AR`), `time_zone`
(`America/Argentina/Buenos_Aires`), `default_currency` (`ARS`), `deletion_pending_at`,
`created_at`, `updated_at`.

### `categories`

`id` PK, `user_id` FK, `kind` (`income`/`expense`), `name`, `slug`,
`icon_key`, `color_token`, `sort_order`, `is_default`, `archived_at`, timestamps.
Únicos: `(user_id, slug)` y `(user_id, id)` (este último es requerido por las FK
compuestas de movimientos y presupuestos).

### `transactions`

`id` PK (UUID del cliente), `user_id`, `category_id`, `kind`, `amount_minor` (entero
positivo, centavos), `currency_code` (`ARS`/`USD`), `occurred_on` (`YYYY-MM-DD` local),
`note`, `version`, `change_seq`, `created_at`, `updated_at`, `deleted_at`.

- FK compuesta `(user_id, category_id)` → `categories(user_id, id)`.
- `id` es PK global; la propiedad se valida en cada consulta y la FK compuesta impide
  asociar una categoría de otra cuenta.
- Índices: historial por fecha, sync por `change_seq`, gasto por categoría/mes.

### `budgets`

`id`, `user_id`, `category_id`, `period_month` (`YYYY-MM`), `currency_code`,
`limit_minor`, `version`, timestamps. Único:
`(user_id, category_id, period_month, currency_code)`. Sin arrastre entre meses.

### `user_sync_state`

`user_id` PK, `sequence` entero. Se incrementa en el mismo batch que cada mutación.

### `sync_operations`

`(user_id, operation_id)` PK, `entity_id`, `request_hash`, `result`
(`applied`/`conflict`), `error_code`, `created_at`. Registra el resultado de cada operación
de sync en el mismo batch que la mutación, de modo que un reintento no vuelva a aplicarla.

## Reglas de integridad

1. **Dinero exacto**: enteros en unidades menores; prohibido `REAL`/float.
2. **Fechas locales**: `occurred_on` es fecha civil argentina; timestamps son epoch ms UTC.
3. **Propiedad**: ningún acceso financiero omite `user_id`; las FK compuestas impiden
   asociar una categoría ajena.
4. **Borrado lógico**: movimientos borrados conservan fila con `deleted_at` para producir
   tombstones; el borrado de cuenta sí elimina físicamente.
5. **Monedas separadas**: los totales y presupuestos nunca mezclan ARS y USD.

## Borrado de cuenta

1. `user_preferences.deletion_pending_at` bloquea operaciones.
2. Se escribe `deleted-users/<uuid>` en R2.
3. Se escriben markers `deleted-transactions/<uuid>/<id>` por cada movimiento.
4. Se eliminan movimientos, presupuestos, categorías, sesiones, cuentas OAuth,
   verificaciones y el usuario.

El journal R2 permite reaplicar borrados tras un restore de D1; solo contiene
identificadores seudónimos, sin email ni importes.
