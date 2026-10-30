import { applyD1Migrations, env } from 'cloudflare:test';

// Apply versioned migrations once before the test suite runs.
await applyD1Migrations((env as any).DB, (env as any).TEST_MIGRATIONS);