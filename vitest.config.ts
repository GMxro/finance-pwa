import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, 'migrations'));
  return {
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
        '@env': path.resolve(root, './worker-configuration.d.ts'),
        '@domain': path.resolve(root, './src/domain'),
        '@contracts': path.resolve(root, './src/contracts'),
        '@worker': path.resolve(root, './src/worker'),
        '@client': path.resolve(root, './src/client'),
        '@shared': path.resolve(root, './src/client/shared'),
        '@local-data': path.resolve(root, './src/local-data')
      }
    },
    test: {
      globals: true,
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      setupFiles: ['./tests/apply-migrations.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: false,
          wrangler: { configPath: './wrangler.test.jsonc' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations }
          }
        }
      }
    }
  };
});