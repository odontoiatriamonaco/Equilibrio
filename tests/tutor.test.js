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
  PASSI_PREFERENZE, PASSI_PROGRESSI, PASSI_PROFILO,
} from '../js/tutor-passi.js';

const SEZIONI = {
  Oggi: PASSI_OGGI,
  Piano: PASSI_PIANO,
  Pietanze: PASSI_PIETANZE,
  Spesa: PASSI_SPESA,
  Dispensa: PASSI_DISPENSA,
  Altro: PASSI_ALTRO,
  Preferenze: PASSI_PREFERENZE,
  Progressi: PASSI_PROGRESSI,
  Profilo: PASSI_PROFILO,
};

/* --- Un DOM finto, giusto quello che il tutor tocca ------------------------ */

function nodo({ w = 100, h = 40, hidden = false, dentroHidden = false, visibility = 'visible' } = {}) {
  const el = {
    hidden,
    getBoundingClientRect: () => ({ width: w, height: h, top: 0, left: 0, bottom: h, right: w }),
    closest: (sel) => (sel === '[hidden]' && dentroHidden ? {} : null),
    parentElement: null,
    __visibility: visibility,
  };
  return el;
}

function fingiPagina(mappa) {
  globalThis.document = { querySelectorAll: (sel) => (mappa[sel] ? [mappa[sel]] : []) };
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
  it('tutte le pagine hanno qualcosa da dire', () => {
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

/* --- I pannelli chiusi ------------------------------------------------------
   La regola che si è rotta due volte: prima non vedeva i pannelli chiusi e il
   faro illuminava un comando dentro un giorno richiuso; poi li vedeva troppo e
   scartava anche i sommari, che invece restano in vista. Qui si finge una
   catena di `<details>` come quella vera del Piano: i piatti sono pannelli
   dentro i giorni, che sono pannelli a loro volta.
   -------------------------------------------------------------------------- */

/** Un albero finto con `closest` che risale davvero i genitori. */
function albero() {
  const fai = (tag, attr = {}) => {
    const el = {
      tag,
      open: attr.open,
      figli: [],
      parentElement: null,
      hidden: false,
      getBoundingClientRect: () => ({ width: 50, height: 20, top: 0, left: 0, bottom: 20, right: 50 }),
      closest(sel) {
        for (let n = el; n; n = n.parentElement) {
          if (sel === 'details' && n.tag === 'details') return n;
          if (sel === 'details:not([open])' && n.tag === 'details' && !n.open) return n;
          if (sel === 'summary' && n.tag === 'summary') return n;
          if (sel === '[hidden]' && n.hidden) return n;
        }
        return null;
      },
      querySelector: (sel) => (sel === ':scope > summary'
        ? el.figli.find((f) => f.tag === 'summary') || null : null),
      contains(altro) {
        for (let n = altro; n; n = n.parentElement) if (n === el) return true;
        return false;
      },
    };
    return el;
  };
  const dentro = (padre, figlio) => { figlio.parentElement = padre; padre.figli.push(figlio); return figlio; };
  return { fai, dentro };
}

describe('un comando dentro un pannello chiuso non si illumina', () => {
  const { fai, dentro } = albero();

  /** giorno > voce > summary > pillola, con giorno e voce apribili. */
  function piano({ giornoAperto, voceAperta }) {
    const giorno = fai('details', { open: giornoAperto });
    const sommarioGiorno = dentro(giorno, fai('summary'));
    const corpo = dentro(giorno, fai('div'));
    const voce = dentro(corpo, fai('details', { open: voceAperta }));
    const sommarioVoce = dentro(voce, fai('summary'));
    const pillola = dentro(sommarioVoce, fai('span'));
    const dose = dentro(dentro(voce, fai('ul')), fai('li'));
    return { giorno, sommarioGiorno, pillola, dose };
  }

  function conNodo(nodo) {
    globalThis.document = { querySelectorAll: () => [nodo] };
    globalThis.getComputedStyle = () => ({ visibility: 'visible' });
    return passiVeri([{ sel: '#x', titolo: 'T', testo: 'x' }]).length;
  }

  it('il sommario si vede anche a pannello chiuso: è la riga su cui premi', () => {
    const { pillola } = piano({ giornoAperto: true, voceAperta: false });
    expect(conNodo(pillola)).toBe(1);
  });

  it('ma non se il pannello che lo contiene è a sua volta chiuso', () => {
    // È il difetto vero: la pillola sta nel sommario del piatto — visibile, a
    // guardare solo lì — ma il giorno intorno è richiuso e non si vede niente.
    const { pillola } = piano({ giornoAperto: false, voceAperta: false });
    expect(conNodo(pillola)).toBe(0);
  });

  it('il contenuto oltre il sommario resta nascosto a pannello chiuso', () => {
    const { dose } = piano({ giornoAperto: true, voceAperta: false });
    expect(conNodo(dose)).toBe(0);
  });

  it('con tutto aperto si vede tutto', () => {
    const { dose } = piano({ giornoAperto: true, voceAperta: true });
    expect(conNodo(dose)).toBe(1);
  });

  it('fra più nodi uguali vince il primo che si vede, non il primo del documento', () => {
    // Sul Piano il primo bersaglio in ordine di documento sta quasi sempre in
    // un giorno richiuso: fermarsi lì buttava via il passo, o peggio lo faceva
    // puntare nel vuoto.
    const chiuso = piano({ giornoAperto: false, voceAperta: false }).pillola;
    const aperto = piano({ giornoAperto: true, voceAperta: false }).pillola;
    globalThis.document = { querySelectorAll: () => [chiuso, aperto] };
    globalThis.getComputedStyle = () => ({ visibility: 'visible' });
    const veri = passiVeri([{ sel: '#x', titolo: 'T', testo: 'x' }]);
    expect(veri).toHaveLength(1);
    expect(veri[0].nodo).toBe(aperto);
  });
});

describe('il pannello stesso è il bersaglio', () => {
  /* Il caso nuovo: l'avviso del recupero è diventato un `<details>`, e il passo
     del tutor punta a lui, non a qualcosa che ha dentro. `closest` comprende sé
     stesso, quindi la regola dei pannelli chiusi lo scartava in silenzio — e un
     passo saltato non lascia traccia da nessuna parte. */
  const { fai, dentro } = albero();

  function avviso({ aperto }) {
    const nota = fai('details', { open: aperto });
    const sommario = dentro(nota, fai('summary'));
    dentro(sommario, fai('div'));
    const spiega = dentro(nota, fai('div'));
    return { nota, spiega };
  }

  function conNodo(nodo) {
    globalThis.document = { querySelectorAll: () => [nodo] };
    globalThis.getComputedStyle = () => ({ visibility: 'visible' });
    return passiVeri([{ sel: '#nota', titolo: 'T', testo: 'x' }]).length;
  }

  it('chiuso si vede: quello che si vede è la riga su cui si preme', () => {
    expect(conNodo(avviso({ aperto: false }).nota)).toBe(1);
  });

  it('aperto pure', () => {
    expect(conNodo(avviso({ aperto: true }).nota)).toBe(1);
  });

  it('ma la spiegazione dentro resta nascosta finché non si apre', () => {
    expect(conNodo(avviso({ aperto: false }).spiega)).toBe(0);
    expect(conNodo(avviso({ aperto: true }).spiega)).toBe(1);
  });

  it('un pannello chiuso dentro un pannello chiuso resta invisibile', () => {
    // La regola vecchia non deve saltare: è sé stesso che si perdona, non i genitori.
    const fuori = fai('details', { open: false });
    dentro(fuori, fai('summary'));
    const dentroChiuso = dentro(dentro(fuori, fai('div')), fai('details', { open: false }));
    dentro(dentroChiuso, fai('summary'));
    expect(conNodo(dentroChiuso)).toBe(0);
  });
});
