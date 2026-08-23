/* Il tutor: una guida che non deve mai illuminare il vuoto.
 *
 * `percorso.js` porta scritto il motivo per cui i tour a riquadri erano stati
 * scartati: «un percorso che si ricava dallo stato non può indicare una cosa che
 * non c'è più». La risposta è la regola di salto, ed è quella che si prova qui —
 * insieme ai testi, che sono l'altra metà del lavoro.
 *
 * Il progetto non ha jsdom e non vale la pena aggiungerlo per una funzione che
 * usa quattro cose del DOM: qui si finge quelle quattro, e si dichiara. */
import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { passiVeri } from '../js/tutor.js';
import {
  PASSI_OGGI, PASSI_PIANO, PASSI_PIETANZE, PASSI_SPESA, PASSI_DISPENSA, PASSI_ALTRO,
} from '../js/tutor-passi.js';

const SEZIONI = {
  Oggi: PASSI_OGGI,
  Piano: PASSI_PIANO,
  Pietanze: PASSI_PIETANZE,
  Spesa: PASSI_SPESA,
  Dispensa: PASSI_DISPENSA,
  Altro: PASSI_ALTRO,
};

/* --- Un DOM finto, giusto quello che il tutor tocca ------------------------ */

function nodo({ w = 100, h = 40, hidden = false, dentroHidden = false, visibility = 'visible' } = {}) {
  const el = {
    hidden,
    getBoundingClientRect: () => ({ width: w, height: h, top: 0, left: 0, bottom: h, right: w }),
    closest: (sel) => (sel === '[hidden]' && dentroHidden ? {} : null),
    __visibility: visibility,
  };
  return el;
}

function fingiPagina(mappa) {
  globalThis.document = { querySelector: (sel) => mappa[sel] || null };
  globalThis.getComputedStyle = (el) => ({ visibility: el.__visibility || 'visible' });
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.getComputedStyle;
});

describe('un passo senza bersaglio non esiste', () => {
  const passi = [
    { sel: '#c-e', titolo: 'C’è', testo: 'x' },
    { sel: '#non-c-e', titolo: 'Non c’è', testo: 'x' },
    { sel: '#nascosto', titolo: 'Nascosto', testo: 'x' },
    { sel: '#dentro-nascosto', titolo: 'Dentro un nascosto', testo: 'x' },
    { sel: '#alto-zero', titolo: 'Alto zero', testo: 'x' },
    { sel: '#invisibile', titolo: 'Invisibile', testo: 'x' },
  ];

  beforeEach(() => fingiPagina({
    '#c-e': nodo(),
    '#nascosto': nodo({ hidden: true }),
    '#dentro-nascosto': nodo({ dentroHidden: true }),
    '#alto-zero': nodo({ h: 0 }),
    '#invisibile': nodo({ visibility: 'hidden' }),
  }));

  it('tiene solo quello che si vede davvero', () => {
    expect(passiVeri(passi).map((p) => p.sel)).toEqual(['#c-e']);
  });

  it('un riquadro alto zero non è un riquadro', () => {
    // Capita: la riga di stato dello spazio famiglia è vuota finché uno spazio
    // non c'è, e puntarci sopra illuminerebbe una fessura.
    expect(passiVeri([{ sel: '#alto-zero', titolo: 'a', testo: 'b' }])).toHaveLength(0);
  });

  it('senza nessun bersaglio non torna niente, invece di un elenco vuoto di passi', () => {
    fingiPagina({});
    expect(passiVeri(passi)).toEqual([]);
  });
});

describe('la numerazione non ha buchi', () => {
  it('conta i passi rimasti, non quelli scritti', () => {
    // Sei passi definiti, due bersagli in pagina: chi guarda deve leggere
    // «1 di 2» e «2 di 2», non «1 di 6» e «4 di 6».
    fingiPagina({ '#a': nodo(), '#d': nodo() });
    const veri = passiVeri([
      { sel: '#a', titolo: 'A', testo: 'x' },
      { sel: '#b', titolo: 'B', testo: 'x' },
      { sel: '#c', titolo: 'C', testo: 'x' },
      { sel: '#d', titolo: 'D', testo: 'x' },
    ]);
    expect(veri).toHaveLength(2);
    expect(veri.map((p) => p.titolo)).toEqual(['A', 'D']);
  });
});

describe('i testi della guida', () => {
  it('tutte e sei le pagine hanno qualcosa da dire', () => {
    for (const [nome, passi] of Object.entries(SEZIONI)) {
      expect(passi.length, nome).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(SEZIONI))('%s: ogni passo ha bersaglio, titolo e testo', (nome, passi) => {
    for (const p of passi) {
      expect(p.sel, nome).toMatch(/^[.#[]/);
      expect(p.titolo?.trim(), nome).toBeTruthy();
      expect(p.testo?.trim().length, `${nome} — ${p.titolo}`).toBeGreaterThan(40);
    }
  });

  it.each(Object.entries(SEZIONI))('%s: nessun bersaglio ripetuto', (nome, passi) => {
    const visti = passi.map((p) => p.sel);
    expect(new Set(visti).size, nome).toBe(visti.length);
  });

  it.each(Object.entries(SEZIONI))('%s: nessun titolo ripetuto', (nome, passi) => {
    const visti = passi.map((p) => p.titolo);
    expect(new Set(visti).size, nome).toBe(visti.length);
  });

  it.each(Object.entries(SEZIONI))('%s: i testi stanno nella carta', (nome, passi) => {
    // La carta è larga al massimo 24rem: oltre le trecento battute diventa un
    // muro, e un muro non si legge in piedi al supermercato.
    for (const p of passi) {
      expect(p.testo.length, `${nome} — ${p.titolo}`).toBeLessThanOrEqual(300);
    }
  });

  it('i titoli non cominciano con «Premi» o «Clicca»: dicono cosa c’è, non come si usa', () => {
    for (const [nome, passi] of Object.entries(SEZIONI)) {
      for (const p of passi) {
        expect(p.titolo, `${nome} — ${p.titolo}`).not.toMatch(/^(premi|clicca|tocca)/i);
      }
    }
  });
});
