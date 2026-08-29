/* Il perché dietro gli avvisi che si aprono.
 *
 * Sono testo, ma non è testo qualunque: dice quanto vale un vincolo di
 * sicurezza. Un numero sbagliato qui è peggio di nessun numero, perché ha
 * l'aria di essere stato controllato. */
import { describe, it, expect } from 'vitest';
import { perchePavimento, percheAvvio, percheRipescati } from '../js/spiegazioni.js';
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
