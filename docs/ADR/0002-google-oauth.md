# ADR 0002 — Google OAuth como único proveedor en V1

**Estado:** aceptado

## Contexto

El producto requiere registro público. Cloudflare Access no ofrece autorregistro y el
envío de email de Cloudflare figura como beta; Better Auth documenta un caso no atómico
de restablecimiento de contraseña con D1.

## Decisión

Better Auth con Google OAuth y sesiones en D1. Scopes mínimos (`openid email profile`),
tokens OAuth descartados antes de persistir, sin account linking automático.

## Consecuencias

- No hay contraseñas ni recuperación por email en V1.
- Google es una dependencia externa de identidad; el resto de la aplicación sigue en
  Cloudflare.
- Si se agrega email/contraseña, revisar antes el envío transaccional y el caso de fallo
  del reset con D1.
