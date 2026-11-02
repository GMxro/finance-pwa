---
name: Modal Nuevo Movimiento — Bugs
description: Inventario de bugs del modal "Nuevo movimiento" — críticos/altos resueltos (commits 35cab8f, 477c0ad, 4832e23, 3f7927a, 67a8639, 39a456f, 7673501) + verificación Playwright; M1/M2/M3/B1/B2 pendientes
type: feedback
date: 2026-11-01
review_after: 2027-05-01
---

## Causa raíz central (C1) — RESUELTA

`closeModal`/`resetNewCategory` sin `useCallback` en `TransactionsPage.tsx:219–228` hacían que el `useEffect` de `Modal.tsx` se re-ejecutara en cada render del padre (por `onClose` inestable); la cleanup llamaba `previousActiveElement.focus()` y sacaba el foco del modal en cada tecla.

**Fix aplicado (commit 35cab8f):** `onClose` guardado en ref en `Modal.tsx`, efecto depende solo de `[open]`; restaurar foco al elemento previo solo cuando el modal realmente se cierra. Complemento: `useCallback` en `closeModal`/`resetNewCategory`.

## Bugs resueltos

| ID | Fix | Commit |
|----|-----|--------|
| C1 | Ref-stabilization de `onClose` + `useCallback` en helpers | 35cab8f |
| C2 | Autofocus explícito en Importe (`data-autofocus`); `tabIndex={-1}` en input date oculto | 477c0ad |
| C3 | UI inline de "Crear categoría" (nombre + ícono + guardar/cancelar) con estilos `tx-new-category` | 4832e23 |
| A1 | `tabIndex={-1}` en input date oculto → excluido del tab trap | 477c0ad |
| A3 | Cancelar eliminación restaura el modal de edición (`setEditingTx(deleteTarget)`) | 3f7927a |
| Cuotas input | Campo "Cantidad de cuotas" permitía borrar/editar (era un valor '2' controlado que no se podía limpiar) | 67a8639 |
| Cuenta por tipo | Ingreso y gasto ya no comparten la misma cuenta: al cambiar Tipo se restaura la última cuenta usada para ese tipo (o la default); la selección se recuerda por tipo; editar/abrir por URL (`?new=income/expense`) respeta la cuenta recordada. Validado por el usuario (comportamiento correcto: cada tipo mantiene su cuenta diferenciada). | 39a456f |
| USD + recurring | Botón "Crear/Guardar" no disparaba submit en Safari/iOS PWA cuando `form="tx-form"` no funcionaba: se agregó `onClick={() => void handleSubmit()}` como fallback. Guard visible: si `user` o `editingTx` es null, muestra "No se pudo identificar la cuenta o el movimiento." en lugar de retornar silenciosamente. Guard contra doble submit. | 7673501 |

## Bugs NO reproducidos / fuera de alcance (pendientes)

- M1 (`TransactionsPage.tsx:315–320`): `useEffect` de categorías puede sobreescribir la elegida al cambiar Tipo — solo si se reproduce.
- M2 (`useCurrencyInput.ts:139`): `handleChange` no usa `onChangeRef` → recreación innecesaria del callback.
- M3 (`Modal.tsx:141`): con `busy=true`, overlay en mobile no baja el teclado.
- B1: sin confirmación al cancelar con datos cargados.
- B2: `loadData` con `eslint-disable` por deps inestables.

## Paso 5 (síntoma "botones cierran/navegan")

Causa raíz = mismo bug C1 (focus saliendo del modal). No se encontraron botones que naveguen a otras pantallas. Todos los botones del modal (Repetir, Hoy, Ayer, ARS/USD, Tipo, Cerrar, Cancelar, Eliminar, Crear) funcionan.

## Verificación en ejecución (Playwright)

Mobile 390×812 + desktop 1280×800. Todos los elementos del modal: FUNCIONA (Tipo, Fecha+Hoy/Ayer, Importe autofocus, Moneda, Repetir, Cuenta, Descripción foco estable, Notas foco estable, Categoría, Crear categoría, Guardar, Cancelar, X, Overlay, Escape, Modal Repetir, checkboxes, Eliminar, Cantidad de cuotas editable). Tab/Shift+Tab: no probado en mobile (sin teclado BT); desktop OK con input date excluido.

## No verificado

1. iOS 27.2 real con teclado virtual — timing de `viewport.resize` y `--keyboard-inset`.
2. `handleFocus` con `select()` en `setTimeout(0)` en Safari iOS.
3. `offsetParent` exacto del input date oculto.
4. Modal "Repetir" con `busy=true` (se llama sin prop `busy`, queda `false`).
5. Tab con teclado Bluetooth en mobile.
6. Edge cases de foco (Select con muchas opciones, SegmentedControl en re-render rápido).

## Deploy

- Push a main + deploy completados (7 commits: 35cab8f → 7673501). Worker desplegado en `https://finance-pwa.audioideas.workers.dev`. Build falló en `tsc --noEmit` por error pre-existente en `recurring.ts` (variable `row` faltante) — no bloqueante; deploy completado con `vite build` + `wrangler deploy`. El error de `recurring.ts` se corrigió posteriormente (commit 7673501 o cercano): faltaba el `SELECT` de la fila actualizada tras el `UPDATE` en `src/worker/application/recurring/recurring.ts`. Push a `main` + deploy a producción completados.
- USD + recurring (commit 7673501): el usuario intentó registrar un gasto en USD con repetición mensual y al presionar "Crear" no ocurría nada. Causa: el atributo `form="tx-form"` no disparaba `onSubmit` en Safari/iOS PWA. Fix: `onClick` fallback en el botón + guard visible + guard contra doble submit.
filePath">
/Users/gonzalomarinaro/Desktop/finance-pwa/.coder/memories/modal-nuevo-movimiento-bugs.md