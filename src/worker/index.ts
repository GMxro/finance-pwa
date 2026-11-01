// Worker entry point
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

import { sessionMiddleware } from './middleware/session';
import { apiMutationRateLimit } from './middleware/rate-limit';
import { legalAcceptanceRequired } from './middleware/legal-acceptance';
import { sameOriginGuard } from './middleware/same-origin';
import { apiBodyLimit } from './middleware/body-limit';
import { minimumAppVersion } from './middleware/minimum-app-version';
import { securityHeaders } from './middleware/security-headers';
import { errorHandler } from './middleware/error-handler';
import { authRoutes } from './routes/auth';
import { accountRoutes, deletionStatusRoutes } from './routes/account';
import { bootstrapRoutes } from './routes/bootstrap';
import { transactionsRoutes } from './routes/transactions';
import { accountsRoutes } from './routes/accounts';
import { transfersRoutes } from './routes/transfers';
import { budgetsRoutes } from './routes/budgets';
import { categoriesRoutes } from './routes/categories';
import { syncRoutes } from './routes/sync';
import { healthRoutes } from './routes/health';
import { legalRoutes } from './routes/legal';
import { installmentRoutes } from './routes/installments';
import { recurringRoutes } from './routes/recurring';
import { commitmentsRoutes } from './routes/commitments';
import { calendarRoutes } from './routes/calendar';
import { processDueRecurring } from './application/recurring/recurring';

import type { Env } from '@env';

const app = new Hono<{ Bindings: Env }>();

app.use('*', requestId());
// Applied to API responses only; static asset responses have immutable headers.
app.use('/api/*', securityHeaders());
app.use('*', errorHandler);

app.use('/api/*', sameOriginGuard);
app.use('/api/*', apiBodyLimit);
app.use('/api/*', minimumAppVersion);

// Health check (no auth)
app.route('/api', healthRoutes);

// Better Auth routes (public; Better Auth validates origin/CSRF itself)
app.route('/api/auth', authRoutes);
app.route('/api/account/deletion-status', deletionStatusRoutes);

// Protected routes - require a server-side session
const protectedApi = new Hono<{ Bindings: Env }>();
protectedApi.use('*', sessionMiddleware);
protectedApi.use('*', apiMutationRateLimit);
protectedApi.use('*', legalAcceptanceRequired);

protectedApi.route('/bootstrap', bootstrapRoutes);
protectedApi.route('/legal', legalRoutes);
protectedApi.route('/account', accountRoutes);
protectedApi.route('/transactions', transactionsRoutes);
protectedApi.route('/accounts', accountsRoutes);
protectedApi.route('/transfers', transfersRoutes);
protectedApi.route('/budgets', budgetsRoutes);
protectedApi.route('/categories', categoriesRoutes);
protectedApi.route('/sync', syncRoutes);
protectedApi.route('/installments', installmentRoutes);
protectedApi.route('/recurring', recurringRoutes);
protectedApi.route('/commitments', commitmentsRoutes);
protectedApi.route('/calendar', calendarRoutes);

app.route('/api', protectedApi);

// Hacer pasar los recursos de identidad por el Worker permite observar lo que
// pide iOS y evita que un fallback SPA se disfrace de imagen/manifest válido.
app.use('*', async (c, next) => {
  const incomingUrl = new URL(c.req.url);
  const pathname = incomingUrl.pathname;
  const isPwaAsset = pathname.startsWith('/icons/') ||
    /^\/apple-touch-icon(?:-[^/]+)?\.png$/.test(pathname) ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest';

  if (!isPwaAsset) return next();

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return c.text('Method not allowed', 405);
  }

  const assets = c.env.ASSETS;
  if (!assets) return c.text('Not found', 404);

  // El query sirve para cache-busting en el HTML; el asset se resuelve por path.
  const assetUrl = new URL(pathname, incomingUrl.origin);
  const assetHeaders = new Headers(c.req.raw.headers);
  // No reenviar validadores del navegador al binding: puede contestar 304,
  // que el proxy convierte en 404 y el <img> de la pantalla de carga muestra roto.
  assetHeaders.delete('if-none-match');
  assetHeaders.delete('if-modified-since');
  const assetRequest = new Request(assetUrl, {
    method: c.req.method,
    headers: assetHeaders
  });
  const assetResponse = await assets.fetch(assetRequest);
  const contentType = assetResponse.headers.get('content-type') ?? '';
  if (!assetResponse.ok || contentType.includes('text/html')) {
    return c.text('Not found', 404);
  }

  const headers = new Headers(assetResponse.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
});

app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Ruta no encontrada' }, 404));

// SPA fallback: serve built assets for every other path.
app.get('*', async (c) => {
  const assets = c.env.ASSETS;
  if (!assets) return c.text('Not found', 404);

  const assetResponse = await assets.fetch(c.req.raw);

  // Un asset inexistente tiene que dar 404, no el index.html del SPA.
  // Devolver HTML con 200 bajo la URL de una imagen fue lo que rompió el
  // icono de la PWA en iOS (el service worker lo cacheaba como si fuera el icono).
  const pathname = new URL(c.req.url).pathname;
  const looksLikeFile = /\.[a-z0-9]{2,5}$/i.test(pathname);
  const isHtml = (assetResponse.headers.get('content-type') || '').includes('text/html');
  if (looksLikeFile && isHtml) {
    return c.text('Not found', 404);
  }

  // Asset responses use immutable headers. Re-wrap so the SPA/document
  // response can carry our security and cache headers.
  const headers = new Headers(assetResponse.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache');
  }

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
});

export default {
  fetch: app.fetch,
  async scheduled(controller: any, env: Env, ctx: ExecutionContext) {
    try {
      await processDueRecurring(env);
    } catch {}
  }
} satisfies ExportedHandler<Env>;
