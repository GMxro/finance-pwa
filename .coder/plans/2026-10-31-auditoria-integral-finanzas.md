# Auditoría integral de finance-pwa

**Fecha:** 2026-10-31  
**Alcance:** inspección estática de UI, API, casos de uso, contratos, persistencia local, migraciones, documentación y tests existentes. No se modificó código, no se ejecutaron builds/tests y no se hicieron llamadas a producción. Las referencias son evidencia de código; explotabilidad y comportamiento runtime quedan sin validar salvo indicación expresa.

## Resumen ejecutivo

La aplicación no es una maqueta: incluye autenticación Google con Better Auth, operaciones financieras persistidas en D1, caché/outbox IndexedDB para altas offline, cuentas, transferencias, presupuestos, categorías, estadísticas, exportación y borrado de cuenta. Hay controles significativos: las rutas de negocio requieren sesión; muchas consultas filtran por `user_id`; existen claves foráneas e idempotencia en varios flujos.

Sin embargo, no corresponde considerarla íntegra ni plenamente confiable todavía. Se encontraron defectos confirmados en conciliación local, validación y manejo de sincronización, además de riesgos server-side en el protocolo de sync y en cambios de categoría. No se confirmó lectura/escritura directa entre cuentas en las rutas CRUD ordinarias revisadas. El riesgo más importante es que discrepancias de sincronización hagan que una operación parezca aplicada sin modificar el registro esperado o que la UI muestre datos financieros desactualizados.

**Confianza:** alta para defectos directamente visibles en el flujo estático; media para impacto en runtime; no se verificó entorno desplegado, configuración de secretos, base real, navegador ni ataques reproducidos.

## Inventario funcional y estado

| Funcionalidad | Estado real observado | Persistencia / límites |
|---|---|---|
| Login y sesión | Implementada mediante Google OAuth/Better Auth; rutas de negocio detrás de middleware de sesión. | Sesión en D1/cookie; no se verificó proveedor/configuración en producción. |
| Onboarding y moneda preferida | Implementado: guarda preferencias por API y completa onboarding. | El texto promete categorías iniciales; confirmar backend bootstrap para que la promesa corresponda. |
| Resumen mensual | Implementado con cálculo en cliente de ingresos, gastos, saldo neto, comparativo y recientes. | D1 más caché; mezcla conserva la copia local si hay mismo ID, con posibilidad de valores antiguos. |
| Movimientos | CRUD conectado a API; listado mensual paginado y filtros. Alta offline mediante IndexedDB/outbox; edición y borrado requieren red. | D1 es autoridad; la caché/outbox es best-effort y no cifrada. Pull de tombstones tiene defecto (ver F-1). |
| Estadísticas | Implementadas: reúne páginas de movimientos y calcula comparativas, categorías principales y promedio diario. | Límite de 20 páginas de 100; posible truncamiento en meses con más de 2.000 registros. Mezcla puede priorizar caché obsoleta. |
| Presupuestos | CRUD/API y cálculo de gasto por periodo, categoría y moneda. | Persistencia servidor; no hay cola offline visible. Agregados financieros sin chequeo de precisión. |
| Categorías | Alta, edición, archivo/restauración por API. | No hay fallback offline. Edición de movimiento no vuelve a validar categoría activa/compatible en el caso de uso. |
| Cuentas | Crear/editar/archivar, predeterminada y saldos derivados de movimientos/transferencias. | API/D1; saldos agregados por moneda. No se verificó en ejecución la presentación monetaria de la UI. |
| Transferencias | Crear/listar/eliminar vía API; valida cuentas del usuario y restricciones SQL relevantes. | Sin suite de integración dedicada identificada; id existente devuelve registro sin comparar necesariamente el payload solicitado. |
| Sincronización | Push outbox, pull por cursor, epoch/full sync, reintentos de pendientes; indicador y acción manual. | Defectos en ownership local, tombstones y señalización del error. Sin garantía de Background Sync. |
| Exportación CSV | Implementada en Settings. | Requiere conexión; la revocación inmediata del object URL puede ser dependiente del navegador, no probada. |
| Cierre de sesión | Flujo contempla pendientes antes de cerrar sesión. | Revisar aislamiento de datos locales entre usuarios; full sync no filtra todo el trabajo pendiente por propietario. |
| Borrado de cuenta | Caso de uso presente y conectado. | No es atómico entre R2 y D1; puede quedar parcial. |
| PWA / actualización / modo offline | Shell, manifest, assets, service worker y aviso de versión implementados. API no se cachea. | Offline permite abrir shell y crear movimientos; resto de escrituras necesita conexión. IndexedDB sin cifrado y desalojable. |

Las pantallas de Ajustes muestran versión, moneda base y zona horaria como valores literales (`SettingsPage.tsx:179-199`), no como estado consultado: dato informativo potencialmente divergente. `OFFLINE-SYNC.md:3-7, 45-51` documenta correctamente las limitaciones offline principales.

## Hallazgos priorizados

Escala de gravedad: **Crítica** = compromiso amplio de datos/cuentas; **Alta** = impacto financiero/seguridad importante; **Media** = integridad o disponibilidad acotada; **Baja** = presentación/operación menor. Dificultad: S/M/L aproximada para corregir y verificar, no estimación de calendario.

### A-1 — Full sync mezcla movimientos pendientes locales de otras cuentas
- **Gravedad:** Alta para privacidad/integridad local. **Dificultad:** M.
- **Estado:** Confirmado en código; consecuencia exacta según el resto de flujos requiere validación runtime.
- **Evidencia:** `src/local-data/sync-engine.ts:84-95`: full sync obtiene pendientes sin filtrar por usuario activo y los preserva durante reconstrucción. Las filas guardan `userId`.
- **Causa:** la reconstrucción toma el conjunto global de IndexedDB, aunque el outbox y datos son multiusuario.
- **Consecuencia:** al cambiar de cuenta/dispositivo compartido puede reintroducirse una fila pendiente ajena en el almacén local de la cuenta activa; crea riesgo de exposición en pantalla o envío bajo contexto incorrecto.
- **Corrección:** particionar todas las lecturas/escrituras locales por usuario; en full sync preservar solo pendientes cuyo propietario coincide con sesión actual. Al cerrar sesión, bloquear el acceso a datos de la cuenta anterior sin borrar operaciones legítimas inadvertidamente.

### A-2 — Pull recibe tombstone pero no marca localmente el movimiento como borrado
- **Gravedad:** Alta para consistencia de saldos/reportes. **Dificultad:** S.
- **Estado:** Defecto confirmado en código.
- **Evidencia:** `src/local-data/sync-engine.ts:146-155` solo marca `synced: true` para elementos borrados/tombstones, sin copiar `deletedAt` ni eliminar la fila; `transaction-store.ts:95-100` oculta solo filas que sí tienen `deletedAt`.
- **Causa:** el consumidor descarta la semántica del tombstone al aplicar el pull.
- **Consecuencia:** un registro previamente cacheado puede permanecer visible y ser contado por resumen/estadísticas después de su borrado remoto.
- **Corrección:** aplicar tombstone de forma explícita y atómica a la caché; asegurar que lista y cálculos excluyan registros borrados. Agregar pruebas de sync multi-dispositivo y borrado concurrente.

### A-3 — Las vistas resumen/estadísticas dan precedencia a una copia local potencialmente antigua
- **Gravedad:** Alta. **Dificultad:** S.
- **Estado:** Confirmado en política de merge; divergencia runtime no reproducida.
- **Evidencia:** `OverviewPage.tsx:36-45` y `StatisticsPage.tsx:39-48`: cargan primero caché y solo agregan filas del servidor cuando el ID no existe; resumen usa ese resultado.
- **Causa:** merge prioriza fuente no autoritativa frente a servidor para registros con el mismo ID.
- **Consecuencia:** monto/categoría/fecha antiguos o registro ya borrado pueden inflar o reducir cifras mostradas.
- **Corrección:** servidor debe prevalecer para filas sincronizadas y pendientes locales deben superponerse solo por estado explícito; combinar tombstones y versionado/cursor. Recalcular reportes desde un dataset ya conciliado.

### A-4 — El endpoint de sincronización no aplica los esquemas completos de transacción
- **Gravedad:** Alta. **Dificultad:** M.
- **Estado:** Confirmado en validación incompleta; datos concretos admitidos dependen de SQL y ramas del caso de uso.
- **Evidencia:** `src/worker/routes/sync.ts:42-51` valida payload como objeto genérico; `src/worker/application/sync/sync-engine.ts:157-204, 218-236` usa sus campos en alta/actualización sin validar contra contrato por entidad/operación. `src/contracts/transaction.ts:7-16` define un esquema más estricto.
- **Causa:** los contratos normales no se reutilizan en el canal de sync.
- **Consecuencia:** requests directas pueden saltarse validaciones normales, provocar fallas SQL poco controladas o inconsistencias; cambios con valores falsy (p. ej. importe 0) pueden ignorarse en lugar de rechazarse claramente.
- **Corrección:** validar cada operación/payload con schema estricto del servidor antes de mutar; mismos invariantes que CRUD; distinguir campos omitidos de valores inválidos; límites de tamaño y cantidad por request.

### A-5 — Reutilización de operationId puede reportar aplicado un recurso distinto
- **Gravedad:** Alta para confiabilidad de sync. **Dificultad:** S.
- **Estado:** Confirmado en flujo estático; explotación no ejecutada.
- **Evidencia:** `src/worker/application/sync/sync-engine.ts:42-50` consulta operación anterior por `(user_id, operation_id)` y hash; `:101-105` cuenta como aplicada al encontrar una operación previa coincidente, sin verificar `entity_id` contra el nuevo `item.id`. Migración `migrations/0001_initial.sql:119-127` registra entidad.
- **Causa:** idempotencia valida contenido/operación, no identidad completa del efecto previo.
- **Consecuencia:** respuesta de sync puede confirmar una fila diferente como si se hubiera aplicado el registro nuevo; el cliente puede quitar el item de outbox y dejar la operación esperada ausente.
- **Corrección:** guardar/consultar tipo y entity ID en la clave idempotente y exigir coincidencia exacta; mismatch debe devolver conflicto. No borrar outbox salvo confirmación inequívoca.

### A-6 — Editar movimiento no revalida categoría activa y compatible con el tipo
- **Gravedad:** Media-alta. **Dificultad:** S.
- **Estado:** Riesgo de integridad confirmado en lógica, limitado por constraints de propiedad.
- **Evidencia:** `src/worker/application/transactions/transactions.ts:131-152` admite `category_id` en update; la validación de creación de categoría activa/propia aparece en `:75-80`, sin equivalente al editar. FK compuesta impide categoría ajena, pero no categoría archivada o de tipo incompatible (`migrations/0001_initial.sql:93`).
- **Causa:** reglas de negocio solo se aplican en create.
- **Consecuencia:** solicitudes directas o recorridos de UI pueden asociar egreso a categoría de ingreso o usar categoría archivada, desalineando informes.
- **Corrección:** centralizar invariantes de categoría y usarlos en create/update/sync: propiedad, activa, tipo compatible.

### A-7 — Borrado de cuenta no es atómico entre D1 y R2
- **Gravedad:** Alta para disponibilidad e integridad de borrado. **Dificultad:** M/L.
- **Estado:** Confirmado; fallos parciales no probados.
- **Evidencia:** `src/worker/application/account/delete-account.ts:6-25, 27-35` escribe journal markers en R2 y luego ejecuta eliminación/batch D1; no puede ser una única transacción distribuida.
- **Causa:** dos almacenes sin protocolo explícito de estado/reintento coordinado.
- **Consecuencia:** error intermedio puede dejar cuenta parcialmente borrada o markers R2 que no corresponden a eliminación confirmada.
- **Corrección:** diseñar borrado idempotente y reanudable con estado de operación; decidir orden/compensación y registrar progreso. Probar fallos entre cada paso. No prometer atomicidad distribuida inexistente.

### A-8 — Esquemas de fecha validan forma, no fecha calendaria real
- **Gravedad:** Media. **Dificultad:** S.
- **Estado:** Confirmado.
- **Evidencia:** regex de `YYYY-MM-DD` en `contracts/transaction.ts:7-16`, `contracts/transfer.ts:4-18`, `contracts/budget.ts:4-10`; fecha imposible puede satisfacer patrón.
- **Causa:** validación sintáctica sin round-trip calendárico.
- **Consecuencia:** movimientos/transferencias pueden quedar fuera de filtros o asignados a periodo inesperado.
- **Corrección:** validar fecha calendaria real con parser estricto centralizado; mismo validador en todos los endpoints y sync.

### A-9 — Agregados financieros pueden exceder precisión entera segura
- **Gravedad:** Media, potencialmente Alta a gran volumen. **Dificultad:** M.
- **Estado:** Riesgo matemático confirmado en acumulación sin guardas; volumen/impacto real no verificados.
- **Evidencia:** `src/domain/summary.ts:29-42` acumula con `+=`; `src/worker/application/budgets/budgets.ts:28,43` convierte SUM a number; `src/worker/application/accounts/accounts.ts:33-56` suma SQL y convierte resultados. `money.ts:19-24` controla importe individual, no total agregado.
- **Causa:** límite seguro individual no garantiza que una suma conserve exactitud.
- **Consecuencia:** redondeos silenciosos en resúmenes, gasto de presupuesto o saldo.
- **Corrección:** imponer límites de producto razonables y detectar overflow al agregar; mantener enteros en unidades menores y rechazar/reportar agregados fuera de rango.

### A-10 — Datos del cliente y outbox offline no están cifrados y pueden ser desalojados
- **Gravedad:** Media (dispositivo compartido/comprometido). **Dificultad:** M, según objetivo de seguridad.
- **Estado:** Limitación confirmada y documentada, no vulnerabilidad remota demostrada.
- **Evidencia:** `docs/OFFLINE-SYNC.md:45-51`; IndexedDB contiene transacciones/outbox (`database.ts:41-72`).
- **Causa:** modelo de PWA confía en bloqueo del dispositivo y almacenamiento best-effort.
- **Consecuencia:** persona con acceso al perfil del navegador puede inspeccionar datos; desalojo puede perder altas pendientes.
- **Corrección:** comunicar limitación; minimizar datos offline; limpiar/bloquear por usuario en logout; no afirmar que cifrado con clave accesible desde JS protege ante XSS. Para pérdidas, conservar confirmación de sync y export/backup apropiados.

### A-11 — Idempotencia de transferencias retorna registro existente sin comparar solicitud
- **Gravedad:** Media. **Dificultad:** S.
- **Estado:** Riesgo confirmado en patrón; efectos dependen de contrato cliente/reintento.
- **Evidencia:** `src/worker/application/transfers/transfers.ts:73-77` retorno temprano por ID existente señalado en revisión estática; no se verifica correspondencia del nuevo payload en ese camino.
- **Causa:** UUID repetido se trata como repetición válida sin comparar fingerprint de datos.
- **Consecuencia:** reintento con payload alterado puede producir respuesta que aparenta aceptar valores nuevos mientras conserva los anteriores; confunde sincronización/usuario.
- **Corrección:** mismo payload devuelve resultado idempotente; distinto payload con mismo ID devuelve conflicto y no muta.

### A-12 — Guard de origen acepta origen de URL de request además del configurado
- **Gravedad:** Media, condicionada a proxy/host. **Dificultad:** S.
- **Estado:** Riesgo potencial; explotabilidad no verificada.
- **Evidencia:** `src/worker/middleware/same-origin.ts:17-30` considera válido Origin si coincide con origen derivado de la URL de solicitud o el configurado.
- **Causa:** el host de la request podría no equivaler al origen público de confianza en ciertos proxies/hosts alternativos.
- **Consecuencia:** debilitamiento de defensa CSRF bajo configuración de proxy/hostname no confiable; no se confirma bypass en el despliegue actual.
- **Corrección:** basar comparación en una allowlist/origen público explícito y probar proxy/host alternativo. Mantener cookies SameSite y controles Better Auth como defensa adicional.

### A-13 — Sync fallido no propaga error al consumidor que espera rechazo
- **Gravedad:** Baja-media. **Dificultad:** S.
- **Estado:** Confirmado.
- **Evidencia:** `src/local-data/sync-engine.ts:71-75` captura excepción, fija estado error y termina; `TransactionsPage.tsx:150-155` continúa a cargar datos tras `await syncNow()`.
- **Causa:** interfaz de sync mezcla resolución de promesa y estado de error como canales distintos.
- **Consecuencia:** consumidor puede seguir como si sync se hubiera completado; aumenta riesgo de feedback confuso, no prueba pérdida por sí solo.
- **Corrección:** retorno discriminado `{ok,error}` o rethrow coherente; que todas las pantallas usen un contrato único y muestren estado pendiente/fallido.

## Controles favorables observados

- Rutas de negocio bajo sesión y filtro por propietario en CRUD ordinario revisado (`worker/index.ts:43-62`, `middleware/session.ts:4-15`; transacciones `transactions.ts:75-94,148-152`). No se encontró evidencia de IDOR directo en esos flujos revisados.
- Creación de transferencias verifica cuentas del usuario; constraints compuestas anclan relaciones al mismo usuario (`transfers.ts:79-89`, `0002_accounts_and_transfers.sql:25-42`).
- Headers de seguridad, cookies seguras explícitas, orígenes de Better Auth y eliminación de tokens OAuth antes de persistir aparecen en `security-headers.ts:4-27` y `auth/auth.ts:7-22,44-81,89-93`.
- Consultas SQL preparadas, FKs/checks de tipo, moneda y monto positivo en migraciones (`0001_initial.sql:61-110`, `0002_accounts_and_transfers.sql:5-48`).
- Operaciones CRUD comunes filtran por `user_id`; las pruebas incluyen ownership para ciertos flujos, aunque no cubren toda la superficie.

Estos controles reducen riesgo, pero no reemplazan revisar cada rama de sync ni validación de negocio.

## Gaps y límites de la auditoría

- Sin ejecución de tests/builds, navegador, fuzzing, requests HTTP, D1/R2 real ni configuración de producción; no afirmo explotación práctica.
- No se verificó configuración real de `SYNC_EPOCH`, proxy/host, rate limits, cuotas de Cloudflare ni límites de request del despliegue.
- El test estático disponible incluye unitarios de dinero/presupuesto y ownership/sync, e integración de transacciones, bootstrap, borrado de sync, versión y PWA; cobertura dedicada de transferencias y fallos parciales de borrado no fue identificada en la revisión.
- Potencial carrera en cargas paginadas concurrentes y descarga CSV dependiente de navegador no se reprodujeron.
- No se detectó evidencia suficiente para afirmar exposición de secretos, omisión de sesión en rutas personales o acceso cross-account CRUD directo; eso no equivale a certificación de seguridad.

## Plan de corrección recomendado

### P0 — cerrar inconsistencias que afectan datos y autorización del protocolo
1. Corregir ownership en IndexedDB/full sync y aislamiento al cambiar/cerrar sesión (A-1).
2. Aplicar tombstones correctamente y definir precedencia/versiones en merge con fuente servidor (A-2, A-3).
3. Endurecer el endpoint sync con schema por operación, límites de lote/payload y validaciones de negocio compartidas (A-4).
4. Hacer idempotencia de sync y transferencias dependiente de identidad completa + payload; mismatches devuelven conflicto (A-5, A-11).
5. Replicar validación de categoría en update/sync (A-6).

### P1 — integridad, resiliencia y protección de información
6. Hacer borrado de cuenta reanudable/idempotente con progreso/compensación entre D1 y R2 (A-7).
7. Validar fecha real y controlar precisión/overflow en agregados (A-8, A-9).
8. Revisar origen confiable detrás de proxy y verificar manejo de rate/abuso en endpoints de escritura y sync; añadir límites proporcionales (A-12 y controles pendientes).
9. Definir política de datos locales: mínimo necesario, aislamiento por usuario, limpieza segura al logout y aviso de almacenamiento no cifrado/desalojable (A-10).

### P2 — claridad operativa y cobertura
10. Normalizar contrato de resultado/error de sync y mensajes visibles (A-13).
11. Alinear Settings/README/onboarding con funcionalidades y configuración reales; documentar offline por entidad.
12. Añadir pruebas de regresión para tombstones, dos usuarios en un mismo navegador, reintentos con ID igual/payload distinto, categoría inválida, fecha imposible, fallo entre D1/R2, concurrencia y agregados límite.

## Verificación propuesta para la etapa de implementación

- Tests de integración aislados con dos usuarios: CRUD y sync no deben leer, modificar, borrar ni reintroducir registros ajenos.
- Escenarios sync: mismo operationId + mismo payload es idempotente; mismo ID + payload/entity distinto devuelve conflicto; tombstone desaparece de caché y de todos los totales.
- Pruebas contrato API directas para importes, fechas, moneda, categoría/propietario/tipo, lote grande y campos desconocidos; errores controlados sin escrituras parciales.
- Fallos inyectados en cada frontera D1/R2: borrado reintentado converge a estado completo y no revierte marcadores indebidamente.
- Comparar saldos, presupuestos, resumen y estadísticas antes/después de create/update/delete/transfer y tras pull/full sync; tolerancia exacta en unidades menores.
- Después de pruebas automatizadas, verificar manualmente offline/online y cambio de usuario en navegador de prueba, sin datos de producción.
- Registrar comandos y resultados ejecutados al implementar; esta auditoría no ejecutó ninguno.
