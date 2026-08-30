/* La barra dei filtri delle Pietanze.
 *
 * Aveva tre comandi, di cui uno che spiegava in un paragrafo di NON fare la
 * cosa per cui lo cercavi — il tetto ai minuti che morde davvero sta nello
 * scambio di una riga del piano — e uno che sul ricettario di partenza sapeva
 * fare una cosa sola: svuotare la lista, perché di ricette proprie non ce n'è
 * nessuna finché non le scrivi.
 *
 * Questi test guardano la pagina come testo. È poco, ma è quello che serve:
 * impedire che quei due comandi tornino per distrazione. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { piatti } from '../js/alimenti.js';

const HTML = readFileSync(new URL('../ricette.html', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../js/pagina-ricette.js', import.meta.url), 'utf8');

describe('il cursore del tempo non è tornato', () => {
  it('non c’è nessun cursore dei minuti nella barra dei filtri', () => {
    expect(HTML).not.toMatch(/id="tempo"/);
    expect(HTML).not.toMatch(/type="range"/);
    expect(JS).not.toMatch(/filtri\.tempo/);
  });

  it('la pagina dice dove sta il filtro sul tempo che conta', () => {
    // Toglierlo senza dire dov'è quello vero lascerebbe un buco: i minuti si
    // vedono su ogni scheda, ma per escludere i piatti lunghi serve lo scambio.
    expect(HTML).toMatch(/scambio su una\s+riga del piano/);
  });
});

describe('«Solo le mie» esiste solo per chi ne ha', () => {
  it('il ricettario di partenza non ha nemmeno una pietanza «di casa»', () => {
    // È il fatto che rende quell'interruttore inutile all'inizio. Se un giorno
    // il catalogo ne portasse una, questo test cade e la scelta va rivista.
    expect(piatti.filter((p) => p.origine === 'casa')).toHaveLength(0);
  });

  it('parte nascosto nella marcatura, e lo si mostra solo contando', () => {
    expect(HTML).toMatch(/id="filtro-mie"[^>]*\shidden/);
    expect(JS).toMatch(/\$\('#filtro-mie'\)\.hidden = diCasa === 0/);
  });

  it('se sparisce mentre è acceso si spegne, invece di lasciare il vuoto', () => {
    expect(JS).toMatch(/if \(!diCasa && filtri\.casa\)/);
  });
});

describe('lo stato vuoto', () => {
  it('dice quali filtri stanno tagliando e offre di toglierli', () => {
    expect(JS).toMatch(/azzera-filtri/);
    expect(JS).toMatch(/function azzeraFiltri/);
    // E li toglie davvero tutti e quattro, moduli compresi.
    for (const c of ["filtri.testo = ''", "filtri.tipo = 'tutti'",
      'filtri.stagione = false', 'filtri.casa = false']) {
      expect(JS).toContain(c);
    }
  });
});

describe('il ricettario dice quando si accorcia', () => {
  /* Il conto scendeva da 153 a 113 senza una parola. Dal di fuori l'unica
     spiegazione plausibile è che qualcuno abbia cancellato dei piatti — ed è
     esattamente quello che è stato chiesto. Un'app che toglie roba in silenzio
     insegna a non fidarsi, e la sfiducia costa più di quaranta piatti. */
  it('c’è un posto dove dirlo, e lo si riempie a ogni disegno', () => {
    expect(HTML).toMatch(/id="nascoste"/);
    expect(JS).toMatch(/function rendiNascoste/);
    expect(JS).toMatch(/rendiNascoste\(\);/);
  });

  it('porta al posto dove si cambia idea', () => {
    expect(JS).toMatch(/preferenze\.html/);
  });

  it('quando non nasconde niente non lascia un riquadro vuoto', () => {
    expect(JS).toMatch(/if \(!scartate\.length\) \{ dove\.innerHTML = ''; return; \}/);
  });
});
