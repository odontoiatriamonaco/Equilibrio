/* «Cosa hai già in casa»: guardare negli sportelli prima di uscire.
 *
 * Fino a qui la dispensa si riempiva solo con gli avanzi, a fine settimana —
 * quindi la PRIMA spesa comprava tutto da zero, olio e sale compresi. */
import { describe, it, expect } from 'vitest';
import {
  daAvereInCasa, costruisciLista, aggregaSettimana, residuiInDispensa, comeTesto,
} from '../js/spesa.js';
import { generaSettimana, inizioSettimana } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';

const TARGET = 2000;
const FLOOR = 1500;

function settimana() {
  return generaSettimana({
    target: TARGET, floor: FLOOR, preferenze: vuote('p'), mese: 8, seme: 42,
    inizio: inizioSettimana(new Date('2026-08-17T12:00:00')),
  });
}

describe('l\u2019elenco di cosa serve avere', () => {
  const s = settimana();
  const q = daAvereInCasa(s);

  it('elenca gli alimenti della settimana, non il catalogo intero', () => {
    const usati = aggregaSettimana(s, 1);
    expect(q.quanti).toBeGreaterThan(0);
    expect(q.quanti).toBeLessThanOrEqual(usati.size);
    // Ogni voce e\u0300 una cosa che la settimana usa davvero.
    for (const v of q.voci) expect(usati.has(v.alimentoId)).toBe(true);
  });

  it('e\u0300 ordinato come gli scaffali, e nessun reparto e\u0300 vuoto', () => {
    const ordini = q.reparti.map((r) => r.ordine);
    expect(ordini).toEqual([...ordini].sort((a, b) => a - b));
    for (const r of q.reparti) expect(r.voci.length).toBeGreaterThan(0);
  });

  it('a cucina vuota non risulta niente segnato', () => {
    expect(q.segnati).toBe(0);
    expect(q.coperti).toBe(0);
    expect(q.voci.every((v) => v.hoGia === 0 && !v.basta)).toBe(true);
  });
});

describe('quello che hai gia\u0300 non si ricompra', () => {
  const s = settimana();

  it('un alimento coperto sparisce dalla lista della spesa', () => {
    const primo = daAvereInCasa(s).voci[0];
    const dispensa = [{ alimentoId: primo.alimentoId, grammi: primo.serve }];

    const senza = costruisciLista(s, { dispensa: [] });
    const con = costruisciLista(s, { dispensa });

    expect(senza.voci.some((v) => v.alimentoId === primo.alimentoId)).toBe(true);
    expect(con.voci.some((v) => v.alimentoId === primo.alimentoId)).toBe(false);
    expect(con.costo).toBeLessThanOrEqual(senza.costo);
  });

  it('averne meta\u0300 lo lascia in lista, ma se ne compra meno', () => {
    const primo = daAvereInCasa(s).voci.find((v) => v.serve > 200);
    const meta = Math.round(primo.serve / 2);
    const con = costruisciLista(s, { dispensa: [{ alimentoId: primo.alimentoId, grammi: meta }] });
    const voce = con.voci.find((v) => v.alimentoId === primo.alimentoId);

    expect(voce.inCasa).toBe(meta);
    expect(voce.grammi).toBe(primo.serve - meta);
  });

  it('averne piu\u0300 del necessario non fa scendere il conto sotto zero', () => {
    const dispensa = daAvereInCasa(s).voci.map((v) => ({ alimentoId: v.alimentoId, grammi: v.serve * 3 }));
    const con = costruisciLista(s, { dispensa });
    expect(con.voci).toHaveLength(0);
    expect(con.costo).toBe(0);
  });
});

describe('quello che c\u2019e\u0300 in casa si vede per intero', () => {
  const s = settimana();

  it('la lista NASCONDE cio\u0300 che e\u0300 coperto, questo elenco no', () => {
    // E\u0300 la differenza che conta: la lista dice cosa comprare, qui stai
    // guardando negli sportelli e devi poterti correggere.
    const primo = daAvereInCasa(s).voci[0];
    const dispensa = [{ alimentoId: primo.alimentoId, grammi: primo.serve }];

    expect(costruisciLista(s, { dispensa }).voci.some((v) => v.alimentoId === primo.alimentoId)).toBe(false);

    const q = daAvereInCasa(s, { dispensa });
    const riga = q.voci.find((v) => v.alimentoId === primo.alimentoId);
    expect(riga).toBeDefined();
    expect(riga.basta).toBe(true);
    expect(q.segnati).toBe(1);
    expect(q.coperti).toBe(1);
  });

  it('se ne hai piu\u0300 del necessario lo dice, invece di tagliare il numero', () => {
    const primo = daAvereInCasa(s).voci[0];
    const q = daAvereInCasa(s, { dispensa: [{ alimentoId: primo.alimentoId, grammi: primo.serve + 900 }] });
    const riga = q.voci.find((v) => v.alimentoId === primo.alimentoId);

    expect(riga.hoGia).toBe(primo.serve + 900);   // quello che c'e' davvero
    expect(riga.coperto).toBe(primo.serve);        // quello che serve, e basta
    expect(riga.basta).toBe(true);
  });

  it('una scorta di un alimento che la settimana non usa non compare', () => {
    const q = daAvereInCasa(s, { dispensa: [{ alimentoId: 'non-esiste-affatto', grammi: 900 }] });
    expect(q.voci.some((v) => v.alimentoId === 'non-esiste-affatto')).toBe(false);
    expect(q.segnati).toBe(0);
  });
});

describe('quanto ne hai preso davvero', () => {
  const s = settimana();

  /** La lista, e una voce che si compra a confezioni. */
  function conVoce() {
    const lista = costruisciLista(s, { dispensa: [] });
    const v = lista.voci.find((x) => x.acquistato > x.grammi + 50);
    return { lista, v };
  }

  it('senza correzioni l\u2019avanzo resta quello della confezione', () => {
    const { lista } = conVoce();
    const vecchio = residuiInDispensa(lista, 'p');
    const nuovo = residuiInDispensa(lista, 'p', {});
    expect(nuovo).toEqual(vecchio);
  });

  it('il mazzo era piu\u0300 grande: l\u2019avanzo cresce di quello che hai preso in piu\u0300', () => {
    const { lista, v } = conVoce();
    expect(v).toBeDefined();
    const comprato = new Map([[v.alimentoId, v.acquistato + 200]]);
    const scorte = residuiInDispensa(lista, 'p', { comprato });
    const riga = scorte.find((x) => x.alimentoId === v.alimentoId);

    expect(riga.grammi).toBe(v.residuo + 200);
  });

  it('ne hai preso meno del necessario: non avanza niente, e non va sotto zero', () => {
    const { lista, v } = conVoce();
    const comprato = new Map([[v.alimentoId, Math.floor(v.grammi / 2)]]);
    const scorte = residuiInDispensa(lista, 'p', { comprato });
    expect(scorte.some((x) => x.alimentoId === v.alimentoId)).toBe(false);
  });

  it('la correzione vale solo per la voce corretta', () => {
    const { lista, v } = conVoce();
    const comprato = new Map([[v.alimentoId, v.acquistato + 500]]);
    const scorte = residuiInDispensa(lista, 'p', { comprato });
    const altri = residuiInDispensa(lista, 'p').filter((x) => x.alimentoId !== v.alimentoId);
    for (const a of altri) {
      expect(scorte.find((x) => x.alimentoId === a.alimentoId)?.grammi).toBe(a.grammi);
    }
  });
});

describe('i soldi non si mostrano piu\u0300', () => {
  const s = settimana();

  it('la lista da mandare su WhatsApp non porta un prezzo', () => {
    const testo = comeTesto(costruisciLista(s, { dispensa: [] }));
    expect(testo).not.toMatch(/€/);
    expect(testo).toMatch(/\d+ articoli/);
  });

  it('al posto degli euro c\u2019e\u0300 quante cose non servono', () => {
    const q = daAvereInCasa(s);
    const dispensa = q.voci.slice(0, 3).map((v) => ({ alimentoId: v.alimentoId, grammi: v.serve }));
    const lista = costruisciLista(s, { dispensa });

    expect(lista.coperti).toBe(3);
    expect(costruisciLista(s, { dispensa: [] }).coperti).toBe(0);
  });
});
