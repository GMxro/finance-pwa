# Auditoría UI/UX — App Finanzas (mobile-first)

Fecha: 2026-11-10. Repo: finance-pwa. Alcance: auditoría estática completa (8 subagentes especializados en paralelo: arquitectura UI, layout/responsive, forms/modales, espacio/jerarquía, navegación/flujos, accesibilidad, consistencia de datos, performance percibida). Sin cambios de código. Identidad visual (colores, tipografía base, píldoras, botones negros) se conserva; se evalúa espacio, densidad, jerarquía, accesibilidad, datos y rendimiento.

## 1. Resumen ejecutivo

- Causa raíz #1 — Migración parcial a tokens y guard insuficiente: `check-tokens.mjs` solo valida referencias `var(--x)` (pasa con ~302 literales px fuera de `tokens.css`) y no detecta hardcoded lengths/z-index/breakpoints. Convención "cero hardcoded" se viola en AppShell, AuthLayout, transactions, Modal, etc.
- Causa raíz #2 — Primitivas duplicadas sin contrato: tres implementaciones de dialog (Modal, SelectSheet, `<dialog>` nativo), Field wrapper repetido en Input/Select/RadioGroup, RadioGroup vs SegmentedControl, SelectSheet sin foco/Tab/Escape/scroll-lock.
- Causa raíz #3 — Inconsistencias de sync/contrato en datos: `pullSync` y `updateTransaction` omiten `sourceType`/`sourceId`; `getMonthlySummary` ignora USD sin currency; `accountId` mapeado a `null` pese a NOT NULL; día default de recurrencia usa `new Date().getDay()`; export usa fecha UTC.
- Causa raíz #4 — Layout responsive con overrides que anulan el sistema: grid ingresos/gastos fuerza 2 columnas en móvil (LAYOUT-01), ellipsis inefectivo sobre flex (LAYOUT-04/05), safe-area duplicada en Modal/Select (LAYOUT-06/07), manejo de teclado solo en Modal con umbral 100px.
- Causa raíz #5 — Navegación con secciones huérfanas y tareas enterradas: Calendario/Compromisos inalcanzables en desktop (NAV-01), crear cuenta/transferir bajo "Más" (3 taps), FAB solo en Inicio/Estadísticas, feedback post-guardado ambiguo (NAV-04), empty state de Movimientos sin acción.
- Causa raíz #6 — Performance percibida: sin virtualización, `LedgerList` reagrupa en cada render, Statistics carga hasta 20 páginas secuenciales por mes, callbacks inline anulan memoización, `AccountsPage.totals` ejecuta `setError` dentro de `useMemo`.

## 2. Tabla de hallazgos por severidad

Leyenda: Crítica / Alta / Media / Baja. Evidencia con `archivo:línea` y valor. Hallazgos consolidados y deduplicados entre los 8 auditores.

### Críticas

| ID | Pantalla/componente | Evidencia (archivo:línea + valor) | Problema | Impacto usuario | Causa raíz | Corrección propuesta |
|---|---|---|---|---|---|---|
| NAV-01 | Navegación desktop | `navigation.ts:10-17` NAV_ITEMS sin `/calendario` ni `/compromisos`; `AppShell.css:299-315` `.ui-more-menu display:none ≥1024px`; `:308-310` bottom nav `display:none ≥1024px` | Calendario y Compromisos solo en menú "Más" mobile; ese menú oculto en desktop → 2 de 8 secciones inalcanzables | Usuario desktop no puede acceder a 2 secciones | Navegación no adaptada a desktop | Agregar Calendario/Compromisos a NAV_ITEMS desktop o mostrar sidebar con todas las secciones |
| NAV-04 | Movimientos (post-guardado) | `TransactionsPage.tsx:574-576` `closeModal(); … await loadData(false, 1);` | Al guardar se cierra modal y recarga; si `occurredOn` cae fuera del mes/filtros activos, la fila nueva no aparece | Usuario cree que falló y duplica el movimiento | Feedback ambiguo + filtro activo | Toast "Movimiento guardado" + mantener modal abierto hasta confirmar, o navegar al mes correcto; mostrar la fila recién creada |
| NAV-10 | Modal movimiento (doble submit) | `TransactionsPage.tsx:759` `onClick={() => void handleSubmit()}` + `:763` `onSubmit`; guard `:489` `if (saving) return;` | El botón dispara handler y submit del form; en React 18 ambos closures ven `saving=false` | Riesgo de movimiento duplicado en la tarea más frecuente | Doble disparo sin guard efectivo | Unificar en un solo `onSubmit` del form; quitar `onClick` del botón; guard con ref o disabled |

### Altas

| ID | Pantalla/componente | Evidencia (archivo:línea + valor) | Problema | Impacto usuario | Causa raíz | Corrección propuesta |
|---|---|---|---|---|---|---|
| ARCH-01 | shared/ui (Modal/Select) | `Modal.tsx:104-197` createPortal+focus trap+scroll lock+Escape; `Select.tsx:63-110` createPortal+focus trap+Escape; `SettingsPage.tsx:236` `<dialog>`; `AppUpdateNotice.tsx:212` `<dialog>` | Tres implementaciones de dialog/sheet con lógica duplicada y z-index distintos (200/300/1000) | Inconsistencia de foco, stacking y mantenimiento | Sin primitiva única | Consolidar en `Modal` con `variant="sheet"`; migrar SelectSheet y `<dialog>`; eliminar `@keyframes` duplicados |
| ARCH-03 | shared/ui (RadioGroup/SegmentedControl) | `RadioGroup.tsx:1-60` (native radio) vs `SegmentedControl.tsx:1-60` (button aria-pressed, sin roving tabindex) | Dos primitivas con responsabilidad solapada y a11y divergente | Navegación por teclado inconsistente | Sin spec compartida | Unificar en una primitiva con `variant="radio"\|"segmented"` o documentar roles y compartir `Option`; agregar roving tabindex |
| ARCH-05 | AppShell y varios | `AppShell.css:29` `border-radius: 10px`; `:68-70` `left:9px; width:3px; height:14px`; `:124-126` `width/height:34px`; `:192-194` `min-height:48px; padding:4px 2px; border-radius:14px`; `:236-239` `width/height:56px`; `:276` `min-width:190px`; ~302 literales px fuera de tokens | Valores de longitud directos violan la convención "cero hardcoded" | Inconsistencia de spacing/sizing; cambios globales requieren ediciones dispersas | Cobertura de tokens incompleta + sin enforcement | Agregar tokens (`--avatar-size-sm:34px`, `--tap-target-min:48px`, `--quick-add-size:56px`, `--radius-control:10px`, `--radius-chip:14px`) y reemplazar; extender `check-tokens.mjs` |
| ARCH-07 | AppShell/Modal/Select/Notice/Input | `AppShell.css:15` z-index 30; `:174` 40; `:235` 35; `:274` 45; `Modal.css:4` 200; `Select.css:111` 300; `AppUpdateNotice.css:3` 1000; `Input.css:36` 1 | Escala de z-index arbitraria sin orden definido | Overlays pueden renderizar bajo/sobre capas incorrectas | Sin tokens de z-index | Agregar `--z-*` tokens y reemplazar literales |
| ARCH-10 | scripts/check-tokens.mjs | Script solo valida `var(--x)` referencias (pasa con 302 literales presentes) | El guard no puede hacer cumplir "cero hardcoded" | Violaciones de convención se envían sin detección | Alcance del guard limitado | Extender script: escanear CSS (excepto tokens.css) por literales de longitud numéricos no en allowlist; fallar prebuild |
| DATA-01 | worker transactions | `transactions.ts:243-246` SELECT de respuesta omite `source_type`/`source_id`; `mapTransaction:39` cae a `?? 'manual'` | Tras editar tx `installment`/`recurring`/`initial`, cliente recibe `sourceType='manual'` | Saldo inicial deja de marcarse; guard de edición de cuotas falla | Mapeo incompleto | Incluir `source_type, source_id` en SELECT y mapTransaction |
| DATA-02 | worker sync-engine | `sync-engine.ts:406` SELECT omite `source_type, source_id`; `mapRowToDto:444-459` no los incluye | Después de sync el cliente pierde `sourceType` | "Saldo inicial" deja de marcarse; guard de installments falla | Mapeo incompleto | Incluir ambos campos en SELECT y DTO |
| DATA-05 | migrations/0009 | `0009_rename_default_accounts.sql:5-25` renombra solo si `name='Sueldo'/'Otros ingresos'`, `kind='bank'`, `sort_order=2/3` | Cuentas antiguas archivadas/reordenadas o creadas por usuario con esos nombres quedan como "Sueldo"/"Otros ingresos" | Indistinguibles de categorías "Salario"/"Otros ingresos" | Heurística frágil | Migración idempotente por `id`/flag o renombrar solo cuentas seed con identificador estable |
| DATA-06 | worker accounts | `accounts.ts:143-152` si slug `otros-ingresos`/`otros-gastos` no existe/archivado, usa primera categoría del mismo kind | Saldo inicial puede atribuirse a "Salario" (u otra) | Contamina reportes por categoría | Fallback silencioso | Fallar/crear categoría seed; no usar fallback silencioso; o bloquear creación de cuenta sin categoría seed |
| DATA-07 | worker transactions | `transactions.ts:322-389` construye `['ARS','USD']` pero retorna `results[0]` (ARS) | Resumen USD no se entrega cuando la llamada no especifica moneda | Inconsistencia ARS/USD en resúmenes | Retorno prematuro | Devolver ambos o exigir currency en el contrato |
| FORM-01 | Modal (mobile) | `Modal.css:16` desktop `max-height: var(--sheet-max-height)` (92dvh); `:115` mobile `max-height: calc(100dvh - safe-top - keyboard-inset)` sin cap | En mobile con teclado cerrado el sheet ocupa toda la pantalla | Inconsistente con convención 92dvh | Override mobile sin cap | Cap en mobile: `min(calc(...), var(--sheet-max-height))` |
| FORM-05 | Cuentas (kind) | `AccountsPage.tsx:39-44` KIND_OPTIONS 4 items; `:643-648` SegmentedControl; convención: >3 → sheet/chips; `Select.tsx:234` auto-switch | Segmented de 4 opciones puede desbordar en viewports angostos | Inconsistente con Select | Bypass de la regla | Usar Select (sheet) o chips para 4 opciones |
| FORM-06 | Modal movimiento (delete) | `TransactionsPage.tsx:748-758` delete Button sin `disabled={saving}`/`loading`; submit `:759` `loading={saving}` | El botón delete sigue clickeable durante el save | Posible delete concurrente con save | Falta busy guard en acción secundaria | `disabled={saving}` en delete |
| FORM-08 | Modal movimiento (footer) | `TransactionsPage.tsx:746-761` footer solo delete condicional + submit; sin Cancel | Dismissal depende de overlay/close, deshabilitados mientras busy | Usuario no puede cancelar un save en curso desde el footer | Falta acción Cancel | Agregar botón Cancel (disabled={saving}) |
| LAYOUT-01 | Overview (ingresos/gastos) | `overview.css:91-93` `grid-template-columns: repeat(2, minmax(0, 1fr))` sin media query | Anula el colapso del sistema a 1 columna a ≤640px | A 360px cada card ≈136px; montos se recortan/envuelven | Override posterior al sistema | Eliminar la regla o envolver en `@media (min-width:641px)` |
| LAYOUT-04/05 | Money / overview | `overview.css:76-81` ellipsis sobre `.ui-money` (inline-flex); `Money.css:1-11` `display:inline-flex; overflow:hidden; text-overflow:ellipsis` | `text-overflow: ellipsis` no aplica a contenedores flex | Montos largos cortados sin "…" | Contenedor flex con ellipsis | Envolver `displayAmount` en span con overflow/ellipsis/min-width:0 |
| LAYOUT-06/07 | Modal / Select sheet | `Modal.css:117` padding-bottom safe-bottom + `:132` footer padding `calc(space-4 + safe-bottom)`; `Select.css:234` + `:242` igual | safe-area sumada dos veces | Padding inferior excesivo, footer desplazado | safe-bottom redundante | Quitar safe-bottom de uno de los dos |
| NAV-02 | FAB / quick-add | `AppShell.tsx:34` `showQuickAdd = pathname === '/' || pathname === '/estadisticas'` | FAB solo en Inicio y Estadísticas; falta en Movimientos | Registrar gasto desde Movimientos exige header "Nuevo movimiento" | Lógica de visibilidad limitada | Mostrar FAB también en `/movimientos` |
| NAV-03 | Tareas comunes | `navigation.ts:19-22` MOBILE_NAV_ITEMS solo Inicio/Movimientos/Estadísticas; `:25-30` Cuentas/Presupuestos/Calendario/Compromisos/Ajustes en MORE | Crear cuenta y transferir bajo "Más" (2 taps extra) | Cuenta: 3 taps; transferencia: 3 taps | Jerarquía de navegación | Promover Cuentas (y tal vez Presupuestos) al bottom nav o agregar atajos |
| NAV-05 | Movimientos (empty) | `TransactionsPage.tsx:713-718` `<EmptyState … />` sin `action` | Lista vacía sin botón para crear primer movimiento | Camino muerto en la pantalla más usada | Empty state sin acción | Pasar `action` con botón "Nuevo movimiento" |
| NAV-06 | Movimientos (offline) | `TransactionsPage.tsx:214-226` rama offline setOffline+setError; `:669-683` renderiza Notice offline y Notice error a la vez | Dos avisos con el mismo mensaje (~110px) | Ruido duplicado al perder conexión | Doble set de estado | En rama offline no setear `error`; un solo Notice con "Reintentar" |
| NAV-07 | Sync indicator | `AppShell.tsx:42-43` 'Al día'/'X pendiente(s)'; `SettingsPage.tsx:61-62` 'Todo sincronizado'/'X cambios pendientes'; `AppShell.tsx:87` tooltip estático "Tus datos están guardados y al día" | Mismo estado con dos nombres y tooltip que afirma "al día" incluso con error/pendientes | Usuario no puede confiar en el indicador | Copy inconsistente | Unificar nombres y tooltip dinámico según estado (ok/pending/error) |
| A11Y-01/02/03/04/05/06 | Button/IconButton/eye/Notice/AppShell/chip | `Button.css` sm 32px/md 40px; `IconButton.css` sm 40px; `OverviewPage` eye 36px; `Notice.css` close 32px; `AppShell.css` 40px; `transactions.css` chip 28px | Touch targets por debajo de 44px | Taps imprecisos en móvil | Tokens de altura insuficientes | Subir a min 44px (o 40px aceptable para secundarios documentado) |
| A11Y-07 | offline.html | `offline.html` texto/icono `#85898b` sobre blanco = 3.53:1 (<4.5) | Contraste bajo | Ilegible para baja visión | Color fijo | Subir a `#6b7280` o similar (≥4.5:1) |
| A11Y-08 | Input placeholder | `Input.css` placeholder `#9b9b9b` sobre blanco = 2.78:1 | Contraste bajo | Placeholder poco legible | Color fijo | Subir a `#6b7280` |
| DATA-03 | Recurrencia (día default) | `TransactionsPage.tsx:121,132` `new Date().getDay()` | Día por defecto usa getDay en vez de `todayLocalISO()` | Desfase por timezone del dispositivo | Convención no aplicada | Usar `todayLocalISO()` y derivar día local |
| DATA-04 | Export / Legal | `SettingsPage.tsx:46`, `LegalAcceptancePage.tsx:53` `new Date().toISOString().slice(0,10)` | Nombre de archivo con fecha UTC | Desfase para usuarios AR | Convención no aplicada | Usar `todayLocalISO()` |
| DATA-08 | worker sync-engine | `sync-engine.ts:448` `accountId: row.account_id ?? null` pese a NOT NULL y contrato `string` | DTO inconsistente con contrato | Oculta errores futuros | Mapeo defensivo incorrecto | Tipar como `string` sin fallback a null |
| PERF-01 | LedgerList | `LedgerList.tsx:53-58` construye `new Map` agrupando en el cuerpo del render; sin `useMemo`/`React.memo` | Reagrupa y re-renderiza todas las filas en cada render | Jank en listas largas | Sin memoización | `useMemo` para agrupación; `React.memo` en fila |
| PERF-02 | Listas (todas) | `package.json` sin `react-window`/`@tanstack/react-virtual`; `.map` completo en LedgerList/Accounts/Budgets | Sin virtualización | Scroll/jank al crecer filas | Sin windowing | Evaluar virtualización (react-virtual) para listas >50 items |
| PERF-03 | TransactionsPage | `:602-616` `items`/`visibleItems` sin `useMemo`; `:618-620,637` `categoryOptions`/`accountOptions` recreados cada render | Trabajo O(n) por render + re-render de Selects | Jank al filtrar/editar | Sin memoización | `useMemo` para derivados y opciones |
| PERF-05 | AccountsPage | `:216-236` `setError` dentro de `useMemo` (overflow); `:238` `activeAccounts` sin memo | Efecto secundario en render + trabajo redundante | Render adicional + warning React | Side effect en useMemo | Mover setError a useEffect; memoizar activeAccounts |
| PERF-06 | Statistics | `StatisticsPage.tsx:27-35` `for (page=1..MAX_PAGES)` con `await` por página (hasta 20 serial) | Tiempo de carga lineal en número de páginas | Carga lenta con muchos movimientos | Fetch serial | Paralelizar páginas con `Promise.all` (o endpoint agregado) |

### Medias

| ID | Pantalla/componente | Evidencia (archivo:línea + valor) | Problema | Impacto usuario | Causa raíz | Corrección propuesta |
|---|---|---|---|---|---|---|
| ARCH-02 | Input/Select/RadioGroup | `Input.tsx:34-59`, `Select.tsx:256-305`, `RadioGroup.tsx:26,50` | Field wrapper (label/error/helper) duplicado en 3 componentes | Inconsistencia de spacing/aria/error | Sin primitiva Field | Extraer `Field` primitivo |
| ARCH-04 | Modal/Select/Button/Spinner CSS | `Modal.css:140-152` y `Select.css:246-253` `ui-overlay-in`/`ui-sheet-in` duplicados; `Button.css:194` y `LoadingSpinner.css:30` `ui-spin` | Keyframes duplicados | Drift de mantenimiento, CSS mayor | Sin definiciones centrales | Mover keyframes compartidos a `base.css`/`global.css` |
| ARCH-06 | AuthLayout | `AuthLayout.css:109` `min-height: clamp(180px, 28svh, 240px)` | Usa `svh` mientras el resto estandariza `dvh` | Posible salto de layout en toolbars dinámicos | Unidad inconsistente | `clamp(180px, 28dvh, 240px)` |
| ARCH-08 | Varios CSS | `@media (max-width: 640px)` ×14; `899px` ×2; `720/719px`; `560`; `480` ×2; `420`; `380`; `min-width:900` ×3; `1024` | Sin set de breakpoints estandarizado; 719/720 off-by-one | Layouts caen entre breakpoints | Breakpoints inline | Definir breakpoints (480/640/768/1024) compartidos y usarlos |
| ARCH-09 | tokens.css | Space/text tokens en `rem`, control/radius en `px` (`--control-h-lg:44px`, `--radius-card:20px`, `--shell-sidebar:248px`) | Unidades mixtas sin política documentada | Inconsistencia bajo cambios de font-size de usuario | Sin política de unidades | Documentar o convertir tokens de layout a `rem` |
| ARCH-11 | TSX (settings/transactions) | `SettingsPage.tsx:142,193` `size={16}`; tamaños 15–24 (~50 ocurrencias) | Iconos con size raw sin estándar | Escala de iconos inconsistente | Sin estándar de icon-size | Estandarizar 16/20/24 y documentar, o clases `.ui-icon--sm/md/lg` |
| ARCH-12 | Modal | `Modal.css:136` `font-size: 1.375rem;` (mobile) en vez de token | Tipografía fuera del sistema | Inconsistencia menor vs `--text-page-title` | Falta token modal-title | Usar `var(--text-page-title)` o agregar `--text-modal-title` |
| ARCH-13 | Layout | `Layout.css` `max-width:720px`; `60ch`; `minmax(280px,1fr)` | Constantes de layout hardcoded | Difícil ajustar ancho global | Sin tokens de layout | Agregar `--content-max`, `--reading-max`, `--split-min` |
| ARCH-16 | RadioGroup/SegmentedControl | `SegmentedControl.tsx:38-53` button aria-pressed sin roving tabindex | Control segmentado no navega con flechas | Teclado inconsistente | Sin spec compartida | Roving tabindex + arrow keys, o radios estilizados como segments |
| FORM-02 | tx compact | `transactions.css:275` `.tx-compact-label { font-size: 13px; }` | Label 13px fuera de escala (caption 12, body 14) | Jerarquía rota | Token bypass | Usar `--text-caption` o `--text-body` |
| FORM-03 | tx compact | `transactions.css:315` chip `min-height:28px`; `:254` currency-chip `32px`; `:328-329` repeat-icon `32×32` | Targets táctiles <44px | Taps imprecisos | Tokens insuficientes | Subir chips a `--control-h-sm` (32) mínimo y repeat-icon a 40/44 |
| FORM-04 | Cuentas/Transfer | `AccountsPage.tsx:634` Nombre Input sin `data-autofocus`; `:731` amount sin `data-autofocus` | Depende de heurística `firstVisibleEditable` | Foco puede no ir al campo intended | Convención no aplicada | Agregar `data-autofocus` a los campos objetivo |
| FORM-07 | tx amount input | `TransactionsPage.tsx:786-801` cablea onChange/onBlur/onFocus manualmente sin `onCompositionStart/End` de `inputProps` | Faltan handlers de composición IME | Edge cases de teclado móvil/IME | Uso inconsistente del hook | Usar `inputProps` completo o cablear composition handlers |
| FORM-09 | Modal (keyboard) | `Modal.tsx:182-183` `const inset = rawInset >= 100 ? rawInset : 0;` | Insets <100px se ignoran | Footer cubierto en teclados pequeños/flotantes | Umbral alto | Bajar umbral o manejar visualViewport globalmente |
| FORM-10 | tx new-category | `TransactionsPage.tsx:1043` `autoFocus` en Input de categoría | Compete con autofocus del Modal (amount) | Foco puede ir al campo equivocado | Uso de autoFocus nativo | Usar `data-autofocus` gestionado por el Modal |
| FORM-11 | tx amount input | `transactions.css:230` `.tx-compact-amount-input { min-height: 32px; }` vs `--control-h-lg:44px` | Altura del campo de importe menor que controles adyacentes | Jerarquía visual rota en la fila | Token bypass | `min-height: var(--control-h-lg)` |
| LAYOUT-02 | Overview net card | `overview.css:27-29` `.overview-net { min-height: 140px; }` con ~101px contenido | 39px de aire muerto | Espacio desperdiciado | min-height arbitrario | Quitar o `auto` |
| LAYOUT-03 | Overview amount card | `overview.css:95-98` `.overview-amount-card { min-height:100px; height:100%; }` | `height:100%` sin padre con altura explícita | Alturas inconsistentes | Mezcla min-height/height | Dejar solo `min-height:100px` |
| LAYOUT-08 | Keyboard (global) | `Modal.tsx:174-195` único uso de visualViewport; bottom nav fija puede tapar campo enfocado | Inputs a nivel de página no se elevan con teclado | Campo tapado por bottom nav/teclado | Handling acotado a Modal | Manejar visualViewport globalmente; ocultar/elevar bottom nav con teclado |
| LAYOUT-09 | base.css | `base.css:22` `min-width: 320px;` + `:32` `overflow-x: hidden;` | En <320px contenido recortado | Inutilizable en dispositivos muy pequeños | min-width + overflow hidden | `min-width: 0` o quitar min-width |
| LAYOUT-10 | tx date row | `transactions.css:79-94` `.tx-date-row { flex-wrap: nowrap; }`, `.tx-date-field { min-width: 130px; }` | Dos campos 130px + gap justos en 360px | Overflow potencial en dispositivos angostos | nowrap + min-width fijo | Permitir wrap o reducir min-width |
| LAYOUT-11 | tx footer (dead CSS) | `transactions.css:401-408` `.tx-compact-footer` sticky con safe-area; no referenciado en TSX | CSS muerto + riesgo de doble safe-area si se reactiva | Mantenimiento | Código no limpiado | Eliminar regla o quitar safe-bottom |
| LAYOUT-12 | Calendar summary | `CalendarPage.css:168` `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));` | A 360px produce 2 columnas apretadas | Tarjetas de montos apretadas | auto-fit con mínimo 150px | Forzar 1 columna en `@media (max-width:640px)` |
| NAV-08 | Menú "Más" | `AppShell.tsx:128` onClick cierra solo en NavLink; `:13` moreOpen state | Navegación programática deja el overlay abierto | Overlay tapa contenido | Estado no sincronizado | Cerrar moreOpen en cambio de pathname (useEffect) |
| NAV-09 | Transfer button | `AccountsPage.tsx:462` `disabled={activeAccounts.length < 2}` sin motivo visible | Botón deshabilitado sin explicación | Usuario no sabe por qué ni cómo habilitar | Falta affordance | Tooltip/texto "Necesitás al menos 2 cuentas activas" o link a crear cuenta |
| NAV-11 | FAB vs error notice | `AppShell.css:231-236` quick-add z-index:35, bottom; `:174` bottom-nav z-index:40 | FAB puede tapar "Reintentar" del Notice | Acción de reintento inaccesible | z-index/posicionamiento | Elevar Notice o desplazar FAB cuando hay error |
| NAV-12 | Menú "Más" scroll | `AppShell.tsx:147-164` overlay sin scroll-lock (Modal sí lo hace) | Fondo scrollea detrás del menú | Desplazamiento accidental | Falta scroll-lock | Aplicar scroll-lock al body al abrir moreOpen |
| NAV-13 | Calendario (empty) | `CalendarPage.tsx:285-287` EmptyState sin `action` | Día vacío sin atajo para registrar movimiento | Camino muerto | Empty state sin acción | Pasar `action` "Nuevo movimiento" |
| SPACE-01..04 | Page headers (eyebrows) | `AccountsPage.tsx:456` eyebrow "Tu plata"; `CategoriesPage.tsx:206` "Ajustes · Organización"; `TransactionsPage.tsx:642` "Ingresos y gastos"; `BudgetsPage.tsx:206` "Límites por categoría" | Eyebrows decorativos que repiten el título | Headers inflados (~70-150px) | Copy redundante | Remover eyebrows |
| SPACE-06/07 | EmptyState / BudgetList | `EmptyState.css:5-6` gap 12px/padding 24px; `BudgetList.css:104-105` 12/12 | Empty state con padding/gap > 8px (convención 8px) | Espacio desperdiciado | Tokens no aplicados | gap 8px, padding 8px |
| SPACE-08 | "Ver todos" | `overview.css:138-141` `margin-right: var(--space-6)` (24px) | Acción inset 24px del borde derecho | Desalineada con el contenido | Margin arbitrario | `margin-right: 0` |
| SPACE-09/10/11 | Spacing stacking | `overview.css:2,6,24` tres gaps 12px consecutivos; `Layout.css:55` + `overview.css:130-132` margin-top 20px doble; `Layout.css:6` padding 20 + `:15` margin-bottom 20 | Stacking de margin-top+margin-bottom+padding-top | 40px de aire antes del contenido en desktop | Reglas redundantes | Colapsar a un único gap; eliminar clase redundante |
| SPACE-15/16/17/18 | Densidad | `OverviewPage.tsx:238-260` presupuestos antes de movimientos; `LedgerList.tsx:52-58` groupByDay; `TransactionsPage.tsx:532` eyebrow + 3 bloques chrome; `:159-161` offline+error a la vez | Chrome excesivo antes del primer dato; avisos duplicados | Usuario scrollea más para ver datos | Orden/densidad | Movimientos primero; slice(0,3) presupuestos; groupByDay false en home; un solo Notice |
| SPACE-19/20/21/22 | Cuentas/Categorías/Ajustes | `AccountsPage.tsx:413` descripción 89 chars; `:414-421` dos botones en fila; `CategoriesPage.tsx:191,193,168,299` eyebrow+desc+slug+hint; `SettingsPage.tsx:151,156,188-216` | Headers inflados y metadata redundante | Encabezado 152.5px vs 46.5px | Copy redundante | Quitar descripciones/eyebrows/slug; acciones compactas |
| SPACE-25/26/27 | Estadísticas/Cuentas | `StatisticsPage.tsx:205-229` panel duplicado de totales; `AccountsPage.tsx:492-516` archivadas expandidas; `:533` ISO crudo | Duplicación de datos y secciones siempre abiertas | ~1400px con 25 transferencias; ruido | Sin colapso/dedup | Fusionar panel; archivadas colapsadas por defecto; formatear fechas |
| SPACE-28/29 | Overview loading/error | `OverviewPage.tsx:174-177` LoadingSpinner con padding 40px; `:283` Notice de error al final | Spinner empuja contenido 104px; error bajo el pliegue | Saltos de layout; error no visible | Placement | Contenedor con min-height + spinner absoluto; Notice debajo del header |
| SPACE-30 | Búsqueda | `TransactionsPage.tsx:549-556` búsqueda a ancho completo con label | +75.6px de chrome permanente | Menos espacio para lista | Búsqueda siempre visible | Búsqueda colapsable o dentro del panel de filtros |
| A11Y-07/08 | offline.html / Input | `offline.html` `#85898b` sobre blanco 3.53:1; `Input.css` placeholder `#9b9b9b` 2.78:1 | Contraste bajo | Ilegible para baja visión | Color fijo | Subir a `#6b7280` o similar |
| A11Y-09 | Button (disabled) | opacity 0.45 (~3.2:1) | Contraste bajo en disabled (exento pero bajo) | Poco legible | Opacidad baja | Subir a 0.55 o usar color muted |
| A11Y-10 | AppShell | Sin skip-to-content link | Navegación por teclado inicia en bottom nav | Ineficiente para teclado/lector | Falta affordance | Agregar `<a href="#main" className="skip-link">` |
| DATA-03 | tx recurrencia | `TransactionsPage.tsx:121,132` `new Date().getDay()` | Día default usa getDay en vez de todayLocalISO | Desfase por timezone | Convención no aplicada | Usar `todayLocalISO()` y derivar día local |
| DATA-04 | Export/Legal | `SettingsPage.tsx:46`, `LegalAcceptancePage.tsx:53` `new Date().toISOString().slice(0,10)` | Fecha UTC en nombre de archivo | Desfase para usuarios AR | Convención no aplicada | Usar `todayLocalISO()` |
| DATA-08 | sync-engine | `sync-engine.ts:448` `accountId: row.account_id ?? null` pese a NOT NULL + contrato string | DTO inconsistente con contrato | Oculta errores futuros | Mapeo defensivo incorrecto | Tipar como `string` sin fallback |
| PERF-01 | LedgerList | `LedgerList.tsx:53-58` `new Map` agrupando en render; sin useMemo/React.memo | Reagrupa y re-renderiza todas las filas cada render | Jank en listas largas | Sin memoización | useMemo para agrupación; React.memo en fila |
| PERF-02 | Listas | `package.json` sin react-window/@tanstack/react-virtual; `.map` completo | Sin virtualización | Scroll/jank al crecer filas | Sin windowing | Evaluar react-virtual para listas >50 |
| PERF-03 | TransactionsPage | `:602-616` items/visibleItems sin useMemo; `:618-620,637` options recreados | Trabajo O(n) por render + re-render de Selects | Jank al filtrar/editar | Sin memoización | useMemo para derivados y opciones |
| PERF-05 | AccountsPage | `:216-236` setError dentro de useMemo; `:238` activeAccounts sin memo | Side effect en render + trabajo redundante | Render adicional + warning React | Side effect en useMemo | Mover setError a useEffect; memoizar activeAccounts |
| PERF-06 | Statistics | `StatisticsPage.tsx:27-35` for serial hasta 20 páginas por mes | Tiempo de carga lineal | Carga lenta con muchos movimientos | Fetch serial | Paralelizar con Promise.all o endpoint agregado |

### Bajas

| ID | Pantalla/componente | Evidencia (archivo:línea + valor) | Problema | Impacto usuario | Causa raíz | Corrección propuesta |
|---|---|---|---|---|---|---|
| ARCH-14 | TransactionsPage | `TransactionsPage.tsx:813,874,923,938,961` `style={{ padding: '0 var(--space-3)' }}` ×5 | Mismo inline override repetido | Drift de mantenimiento | Falta clase modificadora | Agregar `.ui-field__error--inset` |
| ARCH-15 | Input | `Input.tsx:31` `Math.max(28, 14 + prefix.length * 9)`; `:43` `--prefix-w` | Magic numbers para prefix | Desalineación con prefijos largos | Sin medición real | Medir vía ref o usar `ch` units |
| FORM-10 | (ver arriba Medias) | — | — | — | — | — |
| LAYOUT-09 | base.css | `min-width: 320px` + `overflow-x: hidden` | Recorte en <320px | Bajo (objetivo 360px) | min-width + overflow | `min-width: 0` |
| LAYOUT-10 | tx date row | nowrap + min-width 130px | Overflow potencial | Bajo | nowrap + min-width | Permitir wrap |
| LAYOUT-11 | tx footer (dead) | CSS muerto con safe-area | Mantenimiento | Bajo | No limpiado | Eliminar |
| LAYOUT-12 | Calendar summary | auto-fit minmax(150px) | 2 columnas apretadas a 360px | Bajo | auto-fit | 1 columna en ≤640px |
| SPACE-05 | Commitments | `CommitmentsPage.tsx:323` descripción "Cuotas pendientes, recurrencias y próximos vencimientos." | "recurrencias" es jerga (1 línea OK) | Bajo | Copy | Renombrar a "movimientos recurrentes" |
| SPACE-23/24 | Commitments | `:81-88` dos montos sin etiqueta/mes; `:97-99` tabs como 3 Button; `:103-107` `borderBottom: 1px solid var(--color-border)` (token inexistente) | Resumen sin mes; filas sin separador visible | Bajo | Tokens inexistentes + UX | Título "Comprometido · {mes}" + MonthStepper; SegmentedControl; usar `--color-line` |
| SPACE-27 | Accounts (transfer history) | `AccountsPage.tsx:503` " . Archivada"; `:533` ISO crudo `[occurredOn, note].join(' . ')` | Metadata repetida o en formato de máquina | Bajo | Formateo | Quitar " . Archivada"; `formatDate(transfer.occurredOn)` |
| SPACE-28 | Overview loading | `OverviewPage.tsx:174-177` LoadingSpinner padding 40px | Spinner empuja contenido 104px | Bajo | Placement | Contenedor min-height + spinner absoluto |
| SPACE-29 | Overview error | `OverviewPage.tsx:283` Notice al final | Error bajo el pliegue | Bajo | Placement | Notice debajo del header |
| SPACE-30 | Búsqueda | `TransactionsPage.tsx:549-556` búsqueda a ancho completo con label | +75.6px de chrome | Bajo | Siempre visible | Colapsable o dentro de filtros |
| A11Y-10 | AppShell | Sin skip-to-content | Teclado inicia en bottom nav | Bajo | Falta affordance | Agregar skip link |
| PERF-07/08/09/10 | Varios | Callbacks inline en listas; Modal querySelectorAll en apertura; sin useCallback en handlers; Statistics useEffect currency | Re-render en cascada; costo en apertura; trabajo redundante | Bajo | Sin memoización | useCallback/useMemo; medir foco por ref; efecto solo al cambiar mes |

## 3. Lo que NO está mal (no tocar)

- Tokens definidos en `tokens.css` (94 definidos, 1152 usos) y guard de referencias pasan.
- `viewport-fit=cover` presente (`index.html:9`).
- Uso de `dvh`/`svh` en lugar de `vh` raw (único `svh` en AuthLayout).
- `body`/`#root` usan `100dvh` (`base.css:23,36`); `--sheet-max-height: 92dvh` (`tokens.css:123`).
- safe-area definido vía `env()` (`tokens.css:116-119`); bottom nav 56px y content padding-bottom lo contemplan (`AppShell.css:165,179-180`).
- Modal three-zone layout (header/body/footer), flex scroll con `min-height:0` (`Modal.css:85-103`).
- Busy guard en Escape/overlay/close (`Modal.tsx:128-133,205-213`, close button `disabled={busy}`).
- Focus trap con Tab wrap (`Modal.tsx:134-161`).
- `useEffect` dependency `[open]` stabilization (`Modal.tsx:104,175,197`).
- es-AR formatting vía `Intl.NumberFormat('es-AR')` y `parseCurrencyInput` (`useCurrencyInput.ts:129,82`).
- Inputs 16px vía `--text-input: 1rem` (`tokens.css:66`, `Input.css:48`).
- `Select` auto-promueve ≤3 opciones a `SegmentedControl` (`Select.tsx:234`).
- Eye button con `aria-label`/`aria-pressed`; focus rings; icon-button labels; disabled/loading states; semantics/lang (A11Y verified OK).
- Auth flow, bootstrap, sync engine ownership/tombstones/idempotency (audit-methodology) no re-auditados aquí; pendiente Fase 2.

## 4. Sistema de tokens propuesto (adicionales)

| Categoría | Tokens nuevos |
|---|---|
| Avatares/tap targets | `--avatar-size-sm: 34px`, `--tap-target-min: 44px`, `--quick-add-size: 56px` |
| Radios | `--radius-control: 10px`, `--radius-chip: 14px` |
| Z-index | `--z-base: 0`, `--z-raised: 1`, `--z-shell: 30`, `--z-nav: 40`, `--z-overlay: 200`, `--z-sheet: 300`, `--z-toast: 1000` |
| Layout | `--content-max: 720px`, `--reading-max: 60ch`, `--split-min: 280px` |
| Tipografía | `--text-modal-title: 1.375rem` (o reusar `--text-page-title`) |
| Breakpoints | 480 / 640 / 768 / 1024 (documentados, no como tokens CSS) |

## 5. Primitivas a reconstruir

| Primitiva | Archivos | Reglas clave |
|---|---|---|
| Dialog/Sheet único | `Modal.tsx/.css` | Consolidar SelectSheet y `<dialog>` nativo; foco, Escape, scroll-lock, retorno; `variant="sheet"` |
| Field | nuevo `Field.tsx` | Label/error/helper/required; consumido por Input/Select/RadioGroup |
| Choice (radio/segmented) | `RadioGroup`/`SegmentedControl` | Unificar; roving tabindex + arrow keys |
| Money (ellipsis) | `Money.tsx/.css` | Envolver `displayAmount` en span con overflow/ellipsis/min-width:0 |

## 6. Plan de reconstrucción (orden de ejecución)

1. **Tokens + guard** (ARCH-05, ARCH-07, ARCH-08, ARCH-09, ARCH-10): agregar tokens faltantes, extender `check-tokens.mjs`, reemplazar literales en AppShell. Criterio: `prebuild` pasa; 0 literales no allowlisted.
2. **Dialog único** (ARCH-01, FORM-01, FORM-09): consolidar Modal/SelectSheet/`<dialog>`; cap 92dvh en mobile; bajar umbral visualViewport. Criterio: foco/Escape/scroll-lock consistentes en todos los modales.
3. **Field + Choice** (ARCH-02, ARCH-03, ARCH-16): extraer Field; unificar choice. Criterio: label/error/aria consistentes.
4. **Money ellipsis** (LAYOUT-04/05): fix en Money + overview.
5. **Safe-area** (LAYOUT-06/07): quitar duplicado en Modal/Select.
6. **Layout responsive** (LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-08, LAYOUT-12): grid colapso, min-heights, keyboard global, calendar grid.
7. **Navegación** (NAV-01..13): secciones huérfanas, FAB en Movimientos, empty states con acción, copy sync, scroll-lock, double submit.
8. **Formularios** (FORM-02..11): autofocus explícito, targets táctiles, busy guards, Cancel, composition handlers, alturas.
9. **Espacio/jerarquía** (SPACE-01..30): remover eyebrows, compactar empty states, alinear "Ver todos", colapsar stacking, densidad.
10. **Accesibilidad** (A11Y-01..10): targets 44px, contraste offline/placeholder/disabled, skip link.
11. **Datos** (DATA-01..08): sourceType en update/sync, getMonthlySummary USD, accountId tipado, migración 0009, saldo inicial, fechas UTC, día default recurrencia.
12. **Performance** (PERF-01..10): memoización, virtualización evaluada, paralelizar Statistics, mover side effects.

Criterios de aceptación por pantalla: sin texto truncado donde hay espacio, sin contenido cortado, sin overflow horizontal, sin elemento cubierto por teclado/footer, sin tamaños fijos fuera de tokens, en viewports 360×640, 375×667, 390×844, 430×932 con teclado cerrado y abierto.

## 7. Lo que queda sin verificar

- Comportamiento runtime de `svh` vs `dvh` y stacking de z-index (no se ejercitó en navegador).
- NAV-10 (doble submit) marcado como riesgo deducido, no reproducido.
- Performance: no se ejecutaron mediciones (Lighthouse/React Profiler); conclusiones por inspección estática.
- Backend/sync/seguridad/agregaciones: pendiente Fase 2 (audit-methodology.md).
- Producción D1/R2 y carga concurrente: no verificado.
- React DOM tests: no existen (gap crítico; F-01 render loop no se capturó).

## 8. Metodología y evidencia

- 8 subagentes paralelos con especialización (arquitectura, layout, forms, espacio, navegación, a11y, datos, performance).
- Cada hallazgo cita `archivo:línea` + valor; sin opiniones sin evidencia.
- Auditoría estática únicamente; sin edición de código en esta fase.
- Fuente de convenciones: `.coder/memories/project-conventions.md`, `.coder/memories/audit-methodology.md`, `.coder/memories/ui-ux-audit-workflow.md`.

---

*Informe consolidado de la Fase 1 (UI/UX). Fase 2 (full stack) pendiente.*
