/* Un'icona citata nel codice ma mai disegnata non da' nessun errore: lascia un
   buco silenzioso nell'interfaccia, e ce ne si accorge guardando. Questi test
   leggono lo sprite vero e confrontano. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { piattiDiSerie, alimenti, iconaPiatto, iconaAlimento, famigliaCibo } from '../js/alimenti.js';
import { ICONE_TETTI, NOMI_TETTI } from '../js/preferenze.js';

const SPRITE = readFileSync(resolve(__dirname, '../public/assets/icons.svg'), 'utf8');
const DISEGNATE = new Set([...SPRITE.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));

/** Le famiglie che hanno una tinta dichiarata in tokens.css. */
const TOKENS = readFileSync(resolve(__dirname, '../css/tokens.css'), 'utf8');

describe('lo sprite ha tutto quello che il codice nomina', () => {
  it('ogni pietanza ha un\'icona che esiste davvero', () => {
    const mancanti = new Set();
    for (const p of piattiDiSerie) {
      const i = iconaPiatto(p);
      if (!DISEGNATE.has(i)) mancanti.add(`${i} (${p.nome})`);
    }
    expect([...mancanti]).toEqual([]);
  });

  it('ogni alimento ha un\'icona che esiste davvero', () => {
    const mancanti = new Set();
    for (const a of alimenti) {
      const i = iconaAlimento(a);
      if (!DISEGNATE.has(i)) mancanti.add(`${i} (${a.nome})`);
    }
    expect([...mancanti]).toEqual([]);
  });

  it('le sei righe dei tetti hanno nome e icona', () => {
    for (const chiave of Object.keys(NOMI_TETTI)) {
      expect(ICONE_TETTI[chiave], `manca l'icona per ${chiave}`).toBeTruthy();
      expect(DISEGNATE.has(ICONE_TETTI[chiave]), `${ICONE_TETTI[chiave]} non è nello sprite`).toBe(true);
    }
  });

  it('nessuna riga dei tetti finisce nella famiglia grigia', () => {
    // Un'icona nuova che `famigliaCibo` non conosce non da' errori: si spegne e
    // basta, e ci si accorge solo guardando che quella riga e' grigia fra sei
    // colorate. E' successo davvero con «carni bianche» e «salumi».
    for (const [chiave, ic] of Object.entries(ICONE_TETTI)) {
      expect(famigliaCibo(ic), `${chiave} (${ic}) non ha una famiglia di colore`).not.toBe('altro');
    }
  });

  it('i quattro momenti della giornata sono disegnati', () => {
    for (const m of ['colazione', 'spuntino', 'pranzo', 'cena']) {
      expect(DISEGNATE.has(m), `manca il simbolo ${m}`).toBe(true);
    }
  });
});

describe('le tinte dichiarate esistono in tutti e tre i blocchi', () => {
  // Il tema scuro e' definito due volte in tokens.css: una per la scelta a mano
  // e una per quella di sistema. Un token aggiunto in due posti su tre non da'
  // errori e si nota mesi dopo, da un colore che resta indietro.
  const treVolte = (nome) => (TOKENS.match(new RegExp(`--${nome}\\s*:`, 'g')) || []).length;

  it('ogni famiglia di cibo usata ha la sua coppia di token', () => {
    const usate = new Set([
      ...piattiDiSerie.map((p) => famigliaCibo(iconaPiatto(p))),
      ...alimenti.map((a) => famigliaCibo(iconaAlimento(a))),
    ]);
    for (const f of usate) {
      expect(treVolte(`cibo-${f}-velo`), `--cibo-${f}-velo`).toBe(3);
      expect(treVolte(`cibo-${f}-segno`), `--cibo-${f}-segno`).toBe(3);
    }
  });

  it('ogni momento della giornata ha la sua coppia di token', () => {
    for (const m of ['colazione', 'spuntino', 'pranzo', 'cena']) {
      expect(treVolte(`momento-${m}-velo`), `--momento-${m}-velo`).toBe(3);
      expect(treVolte(`momento-${m}-segno`), `--momento-${m}-segno`).toBe(3);
    }
  });
});

describe('le icone nuove rispettano lo stile del set', () => {
  const nuove = ['colazione', 'spuntino', 'pranzo', 'cena', 'carne-bianca', 'salumi'];

  it('sono tutte sulla griglia 24', () => {
    for (const id of nuove) {
      const simbolo = SPRITE.match(new RegExp(`<symbol id="${id}"[^>]*>`))?.[0] || '';
      expect(simbolo, id).toContain('viewBox="0 0 24 24"');
    }
  });

  it('non portano colori propri: si ricolorano da sole nei due temi', () => {
    for (const id of nuove) {
      const corpo = SPRITE.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`))?.[0] || '';
      // L'unico fill ammesso e' currentColor, per i pallini pieni.
      const fill = [...corpo.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
      expect(fill.every((f) => f === 'currentColor'), `${id}: ${fill}`).toBe(true);
      expect(corpo, id).not.toMatch(/stroke="#|fill="#/);
    }
  });
});
