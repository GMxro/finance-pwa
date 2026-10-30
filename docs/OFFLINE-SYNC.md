# Offline y sincronización

## Alcance en V1

La aplicación se abre sin conexión después de una visita online y permite **crear**
movimientos. Editar, borrar, cambiar presupuestos/categorías y exportar requieren
conexión. Esto evita resolver conflictos de escritura complejos en la primera versión.

## Componentes

- `public/sw.js`: precachea `/`, `/offline`, el manifest y las fuentes. Las navegaciones
  usan red primero y caen al shell cacheado. Para `/api/*` y `/api/auth/*` usa red
  únicamente; si falla devuelve 503 JSON con `code: OFFLINE`.
- `src/local-data/database.ts`: Dexie con tablas `transactions`, `categories`, `budgets`,
  `syncMeta` y `outbox`.
- `src/local-data/transaction-store.ts`: guarda un alta local y su operación de outbox en
  **una sola transacción IndexedDB**; fusiona filas del servidor con pendientes locales.
- `src/local-data/sync-engine.ts`: envía el outbox, recibe cambios por cursor y expone un
  estado observable (`idle`/`syncing`/`error`, pendientes, último sync).

## Protocolo

1. El formulario genera un UUID y llama a la API.
2. Si la red falla, `savePendingCreate` escribe la fila con `synced: false` y un item de
   `outbox` con `userId` y UUID propio en la misma transacción local.
3. La lista muestra la fila con la etiqueta “Pendiente”; editar/eliminar quedan
   deshabilitados para filas no sincronizadas.
4. Al recuperar conexión (evento `online`, foco o acción manual) el motor hace push del
   outbox de la cuenta activa. Cada item lleva `operationId`; el servidor registra el
   resultado por `(user_id, operationId)` y su hash:
   - mismo `operationId` y mismo contenido → no duplica;
   - mismo `operationId` con contenido distinto → `409`.
5. Solo se eliminan los items confirmados; los conflictos y los fallos de red quedan en
   la cola para reintentarse.
6. El pull usa `change_seq > cursor` y devuelve también tombstones para que otros
   dispositivos eliminen filas locales.

## Cursor y restore

`GET /api/bootstrap` entrega `{ userId, syncEpoch }`; el epoch se configura fuera de D1.
El `sequence` inicial se lee del primer pull de transacciones.
Si un restore de D1 retrocede el cursor, el operador rota `SYNC_EPOCH`; el cliente recibe
`409 SYNC_EPOCH_CHANGED`, reconstruye su copia sincronizada y conserva el outbox pendiente.

## Limitaciones conocidas

- No se usa Background Sync como garantía: el navegador decide si lo ejecuta. La cola se
  reintenta cuando la app vuelve a estar activa.
- IndexedDB es almacenamiento *best-effort*: el navegador puede desalojarlo. La captura
  offline no reemplaza la sincronización ni un backup.
- La PWA no cifra los datos locales; se apoya en el bloqueo del dispositivo.
