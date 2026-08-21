/* Ogni pagina dev'essere nel build, e nel guscio offline.
 *
 * Vite in sviluppo serve QUALSIASI .html trovi nella cartella, ma in build
 * costruisce solo quelli elencati in `rollupOptions.input`. Una pagina nuova
 * quindi funziona perfettamente su localhost e in produzione risponde 404 —
 * e nessun test, nessun avviso, nessun errore di build lo dice.
 *
 * È successo con `dispensa.html`: provata a lungo nel browser, verificata riga
 * per riga, e online non esisteva. Questo test è la rete che mancava. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Le pagine vere: gli .html nella radice del progetto. */
const pagine = readdirSync(radice).filter((f) => f.endsWith('.html'));

const config = readFileSync(resolve(radice, 'vite.config.js'), 'utf8');
const sw = readFileSync(resolve(radice, 'public/sw.js'), 'utf8');

describe('le pagine e il build', () => {
  it('ce n\u2019è più d\u2019una, o il test non sta guardando niente', () => {
    expect(pagine.length).toBeGreaterThan(5);
  });

  it.each(pagine)('%s è fra gli ingressi di Vite', (pagina) => {
    expect(config).toContain(`'${pagina}'`);
  });

  it.each(pagine.filter((p) => p !== 'stile.html'))(
    '%s è nel guscio del service worker, così vale anche in aereo',
    (pagina) => {
      // `stile.html` è la pagina degli stili, per chi sviluppa: non serve
      // offline e occuperebbe spazio nella cache di chi usa l'app.
      expect(sw).toContain(`'/${pagina}'`);
    },
  );
});

describe('le pagine e i loro moduli', () => {
  it.each(pagine)('%s carica un modulo che esiste davvero', (pagina) => {
    const html = readFileSync(resolve(radice, pagina), 'utf8');
    const moduli = [...html.matchAll(/from '(\/js\/[a-z0-9-]+\.js)'/g)].map((m) => m[1]);
    for (const m of moduli) {
      expect(() => readFileSync(resolve(radice, m.slice(1)), 'utf8')).not.toThrow();
    }
  });
});
