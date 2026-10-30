# ADR 0001 — Un Worker y D1 como fuente de verdad

**Estado:** aceptado

## Contexto

La aplicación es una PWA autenticada con un modelo relacional pequeño: usuarios,
categorías, movimientos y presupuestos por mes. El equipo es chico y el presupuesto, bajo.

## Decisión

Un único Worker sirve la SPA y la API. D1 es la fuente autoritativa. IndexedDB es solo
caché y cola de altas pendientes.

## Consecuencias

- Un solo despliegue y un solo origen: sin CORS con credenciales.
- Migraciones SQL versionadas; sin ORM de negocio.
- D1 no tiene RLS: la autorización es responsabilidad del Worker y se prueba con dos
  usuarios.
- Cada base D1 serializa consultas; se controlan índices y `rows_read` antes de pensar en
  particionar.
