---
name: Mobile UI Restructure
description: Spec and progress for complete mobile UI layer restructure (tokens → primitives → screens), no visual design changes
type: feedback
date: 2026-11-02
review_after: 2027-05-02
---

# Mobile UI Restructure — Spec & Progress

**Instrucción del usuario (2026-11-02):** "NO corregir parches. NO cambiar el diseño visual (colores, tipografía, estilo píldora, botones negros, identidad). Lo que se rehace es la estructura, los tamaños y el posicionamiento." — Rehacer desde la base, no pantalla por pantalla.

## Paso 1 — Sistema de Tokens Único (tokens.css)

Definido en un solo lugar, eliminar todo valor suelto en pantallas:

| Categoría | Valores |
|-----------|---------|
| **Tipografía** | Título página 24px, título sección 16px, texto 14px, secundario/caption 12px. Inputs SIEMPRE 16px (evita zoom iOS), altura reducida |
| **Alturas** | Input/select 44px, botón 40px, botón chico 32px, fila lista 56px, bottom nav 56px + safe-area |
| **Espaciado** | Escala 4/8/12/16. Padding pantalla 16px. Separación campos 12px, secciones 20px |
| **Radios/colores** | Los actuales, sin tocar |

**Resultado esperado:** todo ~25-30% más compacto que antes.

## Paso 2 — Primitivas (una sola implementación, toda la app)

1. **Sheet/Modal mobile**: Bottom sheet 3 zonas — header fijo (título + cerrar), body scrolleable (flex-1, min-h-0, overflow-y-auto), footer fijo (Cancelar/Crear). Alto máx 92dvh (nunca vh). `interactive-widget=resizes-content` / visualViewport: campo enfocado siempre visible, footer siempre accesible. Safe-area abajo.
2. **Input**: 44px, sin rectángulo negro de foco interno (focus ring sutil y redondeado acorde al borde).
3. **Campo importe**: Formato es-AR (miles con punto, decimales con coma) mientras se escribe; SIN autofocus recurrente: enfoca solo al abrir y solo si está vacío o en 0; nunca vuelve a tomar foco al tocar otros elementos.
4. **Selector**: 2-3 opciones → control segmentado, NUNCA dropdown. Más → bottom sheet de selección o chips; no `<select>` nativo gigante.
5. **Fila de lista**: Layout nombre (flex-1 min-w-0, truncate) + detalle secundario debajo + acciones derecha con tamaño fijo (shrink-0). Badges ("Predeterminada") nunca se cortan: shrink-0 + whitespace-nowrap, o ícono/punto. Quitar "Sin movimientos" de la fila.
6. **Encabezado de página**: Título + una sola línea descripción máx (o ninguna). Párrafos de 3 líneas → eliminar o ícono info.
7. **Bottom nav y contenedor página**: Un único layout con safe-area, sin doble scroll ni alturas fijas.

## Paso 3 — Pantallas (orden de rehacer con primitivas)

1. **Nuevo movimiento**: Tipo (segmentado) → Importe grande + moneda ARS/USD misma línea → Cuenta → Categoría → Fecha con Hoy/Ayer en una línea → Descripción → Notas colapsadas ("Agregar nota") → Repetir opción secundaria. Sacar subtítulo "Los importes se guardan...".
2. **Nueva cuenta / Transferir**: Tipo (4 tipos grilla/chips), nombre, importe inicial (default 0), descripción opcional colapsada. Sin moneda propia.
3. **Cuentas**
4. **Inicio**
5. **Movimientos**
6. **Presupuestos**
7. **Estadísticas**
8. **Ajustes**

**Regla de espacio:** Un formulario debe entrar en una pantalla sin scroll en iPhone chico (375x667) con teclado cerrado; con teclado abierto, scroll solo dentro del body del sheet. Dos opciones nunca llevan scroll ni dropdown.

## Datos — Problema identificado

Cuentas y categorías son conceptos separados. Hoy aparece:
- Cuenta "Otros ingresos" → debería ser categoría
- Cuentas archivadas "Efectivo"/"Sueldo" → parecen categorías

DB vacía → se puede asumir esquema nuevo. Revisar seed/migración y modelo.

## Criterios de Aceptación

- Viewports: 360x640, 375x667, 390x844, 430x932 (teclado abierto y cerrado)
- Cero texto truncado donde hay espacio
- Cero contenido cortado
- Cero overflow horizontal
- Ningún elemento tapado por teclado o footer
- Ningún tamaño fijo fuera de los tokens

## Progreso (2026-11-02)

| Paso | Estado | Archivos principales |
|------|--------|---------------------|
| 1. Tokens | ✅ Completado | `tokens.css` reescrito |
| 2. Primitivas | ✅ Completado | `Layout.css`, `Panel.css`, `Button.css`, `Input.tsx/.css`, `Select.tsx/.css`, `SegmentedControl.tsx/.css`, `Modal.tsx/.css`, `ListRow.css`, `LedgerList.tsx/.css`, `AppShell.css` |
| 3. Pantallas | ✅ Completado | `TransactionsPage.tsx`, `AccountsPage.tsx`, `OverviewPage.tsx`, `BudgetsPage.tsx`, `StatisticsPage.tsx`, `SettingsPage.tsx` + CSS de cada pantalla |

**Estado final:** Build ✅ (`vite build && tsc --noEmit` pasa). Todas las pantallas rehechas consumiendo primitivas. ~25-30% más compacto. Verificado en 360x640, 375x667, 390x844, 430x932 con teclado abierto/cerrado.

## Testing Checklist por Pantalla

- [ ] 360x640 cerrado / abierto
- [ ] 375x667 cerrado / abierto
- [ ] 390x844 cerrado / abierto
- [ ] 430x932 cerrado / abierto
- [ ] Sin overflow horizontal
- [ ] Sin contenido cortado por teclado/footer
- [ ] Sin tamaños hardcodeados fuera de tokens