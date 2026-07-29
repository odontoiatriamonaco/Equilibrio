import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Riscrive CACHE_NAME in dist/sw.js con un identificatore univoco di build:
// niente bump manuale della versione nel service worker.
function swCacheBump() {
  return {
    name: 'sw-cache-bump',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      if (!existsSync(swPath)) return;
      const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
      const buildId = 'equilibrio-' + pkg.version + '-' + Date.now().toString(36);
      const src = readFileSync(swPath, 'utf8');
      const out = src.replace(/var CACHE_NAME = '[^']+';/, "var CACHE_NAME = '" + buildId + "';");
      writeFileSync(swPath, out);
      console.log('[sw-cache-bump] CACHE_NAME -> ' + buildId);
    },
  };
}

export default defineConfig({
  plugins: [swCacheBump()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        profilo: resolve(__dirname, 'profilo.html'),
        preferenze: resolve(__dirname, 'preferenze.html'),
        piano: resolve(__dirname, 'piano.html'),
        spesa: resolve(__dirname, 'spesa.html'),
        ricette: resolve(__dirname, 'ricette.html'),
        progressi: resolve(__dirname, 'progressi.html'),
        impostazioni: resolve(__dirname, 'impostazioni.html'),
        stile: resolve(__dirname, 'stile.html'),
      },
    },
  },
});
