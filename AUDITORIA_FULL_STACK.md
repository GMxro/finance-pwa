# Auditoría Full Stack — finance-pwa

Fecha: 2026-11-10. Repo: finance-pwa. Alcance: auditoría estática completa del backend (rutas, contratos, sync, seguridad, agregaciones financieras, aislamiento de ownership, fechas y propagación de errores). Sin cambios de código. 6 subagentes especializados en paralelo.

## 1. Resumen ejecutivo

- Causa raíz #1 — Contratos no son fuente única: rutas definen schemas Zod ad hoc (transactions, categories, budgets, sync, legal, commitments, calendar, account) que duplican y divergen de `src/contracts/*`. Paginación inconsistente (default 50/100, max 500) vs política (max 100, min 1, default 20).
- Causa raíz #2 — Sync engine no cumple el contrato documentado: Dexie `creating` hook envenena filas cacheadas (SYNC-01); full sync borra la tabla global en vez de particionar por userId (SYNC-02); outbox no se reconcilia (SYNC-03); idempotency key es `(user_id, operation_id)` en vez de incluir entity_type/entity_id (SYNC-08); tombstones se pierden (SYNC-09/10).
- Causa raíz #3 — Seguridad parcial: auth endpoints usan rate limit en memoria 100/min (no D1-backed 30/min); sync body limit medido en code units (bypass multibyte); deletion status polleable sin auth con solo requestId; CSP img-src más amplio que documentado.
- Causa raíz #4 — Agregaciones con umbral inconsistente: código usa `Number.MAX_SAFE_INTEGER` donde la convención exige ±999,999,999,999; `getMonthlySummary` retorna solo la primera moneda y sin manejo de overflow; cliente (summary, account totals) no filtra future-dated; backend permite editar/borrar "Apertura".
- Causa raíz #5 — Aislamiento de ownership incompleto: full sync borra tabla global; cursor global no particionado por userId; cacheServerRows busca por id global; bootstrap fallido no resetea estado previo.
- Causa raíz #6 — Fechas y errores: export CSV y Legal usan UTC para nombre de archivo; día default de recurrencia usa tz del dispositivo; sync engine no devuelve `{ok,error}` discriminado; consumidores tragan errores (AppShell, TransactionsPage loadCategories/loadAccounts).

## 2. Tabla de hallazgos por severidad

### Críticas

| ID | Área | Evidencia (archivo:línea + valor) | Problema | Impacto | Causa raíz | Corrección |
|---|---|---|---|---|---|---|
| SYNC-01 | Sync (Dexie hook) | `database.ts:67-71` hook `creating` setea `synced=false; pendingOp='create'` en todo insert; `transaction-store.ts:88-97` cacheServerRows usa `put` | Filas cacheadas del servidor se reclasifican como pending creates | Falsos pendientes, filas duplicadas/superpuestas, bloqueo de overwrites | Hook incondicional | Condicionar hook a rows sin `synced:true` o usar `db.transactions.add` con flag |
| SYNC-02 | Sync (full sync) | `sync-engine.ts:95,111,129-132` `if (firstPage) await db.transactions.clear()` | Borra transacciones de todos los usuarios antes de reinsertar las del activo | Destruye datos cacheados de otras cuentas; viola partición por userId | clear global | Filtrar delete por `userId` activo |
| SYNC-08 | Sync (idempotency) | `migrations/0001_initial.sql:139-147` PK `(user_id, operation_id)`; `sync-engine.ts:126-130` getOperation por user+operation | Idempotency key más angosta que la especificada (falta entity_type/entity_id) | Reuso entre entity types no detectable | Schema de sync_operations | Agregar columnas `entity_type`, `entity_id`; PK compuesta; actualizar getOperation |
| AGG-01 | Agregaciones | `money.ts:4` `MAX_MINOR_UNITS = Number.MAX_SAFE_INTEGER`; `:83-85` assertSafeMinorUnits solo isSafeInteger; contracts usan MAX_MINOR_UNITS | Acepta montos hasta ~9e15, lejos del límite producto ±999,999,999,999 | Guarda de rango inefectiva | Threshold incorrecto | Setear `MAX_MINOR_UNITS = 999_999_999_999` y enforce `Math.abs <=` |
| OWN-01 | Ownership | `sync-engine.ts:94-111` `db.transactions.clear()` en full sync | Borra tabla global, no solo del usuario activo | Fuga/pérdida de datos entre cuentas | clear sin filtro | Filtrar por userId |
| DATE-01 | Fechas | `SettingsPage.tsx:46` `new Date().toISOString().slice(0,10)` para nombre CSV | Fecha UTC → desfase después de 21:00 ART | Nombre de archivo con día siguiente | Default UTC | Usar `todayLocalISO()` |
| DATE-02 | Fechas | `LegalAcceptancePage.tsx:53` mismo patrón | Igual que DATE-01 | Igual | Default UTC | Usar `todayLocalISO()` |
| ERR-01 | Errores | `sync-engine.ts:59` `syncNow: Promise<void>` que lanza; `providers.tsx:109,330-342` | No devuelve `{ok,error}` discriminado | Consumidores manejan inconsistente | Contrato no implementado | Cambiar firma a `Promise<{ok, error?}>` y actualizar consumidores |

### Altas

| ID | Área | Evidencia | Problema | Impacto | Causa raíz | Corrección |
|---|---|---|---|---|---|---|
| ROUTE-01 | Rutas/contratos | `transactions.ts:25-60`, `categories.ts:18-56`, `budgets.ts:25-50`, `account.ts:17,245-273`, `sync.ts:12-16`, `legal.ts:8-12`, `commitments.ts:1-26`, `calendar.ts:1-17` | Schemas ad hoc en rutas duplican contratos | Drift de validación | Validación por endpoint | Importar schemas de `src/contracts/*` |
| ROUTE-02 | Paginación | `transaction.ts:43` default 50; `sync.ts:65` max 500 default 100; `transfers.ts:67` default 100; `client.ts:181` limit 50 | Límites fuera de política (max 100, min 1, default 20) | Respuestas grandes/inconsistentes | Defaults hardcodeados | Ajustar todos a política |
| ROUTE-05 | Contrato tx | `transactions.ts:25-34` accountId requerido vs `transaction.ts:15` opcional; `:49-58` inyecta id | Drift REST vs contrato | Rechazos inesperados | Schema local | Usar contratos directamente |
| ROUTE-09 | Transfer invariante | `transfer.ts:16-34` refine solo si toAmountMinor presente y monedas iguales | Validación cross-field incompleta | Bypass si contrato se usa en otros consumidores | Refine parcial | Hacer toAmountMinor requerido cuando monedas difieren; forzar igualdad |
| ROUTE-10 | Category kind | `recurring.ts:37-38`, `installments.ts:30-31` solo archived_at IS NULL; vs budgets/transactions que verifican kind | Recurring/installments no verifican kind de categoría | Puede asociarse categoría de ingreso a gasto | Checks incompletos | Agregar condición `kind = ...` |
| SYNC-03 | Outbox | `sync-engine.ts:94-140` no toca outbox; `database.ts:134-149` discardUserOutbox existe pero no se llama | Outbox no se reconcilia al usuario activo | Mutaciones huérfanas | Sin partición de outbox | Llamar discardUserOutbox en full sync |
| SYNC-04 | Outbox (create-only) | `database.ts:73-77` hook fabrica `pendingOp='update'`; `transaction-store.ts:18-59` solo savePendingCreate; `sync-engine.ts:147-190` solo actúa en 'create' | `pendingOp='update'` es estado muerto; ediciones offline de pending creates se pierden | Ediciones silenciosamente perdidas | Sin queue de update/delete | Implementar update outbox o remover el hook/misleading state |
| SYNC-05 | Tombstones | `transaction-store.ts:62-85` mergeWithCache filtra deleted solo en pending; server rows con deletedAt se mantienen; `StatisticsPage.tsx:100-113`, `OverviewPage.tsx:82-97` no filtran | Movimientos eliminados reaparecen en listas/agregaciones | Datos fantasma | Filtro incompleto | Filtrar deletedAt en todos los paths (merge, offline fallback, overview) |
| SYNC-06 | Pull overwrite | `sync-engine.ts:215-219` condición `!local || local.userId !== userId || local.synced`; sin comparación de versión | Si local unsynced (incl. false positives SYNC-01), server row se salta | Datos stale prevalecen sobre server | Sin version comparison | Agregar comparación `local.localVersion`/`tx.version` |
| SYNC-09 | Cursor/hasMore | `sync-engine.ts:424-428` `hasMore = transactions.length === limit`; tombstones query separada con mismo LIMIT | Si una página tiene menos transactions pero más tombstones, hasMore=false y tombstones restantes no se entregan | Tombstones perdidos tras borrados masivos | hasMore basado solo en transactions | Calcular hasMore sobre union o cursor separado |
| SYNC-10 | Tombstones apply | `sync-engine.ts:112-127,222-227` aplica tombstone solo si `local` existe | Tombstones de filas ausentes se ignoran | Filas eliminadas en server reaparecen localmente | Apply condicional | Aplicar tombstone (upsert con deletedAt) aunque no exista |
| AGG-03 | Agregaciones (cliente) | `summary.ts:23-25` filtra sourceType initial pero no occurred_on <= today; usado por `OverviewPage.tsx:153`, `StatisticsPage.tsx:130-135` | Cliente incluye futuros en totales | Divergencia offline vs server | Falta filtro de fecha | Agregar filtro `occurred_on <= today` en `summarizeTransactions` |
| AGG-04 | Agregaciones | `summary.ts:42` byCategoryMap setea amountMinor sin addAmounts; acumulación posterior con addAmounts | Primer entry no validado | Monto inseguro entra sin check | Seed sin validación | Validar en seed (usar addAmounts o assertSafe) |
| AGG-06 | Agregaciones (server) | `transactions.ts:327-389` queries sin catch de overflow; `:389` `return results[0]!` | Overflow D1 sin manejo; retorna solo primera moneda | Error crudo; USD ignorado | Sin manejo/retorno único | Catch → ValidationError; devolver ambos o exigir currency |
| AGG-08 | Agregaciones (backend) | `transactions.ts` updateTransaction/deleteTransaction no verifican source_type; UI bloquea initial (`LedgerList.tsx:72,108`) | "Apertura" editable/borrable vía API/sync | Cambia balances/contabilidad | Sin guard server-side | Rechazar update/delete cuando source_type='initial' |
| SEC-01 | Seguridad (auth) | `auth.ts:82-85` rateLimit window 60 max 100; Better Auth storage memory default (`create-context.mjs:170-175`); sin middleware app en authRoutes | Auth rate limit en memoria, no D1-backed; 100/min vs 30/min documentado | Brute-force más fácil; no compartido entre isolates | Config inadecuada | App-level D1-backed per-IP rate limit en /api/auth/*; alinear 30/min |
| SEC-02 | Seguridad (body) | `sync.ts:45-52` rechaza `text.length > 256*1024`; `body-limit.ts` cap 1 MiB | Límite Sync medido en code units, bypass multibyte | Body hasta 1 MiB | Medición incorrecta | Medir bytes (`TextEncoder().encode(text).byteLength`) |
| OWN-02 | Ownership | `database.ts:95-101` getSyncMeta/setSyncMeta id fijo 'sync-meta'; `sync-engine.ts:42-43,192-194,229` | Cursor global no particionado por userId | Cursor reutilizado entre cuentas | Storage global | Particionar por userId (key compuesta) |
| OWN-03 | Ownership | `transaction-store.ts:88-96` cacheServerRows `db.transactions.get(row.id)` global | Decisión de preservar pending y put basada en id global | Colisión de id entre cuentas | Búsqueda global | Filtrar por userId en get |
| OWN-05 | Ownership | `sync-engine.ts:114-119,123-127,131,210-217,223-225` `db.transactions.get(tx.id)` sin filtro userId | put puede reemplazar fila de otro usuario | Fuga de datos | Búsqueda global | Filtrar por userId en todas las búsquedas |
| OWN-06 | Ownership | `providers.tsx:160-172` catch no resetea defaultCurrency/onboarding/legalAcceptance | Estado previo persiste si bootstrap falla | UI stale entre usuarios | Reset incompleto | Resetear estados en catch |
| DATE-03 | Fechas | `TransactionsPage.tsx:121,132` `1 << new Date().getDay()` | Día default por tz del dispositivo | Desfase | Default por dispositivo | Derivar de `todayLocalISO()` |
| DATE-04 | Fechas | `domain/date.ts:17-19` `new Date(locString)` interpretado por tz del host | nowInArgentina frágil fuera de host UTC/AR | todayLocalISO roto en otros hosts | Interpretación por host | Usar Intl.DateTimeFormat con timeZone |
| ERR-02 | Errores | `AppShell.tsx:86` `void syncNow().catch(() => undefined)` | Traga error del botón de sync | Usuario no ve por qué falló | catch vacío | Mostrar syncState.error o usar el error lanzado |
| ERR-03 | Errores | `TransactionsPage.tsx:233-243` loadCategories/loadAccounts `if (!response.error)` sin else | Listas vacías sin error/retry | Sin feedback | Error tragado | Setear error y permitir retry |
| ERR-04 | Errores | `SettingsPage.tsx:68-75` catch lee syncState.pendingCount del closure | Mensaje puede usar pendingCount viejo | Mensaje incorrecto | Closure stale | Usar error lanzado o syncState.error |

### Medias

| ID | Área | Evidencia | Problema | Impacto | Causa raíz | Corrección |
|---|---|---|---|---|---|---|
| ROUTE-03 | Rutas | `transfers.ts:12-36` parseo manual de query; sin `transferListQuerySchema` | Sin validación tipada/compartida | Params inválidos llegan a app | Falta contrato | Crear `transferListQuerySchema` |
| ROUTE-04 | Rutas | `commitments.ts:10-26`, `calendar.ts:10-17` solo verifican presencia | Sin validación de formato/fecha | Fechas inválidas | Validación manual | Usar schemas de contracts |
| ROUTE-06 | Rutas | `budgets.ts:25-48` schemas locales | Duplica budgetCreate/Update | Drift | Schema local | Usar contratos |
| ROUTE-07 | Rutas | `categories.ts:18-56` vs `categories.ts` application ignora kind/archivedAt | Campos aceptados sin efecto | Drift semántico | Contrato más amplio | Alinear contrato/ruta/app |
| ROUTE-08 | Rutas | `transfers.ts:50-57` DELETE sin body/version | Sin concurrencia optimista | Inconsistencia | Delete no modelado | Definir schema de delete con version |
| ROUTE-11 | Rutas | `sync.ts:12-31` pullQuerySchema local max 500 default 100 | Duplicación y límite fuera de política | Paginación distinta | Query no contract-first | Usar `syncTransactionsQuerySchema` |
| ROUTE-12 | Contratos | `sync.ts:54` `z.array(z.record(z.unknown()))` | Respuesta genérica, no tipada | No valida estructura | Schema laxo | Usar transactionResponseSchema |
| ROUTE-13 | Contratos | `legal.ts:8-12` vs `legal.ts:13-17` | Schema legal duplicado | Drift | Duplicado | Usar contrato compartido |
| ROUTE-14 | Contratos | `bootstrap.ts:24-31` sin schema | Sin contrato de respuesta | Cliente depende de forma implícita | Falta contrato | Crear bootstrapResponseSchema |
| SYNC-07 | Sync | `sync-engine.ts:35-57,59-71,79-92` retorna void, solo muta state/throw | No devuelve {ok,error} | Inconsistencia de manejo | Contrato no implementado | Cambiar firma (ver ERR-01) |
| AGG-02 | Agregaciones | `money.ts:83-85` solo isSafeInteger, sin bound | Sin rango con signo | Montos fuera de ±1e12 aceptados | Sin bound | Agregar Math.abs check |
| AGG-05 | Agregaciones | `summary.ts:33,35,40` addAmounts (MAX_SAFE); `budgets.ts:9-11` safeAggregate solo isSafeInteger; `accounts.ts:14-20` safeBalance solo isSafeInteger | Umbrales usan MAX_SAFE en vez de producto | Rechazo tardío (9e15) | Threshold inconsistente | Usar ±1e12 en todos |
| AGG-07 | Agregaciones (cliente) | `AccountsPage.tsx:216-236` setError dentro de useMemo; isSafeInteger en vez de límite producto | Side effect en render; totales parciales | Render adicional + totales incorrectos | Side effect en useMemo | Mover setError a useEffect; usar límite producto |
| AGG-09 | Agregaciones | `financial-limit.ts:1-11` suma amount_minor total (sin source_type ni fecha) vs MAX_MINOR_UNITS | Capacidad medida en volumen bruto | Future tx consumen capacidad | Diseño | Considerar neto + excluir future; alinear threshold |
| SEC-03 | Seguridad | `origin-check.mjs:109-110` inferredBaseURL desde request.url cuando origin==="null" | Contradice política (mitigado por sameOriginGuard) | Riesgo residual si guard se bypassa | Better Auth fallback | Mantener guard obligatorio; documentar |
| SEC-04 | Seguridad | `account.ts:268-287` rama requestId sin sessionMiddleware | Polling de deletion status sin auth | Cualquiera con requestId pollea | Sin session en rama | Requerir session en ambas ramas o bind requestId a user |
| SEC-05 | Seguridad | `security-headers.ts` imgSrc incluye `https:` | CSP más amplio que documentado | Tracking/beaconing potencial | Policy laxa | Restringir a 'self' data: blob: |
| OWN-04 | Ownership | `database.ts:48-65` solo v1/v2; v2 upgrade limpia syncMeta/outbox | Schema v3 documentado no existe; upgrade destructivo | Clientes pre-v2 pierden outbox | Versionado inconsistente | Alinear versión y migración no destructiva |
| OWN-06 | Ownership | `providers.tsx:160-172` catch no resetea defaultCurrency/onboarding/legalAcceptance | Estado previo persiste tras bootstrap fallido | UI stale | Reset incompleto | Resetear en catch |
| DATE-04 | Fechas | `domain/date.ts:17-19` nowInArgentina interpreta string por tz del host | Frágil fuera de host UTC/AR | todayLocalISO roto | Interpretación por host | Usar Intl.DateTimeFormat timeZone |
| ERR-03 | Errores | `TransactionsPage.tsx:233-243` loadCategories/loadAccounts tragan error | Listas vacías sin feedback | Sin retry | Error tragado | Setear error + retry |
| ERR-04 | Errores | `SettingsPage.tsx:68-75` catch lee syncState.pendingCount del closure | Mensaje stale | Mensaje incorrecto | Closure stale | Usar error lanzado o syncState.error |

### Bajas

| ID | Área | Evidencia | Problema | Impacto | Causa raíz | Corrección |
|---|---|---|---|---|---|---|
| ROUTE-12 | Contratos | `sync.ts:54` respuesta genérica | Sin tipado de transacciones en respuesta | Menor | Schema laxo | Usar transactionResponseSchema |
| ROUTE-14 | Contratos | `bootstrap.ts:24-31` sin schema | Sin contrato de respuesta | Menor | Falta contrato | Crear bootstrapResponseSchema |
| AGG-09 | Agregaciones | `financial-limit.ts:1-11` (ver arriba) | Menor | Bajo | Diseño | Considerar |
| SEC-03 | Seguridad | (ver arriba) | Residual | Bajo | Better Auth fallback | Documentar |
| OWN-04 | Ownership | (ver arriba) | Menor | Bajo | Versionado | Alinear |
| DATE-05 | Fechas | `TransactionsPage.tsx:854,857` "Ayer" con toISOString sobre base UTC medianoche | Correcto pero sin helper | Bajo | Duplicación | Extraer `addDaysISO` helper |
| DATE-06 | Fechas | `recurring.ts:152,156,176,182,210` aritmética UTC consistente | Sin acción | Bajo | — | Centralizar helper (opcional) |
| DATE-07 | Fechas | `date.test.ts` no cubre todayLocalISO ni límite 21:00 | Sin protección de regresión | Bajo | Falta test | Agregar tests con reloj fijo |
| ERR-02 | Errores | `AppShell.tsx:86` catch vacío | Traga error | Bajo | catch vacío | Mostrar syncState.error |
| ERR-05 | Errores | `OverviewPage.tsx:92`, `StatisticsPage.tsx:105` `.catch(() => [])` | Cache-read silencioso | Bajo | Best-effort | Loguear para diagnóstico |
| OWN-06 | Ownership | (ver arriba) | Bajo | Bajo | Reset incompleto | Resetear en catch |

## 3. Lo que NO está mal (verificado)

- Same-origin: `same-origin.ts:1-33` compara Origin solo contra `BETTER_AUTH_URL`; tests 3/3 pass.
- Rate limits D1-backed: `consumeRateLimit` (`rate-limit.ts:50-68`); sync push 20/min, mutations 60/min, reads 180/min (`rate-limit.ts:8-10`); deletion status 30/min per IP (`rate-limit.ts:31-42`).
- Body limit API 1 MiB (`body-limit.ts`, test pass); max 50 ops/batch (`sync.ts`).
- Better Auth: `user.deleteUser.enabled=false` (`auth.ts:25`); built-in delete-user returns not-found; OAuth tokens stripped (`auth.ts:42-78`); `updateAccountOnSignIn:false` (`auth.ts:38`).
- CSRF: cookies `sameSite:"lax"` (better-auth default); app same-origin guard en /api/*.
- Budget `spentMinor` computado server-side vía SQL SUM con `excludeInitialSql` y `occurred_on <= today`; ambos listBudgets y getBudgetWithSpent lo usan; contratos no aceptan spentMinor (`budgets.ts:55-79,161-189`, `budget.ts:6-15`).
- Transfers en tabla separada, excluidos de income/expense (`getMonthlySummary` no consulta transfers).
- Account balances incluyen initial + transfers y filtran `occurred_on <= today` (`accounts.ts`).
- `todayLocalISO()` usado correctamente en Overview, Transactions, Accounts, Calendar, Commitments, Statistics, Budgets.
- `isValidISODate`/`parseDateStrict` valida fechas reales de calendario; contratos zod rechazan fechas imposibles.
- Pages con fallback a caché propagan error de fetch para mostrar retry (Overview, Transactions, Statistics).
- `MIN_APP_VERSION` configurado en `wrangler.jsonc:37` ("0.1.2"), middleware bloquea clientes antiguos (`minimum-app-version.ts:22-43`). Nota: `/api/auth/*` exentas (`:26`).

## 4. Notas de verificación y gaps

- Backend/sync/seguridad/agregaciones: auditados estáticamente; no se ejecutaron tests de integración contra D1 remoto ni carga concurrente.
- React DOM tests: no existen (gap crítico; F-01 render loop no capturado).
- `user.deleteUser` de Better Auth deshabilitado; verificar que `/api/account/delete` saga cubre todos los casos (no auditado en profundidad aquí).
- Dexie schema v3 documentado no existe en código (solo v1/v2); verificar estado remoto/local antes de deploy de migración.

---

*Informe de Fase 2 (full stack). Fase 3 (fixes) pendiente de acuerdo con el usuario.*
