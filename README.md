# Finanzas — PWA de finanzas personales

Registro personal de ingresos y gastos, construido para Cloudflare (Workers + Static
Assets + D1 + R2). Móvil primero, instalable como PWA, con captura de movimientos sin
conexión y sincronización idempotente.

## Estado

Primera versión funcional implementada sobre el plan maestro
(`../.coder/plans/2026-10-28-pwa-finanzas-cloudflare.md`).

Verificado en esta máquina:

- `npm run build` (Vite + `tsc --noEmit`) compila sin errores.
- `npm test`: 23 pruebas (dominio, aislamiento entre usuarios, idempotencia de sync,
  tombstones y borrado de cuenta) en verde.
- `wrangler dev --local` responde `GET /api/health` 200, `GET /api/health/ready` 200,
  `GET /api/bootstrap` 401 sin sesión y rechaza `POST` con `Origin` externo con 403.
- Migraciones aplicadas en D1 local.

No verificado todavía:

- Inicio de sesión real con Google (faltan credenciales OAuth reales).
- Instalación y ejecución en dispositivos iOS/Android físicos.
- Restore de Time Travel y buckets R2 de producción (requieren cuenta Cloudflare).
- Envío de datos a producción (no se desplegó nada).

## Requisitos

- Node.js 20 o superior (probado con 22).
- Cuenta Cloudflare con Workers Paid para producción.
- Un proyecto OAuth de Google con callback `https://<dominio>/api/auth/callback/google`.

## Puesta en marcha local

```bash
npm install
cp .env.example .dev.vars        # completar secretos reales o usar los de ejemplo locales
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

`.dev.vars` (ignorado por git) debe contener:

```
BETTER_AUTH_SECRET=<32+ caracteres aleatorios>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`BETTER_AUTH_URL` y `SYNC_EPOCH` se configuran en `wrangler.jsonc` (variables no secretas).
Para desarrollo con Google real, `BETTER_AUTH_URL` debe ser `http://localhost:8787` y el
callback `http://localhost:8787/api/auth/callback/google`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Worker + assets con D1/R2 locales. |
| `npm run build` | Build de producción y typecheck estricto. |
| `npm test` | Suite de Vitest en runtime Workers con D1/R2 simulados. |
| `npm run db:migrate:local` | Aplica migraciones SQL a D1 local. |
| `npm run db:migrate:remote` | Aplica migraciones a D1 remoto. |
| `npm run deploy` | Build y `wrangler deploy`. |

## Estructura

```
migrations/        Esquema SQL versionado (auth + finanzas)
src/domain/        Reglas puras: dinero, fechas, presupuestos, resúmenes
src/contracts/     Esquemas Zod compartidos y DTOs
src/worker/        Worker: Hono, auth, rutas, casos de uso, repositorios D1
src/client/        React: app, features, UI compartida, estilos
src/local-data/    IndexedDB (Dexie), caché local y motor de sincronización
public/            Manifest, service worker propio, iconos, fallback offline
tests/             Unitarias e integración (Workers + D1)
docs/              Arquitectura, datos, seguridad, sync, despliegue, ADRs
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Modelo de datos](docs/DATA-MODEL.md)
- [Seguridad](docs/SECURITY.md)
- [Offline y sincronización](docs/OFFLINE-SYNC.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Decisiones (ADR)](docs/ADR/0001-cloudflare-d1.md)

## Alcance de esta versión

Incluye: cuentas individuales con Google, categorías iniciales, ingresos/gastos con
ARS y USD separados, historial con filtros y edición, resumen mensual, presupuestos por
categoría y mes, exportación CSV, borrado de cuenta con journal en R2, PWA instalable y
captura sin conexión de altas.

Incluye también: cuentas y transferencias entre cuentas, archivado/restauración de cuentas,
categorías archivadas, sincronización offline de altas, resumen financiero con paginación
completa, estadísticas con límite configurable, páginas legales (Términos y Privacidad),
control de versión de cliente (`MIN_APP_VERSION`), rate limiting distribuido, exportación
CSV con escaping seguro y BOM UTF-8.

Fuera de alcance (deliberadamente): recurrencias, cuotas, cotizaciones, inversiones,
espacios compartidos, edición offline de movimientos/presupuestos/categorías, importación
bancaria, conversión automática de moneda.
