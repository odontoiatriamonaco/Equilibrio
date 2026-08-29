/* Il conto di quello che gli sgarri non hanno restituito.
 *
 * Il dato c'era già — ogni settimana salva `recupero.residuo` — e nessuno lo
 * guardava: l'app annunciava «il traguardo si sposta di due giorni» una volta
 * sola e poi se ne dimenticava. Qui si prova che il conto sta in piedi, perché
 * un totale sbagliato su questo numero è peggio di nessun totale: sposta una
 * data che la persona usa per decidere. */
import { describe, it, expect } from 'vitest';
import { arretrati, raccontaArretrati, GIORNI_RECENTI } from '../js/arretrati.js';
import { slittamentoTraguardo, grammiEquivalenti } from '../js/sgarro.js';

const OGGI = new Date('2026-08-29T12:00:00');

/** Una settimana come la salva l'app, ridotta a quello che serve qui. */
function sett(inizio, residuo, recuperato = 0) {
  return { inizio, recupero: residuo === null ? undefined : { residuo, recuperato, motivo: 'x' } };
}

describe('il totale', () => {
  const dati = [
    sett('2026-08-24', 240),
    sett('2026-08-17', 120),
    sett('2026-08-10', 0),
    sett('2026-08-03', null),
    sett('2026-06-01', 300),
  ];

  it('somma solo le settimane che hanno lasciato scoperto qualcosa', () => {
    const a = arretrati(dati, { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.totale).toBe(660);
    expect(a.quante).toBe(3);
  });

  it('traduce in giorni con la stessa formula che usa l’avviso dello sgarro', () => {
    const a = arretrati(dati, { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.giorni).toBe(slittamentoTraguardo(660, 300));
    expect(a.giorni).toBe(3);
  });

  it('traduce in grammi con la stessa formula di sempre', () => {
    const a = arretrati(dati, { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.grammi).toBe(grammiEquivalenti(660));
  });

  it('senza deficit non inventa giorni invece di dire zero', () => {
    // Capita a chi è a mantenimento: dividere per zero darebbe Infinity.
    const a = arretrati(dati, { deficitGiornaliero: 0, oggi: OGGI });
    expect(a.totale).toBe(660);
    expect(a.giorni).toBe(0);
    expect(Number.isFinite(a.giorni)).toBe(true);
  });

  it('senza settimane non esplode e non mente', () => {
    const a = arretrati([], { deficitGiornaliero: 300, oggi: OGGI });
    expect(a).toMatchObject({ totale: 0, quante: 0, giorni: 0, grammi: 0 });
    expect(a.righe).toEqual([]);
  });

  it('regge settimane rotte senza inizio o senza recupero', () => {
    const a = arretrati([null, {}, { inizio: '2026-08-24' }, sett('2026-08-17', 100)],
      { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.totale).toBe(100);
  });
});

describe('le righe', () => {
  it('vengono dalla più recente, che è quella che interessa', () => {
    const a = arretrati([sett('2026-06-01', 300), sett('2026-08-24', 240)],
      { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.righe.map((r) => r.inizio)).toEqual(['2026-08-24', '2026-06-01']);
  });

  it('una settimana non ancora cominciata è prenotata, non arretrata', () => {
    // Sgarri già segnati per la settimana prossima: il costo è vero ma non
    // ancora speso, e chiamarlo arretrato sarebbe una bugia.
    const a = arretrati([sett('2026-09-07', 200), sett('2026-08-24', 240)],
      { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.righe.find((r) => r.inizio === '2026-09-07').prenotata).toBe(true);
    expect(a.righe.find((r) => r.inizio === '2026-08-24').prenotata).toBe(false);
    // Si conta lo stesso: è un impegno già preso.
    expect(a.totale).toBe(440);
  });
});

describe('«di recente»: serve a distinguere un’abitudine da una storia vecchia', () => {
  it('guarda indietro quattro settimane', () => {
    expect(GIORNI_RECENTI).toBe(28);
  });

  it('separa quello che è successo adesso da quello di mesi fa', () => {
    const a = arretrati([sett('2026-08-24', 240), sett('2026-03-02', 900)],
      { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.totale).toBe(1140);
    expect(a.recenti).toBe(240);
    expect(a.giorniRecenti).toBe(1);
  });

  it('il confine è incluso: una settimana esatta di ventotto giorni fa conta', () => {
    const a = arretrati([sett('2026-08-01', 150)], { deficitGiornaliero: 300, oggi: OGGI });
    expect(a.recenti).toBe(150);
    const fuori = arretrati([sett('2026-07-31', 150)], { deficitGiornaliero: 300, oggi: OGGI });
    expect(fuori.recenti).toBe(0);
    expect(fuori.totale).toBe(150);
  });
});

describe('come si racconta', () => {
  it('quando non c’è niente lo dice, invece di tacere', () => {
    const a = arretrati([], { deficitGiornaliero: 300, oggi: OGGI });
    expect(raccontaArretrati(a)).toMatch(/è rientrato tutto/i);
  });

  it('dice il totale, quante settimane e quanti giorni costa', () => {
    const a = arretrati([sett('2026-08-24', 240), sett('2026-08-17', 420)],
      { deficitGiornaliero: 300, oggi: OGGI });
    const t = raccontaArretrati(a);
    expect(t).toContain('660 kcal');
    expect(t).toContain('2 settimane');
    expect(t).toContain('3 giorni');
  });

  it('al singolare non dice «1 giorni» né «1 settimane»', () => {
    const a = arretrati([sett('2026-08-24', 100)], { deficitGiornaliero: 300, oggi: OGGI });
    const t = raccontaArretrati(a);
    expect(t).toContain('una settimana');
    expect(t).toContain('un giorno');
    expect(t).not.toMatch(/1 giorni|1 settimane/);
  });

  it('non colpevolizza: è un conto, non una sgridata', () => {
    const a = arretrati([sett('2026-08-24', 900)], { deficitGiornaliero: 300, oggi: OGGI });
    const t = raccontaArretrati(a);
    expect(t).not.toMatch(/colpa|sbagliato|dovresti|attenzione|troppo/i);
  });
});

describe('la frase accanto al numero grande', () => {
  const a = arretrati([sett('2026-08-24', 240), sett('2026-08-17', 420)],
    { deficitGiornaliero: 300, oggi: OGGI });

  it('senza totale non ripete il numero che è già scritto sopra', () => {
    const t = raccontaArretrati(a, { conTotale: false });
    expect(t).not.toContain('660 kcal');
    expect(t).toContain('2 settimane');
    expect(t).toContain('3 giorni');
  });

  it('da sola invece il numero lo dice, perché non c’è nient’altro a dirlo', () => {
    expect(raccontaArretrati(a)).toContain('660 kcal');
  });

  it('quando non c’è niente la risposta è la stessa in tutti e due i casi', () => {
    const vuoto = arretrati([], { deficitGiornaliero: 300, oggi: OGGI });
    expect(raccontaArretrati(vuoto, { conTotale: false })).toBe(raccontaArretrati(vuoto));
  });
});
