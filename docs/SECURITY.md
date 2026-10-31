# Seguridad

## Modelo de amenazas resumido

| Riesgo | Control implementado |
|---|---|
| Acceso a datos de otra persona | `sessionMiddleware` deriva el usuario de la sesión; todas las consultas filtran por `user_id`; FK compuestas; pruebas cruzadas. |
| Cross-site request forgery | `sameOriginGuard` valida `Origin` en métodos mutantes; cookies `SameSite=Lax`, `HttpOnly`, `Secure`, host-only. |
| Inyección SQL | `prepare().bind()` en todas las consultas; ordenamientos y filtros desde listas permitidas. |
| Robo de tokens OAuth | Hooks `databaseHooks` eliminan access/refresh/id tokens de Google antes de persistir; `updateAccountOnSignIn: false`; solo scopes `openid email profile`. |
| Caché de datos privados | El service worker nunca intercepta `/api` ni `/api/auth`; respuestas de API con `Cache-Control: no-store`. |
| Clickjacking | `X-Frame-Options: DENY` y `frame-ancestors 'none'`. |
| Fugas en logs | No se registran cuerpos, importes, notas, emails ni cookies; solo mensajes de error técnicos y request id. |
| Duplicados por reintento | UUID de cliente + `UNIQUE(user_id, id)` + comparación de contenido en sync. |
| Resurrección tras restore | Journal R2 con markers de cuenta y movimiento, retención 90 días. |
| Borrado incompleto | Lote D1 atómico, recibo durable, journal R2 paginado e idempotente; los reintentos continúan el journal y las mutaciones quedan bloqueadas mientras el borrado está pendiente. |

## Cabeceras

`securityHeaders()` aplica CSP (`script-src 'self'`), HSTS, `nosniff`, `DENY`,
`strict-origin-when-cross-origin` y una política de permisos restrictiva. `style-src`
admite estilos inline porque la interfaz usa atributos de estilo puntuales (ancho de
barras de progreso).

## Sesiones

Better Auth emite una cookie de sesión de 7 días con renovación diaria. La sesión vive en
D1, por lo que el cierre de sesión y el borrado de cuenta la revocan en el servidor. El
cliente no guarda tokens de sesión en `localStorage` ni en IndexedDB.

## Datos locales

IndexedDB no está cifrado por la aplicación: cualquier código del mismo origen puede
leerlo y el navegador puede desalojarlo. El cierre de sesión limpia la caché cuando no hay
movimientos pendientes; si los hay, se conservan bajo la identidad anterior y nunca se
envían con otra cuenta.

Cuando una sesión se inicia, la aplicación solicita al navegador almacenamiento persistente.
El navegador puede rechazarlo o eliminar los datos igualmente; los movimientos offline no
se pueden recuperar hasta que hayan llegado al servidor. La clave de recuperación de borrado
solo contiene un identificador aleatorio y se elimina después de confirmar el borrado remoto.
El servidor conserva una constancia mínima y sin el ID del usuario para resolver respuestas
perdidas de solicitudes de borrado.

Las solicitudes autenticadas tienen límites distribuidos en D1: 180 lecturas y 60 mutaciones
por usuario/minuto, y 20 solicitudes de push de sincronización/minuto. Las consultas del estado de borrado se limitan
a 30/minuto por IP, almacenando su hash. El endpoint público de autenticación conserva el
límite configurado por Better Auth; las reglas de borde siguen siendo una defensa adicional.

## Importes y agregados

Los importes se guardan en unidades menores como enteros seguros. El servidor limita el flujo
total absoluto por usuario y moneda, incluyendo movimientos y transferencias, para que saldos,
presupuestos y estadísticas no excedan el rango exacto de JavaScript. Los datos históricos que
ya excedan ese rango se conservan, pero los endpoints de agregación devuelven un error controlado
en lugar de redondearlos.

## Pendiente antes de producción

1. Credenciales OAuth reales y consent screen configurada.
 2. Bucket Lock de 90 días y lifecycle rule de expiración en R2 (se configura en el bucket, no en código).
3. Revisión legal de privacidad, retención y borrado.
 4. Rate limiting de borde (Cloudflare WAF/Rate Limiting) para `/api/auth/*` y endpoints de escritura.
 5. Revisión de CSP en el dominio final (sin `unsafe-inline` en scripts).
 6. Configuración de `MIN_APP_VERSION` en `wrangler.jsonc` para producción.
