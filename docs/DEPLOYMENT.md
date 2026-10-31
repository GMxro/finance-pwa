# Despliegue

## Entornos

| Entorno | D1 | R2 | OAuth |
|---|---|---|---|
| Local | `.wrangler/state/v3/d1` | bucket simulado | credenciales de prueba o reales con callback `localhost` |
| Staging | base `finance-pwa-staging` | bucket `finance-pwa-deletion-journal-staging` | cliente OAuth separado |
| Producción | base `finance-pwa` | bucket `finance-pwa-deletion-journal` | cliente OAuth productivo |

Cada entorno tiene su propio `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `SYNC_EPOCH` y
credenciales de Google. No reutilizar secretos entre entornos.

## Preparación (una vez)

```bash
# Autenticación de Wrangler
npx wrangler login

# Base de datos
npx wrangler d1 create finance-pwa
# Copiar database_id en wrangler.jsonc

# Journal de borrados (privado, sin acceso público)
npx wrangler r2 bucket create finance-pwa-deletion-journal
```

Configurar en el bucket R2:

- **Bucket Lock** con retención mínima de 90 días (protege los markers de borrado).
- **Lifecycle rule** para expirar objetos después de 90 días.
- Sin dominio público ni CORS abierto.

## Secretos

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`BETTER_AUTH_URL` y `SYNC_EPOCH` son variables en `wrangler.jsonc`:

```jsonc
"vars": {
  "SYNC_EPOCH": "<uuid-v4 por entorno>",
  "BETTER_AUTH_URL": "https://app.example.com"
}
```

## Migraciones

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Antes de una migración en producción: verificar un bookmark de Time Travel disponible
(`wrangler d1 time-travel info finance-pwa`) y ensayar la migración en staging.
El esquema base está en `migrations/0001_initial.sql`; las migraciones posteriores añaden
cuentas/transferencias (0002), índices de sync (0003), receipts de borrado (0004),
rate limits (0005) y onboarding (0006). Aplicar todas en orden antes de publicar
el Worker (`npm run db:migrate:remote`).

## Despliegue

```bash
npm run build
npx wrangler deploy
```

### Actualizaciones obligatorias de la app

- Incrementar `version` en `package.json` en cada release. El cliente envía esa versión
  en `X-App-Version` y el Service Worker recibe un identificador de caché aislado para
  el contenido de cada build.
 - `MIN_APP_VERSION` se configura en `wrangler.jsonc`. El endpoint de sincronización
   exige `userId` y `operationId` por operación. Builds anteriores sin estos campos
   no sincronizan hasta actualizar.
 - Para exigir una versión crítica: (1) publicar y verificar el release con el mínimo
   anterior, (2) confirmar login y APIs, (3) configurar `MIN_APP_VERSION` en
   `wrangler.jsonc` y desplegar. Así la política no se adelanta a los assets.
 - El cliente PWA debe manejar la respuesta 426 conservando las operaciones locales para
   sincronizarlas tras actualizar.
 - La API responde `426 UPDATE_REQUIRED` a builds por debajo del mínimo o sin versión.
   Ante error de configuración en `MIN_APP_VERSION`, responde `503` (no abre acceso).
 - Para permitir una versión anterior durante una incidencia, bajar o vaciar
   `MIN_APP_VERSION` en `wrangler.jsonc` y desplegar.

Verificación mínima después del despliegue:

1. `GET /api/health` → 200.
2. `GET /api/health/ready` → 200 con `db: connected`.
3. `GET /api/bootstrap` sin cookie → 401.
4. `POST /api/bootstrap` con `Origin: https://evil.example` → 403.
5. Login con Google redirige al callback correcto y crea sesión.
6. Crear un movimiento y verlo tras recargar.

## Recuperación

- **Código**: rollback de Worker Version. No revierte datos.
- **Datos**: Time Travel de D1 (30 días en Paid) restaura en el lugar y pierde cambios
  posteriores al bookmark. Procedimiento:
  1. Activar modo mantenimiento (rechazar mutaciones con 503).
  2. Drenar operaciones en curso.
  3. Restaurar el bookmark elegido.
  4. Enumerar y reaplicar todos los markers de `deletion-journal` posteriores.
  5. Rotar `SYNC_EPOCH` para invalidar cursores de clientes.
  6. Reabrir tráfico y verificar salud y un login.
- **Journal incompleto o no disponible**: mantener el Worker aislado; no abrir tráfico.

El export SQL programado de D1 no se usa en V1 porque puede dejar la base sin atender
consultas durante el proceso. Si se necesita una copia independiente de la cuenta
Cloudflare, diseñar antes una ventana de mantenimiento y una copia cifrada externa.
