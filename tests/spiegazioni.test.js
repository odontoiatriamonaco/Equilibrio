/* Il perché dietro gli avvisi che si aprono.
 *
 * Sono testo, ma non è testo qualunque: dice quanto vale un vincolo di
 * sicurezza. Un numero sbagliato qui è peggio di nessun numero, perché ha
 * l'aria di essere stato controllato. */
import { describe, it, expect } from 'vitest';
import {
  perchePavimento, percheAvvio, percheRipescati, percheFascia,
} from '../js/spiegazioni.js';
import {
  quoteAvvio, giorniAggiuntiDallAvvio, AVVIO_SETTIMANE,
  floorCalorico, FLOOR_DONNA, FLOOR_UOMO,
} from '../js/energia.js';
import { TAGLIO_MAX } from '../js/sgarro.js';

describe('perché una parte dello sgarro resta fuori', () => {
  const testo = perchePavimento({ floor: 1410, residuo: 240, taglioMax: TAGLIO_MAX });

  it('dice il pavimento vero di questa persona, non uno generico', () => {
    expect(testo).toContain('1410 kcal');
  });

  it('dice il tetto giornaliero come lo applica il codice', () => {
    // Se TAGLIO_MAX cambia e la frase no, la spiegazione mente.
    expect(testo).toContain(`${Math.round(TAGLIO_MAX * 100)}%`);
  });

  it('dice i due minimi di sicurezza con i numeri che usa floorCalorico', () => {
    expect(testo).toContain(`${FLOOR_DONNA} kcal per`);
    expect(testo).toContain(String(FLOOR_UOMO));
    // E la regola che li combina: il più alto fra basale e minimo.
    expect(floorCalorico({ bmr: 1410, sesso: 'donna' })).toBe(1410);
    expect(floorCalorico({ bmr: 1100, sesso: 'donna' })).toBe(FLOOR_DONNA);
  });

  it('dice le calorie rimaste fuori, quando ce ne sono', () => {
    expect(testo).toContain('240 kcal');
  });

  it('concorda al plurale in tutti e due i casi', () => {
    // La frase era scritta al singolare e col numero diventava «quelle 240 kcal
    // resta fuori dal conto». Nessun test la guardava: l'ha vista il browser.
    for (const residuo of [0, 1, 240]) {
      const t = perchePavimento({ floor: 1410, residuo, taglioMax: TAGLIO_MAX });
      expect(t, String(residuo)).toContain('restano fuori dal conto');
      expect(t, String(residuo)).not.toMatch(/resta fuori dal conto/);
    }
  });

  it('senza residuo non inventa un numero', () => {
    const t = perchePavimento({ floor: 1500, residuo: 0, taglioMax: TAGLIO_MAX });
    expect(t).not.toMatch(/<strong>0 kcal<\/strong>/);
    expect(t).toContain('le calorie che avanzano');
  });

  it('dice che non è un debito: è la parte che si sbaglia da soli', () => {
    expect(testo).toMatch(/non sono un debito/i);
  });
});

describe('perché il bersaglio di oggi è più alto', () => {
  const testo = percheAvvio({
    quote: quoteAvvio(),
    giorniAggiunti: giorniAggiuntiDallAvvio(AVVIO_SETTIMANE),
  });

  it('elenca i gradini che il codice usa davvero', () => {
    for (const q of quoteAvvio()) expect(testo).toContain(`${Math.round(q * 100)}%`);
  });

  it('regge una rampa di lunghezza diversa senza dire una bugia', () => {
    const t = percheAvvio({ quote: quoteAvvio(2), giorniAggiunti: 5 });
    expect(t).toContain('50%');
    expect(t).toContain('100%');
    expect(t).not.toContain('25%');
  });

  it('dice il costo in giorni, che è il prezzo vero della rampa', () => {
    expect(testo).toContain(`${giorniAggiuntiDallAvvio(AVVIO_SETTIMANE)} giorni`);
  });

  it('non promette benefici metabolici che le prove non sostengono', () => {
    expect(testo).toMatch(/non è un trucco/i);
    expect(testo).not.toMatch(/brucia|accelera|metabolismo più/i);
  });
});

describe('perché degli sgarri erano spariti', () => {
  it('dice cosa era rotto e che è stato riparato, senza scusarsi a vuoto', () => {
    const t = percheRipescati();
    expect(t).toMatch(/strato/i);
    expect(t).toMatch(/non ricapita/i);
  });
});

describe('tutte le spiegazioni', () => {
  const tutte = [
    perchePavimento({ floor: 1410, residuo: 240, taglioMax: TAGLIO_MAX }),
    percheAvvio({ quote: quoteAvvio(), giorniAggiunti: 11 }),
    percheRipescati(),
  ];

  it('sono paragrafi chiusi: un tag aperto sfonderebbe il riquadro', () => {
    for (const t of tutte) {
      expect((t.match(/<p>/g) || []).length).toBe((t.match(/<\/p>/g) || []).length);
      expect((t.match(/<strong>/g) || []).length).toBe((t.match(/<\/strong>/g) || []).length);
    }
  });

  it('stanno in una schermata: oltre le mille battute non le legge nessuno', () => {
    for (const t of tutte) {
      const parole = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(parole.length, parole.slice(0, 60)).toBeLessThan(1000);
    }
  });
});

describe('come si legge la fascia del budget', () => {
  const g = (etichetta, quota, stato) => ({ etichetta, quota, stato });
  const TARGET = 1657;

  it('nomina i giorni per esteso: «lun, mar» si decifra, «lunedì e martedì» si legge', () => {
    const t = percheFascia({
      target: TARGET,
      giorni: [
        g('lun', 1500, 'recupero'), g('mar', 1500, 'recupero'),
        g('mer', 1657), g('gio', 1500, 'recupero'),
        g('ven', 2100, 'sgarro'), g('sab', 2000, 'sgarro'), g('dom', 1657),
      ],
    });
    expect(t).toContain('venerdì e sabato');
    expect(t).toContain('lunedì, martedì e giovedì');
    expect(t).not.toMatch(/\bven\b|\bsab\b/);
  });

  it('dice il bersaglio vero, non uno di esempio', () => {
    const t = percheFascia({ target: TARGET, giorni: [g('lun', 1657)] });
    expect(t).toContain('1657 kcal');
  });

  it('parla di ocra solo se un giorno ocra c’è', () => {
    const senza = percheFascia({ target: TARGET, giorni: [g('lun', 1657), g('mar', 1657)] });
    expect(senza).not.toMatch(/ocra/);
    expect(senza).toMatch(/nessuna colonna esce dalla riga/);
  });

  it('un giorno alleggerito senza sgarri in settimana viene comunque spiegato', () => {
    // Capita: lo sgarro era la settimana scorsa, il recupero cade in questa.
    const t = percheFascia({
      target: TARGET, giorni: [g('lun', 1400, 'recupero'), g('mar', 1657)],
    });
    expect(t).toContain('lunedì');
    expect(t).toMatch(/settimane scorse/);
  });

  it('il giorno rigido si spiega al singolare e al plurale', () => {
    const uno = percheFascia({ target: TARGET, giorni: [g('mer', 1657, 'rigido')] });
    expect(uno).toContain('La colonna blu è');
    expect(uno).toContain('non lo tocca');

    const due = percheFascia({
      target: TARGET, giorni: [g('mer', 1657, 'rigido'), g('dom', 1657, 'rigido')],
    });
    expect(due).toContain('Le colonne blu sono');
    expect(due).toContain('mercoledì e domenica');
    expect(due).toContain('non li tocca');
  });

  it('un giorno solo sotto il bersaglio non è un recupero: è la calibrazione', () => {
    // Il difetto vero, trovato guardando una settimana senza nemmeno uno sgarro
    // che mostrava tre giorni tratteggiati: la soglia era «più di 1 kcal sotto»,
    // mentre la calibrazione atterra di suo a cinquanta calorie dal bersaglio.
    const t = percheFascia({
      target: TARGET,
      giorni: [g('lun', TARGET - 17), g('gio', TARGET - 8), g('dom', TARGET + 54)],
    });
    expect(t).not.toMatch(/tratteggio/);
    expect(t).toMatch(/nessuna colonna esce dalla riga/);
  });

  it('senza giorni rigidi non nomina il blu, che non c’è nel disegno', () => {
    const t = percheFascia({ target: TARGET, giorni: [g('lun', 1657)] });
    expect(t).not.toMatch(/blu/);
  });

  it('dice sempre che a tornare è la settimana, non il giorno', () => {
    const t = percheFascia({ target: TARGET, giorni: [g('lun', 1657)] });
    expect(t).toMatch(/settimana<\/strong>, non ogni singolo giorno/);
  });

  it('senza dati non esplode: la fascia può essere vuota', () => {
    expect(() => percheFascia()).not.toThrow();
    expect(() => percheFascia({})).not.toThrow();
    expect(percheFascia({ giorni: [], target: 0 })).toContain('<p>');
  });

  it('i paragrafi sono chiusi, come in tutte le altre', () => {
    const t = percheFascia({
      target: TARGET,
      giorni: [g('lun', 1400, 'recupero'), g('ven', 2100, 'sgarro'), g('mer', 1657, 'rigido')],
    });
    expect((t.match(/<p>/g) || []).length).toBe((t.match(/<\/p>/g) || []).length);
    expect((t.match(/<strong>/g) || []).length).toBe((t.match(/<\/strong>/g) || []).length);
  });
});
