# ADR 0004 — Importes enteros y monedas separadas

**Estado:** aceptado

## Contexto

Los errores de punto flotante y la mezcla implícita de ARS/USD producen totales falsos.

## Decisión

Persistir `amount_minor` como entero (centavos). Mantener ARS y USD con totales y
presupuestos independientes. No convertir monedas en V1.

## Consecuencias

- Cálculos reproducibles y comparables.
- La interfaz debe mostrar siempre la moneda junto al importe.
- Una futura conversión requiere fuente, tipo de cotización y fecha almacenadas.
