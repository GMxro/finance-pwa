# ADR 0003 — Offline limitado a altas

**Estado:** aceptado

## Contexto

Permitir editar y borrar sin conexión exige resolver conflictos multi-dispositivo y
tombstones locales complejos. El valor principal es registrar un gasto cuando no hay red.

## Decisión

La captura offline se limita a **crear** movimientos. Editar, borrar y cambiar
configuración requieren conexión. Cada alta lleva UUID del cliente y pasa por un outbox
idempotente.

## Consecuencias

- Conflictos acotados a “mismo id, contenido distinto”.
- Las filas pendientes se marcan y no se editan hasta sincronizar.
- Si el navegador desaloja IndexedDB, se pierden altas no sincronizadas; se avisa al
  usuario.
