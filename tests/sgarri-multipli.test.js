/* Piu' sgarri nella stessa settimana, e anche nello stesso giorno.
 *
 * Il caso vero da cui nasce: la pizza la sera al posto della cena, e la
 * sfogliatella in aggiunta allo spuntino. Sono due cose diverse, e il modello
 * ne reggeva una sola. */
import { describe, it, expect } from 'vitest';
import { applicaSgarri, elencoSgarri } from '../js/sgarro.js';
import { generaSettimana, kcalGiorno, tutteLeVoci } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';
import { valoriVoce } from '../js/alimenti.js';

const TARGET = 2000;
const FLOOR = 1500;

function settimanaBase() {
  return generaSettimana({
    target: TARGET, floor: FLOOR, preferenze: vuote('p'), mese: 6, seme: 42,
    inizio: new Date('2026-07-27T00:00:00'),
  });
}

/** Quanto pesa un pasto, contando anche le voci marcate come sostituite. */
function kcalPasto(giorno, pasto) {
  return (giorno.pasti[pasto] || []).reduce((a, v) => a + (v ? valoriVoce(v).kcal : 0), 0);
}

describe('due sgarri nello stesso giorno', () => {
  const prima = settimanaBase();
  const cenaPrima = kcalPasto(prima.giorni[5], 'cena');

  const dopo = applicaSgarri(prima, [
    { id: 'a', giorno: 5, kcal: 900, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' },
    { id: 'b', giorno: 5, kcal: 250, etichetta: 'Sfogliatella', pasto: 'spuntino-mattina', sostituisce: false, modo: 'prima' },
  ]);
  const g = dopo.giorni[5];

  it('li tiene tutti e due, ognuno nel suo pasto', () => {
    expect(g.sgarri).toHaveLength(2);
    expect(g.sgarri.map((x) => x.pasto).sort()).toEqual(['cena', 'spuntino-mattina']);
  });

  it('salta solo il pasto sostituito, non quello a cui si aggiunge', () => {
    expect(g.pasti.cena.every((v) => v.saltato)).toBe(true);
    expect(g.pasti['spuntino-mattina'].some((v) => v.saltato)).toBe(false);
  });

  it('la quota e\u0300 il piano meno la cena piu\u0300 tutti e due gli sgarri', () => {
    // Le porzioni non cambiano: quello che resta in piano si legge dal giorno.
    expect(g.quota).toBe(kcalGiorno(g) + 900 + 250);
    // E kcalGiorno esclude gia' la cena sostituita.
    expect(tutteLeVoci(g).every((v) => !v.saltato)).toBe(true);
    expect(cenaPrima).toBeGreaterThan(0);
  });

  it('recupera il netto: la cena tolta non si recupera due volte', () => {
    const netto = (900 - cenaPrima) + 250;
    const tagliato = dopo.giorni.reduce((a, x) => a + (x.recuperoKcal || 0), 0);
    expect(tagliato).toBeLessThanOrEqual(Math.max(0, netto) + 2);
  });
});

describe('due sgarri in giorni diversi', () => {
  const dopo = applicaSgarri(settimanaBase(), [
    { id: 'a', giorno: 2, kcal: 400, etichetta: 'Gelato', pasto: 'cena', sostituisce: false, modo: 'prima' },
    { id: 'b', giorno: 5, kcal: 800, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' },
  ]);

  it('marca tutti e due i giorni come sgarro', () => {
    expect(dopo.giorni[2].stato).toBe('sgarro');
    expect(dopo.giorni[5].stato).toBe('sgarro');
  });

  it('nessun giorno scende sotto il pavimento', () => {
    for (const g of dopo.giorni) expect(g.quota).toBeGreaterThanOrEqual(FLOOR);
  });

  it('nessun pasto resta saltato senza uno sgarro che lo spieghi', () => {
    // E\u0300 il difetto vero trovato provando: un sabato a 1189 kcal contro 1974,
    // perche\u0301 il giorno aveva perso lo sgarro ma teneva la cena sostituita.
    for (const g of dopo.giorni) {
      const saltati = Object.values(g.pasti).flat().some((v) => v?.saltato);
      const sostituenti = (g.sgarri || []).some((x) => x.sostituisce);
      expect(saltati).toBe(sostituenti);
    }
  });
});

describe('togliere e rimettere', () => {
  const uno = { id: 'a', giorno: 2, kcal: 400, etichetta: 'Gelato', pasto: 'cena', sostituisce: false, modo: 'prima' };
  const due = { id: 'b', giorno: 5, kcal: 800, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' };

  it('togliendone uno l\u0027altro resta applicato', () => {
    const dopo = applicaSgarri(applicaSgarri(settimanaBase(), [uno, due]), [due]);
    expect(elencoSgarri(dopo).map((x) => x.id)).toEqual(['b']);
    expect(dopo.giorni[2].stato).not.toBe('sgarro');
    expect(Object.values(dopo.giorni[2].pasti).flat().some((v) => v?.saltato)).toBe(false);
  });

  it('togliendoli tutti la settimana torna al bersaglio', () => {
    const dopo = applicaSgarri(applicaSgarri(settimanaBase(), [uno, due]), []);
    expect(elencoSgarri(dopo)).toHaveLength(0);
    for (const g of dopo.giorni) {
      expect(Math.abs(g.quota - TARGET)).toBeLessThanOrEqual(60);
      expect(g.recuperoKcal).toBeUndefined();
    }
  });

  it('riapplicare lo stesso elenco da\u0300 lo stesso risultato', () => {
    const a = applicaSgarri(settimanaBase(), [uno, due]);
    const b = applicaSgarri(a, [uno, due]);
    expect(b.giorni.map((g) => g.quota)).toEqual(a.giorni.map((g) => g.quota));
  });
});

describe('due sgarri che sostituiscono lo stesso pasto', () => {
  const prima = settimanaBase();
  const cena = kcalPasto(prima.giorni[5], 'cena');
  const dopo = applicaSgarri(prima, [
    { id: 'a', giorno: 5, kcal: 600, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' },
    { id: 'b', giorno: 5, kcal: 300, etichetta: 'Birra', pasto: 'cena', sostituisce: true, modo: 'prima' },
  ]);

  it('non toglie due volte la stessa cena dal conto', () => {
    const netto = 600 + 300 - cena;
    const tagliato = dopo.giorni.reduce((a, x) => a + (x.recuperoKcal || 0), 0);
    expect(tagliato).toBeGreaterThan(netto - 60);
    expect(tagliato).toBeLessThan(netto + 60);
  });
});

describe('i piani salvati prima', () => {
  it('legge il vecchio `sgarro` singolo e gli da\u0300 un\u0027identita\u0300', () => {
    const s = settimanaBase();
    s.giorni[3].sgarro = { kcal: 500, etichetta: 'Pizza', pasto: 'cena', sostituisce: true };
    s.giorni[3].stato = 'sgarro';
    const elenco = elencoSgarri(s);
    expect(elenco).toHaveLength(1);
    expect(elenco[0].id).toBe('g3-0');
    expect(elenco[0].giorno).toBe(3);
  });
});
