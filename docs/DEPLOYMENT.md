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
El esquema de la primera publicación está consolidado en `migrations/0001_initial.sql`;
aplicarlo antes de publicar el Worker (`npm run db:migrate:remote`).

## Despliegue

```bash
npm run build
npx wrangler deploy
```

### Actualizaciones obligatorias de la app

- Incrementar `version` en `package.json` en cada release. El cliente envía esa versión
  en `X-App-Version` y el Service Worker recibe un identificador de caché aislado para
  el contenido de cada build.
- `MIN_APP_VERSION` está vacío por defecto en `wrangler.jsonc`: el bloqueo general de API
  por versión queda apagado. El endpoint de sincronización sí exige `userId` e
  `operationId` por operación; builds anteriores que no los envían no sincronizan hasta
  actualizar, para evitar atribuir pendientes a la cuenta equivocada.
- Para exigir una versión crítica, primero publicar y verificar el release con el mínimo
  anterior. Confirmar que el build nuevo se sirve correctamente y que login y APIs
  funcionan; recién después configurar `MIN_APP_VERSION` con esa versión en
  `wrangler.jsonc` y desplegar de nuevo. Así la política no se adelanta a los assets.
- No activar el mínimo obligatorio en producción hasta completar el manejo de la cola
  offline: una respuesta 426 debe conservar las operaciones locales para sincronizarlas
  después de actualizar.
- La API responde `426 UPDATE_REQUIRED` a builds por debajo del mínimo o sin versión.
  Ante un error de configuración en `MIN_APP_VERSION`, responde `503` en vez de abrir
  accidentalmente el acceso.
- Para volver a permitir una versión anterior durante una incidencia, bajar o vaciar
  `MIN_APP_VERSION` en `wrangler.jsonc` y desplegar. Wrangler mantiene ese archivo como
  fuente de verdad de las variables del Worker.

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
