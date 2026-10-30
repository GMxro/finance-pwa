import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'dist', 'client');
const errors = [];

function fail(message) {
  errors.push(message);
}

function resolveAsset(href) {
  return join(outputDir, href.split(/[?#]/)[0].replace(/^\//, ''));
}

function readPng(path, label) {
  if (!existsSync(path)) {
    fail(`${label}: no existe (${path})`);
    return null;
  }
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (buffer.length < 33 || signature !== '89504e470d0a1a0a') {
    fail(`${label}: no es un PNG válido (${path})`);
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25]
  };
}

function readInlinePng(dataUri, label) {
  const match = dataUri.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    fail(`${label}: no es un PNG base64 inline válido`);
    return null;
  }
  const buffer = Buffer.from(match[1], 'base64');
  const signature = buffer.subarray(0, 8).toString('hex');
  if (buffer.length < 33 || signature !== '89504e470d0a1a0a') {
    fail(`${label}: los datos inline no son un PNG válido`);
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25]
  };
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function parseSize(sizes) {
  const match = sizes?.match(/^(\d+)x(\d+)$/);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function checkPng(href, label, options = {}) {
  const png = href.startsWith('data:')
    ? readInlinePng(href, label)
    : readPng(resolveAsset(href), label);
  if (!png) return;
  if (options.size) {
    if (png.width !== options.size.width || png.height !== options.size.height) {
      fail(`${label}: mide ${png.width}x${png.height}, declara ${options.size.width}x${options.size.height}`);
    }
  }
  if (options.opaque && png.colorType !== 0 && png.colorType !== 2) {
    fail(`${label}: tiene canal alfa (color type ${png.colorType}); iOS lo compone sobre negro`);
  }
}

const indexPath = join(outputDir, 'index.html');
if (!existsSync(indexPath)) {
  fail('dist/client/index.html no existe');
} else {
  const html = readFileSync(indexPath, 'utf8');
  const appleLinks = [...html.matchAll(/<link\b[^>]*\brel=["']apple-touch-icon["'][^>]*>/gi)].map((m) => m[0]);
  if (appleLinks.length === 0) {
    fail('index.html no declara ningún apple-touch-icon');
  }
  if (appleLinks.length > 1) {
    fail(`index.html declara ${appleLinks.length} apple-touch-icon; iOS debe recibir un único candidato`);
  }
  for (const tag of appleLinks) {
    const href = getAttribute(tag, 'href');
    const sizes = getAttribute(tag, 'sizes');
    if (!href) {
      fail('apple-touch-icon sin href');
      continue;
    }
    if (href.endsWith('.svg')) {
      fail(`apple-touch-icon apunta a SVG: ${href}`);
      continue;
    }
    if (!href.startsWith('data:image/png;base64,') && href !== '/icons/apple-touch-icon-180.png?v=2') {
      fail(`apple-touch-icon debe ser inline en producción o usar el PNG fuente esperado: ${href}`);
    }
    checkPng(href, `apple-touch-icon ${href}`, {
      size: parseSize(sizes) ?? { width: 180, height: 180 },
      opaque: true
    });
  }
  if (html.includes('icon-192.svg') || html.includes('icon-512.svg')) {
    fail('index.html sigue referenciando íconos SVG obsoletos');
  }
}

checkPng('/apple-touch-icon.png', 'apple-touch-icon de raíz', {
  size: { width: 180, height: 180 },
  opaque: true
});

const manifestPath = join(outputDir, 'manifest.webmanifest');
if (!existsSync(manifestPath)) {
  fail('dist/client/manifest.webmanifest no existe');
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`manifest.webmanifest no es JSON válido: ${error.message}`);
  }
  if (manifest) {
    if (manifest.id !== '/' || manifest.start_url !== '/' || manifest.scope !== '/') {
      fail(`identidad PWA inconsistente: id=${manifest.id} start_url=${manifest.start_url} scope=${manifest.scope}`);
    }
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      fail('manifest.webmanifest no declara íconos');
    } else {
      for (const icon of manifest.icons) {
        if (!icon.src || !icon.sizes) {
          fail(`ícono de manifest incompleto: ${JSON.stringify(icon)}`);
          continue;
        }
        if (icon.type !== 'image/png') {
          fail(`ícono de manifest no es PNG: ${icon.src} (${icon.type})`);
        }
        checkPng(icon.src, `manifest ${icon.src}`, {
          size: parseSize(icon.sizes),
          opaque: icon.purpose?.includes('maskable')
        });
      }
      const hasMaskable = manifest.icons.some(
        (icon) => icon.purpose?.includes('maskable') && parseSize(icon.sizes)?.width >= 512
      );
      if (!hasMaskable) fail('manifest.webmanifest no tiene un maskable >= 512x512');
    }
  }
}

if (errors.length > 0) {
  console.error('PWA icon check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('PWA icon check: OK');
