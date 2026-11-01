---
name: Planned Features Cuotas Recurrencias Calendario
description: Plan aprobado para finance-pwa: compras en cuotas, movimientos recurrentes, compromisos financieros y calendario, con decisiones clave. Cuotas editables individualmente; sin reasignación automática de cuenta archivada.
type: feedback
date: 2026-11-01
review_after: 2027-05-01
---

# Funcionalidades planificadas: cuotas, recurrencias, compromisos y calendario

Plan de implementación: `.coder/plans/2026-11-01-cuotas-recurrencias-compromisos-calendario.md`. Plan aprobado por el usuario (2026-11-01); listo para implementación.

## Cuotas (compras en cuotas)
- Se generan **todas** las cuotas al registrar la compra (campo numérico hasta 3 dígitos, máx 999). Cada una es un movimiento normal con fecha futura e identificación `Concepto (i/N)`.
- Las cuotas futuras (`occurred_on > hoy AR`) **no afectan** saldos actuales: `balancesByAccount` debe filtrar `occurred_on <= hoy AR` tanto en transacciones como en transferencias. Resúmenes mensuales, presupuestos y estadísticas ya filtran por período (`occurred_on LIKE mes%`), así que no se distorsionan.
- **Sincronización**: cada cuota es una transacción independiente con su propio `change_seq`. En un batch, leer la secuencia base una vez, asignar `change_seq = base + i` a cada cuota, y actualizar `user_sync_state` una sola vez con `sequence = base + N`. Así el pull por cursor trae todas.
- **Edición individual**: las cuotas futuras (`occurred_on > hoy AR`) son editables individualmente (importe, fecha, concepto) con versionado optimista. Las cuotas ya vencidas no se editan.
- No se usa proceso programado para cuotas.

## Recurrencias (movimientos recurrentes)
- 14 frecuencias: nunca, cada día, días de la semana, fin de semana, cada semana, cada dos semanas, cada cuatro semanas, cada mes, fin de mes, cada dos/tres/cuatro/seis meses, cada año.
- Fecha de finalización opcional, modificación y cancelación.
- No generar indefinidamente movimientos futuros para reglas sin fecha de fin.

## Automatización (Cloudflare, free tier)
- Cloudflare Cron Triggers para auto-registrar recurrencias vencidas, aun sin abrir la app.
- Procesamiento por usuario, manejo de atrasos e interrupciones.
- **Prevención de duplicados con garantía atómica**: no depender de `SELECT` previo (race condition). Usar restricción única `(rule_id, due_on)` en `recurring_occurrences`: insertar transacción + ocurrencia en la misma transacción D1; si la inserción de la ocurrencia falla por conflicto único, todo el batch se revierte y se trata como ya procesada. El `SELECT` queda solo como optimización.
- Migración D1 `0008` para nuevas tablas.

## Calendario y compromisos
- Vista calendario mensual navegable; ingresos/gastos por día; movimientos de fecha seleccionada.
- Movimientos futuros de cuotas y recurrencias visibles, distinguidos visualmente de los actuales.
- Compromisos: cuotas pendientes, recurrencias activas, próximos vencimientos, importes comprometidos.

## UX
- Cuotas y recurrencias configurables desde el formulario habitual de movimientos.
- Interfaz simple, coherente con el diseño actual.

## Decisiones clave
- D1 sigue siendo fuente de verdad; IndexedDB no se extiende para nuevas entidades (online-only, consistente con ADR-0003).
- Las cuotas se generan como transacciones normales al crear la compra. Las recurrencias futuras son compromisos derivados, no transacciones, hasta que el cron las materializa.
- Auto-registro perezoso al abrir la app + handler `scheduled` opcional.
- **Cuenta archivada**: archivar NO se bloquea aunque haya compromisos pendientes. Si hay cuotas pendientes o recurrencias activas, la UI muestra confirmación explícita ("Estás a punto de archivar una cuenta que tiene compromisos financieros pendientes. ¿Estás seguro?"). Si confirma, la cuenta se archiva sin borrar historial ni compromisos, y sin reasignarlos. Las cuotas ya generadas siguen vinculadas y afectan el saldo de esa cuenta cuando venzan (filtradas por fecha en `balancesByAccount`). Las recurrencias con cuenta archivada no se auto-registran mientras esté archivada; la ocurrencia queda pendiente y se reintenta al restaurar la cuenta o cambiar la cuenta en la regla. No se reemplaza automáticamente por la cuenta por defecto. Si el usuario elige una cuenta para un movimiento, debe estar activa (si está archivada, la operación falla con error controlado); si no elige cuenta, se usa la cuenta por defecto activa. Restaurar una cuenta archivada ya existe (`updateAccount` con `archivedAt: null`), y si era default se reasigna la default a otra activa.

## Decisiones post-aprobación pendientes
1. Horario del cron diario (propuesto 06:00).
2. Edición de cuotas individuales: habilitada para cuotas futuras (importe/fecha/concepto) con versionado optimista; las ya vencidas no se editan. (Aprobado por el usuario.)
3. Si cambios en recurrencia aplican solo a futuras.
4. Tope de cuotas 999.
5. Horizonte de proyección recurrente 12 meses.
6. Si transferencias futuras también se excluyen del saldo actual.
7. Archivado con compromisos: confirmación explícita y pausa de recurrencias hasta restaurar/cambiar cuenta. (Aprobado por el usuario.)