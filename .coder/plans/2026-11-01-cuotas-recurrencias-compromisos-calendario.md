# Implementation Plan: Cuotas, Movimientos Recurrentes, Compromisos y Calendario Financiero

**Fecha:** 2026-11-01 (revisado)  
**Proyecto:** finance-pwa  
**Estado:** Aprobado por el usuario (2026-11-01)  
**Restricción operativa:** No ejecutar pruebas, builds, navegadores ni simulaciones. Verificación por inspección estática.

---

## 1. Objetivo y criterio de éxito

Incorporar a Finanzas cuatro capacidades nuevas, reutilizando la arquitectura existente (Worker + D1 + React + Dexie):

1. **Compras en cuotas**: registrar un gasto de monto total en N cuotas mensuales (N de hasta 3 dígitos). **Todos los movimientos se generan en el momento del registro**, cada uno con su fecha futura e identificación `Concepto (i/N)`. Las cuotas futuras no descuentan el saldo actual ni distorsionan resúmenes del período actual.
2. **Movimientos recurrentes**: configurar ingresos/gastos que se repiten según una lista amplia de frecuencias, con modificación, cancelación y fecha de finalización opcional. No se generan indefinidamente movimientos futuros sin fecha de finalización.
3. **Automatización con Cloudflare Cron (free tier)**: los movimientos recurrentes se registran automáticamente aunque el usuario no abra la app, con manejo de ejecuciones atrasadas, interrupciones y prevención de duplicados.
4. **Compromisos y calendario**: consultar cuotas pendientes, recurrencias activas, próximos vencimientos e importes comprometidos; calendario mensual navegable que distingue visualmente movimientos actuales de previstos.

**Criterio de éxito global:** un usuario puede crear una compra en cuotas y una recurrencia desde el formulario habitual, ver las cuotas futuras sin afectar saldos actuales, recibir recurrencias auto-registradas por cron, consultar compromisos y navegar el calendario, sin romper cálculos existentes (totales, presupuestos, saldos, sync).

---

## 2. Decisiones y restricciones vigentes

### 2.1 Reutilización de la arquitectura existente

- **Fuente de verdad sigue siendo D1.** IndexedDB/Dexie sigue siendo caché y cola de altas manuales; las nuevas entidades son online-only, consistente con ADR-0003.
- **Cuotas no usan proceso programado:** se materializan como `transactions` normales en el momento de creación, con `occurred_on` futuro. Reutilizan totales, presupuestos, sync y tombstones sin código nuevo de generación.
- **Recurrencias sí usan cron:** solo se materializa la ocurrencia vencida; las futuras se proyectan virtualmente para calendario/compromisos.

### 2.2 Distinción de movimientos futuros

- Un movimiento es **futuro/previsto** si `occurred_on > hoy (Argentina)`. No se agrega columna de estado: se deriva de la fecha, igual que los filtros por período ya existentes.
- **Saldos (`balancesByAccount`)** deben excluir movimientos con `occurred_on > hoy`. Es el único cálculo all-time; el resto (resúmenes mensuales, presupuestos, estadísticas) ya filtra por período y no se ve afectado.
- **Totales mensuales/presupuestos/estadísticas** no cambian: solo incluyen movimientos del período consultado. Las cuotas futuras aparecerán automáticamente en su mes correspondiente cuando se consulte ese mes.

### 2.3 Frecuencias de recurrencia (V1 completo según captura)

`never`, `daily`, `weekly_days`, `weekend`, `weekly`, `biweekly`, `four_weekly`, `monthly`, `month_end`, `bimonthly`, `trimonthly`, `fourmonthly`, `sixmonthly`, `yearly`.

Se almacena como enum `frequency` + campos auxiliares (`day_of_month`, `days_of_week` bitmask, `month_of_year` según corresponda). V1 implementa todas las opciones listadas.

### 2.4 Cuotas: generación anticipada

- Al crear el plan, se insertan N filas en `transactions` en un mismo batch, una por cuota, con `occurred_on` = primer vencimiento + (i-1) meses (clamp a fin de mes), `note = "Concepto (i/N)"`, `source_type='installment'`, `source_id=item.id`.
- Importes distribuidos exactamente: `base = floor(total/n)` centavos, primeras `total % n` cuotas reciben +1 centavo.
- **Secuencia de sync:** dentro del mismo batch/transacción de D1 se lee la secuencia actual del usuario, se inserta cada cuota con `change_seq = secuencia_base + i` y se actualiza `user_sync_state` una sola vez con `sequence = secuencia_base + N`. Así cada cuota tiene su propia secuencia y el pull por `change_seq` las trae todas.
- Se crea `installment_items` para tracking de estado (posted/cancelled) y vinculación con `transaction_id`. El item queda `posted` con `transaction_id` al momento de creación. Esto simplifica sync (son transacciones normales) y calendario (ya están en DB).
- Edición de cuotas futuras individuales: se permite modificar importe, fecha y concepto con versionado optimista; las cuotas ya vencidas no se editan.
- Cancelación de una cuota futura = soft delete de la transacción + marcar item `cancelled`.

### 2.5 Recurrencias: generación diferida

- Al crear la regla, **no** se generan movimientos futuros. Solo se guarda `next_due_on`.
- Cloudflare Cron (diario, free tier) ejecuta `processDueRecurring` para todos los usuarios con reglas activas: por cada regla con `next_due_on <= hoy`, crea la ocurrencia + transacción, avanza `next_due_on` según frecuencia, hasta `end_on` o hoy.
- Ejecuciones atrasadas: procesa todas las ocurrencias vencidas en una sola corrida, con tope por ejecución (ej. 500) para respetar CPU time del plan gratuito; las restantes se procesan en la siguiente corrida.
- Prevención de duplicados: la unicidad `(rule_id, due_on)` en `recurring_occurrences` es la garantía atómica. En cada ocurrencia se inserta la transacción y luego la ocurrencia en el mismo batch de D1; si la segunda falla por conflicto único, todo el batch se revierte y se trata como ya procesada. El `SELECT` previo queda solo como optimización, no como seguridad.

### 2.6 Compromisos y calendario

- **Compromisos:** cuotas futuras (transacciones source_type='installment' con occurred_on > hoy) + recurrencias activas proyectadas (virtuales) + total previsto por moneda.
- **Calendario:** agrupa por día las transacciones (actuales y futuras) + ocurrencias proyectadas de recurrencias. Distinción visual por `occurred_on > hoy`.
- Horizonte de proyección recurrente: 12 meses (configurable, máx 24) para calendario/compromisos, sin persistir.

### 2.7 Automatización Cloudflare (free tier)

- Usar **Cron Triggers** (incluidos en el plan gratuito de Workers) con `crons = ["0 6 * * *"]` (diario, 03:00 hora de Argentina / 06:00 UTC). No servicios pagos.
- Handler `scheduled` en el Worker reutiliza `processDueRecurring`.
- D1 free tier: consultas limitadas pero suficientes para volúmenes personales. Procesar por lotes y manejar errores por usuario sin abortar toda la corrida.
- El procesamiento también se invoca lazy al abrir la app (fallback si cron falla).

### 2.8 UX

- Desde el formulario habitual de movimientos: toggle "En cuotas" (campos: cantidad de cuotas, primer vencimiento) y toggle "Recurrente" (selector de frecuencia, fecha de inicio, fecha de fin opcional). Un movimiento no puede ser cuota y recurrente a la vez.

---

## 3. Referencias al sistema (archivos relevantes)

| Archivo | Rol en este trabajo |
|---|---|
| `src/worker/index.ts` | Registrar nuevas rutas y handler `scheduled`. |
| `src/worker/application/accounts/accounts.ts` | `balancesByAccount` (excluir futuros), `getDefaultAccountId`. |
| `src/worker/application/transactions/transactions.ts` | Creación de cuotas en batch, guardas de rango. |
| `src/worker/application/budgets/budgets.ts` | Ya filtra por período; sin cambios. |
| `src/worker/application/categories/categories.ts` | Validación de categoría activa. |
| `src/worker/application/account/delete-account.ts` | Extender borrado para nuevas tablas. |
| `src/worker/routes/bootstrap.ts` | Lazy processing de recurrentes. |
| `src/contracts/transaction.ts` | `source_type`/`source_id` en response. |
| `src/domain/date.ts` | `todayLocalISO`, `addMonths` (base para helper con día). |
| `src/client/app/App.tsx`, `navigation.ts` | Nuevas rutas/nav. |
| `src/client/shared/api/client.ts` | Nuevos métodos API. |
| `src/client/features/transactions/TransactionsPage.tsx` | Formulario unificado de cuotas/recurrencias. |
| `migrations/0001_initial.sql` … `0007` | Patrón de migraciones. |

---

## 4. Modelo de datos (migración 0008)

```sql
-- Planes de cuotas (metadata; las cuotas son transacciones)
CREATE TABLE installment_plans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  installments_count INTEGER NOT NULL CHECK (installments_count >= 2 AND installments_count <= 999),
  category_id TEXT NOT NULL,
  account_id TEXT,
  first_due_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_installment_plans_user ON installment_plans(user_id, cancelled_at);

-- Items de cuota (tracking; transacción ya existe)
CREATE TABLE installment_items (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_on TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('posted','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (plan_id, installment_number),
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);
CREATE INDEX idx_installment_items_user_due ON installment_items(user_id, due_on);
CREATE INDEX idx_installment_items_plan ON installment_items(plan_id);

-- Reglas recurrentes
CREATE TABLE recurring_rules (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  concept TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('ARS','USD')),
  category_id TEXT NOT NULL,
  account_id TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('never','daily','weekly_days','weekend','weekly','biweekly','four_weekly','monthly','month_end','bimonthly','trimonthly','fourmonthly','sixmonthly','yearly')),
  day_of_month INTEGER,
  days_of_week INTEGER,
  month_of_year INTEGER,
  start_on TEXT NOT NULL,
  end_on TEXT,
  next_due_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_recurring_rules_user_active ON recurring_rules(user_id, active, next_due_on);

-- Ocurrencias recurrentes materializadas
CREATE TABLE recurring_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('posted','cancelled','skipped')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (rule_id, due_on),
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);
CREATE INDEX idx_recurring_occurrences_user_due ON recurring_occurrences(user_id, due_on);

-- Origen en transacciones (para identificación y filtrado)
ALTER TABLE transactions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (source_type IN ('manual','installment','recurring'));
ALTER TABLE transactions ADD COLUMN source_id TEXT;
CREATE INDEX idx_transactions_user_source ON transactions(user_id, source_type, source_id);
```

---

## 5. Dominio y contratos

### 5.1 Dominio

Nuevos módulos:

- `src/domain/installment.ts`
  - `splitInstallmentAmount(totalMinor, count): number[]`
  - `installmentDueDate(firstDueOn, index): string` (suma meses con clamp a fin de mes)
  - `validateInstallmentCount(count)` (2..999)
- `src/domain/recurring.ts`
  - `RecurringFrequency` union (14 opciones)
  - `computeNextDue(frequency, current, rule): string`
  - `projectOccurrences(rule, from, to): string[]` (sin persistir, tope 12-24 meses)
  - `validateRecurringRule(input)`

### 5.2 Contratos

Nuevos archivos:

- `src/contracts/installment.ts` — create (concept, totalMinor, currency, installmentsCount, categoryId, accountId optional, firstDueOn), response (plan + items), update, cancel.
- `src/contracts/recurring.ts` — create (kind, concept, amountMinor, currency, categoryId, accountId optional, frequency, dayOfMonth, daysOfWeek, monthOfYear, startOn, endOn optional), response, update, cancel, skip.
- `src/contracts/commitment.ts` — commitment (date, kind, amountMinor, currency, label, source, sourceId, isFuture), query (from, to).

---

## 6. Worker: aplicación y rutas

### 6.1 Aplicación

- `src/worker/application/installments/installments.ts`
  - `createInstallmentPlan(env, userId, data)`: valida categoría de gasto activa y cuenta activa (o default activa si no se elige), distribuye montos, inserta plan + items + N transactions en batch con secuencias `secuencia_base + i`, actualiza `user_sync_state` a `secuencia_base + N`. Permite edición de cuotas futuras individuales (importe/fecha/concepto) con versionado optimista.
  - `listInstallmentPlans`, `getInstallmentPlan`, `cancelInstallmentPlan` (soft delete de transactions futuras + marcar items cancelled).
- `src/worker/application/recurring/recurring.ts`
  - `createRecurringRule`, `listRecurringRules`, `updateRecurringRule`, `cancelRecurringRule`.
  - `processDueRecurring(env, asOfDate, userId?)`: itera reglas activas con `next_due_on <= asOfDate`, crea ocurrencia + transacción por cada vencimiento, avanza `next_due_on`, respeta `end_on`. Tope por corrida.
  - `projectRecurring(env, userId, from, to)`: fechas virtuales para calendario/compromisos.
- `src/worker/application/commitments/commitments.ts`
  - `listCommitments(env, userId, from, to)`: cuotas futuras (transacciones source_type='installment' con occurred_on en rango y > hoy) + proyección recurrente.
  - `getCommitmentsSummary(env, userId, month)`: total previsto por moneda.
- `src/worker/application/calendar/calendar.ts`
  - `getCalendarMonth(env, userId, month)`: días con transacciones (actuales y futuras) + compromisos proyectados.

### 6.2 Auto-posteo recurrente (cron)

- `processDueRecurring` se invoca desde handler `scheduled` del Worker.
- Configuración en `wrangler.jsonc`: `[triggers] crons = ["0 6 * * *"]` (03:00 Argentina / 06:00 UTC).
- Procesamiento por usuario con try/catch individual; log de errores sin abortar.
- Tope por corrida (ej. 500 ocurrencias) para respetar CPU time gratuito; backlog se procesa en corridas siguientes.
- Idempotencia: `(rule_id, due_on)` único + verificación de transacción existente.

### 6.3 Rutas nuevas

- `src/worker/routes/installments.ts`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/cancel`.
- `src/worker/routes/recurring.ts`: `GET /`, `POST /`, `PATCH /:id`, `POST /:id/cancel`, `POST /:id/skip`.
- `src/worker/routes/commitments.ts`: `GET /?from&to`, `GET /summary?month`.
- `src/worker/routes/calendar.ts`: `GET /?month`.

Registrar en `src/worker/index.ts` dentro de `protectedApi`.

### 6.4 Cambio en saldos

- `balancesByAccount` en `src/worker/application/accounts/accounts.ts`: agregar `AND occurred_on <= ?` con `todayLocalISO()` en las tres subconsultas (transactions, transfers from, transfers to). Los transfers futuros no deben afectar saldo actual.

### 6.5 Borrado de cuenta

- Extender `deleteAccount` con DELETE de `installment_plans`, `installment_items`, `recurring_rules`, `recurring_occurrences` (o CASCADE).

### 6.5.1 Archivado de cuentas con compromisos (investigación)

**Estado actual del código:**
- Archivar una cuenta solo setea `archived_at = now` en `accounts`; no borra historial.
- `updateAccount` permite restaurarla con `archivedAt: null` (desarchivar).
- Si la cuenta archivada era la default, se reasigna la default a otra cuenta activa.
- Movimientos y transferencias nuevos exigen cuenta activa (`archived_at IS NULL`).
- El historial y los saldos de la cuenta archivada se conservan.

**Comportamiento acordado:**
- Archivar no debe bloquearse por tener compromisos pendientes.
- Si la cuenta tiene cuotas pendientes o recurrencias activas, la UI muestra confirmación explícita; el usuario puede cancelar o confirmar.
- Si confirma, la cuenta se archiva sin borrar historial ni compromisos, y sin reasignarlos automáticamente.
- Las cuotas ya generadas permanecen y afectarán el saldo de esa cuenta cuando venzan.
- Las recurrencias cuya cuenta esté archivada no se auto-registran mientras esté archivada; la ocurrencia queda pendiente y se reintenta cuando la cuenta se restaure o se cambie la cuenta en la regla. No se sustituye por otra cuenta.

### 6.6 Lazy fallback

- `GET /api/bootstrap`: si legal aceptado, invocar `processDueRecurring` para el usuario (además de `initializeUserData`). Esto cubre casos donde cron falla o el usuario abre la app.

---

## 7. Cliente (React)

### 7.1 API client

Agregar métodos para installments, recurring, commitments, calendar y exponerlos en `api`.

### 7.2 Rutas y navegación

- `/calendario` → `CalendarPage`.
- `/compromisos` → `CommitmentsPage`.
- Nav: agregar "Calendario" a sidebar; "Compromisos" en "Más". Mobile bottom nav sin cambios.

### 7.3 Formulario unificado (TransactionsPage)

- Toggle "En cuotas": campos cantidad de cuotas (numérico, max 3 dígitos) y primer vencimiento. Al guardar, llama `api.createInstallmentPlan`.
- Toggle "Recurrente": selector de frecuencia (14 opciones), fecha de inicio, fecha de fin opcional. Al guardar, llama `api.createRecurringRule`.
- Validación: no se pueden activar ambos toggles a la vez.

### 7.4 CalendarPage

- `MonthStepper` para navegar mes/año.
- Grilla de 7 columnas con chips por día (ingresos/gastos) y total.
- Distinción visual: movimientos futuros (`occurred_on > hoy`) con estilo atenuado/badge "Previsto".
- Panel con detalle del día seleccionado: transacciones + compromisos proyectados.

### 7.5 CommitmentsPage

- Tabs: Cuotas, Recurrentes, Próximos.
- Cuotas: planes con progreso (pagadas/total), cancelar.
- Recurrentes: reglas con próxima fecha, editar/cancelar/saltar próxima.
- Próximos: lista de compromisos futuros con total previsto por moneda.

---

## 8. Tareas y secuencia

### Fase 0 — Fundamentos

| # | Tarea | Archivos | Deps |
|---|---|---|---|
| T01 | Migración `0008_installments_and_recurring.sql`. | `migrations/0008_*.sql` | — |
| T02 | Dominio: `installment.ts`, `recurring.ts` (split, due dates, frecuencias, proyección). | `src/domain/installment.ts`, `src/domain/recurring.ts` | — |
| T03 | Contratos Zod. | `src/contracts/installment.ts`, `recurring.ts`, `commitment.ts` | T02 |

### Fase 1 — Backend core

| # | Tarea | Archivos | Deps |
|---|---|---|---|
| T04 | Aplicación installments (crear plan en batch, listar, cancelar). | `src/worker/application/installments/installments.ts` | T01,T03 |
| T05 | Aplicación recurring (CRUD, processDue, project). | `src/worker/application/recurring/recurring.ts` | T01,T03 |
| T06 | Commitments + calendar (unificación). | `src/worker/application/commitments/commitments.ts`, `calendar/calendar.ts` | T04,T05 |
| T07 | Ajustar saldos para excluir futuros. | `src/worker/application/accounts/accounts.ts` | — |
| T08 | Extender delete-account. | `src/worker/application/account/delete-account.ts` | T01 |
| T09 | Rutas nuevas. | `src/worker/routes/installments.ts`, `recurring.ts`, `commitments.ts`, `calendar.ts` | T04-T06 |
| T10 | Registrar rutas + handler scheduled en index. | `src/worker/index.ts` | T09 |

### Fase 2 — Automatización

| # | Tarea | Archivos | Deps |
|---|---|---|---|
| T11 | Configurar cron en `wrangler.jsonc` y handler `scheduled`. | `wrangler.jsonc`, `src/worker/index.ts` | T10 |
| T12 | Lazy processing en bootstrap. | `src/worker/routes/bootstrap.ts` | T05 |

### Fase 3 — Frontend

| # | Tarea | Archivos | Deps |
|---|---|---|---|
| T13 | API client. | `src/client/shared/api/client.ts` | T09 |
| T14 | Rutas y navegación. | `src/client/app/App.tsx`, `navigation.ts` | — |
| T15 | CalendarPage. | `src/client/features/calendar/CalendarPage.tsx` | T13 |
| T16 | CommitmentsPage. | `src/client/features/commitments/CommitmentsPage.tsx` | T13 |
| T17 | Formulario unificado en TransactionsPage. | `src/client/features/transactions/TransactionsPage.tsx` | T13,T16 |

### Fase 4 — Verificación estática

| # | Tarea | Archivos | Deps |
|---|---|---|---|
| T18 | Revisar tipos, contratos, cálculos, sync. | todos | T01-T17 |
| T19 | Documentar configuración cron y migración. | `docs/` | T18 |

---

## 9. Checkpoints

- **A (tras Fase 0-1):** esquema coherente, contratos validan, saldos excluyen futuros.
- **B (tras Fase 2):** cron configurado, procesamiento idempotente, lazy fallback.
- **C (tras Fase 3):** UI coherente, calendario distingue actuales/previstos.
- **Final:** criterios observables cumplidos por inspección; limitaciones documentadas.

---

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cuotas futuras afectan saldos | Alto | Filtro `occurred_on <= hoy` en `balancesByAccount`. |
| Duplicados en cron | Alto | Unicidad `(rule_id, due_on)` + verificación de transacción. |
| CPU time excedido en free tier | Medio | Tope por corrida + procesamiento por usuario aislado. |
| Backlog de recurrencias | Medio | Procesamiento de todas las vencidas por corrida, con tope. |
| Edición inconsistente de cuotas | Medio | Cuotas futuras editables individualmente (importe/fecha/concepto) con versionado optimista; las ya vencidas no se editan. |
| Cuenta archivada con compromisos | Medio | Confirmación explícita; compromisos no se reasignan ni borran; recurrencias se pausan hasta restaurar/cambiar cuenta. |
| Duplicados en cron por concurrencia | Alto | Unicidad `(rule_id, due_on)` + batch atómico; el SELECT previo no es barrera. |
| Cuenta archivada al postear recurrencia | Medio | No reasignar automáticamente; si la cuenta está archivada, la ocurrencia queda pendiente y se reintenta al restaurar/cambiar cuenta. Validar categoría activa o marcar error. |
| Sync de transacciones futuras | Bajo | Son transacciones normales con `change_seq`; sync existente las propaga. |

---

## 11. Limitaciones y decisiones pendientes de aprobación

1. **Cron trigger**: se propone `0 6 * * *` (diario, 03:00 Argentina / 06:00 UTC). ¿Horario preferido?
2. **Edición de cuotas individuales**: habilitada para cuotas futuras (importe/fecha/concepto) con versionado optimista. Las cuotas ya vencidas no se editan. ✅ Aprobado.
3. **Edición de recurrencia**: los cambios aplican solo a futuras; las ya posteadas no se modifican. ¿Aceptar?
4. **Tope de cuotas**: 999. ¿Suficiente?
5. **Horizonte de proyección recurrente**: 12 meses. ¿Ajustar?
6. **Transferencias futuras**: se excluyen del saldo actual igual que movimientos. ¿Correcto?
7. **Archivado con compromisos**: confirmación explícita y pausa de recurrencias hasta restaurar/cambiar cuenta. Sin reasignación automática a cuenta por defecto. ✅ Aprobado.

---

## 12. Estado de tareas

| Tarea | Deps | Estado | Notas |
|---|---|---|---|
| T01 | — | Pending | |
| T02 | — | Pending | |
| T03 | T02 | Pending | |
| T04 | T01,T03 | Pending | |
| T05 | T01,T03 | Pending | |
| T06 | T04,T05 | Pending | |
| T07 | — | Pending | |
| T08 | T01 | Pending | |
| T09 | T04-T06 | Pending | |
| T10 | T09 | Pending | |
| T11 | T10 | Pending | |
| T12 | T05 | Pending | |
| T13 | T09 | Pending | |
| T14 | — | Pending | |
| T15 | T13 | Pending | |
| T16 | T13 | Pending | |
| T17 | T13,T16 | Pending | |
| T18 | T01-T17 | Pending | |
| T19 | T18 | Pending | |

**Plan aprobado por el usuario (2026-11-01).** Listo para implementación cuando se autorice. La ejecución debe seguir el ciclo: Pending → Implementation → Audit → Status Update → Next Task → Final Verification, manteniendo este documento como fuente de verdad.
