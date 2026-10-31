# Auditoría integral — tercera etapa

**Fecha:** 2026-10-31  
**Alcance:** árbol de trabajo actual de `finance-pwa`, incluyendo las dos etapas de correcciones presentes localmente. Auditoría estática de todas las rutas/pantallas declaradas, contratos, cliente API, servicios, persistencia, migraciones, pruebas y documentación; se ejecutaron tests, typecheck y lint locales. **No modifiqué código, no ejecuté migraciones ni operaciones contra producción, no ejecuté el build y no validé un recorrido en navegador real.**

## Veredicto ejecutivo

El producto tiene implementación real para Google login, movimientos, presupuestos, categorías, cuentas, transferencias, estadísticas, exportación, PWA, sync offline de altas y borrado de cuenta. No es solo una maqueta. También hay controles relevantes: ownership en consultas, validaciones de fechas e importes, límites de cuerpo/solicitudes y una saga paginada de borrado.

**No lo considero listo para administrar dinero a diario sin corregir primero varios problemas funcionales y de integridad.** La revisión encontró un probable ciclo de renderizado que afecta las pantallas principales de Movimientos, Cuentas y Presupuestos; el onboarding no es alcanzable ni tiene su endpoint de preferencias; el Resumen puede mostrar cero como si fuese un resultado válido al fallar la API y calcula sobre una sola página; la paginación de movimientos acepta un `limit` sin cota; y el cursor de sync normal puede avanzar/regresar respecto de las mutaciones concurrentes. También hay una ruta alternativa de eliminación de Better Auth que no usa la saga de borrado de la aplicación.

### Veredicto por dimensión

| Dimensión | Estado | Base de la conclusión |
|---|---|---|
| Persistencia/servicios | Parcialmente completa | D1, R2 e IndexedDB existen; CRUD principal implementado. |
| Funcionalidad de pantallas | **No lista** | Ciclo React probable en tres páginas primarias; onboarding inaccesible; problemas en resumen, archivo de cuentas y transferencias. |
| Coherencia financiera | **No lista** | Resumen truncado, montos de transferencias ignorados en un caso y cursor de sync vulnerable a concurrencia. |
| Seguridad/API | Parcialmente endurecida | Ownership, same-origin, body limit y rate limit presentes; límite de paginación eludible y segundo endpoint de borrado. |
| Offline/sync | Parcial | Alta offline y recuperación existen, pero no todas las pantallas reintentan y algunas muestran/interpretan estados incorrectamente. |
| Preparación de release | **Pendiente** | No se verificó despliegue/migraciones remotas; `MIN_APP_VERSION` está vacío; el build estándar elimina un `dist` existente; lint falla por 10 warnings. |

## Inventario funcional

El router declara rutas para login, onboarding, resumen, movimientos, cuentas, presupuestos, estadísticas, categorías y ajustes (`src/client/app/App.tsx:16-38`). `/categorias` redirige a categorías de Ajustes. La navegación ofrece Inicio, Movimientos, Cuentas, Presupuestos, Estadísticas y Ajustes (`src/client/app/navigation.ts:10-17`). No encontré otras páginas financieras en el router.

| Área | Funcionalidad identificada y estado real |
|---|---|
| Login | Google OAuth vía Better Auth; hay estados de carga y error. El flujo depende de credenciales/configuración del proveedor, no se verificó contra Google. [`LoginPage.tsx:19-37,52-74`; `providers.tsx:164-178`] |
| Términos y privacidad | Se muestran como enlaces en Login, pero las rutas cliente declaradas no incluyen `/terminos` ni `/privacidad`; el fallback redirige a Inicio/Login. Enlaces sin destino de contenido dentro de esta aplicación. [`LoginPage.tsx:52-74`; `App.tsx:26-38`] |
| Onboarding | Hay selector ARS/USD, pasos, volver, errores y estado de carga en UI. En la sesión normal no se presenta: `providers.tsx` marca `onboardingComplete=true` al recibir cualquier sesión. Además, el botón intenta usar un endpoint de preferencias que no está montado. La elección de moneda no queda conectada. [`providers.tsx:124-139`; `OnboardingPage.tsx:23-39,42-109`; `worker/index.ts:48-55`; `worker/routes/account.ts:15-31`] |
| Resumen | Selector mensual y moneda, ocultar importes, comparación, recientes y presupuestos. El cálculo es real, pero la carga solicita solo 100 movimientos por período e ignora el campo `error` que devuelve el cliente API; no puede respaldar un resumen completo ni mostrar correctamente un fallo offline. [`OverviewPage.tsx:57-83,88-97,112-134`] |
| Movimientos | Listado, filtros por mes/moneda/tipo/categoría, paginación, alta, edición, borrado, selección de cuenta/categoría/fecha y creación de categoría inline. CRUD online conectado; solo las altas tienen outbox offline. Al fallar el listado, la caché se filtra por mes pero no por los demás filtros. [`TransactionsPage.tsx:88-125,127-148,140-163,290-359,365-384,420-437`] |
| Cuentas | Alta/edición, cuenta predeterminada, archivado, balances por moneda. La API permite incluir archivadas, pero la pantalla llama el listado sin esa opción y no ofrece restauración. Archivar una cuenta con saldo la quita de la lista y de los totales visibles. [`AccountsPage.tsx:107-138,154-205`; `accounts.ts:85-101,113-206`] |
| Transferencias | Crear y borrar transferencias, eligiendo cuentas, moneda/importe origen y destino. La pantalla solo carga 25 transferencias y no ofrece “cargar más” ni historial completo. Existe un caso en que la API ignora el importe destino pedido. [`AccountsPage.tsx:111-126,220-287,375-424`; `transfers.ts:72-104`] |
| Presupuestos | Selector mensual, alta/edición/borrado, categoría de gasto, moneda y límite. La persistencia y el cálculo de gasto están conectados. La actualización no repite la validación de categoría activa/tipo del alta; la respuesta inmediata de alta/edición fija `spentMinor` en cero, aunque la pantalla realiza un GET posterior. [`BudgetsPage.tsx:56-83,121-173`; `budgets.ts:50-65,75-103,106-141`] |
| Categorías | Crear/editar, filtrar archivadas, archivar/restaurar. El servicio elimina físicamente una categoría si no encuentra movimientos asociados; si tiene movimientos (incluso eliminados) la archiva. La pantalla de movimientos carga también archivadas en las opciones del formulario, pero el servidor rechaza crear/editar con ellas. [`CategoriesPage.tsx:51-65,98-161`; `categories.ts:78-108`; `TransactionsPage.tsx:127-148,365-384`] |
| Estadísticas | Comparación mensual, principales categorías y promedio diario; reúne páginas de movimientos. Usa un máximo de 20 páginas de 100 (2.000 registros) sin indicar truncamiento. Si falla la API pero hay caché, presenta las cifras sin una señal visible de que son locales/antiguas. [`StatisticsPage.tsx:25-53,68-149`] |
| Ajustes | Sincronización manual, exportación CSV, cierre de sesión con conservar/descartar pendientes, borrado de cuenta y categorías. Versión, moneda base y zona horaria se muestran como literales. [`SettingsPage.tsx:33-69,103-210,224-262`] |
| PWA/offline | El service worker cachea el shell; la API no queda cacheada. La persistencia local solicita `navigator.storage.persist()`, que el navegador puede denegar. El flujo offline documentado cubre principalmente crear movimientos, no las demás mutaciones. [`sw.js:1-15,21-39,53-93`; `database.ts:48-59`; `OFFLINE-SYNC.md:3-19,45-51`] |
| Eliminación de cuenta | Ruta propia con confirmación, request ID, recibo D1 y finalización paginada de journal R2; cliente conserva la clave y limpia datos locales solo al confirmar. La saga existe, pero Better Auth también mantiene habilitada una ruta de borrado alternativa. [`routes/account.ts:94-127`; `delete-account.ts:18-129`; `SettingsPage.tsx:75-114`] |

### Funciones que no se identificaron

No encontré módulos/rutas para cuotas o pagos en cuotas, ingresos recurrentes, importación bancaria, tipos de cambio automáticos ni presupuestos con arrastre de saldo. No las clasifico como incompletas porque no encontré que el producto las anuncie como capacidades existentes. Sí hay una contradicción documental específica sobre cuentas y transferencias: README las describe como fuera de alcance, aunque la UI y la API actuales las implementan (`README.md:91-98`).

## Hallazgos priorizados

Gravedad: **Crítica** = puede bloquear flujos principales o causar pérdida/inconsistencia importante; **Alta** = errores financieros/seguridad con impacto sustancial; **Media** = limitación localizada o dato engañoso; **Baja** = documentación/deuda menor. Dificultad: S/M/L aproximada.

### F-01 — Ciclo de actualizaciones React en Movimientos, Cuentas y Presupuestos

- **Gravedad:** Crítica/bloqueante. **Confianza:** alta por estructura estática; **no reproducido en navegador**. **Dificultad:** M.
- **Evidencia:** `useCurrencyInput` devuelve un objeto nuevo en cada render (`src/client/shared/hooks/useCurrencyInput.ts:243-254`). `setValueMinor(null)` con `allowEmpty` llama `updateValue`, que invoca `onChange` incluso cuando el valor no cambió (`:106-111,181-191`). Tres páginas tienen efectos que dependen del objeto completo del hook y llaman a ese setter: Movimientos `TransactionsPage.tsx:265-267`, Presupuestos `BudgetsPage.tsx:43-54`, Cuentas `AccountsPage.tsx:80-105`; sus callbacks `onChange` siempre crean un objeto de estado nuevo (`TransactionsPage.tsx:79-86`, `BudgetsPage.tsx:44-49`, `AccountsPage.tsx:81-92`).
- **Causa/efecto:** cada render crea un hook-result distinto, el efecto vuelve a ejecutarse, el setter vuelve a emitir `onChange` y la página vuelve a renderizar. Es un ciclo de estado al montar/actualizar; puede terminar en “Maximum update depth exceeded” o dejar la pantalla sin responder. Afecta tres de las pantallas financieras principales.
- **Verificación pendiente:** no hay pruebas de componentes/renderizado ni se hizo un recorrido autenticado en navegador. Los 10 warnings de ESLint incluyen las cuatro dependencias omitidas en estos efectos.

### F-02 — El onboarding no se alcanza y su guardado apunta a una ruta inexistente

- **Gravedad:** Alta. **Confianza:** alta. **Dificultad:** M.
- **Evidencia:** al recuperar cualquier sesión, `providers.tsx:124-139` establece `onboardingComplete=true`; `App.tsx:16-24` solo muestra `/onboarding` cuando ese valor es falso. La pantalla envía `PATCH /api/account/preferences` (`OnboardingPage.tsx:23-39`), pero el Worker monta solo account, bootstrap, transactions, accounts, transfers, budgets, categories y sync (`worker/index.ts:48-55`); `accountRoutes` no define `/preferences` (`worker/routes/account.ts:15-31,94-127`). La inicialización crea `default_currency='ARS'` (`initialize-user.ts:27-33`) y el estado de onboarding se completa solo en React (`providers.tsx:231-233`).
- **Consecuencia:** el usuario nuevo salta el selector; intentar acceder al paso no persiste la preferencia (404). La moneda principal elegida no se conserva y los formularios arrancan en ARS. La base no tiene un estado durable de onboarding.

### F-03 — El Resumen puede mostrar ceros como si fueran reales y subcuenta meses activos

- **Gravedad:** Alta. **Confianza:** alta. **Dificultad:** M.
- **Evidencia:** `OverviewPage.tsx:63-77` pide solo una página de 100 para el mes actual y el anterior y lee `data` sin comprobar `error`. El cliente resuelve errores HTTP/network como `{data:null,error:...}` (`client.ts:50-87`), no necesariamente lanza una excepción. El `catch` del Resumen, por tanto, no maneja esos fallos; el código sustituye `data` faltante por `[]`. `mergeWithCache` conserva solo filas pendientes del outbox, no todas las filas locales sincronizadas (`transaction-store.ts:16-35`). Los cálculos se basan en esas listas (`OverviewPage.tsx:88-97`).
- **Consecuencia:** sin red o ante un 5xx el resumen puede mostrar cero y “sin movimientos” aunque haya datos cacheados. Con más de 100 movimientos en un mes, ingresos/gastos/saldo y la comparación quedan truncados. No se muestra señal de que el Resumen sea incompleto/offline.

### F-04 — `GET /api/transactions` admite límites negativos/no acotados

- **Gravedad:** Alta por abuso/recursos. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** el contrato define `limit` entero positivo con máximo 100 (`contracts/transaction.ts:35-42`), pero la ruta no lo usa y aplica `parseInt` sin validación (`worker/routes/transactions.ts:13-31`). El servicio enlaza el valor directamente a `LIMIT ? OFFSET ?` (`worker/application/transactions/transactions.ts:53-88`).
- **Consecuencia:** `limit=-1` en SQLite significa “sin límite”; una sola llamada autenticada puede devolver todo el historial propio, incrementar memoria/costo y saltarse la paginación que espera el cliente. El rate limit por usuario no limita el tamaño de cada respuesta.

### F-05 — La secuencia de sync normal no es monotónica bajo concurrencia; el borrado avanza el cursor aun si falla

- **Gravedad:** Alta de integridad. **Confianza:** alta para el orden no atómico; el interleaving concurrente es riesgo estático no reproducido. **Dificultad:** M/L.
- **Evidencia:** `createTransaction` reserva `changeSeq` con `getNextSequence` antes de la escritura (`transactions.ts:93-100`), luego el batch asigna explícitamente ese valor a `user_sync_state.sequence` (`:116-140`). `updateTransaction` también reserva fuera del batch (`:155-166`). `getNextSequence` incrementa la secuencia mediante una sentencia separada (`:287-293`). Dos solicitudes concurrentes pueden reservar N/N+1 y confirmar fuera de orden; la más lenta puede volver a escribir N como cursor después de que ya se haya publicado N+1. Pull solicita solo filas `change_seq > after` y el cursor compartido (`sync-engine.ts:412-443`), por lo que una fila tardía con secuencia menor puede quedar fuera de cursores ya avanzados.
- **Defecto adicional en delete:** `deleteTransaction` reserva secuencia, escribe el tombstone R2 y solo después intenta la actualización condicional por `version`; el cursor se actualiza sin `changes()=1` antes de comprobar el conflicto (`transactions.ts:245-284`). Una versión obsoleta puede avanzar el cursor y dejar un marker de borrado aunque el movimiento no se haya borrado.

### F-06 — Ruta Better Auth alternativa evita el flujo de borrado propio

- **Gravedad:** Alta de seguridad/integridad. **Confianza:** alta en la ruta habilitada; el efecto de cascadas con cada combinación de FKs no se ejecutó. **Dificultad:** S/M.
- **Evidencia:** Better Auth configura `user.deleteUser.enabled=true` (`worker/auth/auth.ts:25-27`) y su handler acepta todas las rutas bajo `/api/auth` (`worker/routes/auth.ts:5-13`, montado en `worker/index.ts:39-41`). En paralelo, la pantalla del producto llama a `POST /api/account/delete`, que exige confirmación y request ID para iniciar la saga (`routes/account.ts:94-116`).
- **Consecuencia:** una solicitud autenticada directa puede invocar el borrado integrado sin la confirmación, recibo paginado ni limpieza local de la ruta del producto. El resultado exacto depende de las cascadas/restricciones financieras: puede borrar sin journal cuando no hay referencias restrictivas o fallar de forma parcial al eliminar relaciones. No hay prueba que compare ambas rutas.

### F-07 — Archivar una cuenta puede hacer desaparecer un saldo y no existe restauración visible

- **Gravedad:** Alta de UX/coherencia financiera. **Confianza:** alta. **Dificultad:** M.
- **Evidencia:** la pantalla lista cuentas con `api.listAccounts()` sin pedir archivadas (`AccountsPage.tsx:107-126`), ofrece archivar pero no acción de desarchivar (`:345-380`); el servicio omite archivadas por defecto y solo las devuelve con `includeArchived` (`worker/application/accounts/accounts.ts:85-101`). La actualización puede poner `archivedAt=null` (`accounts.ts:140-198`), pero no hay un flujo UI para ello. El archivado no exige balance cero y el total de UI suma solo las cuentas devueltas (`AccountsPage.tsx:128-138`).
- **Consecuencia:** archivar una cuenta con saldo la oculta de la lista y del total visible sin que el usuario pueda restaurarla desde la aplicación. Los movimientos siguen existiendo, por lo que el total de la pantalla de cuentas puede no coincidir con lo que la persona considera su patrimonio.

### F-08 — Transferencia en misma moneda ignora el importe destino que sí ofrece la UI

- **Gravedad:** Alta financiera. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** la UI permite indicar “otra moneda o importe distinto” y envía `toAmountMinor` (`AccountsPage.tsx:235-268`). El servidor calcula `toAmount = sameCurrency ? fromAmountMinor : toAmountMinor` (`worker/application/transfers/transfers.ts:81-86`). El contrato permite enviar `toAmountMinor` sin exigir que las monedas sean distintas (`contracts/transfer.ts:8-23`).
- **Consecuencia:** si el usuario marca importe destino distinto pero conserva la misma moneda, el servidor guarda el importe origen y descarta silenciosamente el valor ingresado. El balance destino queda equivocado frente a lo que el formulario permitió indicar.

### F-09 — Categorías archivadas aparecen como opciones de movimiento que el servidor rechazará

- **Gravedad:** Media-alta. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** `TransactionsPage` pide categorías incluyendo archivadas (`:127-148`) y arma las opciones por tipo sin filtrar `archivedAt` (`:365-384`). En alta, la categoría inicial también es la primera por tipo, sin filtrar archivo. El servidor exige categoría activa y compatible (`worker/application/transactions/transactions.ts:40-51`). En edición, valida incluso si el usuario solo cambia nota/fecha y conserva una categoría ya archivada.
- **Consecuencia:** la pantalla deja seleccionar valores que devuelven error; las transacciones históricas de una categoría archivada no pueden editarse en campos no relacionados sin reasignar categoría.

### F-10 — Actualizar presupuesto por API permite categorías propias de ingreso o archivadas

- **Gravedad:** Media. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** el alta valida que la categoría sea propia, activa y `kind='expense'` (`budgets.ts:75-81`); `updateBudget` acepta `categoryId` sin repetir esa verificación (`:106-140`). La FK compuesta restringe el usuario, pero no el tipo ni `archived_at` (`migrations/0001_initial.sql:99-110`).
- **Consecuencia:** una llamada directa puede asociar un presupuesto de gasto a una categoría de ingreso o archivada; el presupuesto luego calcula gasto cero/incoherente.

### F-11 — El presupuesto devuelve `spentMinor=0` al guardarse aunque ya tenga gastos

- **Gravedad:** Media-baja, principalmente contrato API. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** los caminos de alta/upsert y update llaman `mapBudget` con `spent_minor: 0` (`budgets.ts:87-103,139-140`). El listado sí calcula gasto real por categoría/período/moneda (`:50-65`). La UI hace un reload tras guardar, lo que suele corregir el valor presentado (`BudgetsPage.tsx:121-173`).
- **Consecuencia:** los consumidores de la respuesta de escritura reciben un progreso/restante distinto al GET posterior. La pantalla actual mitiga el error solo si el reload funciona.

### F-12 — El CSV puede romperse con nombres/notas y permite fórmulas de hoja de cálculo

- **Gravedad:** Media de seguridad/consistencia de exportación. **Confianza:** alta estática; no se abrió en Excel/LibreOffice. **Dificultad:** S.
- **Evidencia:** la exportación concatena celdas de categoría sin escapar y solo envuelve/duplica comillas de `note` (`worker/routes/account.ts:50-88`). Campos controlables por usuario, como nombre de categoría y nota, pueden incluir coma, comillas, salto de línea o prefijos de fórmula (`=`, `+`, `-`, `@`).
- **Consecuencia:** columnas/filas pueden desalinearse; una hoja de cálculo puede interpretar texto exportado como fórmula. El diálogo indica que exporta movimientos, categorías y presupuestos, por lo que la omisión de transferencias/cuentas no contradice literalmente ese texto, pero **no es un backup completo de toda la información financiera**.

### F-13 — Los defaults de fecha/mes usan UTC y se adelantan respecto de Buenos Aires

- **Gravedad:** Media. **Confianza:** alta por la conversión usada; el momento exacto depende de hora local. **Dificultad:** S.
- **Evidencia:** Resumen, movimientos, presupuestos y estadísticas inicializan el mes con `new Date().toISOString().slice(0,7)`; movimientos/transferencias inicializan la fecha con `toISOString().slice(0,10)` (`OverviewPage.tsx:23-25`; `TransactionsPage.tsx:40-46,52-56`; `BudgetsPage.tsx:30-31`; `StatisticsPage.tsx:18-20`; `AccountsPage.tsx:35,54-63`). La aplicación declara `America/Argentina/Buenos_Aires` en `domain/date.ts` y Ajustes muestra esa zona.
- **Consecuencia:** entre las 21:00 y medianoche en Argentina, UTC ya está en el día/mes siguiente; los formularios y períodos por defecto pueden asignar un movimiento al día o mes incorrecto.

### F-14 — La reconexión/sync automático depende de estar en Movimientos

- **Gravedad:** Media. **Confianza:** alta en el alcance del listener; ejecución automática no verificada en navegador. **Dificultad:** M.
- **Evidencia:** el único listener `online` encontrado está en `TransactionsPage.tsx:150-163`; no encontré listener global de foco/online en providers. El service worker puede emitir `SYNC_WAKEUP` (`public/sw.js:108-118`) pero no encontré un receptor `message` ni registro de `Background Sync` en cliente. La sincronización manual sí está en Ajustes/sidebar. `OFFLINE-SYNC.md` menciona reintento por evento online/foco/acción, pero el foco no tiene listener localizado.
- **Consecuencia:** si el usuario sale de Movimientos antes de reconectar, la cola puede quedar pendiente hasta que visite Movimientos, entre en Ajustes, use el sync de escritorio o reinicie sesión. En móvil no hay el mismo control de sincronización del sidebar.

### F-15 — Los fallback de Movimientos/Estadísticas ocultan errores y pueden mostrar datos no filtrados

- **Gravedad:** Media-alta de UX. **Confianza:** alta en la rama estática; respuestas reales no reproducidas.
- **Evidencia:** `TransactionsPage.tsx:112-121` trata cualquier error de carga con filas cacheadas como offline, filtra solo por mes y no reaplica moneda/tipo/categoría. Estadísticas usa caché en el `catch` y si encuentra movimientos deja `error=null` (`StatisticsPage.tsx:89-99`), pero no muestra indicador de dato desactualizado.
- **Consecuencia:** una respuesta 401/426/500 puede verse como “offline”; en Movimientos los filtros activos dejan de corresponder con la lista. En Estadísticas, el usuario puede leer cifras antiguas como actuales.
- **Matiz:** la cola offline de edición/borrado/presupuesto/categorías no existe y el documento offline declara que solo el alta de movimientos tiene cola; esto es una limitación explícita, no una operación simulada.

### F-16 — Hay paginaciones/límites de producto que no muestran truncamiento

- **Gravedad:** Media. **Confianza:** alta. **Dificultad:** S/M.
- **Evidencia:** Estadísticas termina tras 20 páginas de 100 (`StatisticsPage.tsx:25-35`), por lo que ignora movimientos posteriores a 2.000 por período sin indicarlo. Cuentas solicita solo 25 transferencias y no ofrece paginación (`AccountsPage.tsx:111-114`).
- **Consecuencia:** meses excepcionalmente activos muestran estadísticas incompletas y transferencias viejas dejan de ser accesibles para borrado desde la interfaz.
- **Matiz:** “transferencias recientes” puede ser una decisión intencional, pero no hay pantalla de historial completo encontrada.

### F-17 — Preferencia de moneda fija y ajustes que parecen dinámicos pero son literales

- **Gravedad:** Media. **Confianza:** alta para el código. **Dificultad:** M.
- **Evidencia:** bootstrap fija ARS en preferencias (`initialize-user.ts:27-33`); la UI del onboarding que permitiría elegir otra moneda no se alcanza y carece de ruta API. Formularios de movimiento/presupuesto comienzan en ARS (`TransactionsPage.tsx:42-50`; `BudgetsPage.tsx:28`). Ajustes muestra versión `0.1.0`, moneda base `ARS` y zona horaria como literales (`SettingsPage.tsx:241-249`).
- **Consecuencia:** las pantallas aparentan admitir una preferencia personal que no llega a usarse; los valores informativos pueden quedar desactualizados en builds futuros.

### F-18 — Archivo de categoría sin movimientos borra físicamente en vez de conservar un archivo restaurable

- **Gravedad:** Baja-media de UX. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** `archiveCategory` elimina la fila si no encuentra ninguna transacción y solo usa `archived_at` si encuentra referencias (`categories.ts:78-108`). La UI lo llama “Archivar” y luego recarga (`CategoriesPage.tsx:141-150`).
- **Consecuencia:** una categoría vacía desaparece definitivamente de la lista de archivadas; el usuario no puede restaurarla. Puede ser deliberado, pero la acción/semántica no lo explica.

### F-19 — Navegación legal no tiene contenido y documentación contradice al producto

- **Gravedad:** Media-baja, con aspecto legal/comercial. **Confianza:** alta. **Dificultad:** S.
- **Evidencia:** Login enlaza `/terminos` y `/privacidad` (`LoginPage.tsx:52-74`); esas rutas no están declaradas y no hay páginas/archivos localizados; el wildcard de `App.tsx:26-38` vuelve a `/`. README marca cuentas/transferencias fuera de alcance (`README.md:91-98`) a pesar de pantallas/endpoints implementados. La sección de despliegue aún describe 0001 como el esquema consolidado (`docs/DEPLOYMENT.md:56-64`), mientras el repo tiene 0001, 0002, 0004 y 0005.

### F-20 — La eliminación propia tiene un endpoint alternativo y mínimo de versión desactivado

- **Gravedad:** Alta de compatibilidad/integridad. **Confianza:** alta en configuración; impacto de despliegue no comprobado.
- **Evidencia:** `user.deleteUser.enabled=true` habilita el borrado integrado de Better Auth (`worker/auth/auth.ts:25-27`), además de la saga de `/api/account/delete` (`worker/routes/account.ts:94-116`). La ruta Better Auth se reenvía por `/api/auth/*` (`routes/auth.ts:5-13`; `worker/index.ts:39-41`) y no pasa por el handler de recibo R2/D1 de la aplicación. `MIN_APP_VERSION` está vacío (`wrangler.jsonc:10-13`) y el endpoint propio exige `requestId` (`routes/account.ts:94-100`).
- **Consecuencia:** queda una ruta de borrado propia que no usa la confirmación/saga del producto; su efecto de cascada depende de restricciones D1 y no fue ejecutado. Clientes PWA antiguos que no envían `requestId` no quedan bloqueados por la configuración actual y reciben error al borrar cuenta.

### F-21 — Persistencia local y cambios entre versiones no garantizan conservar colas históricas

- **Gravedad:** Alta si existe un cliente con IndexedDB anterior. **Confianza:** condicional: el comportamiento de upgrade está en código, pero no se verificó que haya dispositivos en versiones <3.
- **Evidencia:** el único schema actual es Dexie v3 y su `upgrade` limpia las cinco tablas (`database.ts:48-59`), incluyendo `outbox` y movimientos. No se encontró en el historial inspeccionado una versión anterior del schema, así que no afirmo que haya usuarios reales con DB v1/v2.
- **Consecuencia:** cualquier dispositivo que efectivamente tenga una DB con versión menor a 3 perdería su cache y operaciones offline al actualizar. La API `navigator.storage.persist()` no evita migraciones explícitamente destructivas.

## Seguridad y resistencia a abusos

**Controles presentes:** sesión de servidor para rutas de negocio, consultas con `user_id`, restricciones compuestas en D1; same-origin compara contra `BETTER_AUTH_URL`; body API de 1 MiB, sync de 256 KiB y máximo 50 operaciones; rate limits distribuidos en D1 (180 lecturas, 60 mutaciones, 20 pushes sync por usuario/minuto y 30 comprobaciones de borrado por IP/minuto). La revisión estática no encontró evidencia nueva de IDOR directo en los CRUD normales revisados.

**Riesgos concretos:** F-04 permite límites negativos/unbounded en listado de movimientos; F-06 deja una ruta alternativa de borrado; F-12 crea riesgo de CSV injection; `cf-connecting-ip` se confía como identidad del límite anónimo y debe verificarse en el ingress real. `docs/SECURITY.md` todavía indica que el rate limit de borde para `/api/auth/*` queda pendiente. No se probó tráfico distribuido, la cabecera en el despliegue ni los límites reales de Cloudflare.

## Calidad técnica y pruebas

- **Automatizado local:** `npm test`: 19 archivos, 99 tests pass; `npm run typecheck`: pass. En tests OAuth se imprimen warnings por credenciales Google ausentes/estado OAuth no encontrado; el suite pasa, pero no valida login real.
- **ESLint:** `npm run lint` termina con código de error por `--max-warnings 0`: 10 warnings, sin errores. Incluye los cuatro warnings de dependencias de efectos `useCurrencyInput` que coinciden con F-01, imports/variables sin uso y un argumento sin usar (`AppShell.tsx:12`; `AccountsPage.tsx:6,101,105`; `BudgetsPage.tsx:6,54`; `TransactionsPage.tsx:8,40,267`; `initialize-user.ts:29`).
- **Cobertura:** los 19 tests son unitarios/de integración de contratos, servicios, sync, bootstrap, assets y versión. No encontré pruebas React/DOM, end-to-end de pantallas ni recorridos responsive. Los tests pasan pese al ciclo de renderizado porque no montan esas páginas.
- **Build:** no ejecuté `npm run build`. El `prebuild` ejecuta `rmSync('dist',{recursive:true,force:true})` (`package.json:8`). Antes de auditar, `dist/` existía, estaba ignorado por Git y contenía un build de cliente y Worker. El comando elimina ese artefacto antes de reconstruirlo; no comprobé que un build alternativo de Cloudflare a `outDir` aislado sea equivalente.
- **Migraciones:** las migraciones 0004/0005 están en el árbol y las pruebas usan el entorno local; no se aplicaron a D1 remoto. El directorio no contiene 0003; no sé si nunca existió o está aplicado remotamente. `npm run deploy` no ejecuta `db:migrate:remote`; la guía exige migración manual antes del Worker (`package.json:15-17`; `docs/DEPLOYMENT.md:56-65`).
- **Estado del código:** los cambios de las etapas anteriores y otros cambios locales siguen sin commit. Esta auditoría describe el árbol actual; no prueba que se encuentre desplegado ni diferencia automáticamente qué línea corresponde a cada etapa.

## Plan de corrección priorizado

| Prioridad | Hallazgo | Impacto / dificultad | Dependencias y criterio de cierre |
|---|---|---|---|
| **P0 — bloqueante** | F-01 ciclo de efectos en los tres formularios | Movimientos, Cuentas y Presupuestos pueden entrar en update loop; M | Estabilizar la API del hook/efecto y evitar `onChange` al aplicar valor externo; prueba de render/mount sin límite de actualizaciones y test de editar/tipar moneda en cada página. |
| **P0 — antes de usar datos reales** | F-05 secuencia/cursor y tombstones normales | Riesgo de omitir cambios entre dispositivos y markers falsos; M/L | Reservar secuencia, mutación y cursor atómicamente/monotónicamente; emitir marker solo tras confirmar delete; prueba con requests intercaladas y versión obsoleta. |
| **P0 — antes de usar datos reales** | F-03 resumen truncado/errores | Saldos comparativos falsos o cero offline; M | Consumir páginas completas o una agregación server-side con cursor; comprobar `error`; mostrar cache únicamente como offline claramente señalado. Tests >100 filas y respuestas 401/500/offline. |
| **P0 — seguridad de disponibilidad** | F-04 query `limit` sin cota | Respuesta sin límite y gasto de recursos; S | Aplicar contrato compartido en ruta, validar page/limit y rechazar negativos/overflow. Tests de `-1`, `0`, >100 y page extremo. |
| **P0 — integridad de borrado** | F-06 ruta Better Auth alterna | Puede evitar recibo/journal/limpieza local; S | Deshabilitar el endpoint built-in o integrarlo en la saga; test HTTP del endpoint con sesión reciente y con relaciones D1. |
| **P1 — datos visibles** | F-07 restaurar cuentas archivadas y sus balances | Saldo desaparece de pantalla y no hay restauración; M | Mostrar archivadas/restaurar o bloquear archivo si hay saldo con explicación. Verificar totals y transfers después de archivar/restaurar. |
| **P1 — coherencia de transferencia** | F-08 importe destino en misma moneda | Saldo acreditado distinto al input; S | Definir/validar la regla para mismo currency y probar mismo/distinto importe en API y formulario. |
| **P1 — onboarding/preferencias** | F-02 | Primera sesión no tiene onboarding ni moneda guardada; M | Endpoint GET/PATCH y flag durable; provider debe leerlo, no inferirlo de sesión; pruebas de nuevo usuario, persistencia y reingreso. |
| **P1** | F-15 caché/filtros y F-14 reconexión | Datos stale sin etiqueta, cola tarda en vaciarse; M | Aplicar filtros al cache, solo usar fallback ante fallos de red, indicador stale; centralizar listener de reconexión y alinear mensaje SW con la cola real. |
| **P1** | F-09/F-10 categorías archivadas y presupuesto | Errores visibles o datos de presupuesto incoherentes; S | Filtrar archivadas en formularios de movimiento y validar categoría activa/tipo en actualización de presupuesto; integración API directa. |
| **P1** | F-17 defaults temporales/locales | Movimientos/períodos se asignan al día/mes siguiente en borde horario; S | Usar funciones de fecha local Argentina en defaults y agregar tests con TZ Buenos Aires a 21:00 y fin de mes. |
| **P2** | F-12 CSV, F-13 métricas, F-16 historial | Export inseguro; truncamiento/ocultación de errores; S/M | Encoder CSV común + neutralización de fórmula; indicador de datos incompletos/stale; paginación o copy explícito para historial. |
| **P2** | F-19 legales/docs | Rutas legales rotas y documentación desactualizada; S | Añadir páginas legales reales y reconciliar README/arquitectura/despliegue con capacidades existentes. |
| **P1 de release** | F-20/F-21/entorno | Clientes viejos y DB local pueden no ser compatibles; M | Definir nueva versión de cliente, configurar `MIN_APP_VERSION`, validar y aplicar en orden todas las migraciones remotas antes del Worker. Inventariar DB local <3 si se sabe que hubo builds anteriores. |
| **P2 de release** | ESLint y build | Calidad/gates no limpios; S | Resolver 10 warnings; separar build limpio de un `dist` existente o respaldarlo; probar la salida Cloudflare en un `outDir` aislado antes de limpiar el actual. |

## Cierre

**No recomiendo declarar el producto terminado ni desplegar esta rama para uso financiero diario todavía.** Primero corregir F-01, F-03, F-04, F-05, F-06, F-07, F-08 y F-02; después validar en navegador real los recorridos de alta/edición/borrado, categorías archivadas, filtros, offline/reconexión, dos cuentas en el mismo dispositivo y actualización de PWA. Las correcciones de las etapas previas tienen tests de backend, pero el punto crítico de formularios muestra por qué el suite actual no basta para certificar experiencia real.

La auditoría es de código y pruebas locales; no afirma que un defecto potencial de concurrencia haya sido explotado ni que una ruta alternativa haya completado una cascada en producción. Esos efectos deben verificarse en D1/R2 de staging con datos sintéticos, nunca sobre la base real.
