# Arquitectura

## Unidad de despliegue

Un único Worker (`src/worker/index.ts`) sirve dos cosas bajo el mismo origen:

1. La PWA compilada, mediante el binding `ASSETS` (Workers Static Assets).
2. La API en `/api/*` y las rutas de Better Auth en `/api/auth/*`.

No hay SSR ni microservicios. La SPA se sirve tal cual y el enrutamiento del cliente
ocurre en el navegador.

```
Navegador / PWA instalada
  ├─ React (rutas protegidas, formularios, resumen)
  ├─ Service Worker propio: solo shell/estáticos; nunca /api ni /api/auth
  └─ IndexedDB (Dexie): caché de movimientos + outbox de altas pendientes
                 │ HTTPS, mismo origen
                 ▼
Worker (Hono)
  ├─ requestId → securityHeaders → errorHandler
  ├─ /api/health (público)
  ├─ /api/auth/* (Better Auth: Google OAuth, sesión D1)
  └─ /api/* (sessionMiddleware → sameOriginGuard → rutas)
        ├─ bootstrap, transactions, budgets, categories, sync, account
        └─ casos de uso → D1 (SQL preparado, siempre con user_id de sesión)
                                   │
                                   └─ R2: deletion-journal (markers seudónimos)
```

## Capas y responsabilidades

| Capa | Responsabilidad | Límite |
|---|---|---|
| `src/domain` | Dinero en unidades menores, fechas locales AR, presupuestos, resúmenes. Sin dependencias de UI o Cloudflare. | No conoce HTTP ni base de datos. |
| `src/contracts` | Schemas Zod y tipos de request/response. | No ejecuta reglas de negocio. |
| `src/worker/routes` | Enrutado, validación de entrada, códigos HTTP. | No contiene SQL. |
| `src/worker/application` | Casos de uso, transacciones D1, versionado, idempotencia. | No renderiza ni conoce React. |
| `src/worker/middleware` | Sesión, mismo origen, cabeceras de seguridad, errores. | No decide permisos de negocio. |
| `src/client` | Pantallas, estado de UI, accesibilidad, llamadas a API. | No determina propiedad de datos. |
| `src/local-data` | Caché IndexedDB, outbox y conciliación con la API. | No es fuente de verdad. |

## Flujo de una operación de escritura

1. El cliente envía un `id` UUID generado localmente.
2. `sessionMiddleware` obtiene el usuario desde Better Auth; el `user_id` nunca viaja en
   el cuerpo de la petición.
3. El caso de uso valida la categoría contra el propietario y ejecuta un `D1.batch()`
   con la mutación y el incremento de `user_sync_state.sequence`.
4. Si es un borrado, primero se escribe el marker en R2 y luego se hace el soft delete.
5. La respuesta se devuelve con `Cache-Control: no-store`.

## Decisiones estructurales

- **Sin ORM de negocio**: SQL preparado en `application/` para un dominio pequeño. Esto
  hace explícitos los filtros por propietario y las transacciones.
- **D1 como fuente de verdad**: IndexedDB es caché y cola, nunca autoridad.
- **Better Auth con tablas por defecto** (`user`, `session`, `account`, `verification`):
  se adoptaron los nombres y columnas de la biblioteca para evitar mapeos frágiles. Las
  tablas financieras usan snake_case y FK explícita a `"user"("id")`.
- **Un solo origen**: evita CORS con credenciales y simplifica cookies en móviles.
- **Service worker propio** en lugar de Workbox generado: la regla “nunca cachear API”
  queda escrita y auditable en `public/sw.js`.

## Riesgos conocidos

- D1 no tiene RLS. La autorización depende de que **toda** consulta incluya `user_id`;
  hay pruebas cruzadas entre dos usuarios.
- Time Travel restaura en el lugar: el journal R2 existe para no revivir cuentas o
  movimientos borrados después del punto restaurado.
- Google es el único proveedor de identidad en V1 (decisión aprobada).
