import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'path';

const APPLE_TOUCH_ICON_HREF = '/icons/apple-touch-icon-180.png?v=2';
const APP_VERSION = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

function appleTouchIconInline() {
  return {
    name: 'apple-touch-icon-inline',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        const iconLinks = [...html.matchAll(/<link\b[^>]*>/gi)]
          .map(([tag]) => tag)
          .filter((tag) => /\brel=["']apple-touch-icon["']/i.test(tag));

        if (iconLinks.length !== 1) {
          throw new Error(`Expected exactly one apple-touch-icon link; found ${iconLinks.length}`);
        }

        const iconLink = iconLinks[0];
        if (!iconLink) throw new Error('Apple touch icon link was not found');
        const href = iconLink.match(/\bhref=["']([^"']+)["']/i)?.[1];
        if (href !== APPLE_TOUCH_ICON_HREF) {
          throw new Error(`Unexpected apple-touch-icon source: ${href ?? '(missing href)'}`);
        }

        const iconPath = path.resolve(__dirname, 'public/icons/apple-touch-icon-180.png');
        const dataUri = `data:image/png;base64,${readFileSync(iconPath).toString('base64')}`;
        const inlineLink = iconLink.replace(/(\bhref=["'])[^"']+(["'])/i, `$1${dataUri}$2`);

        if (inlineLink === iconLink) {
          throw new Error('Could not replace apple-touch-icon href with the inline PNG');
        }

        return html.replace(iconLink, inlineLink);
      }
    }
  };
}

// The service worker is hand-written in `public/sw.js` so that API and auth
// responses are never cached. We intentionally do not use a Workbox plugin.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  plugins: [appleTouchIconInline(), react(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@env': path.resolve(__dirname, './worker-configuration.d.ts'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@contracts': path.resolve(__dirname, './src/contracts'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@client': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/client/shared'),
      '@local-data': path.resolve(__dirname, './src/local-data')
    }
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          db: ['dexie']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
