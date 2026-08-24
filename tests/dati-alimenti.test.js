/* I numeri su cui poggia tutto il resto.
 *
 * `fette-biscottate` dichiarava 103,1 g di macronutrienti su 100 g di prodotto:
 * impossibile, e in piedi per mesi. Non l'ha trovato nessun test perché nessun
 * test guardava i dati — solo il codice che li usa. Questo li guarda. */
import { describe, it, expect } from 'vitest';
import { alimenti } from '../js/alimenti.js';

describe('nessun alimento può contenere più di sé stesso', () => {
  it.each(alimenti.map((a) => [a.nome, a]))(
    '%s: proteine, carboidrati, grassi e fibra stanno in 100 g',
    (nome, a) => {
      const v = a.per100g || {};
      const somma = (v.pro || 0) + (v.car || 0) + (v.gra || 0) + (v.fib || 0);
      // Un filo di margine: acqua, ceneri e arrotondamenti fanno sì che la
      // somma non arrivi mai a cento, ma superarli è un errore di trascrizione.
      expect(somma, `${nome}: ${somma.toFixed(1)} g su 100`).toBeLessThanOrEqual(100.5);
    },
  );
});

describe('le calorie non contraddicono i macronutrienti', () => {
  /**
   * Il controllo è volutamente largo, e per una ragione precisa: il CREA misura
   * le calorie in laboratorio, non le calcola con la formula di Atwater, e sugli
   * alimenti poveri le due strade divergono parecchio in percentuale — i carciofi
   * danno 22 kcal misurate contro 34 calcolate, che in valore assoluto sono
   * dodici calorie. Stringere qui vorrebbe dire segnalare mezza verdura del
   * catalogo come rotta, e un guardiano che grida sempre non lo ascolta nessuno.
   *
   * Quello che deve prendere è l'errore di trascrizione grosso: un numero
   * sbagliato di una cifra, o preso da un'altra riga.
   */
  const SCARTO_MAX = 0.35;
  const SOGLIA_KCAL = 60;

  it.each(alimenti.filter((a) => (a.per100g?.kcal || 0) >= SOGLIA_KCAL).map((a) => [a.nome, a]))(
    '%s: le calorie dichiarate stanno vicine a quelle dei macro',
    (nome, a) => {
      const v = a.per100g;
      const daiMacro = (v.pro || 0) * 4 + (v.car || 0) * 4 + (v.gra || 0) * 9 + (v.fib || 0) * 2;
      const scarto = Math.abs(daiMacro - v.kcal) / v.kcal;
      expect(scarto, `${nome}: ${v.kcal} dichiarate, ${Math.round(daiMacro)} dai macro`)
        .toBeLessThanOrEqual(SCARTO_MAX);
    },
  );
});

describe('la tracciabilità', () => {
  it('ogni alimento dichiara da dove viene', () => {
    for (const a of alimenti) expect(a.fonte, a.nome).toBeTruthy();
  });

  it('chi porta un `fonteId` lo porta come stringa, non come numero', () => {
    // I codici CREA hanno gli zeri davanti — 001500 — e un numero se li mangia.
    for (const a of alimenti.filter((x) => x.fonteId !== undefined)) {
      expect(typeof a.fonteId, a.nome).toBe('string');
      expect(a.fonteId.length, a.nome).toBeGreaterThan(0);
    }
  });

  it('le fette biscottate sono agganciate alla riga di origine', () => {
    // La prima voce del catalogo con un riferimento vero invece di un'etichetta.
    // Quando ce ne saranno altre, questo test diventerà una regola generale.
    const f = alimenti.find((a) => a.id === 'fette-biscottate');
    expect(f.fonte).toBe('CREA');
    expect(f.fonteId).toBe('001500');
    expect(f.per100g.kcal).toBe(387);
    expect(f.per100g.car).toBe(75);
  });
});
