import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/renderer', { recursive: true });
const mainEsmBanner = { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" };
await build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', bundle: true, platform: 'node', format: 'esm', external: ['electron'], sourcemap: true, banner: mainEsmBanner });
await build({ entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', bundle: true, platform: 'browser', format: 'esm', sourcemap: true });
await Promise.all(['index.html', 'styles.css'].map(file => cp(`src/renderer/${file}`, `dist/renderer/${file}`)));
