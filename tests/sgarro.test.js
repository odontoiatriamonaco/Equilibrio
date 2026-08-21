import { describe, it, expect } from 'vitest';
import {
  calcolaRecupero, applicaRecupero, slittamentoTraguardo, grammiEquivalenti,
  racconta, TAGLIO_MAX, extraNetto,
} from '../js/sgarro.js';
import { generaSettimana, kcalGiorno, tutteLeVoci } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';
import { valoriVoce } from '../js/alimenti.js';

const TARGET = 1700;
const FLOOR = 1300;

/** Sette giorni tutti sulla quota, senza generare un piano vero. */
function giorni(quota = TARGET, rigidi = []) {
  return Array.from({ length: 7 }, (_, i) => ({
    quota, rigido: Boolean(rigidi[i]),
  }));
}

describe('recupero: il caso normale', () => {
  const r = calcolaRecupero({
    giorni: giorni(), target: TARGET, floor: FLOOR,
    extra: 850, indiceEvento: 5, modo: 'prima',
  });

  it('recupera tutto se c’è capienza', () => {
    expect(r.recuperato).toBeGreaterThanOrEqual(849);
    expect(r.residuo).toBe(0);
  });

  it('non tocca il giorno dell’evento', () => {
    expect(r.perGiorno[5]).toBe(0);
  });

  it('in modo «prima» alleggerisce solo i giorni precedenti', () => {
    expect(r.perGiorno.slice(0, 5).every((v) => v > 0)).toBe(true);
    expect(r.perGiorno[6]).toBe(0);
  });

  it('dichiara che le proteine restano intere e da dove taglia', () => {
    expect(r.proteineInvariate).toBe(true);
    expect(r.carboGrammi).toBeGreaterThan(0);
    expect(r.grassiGrammi).toBeGreaterThan(0);
    // 70% da carboidrati a 4 kcal/g, 30% da grassi a 9 kcal/g.
    expect(r.carboGrammi).toBeCloseTo((r.recuperato * 0.7) / 4, 0);
  });
});

describe('recupero: modo «dopo»', () => {
  it('riparte dai giorni successivi', () => {
    const r = calcolaRecupero({
      giorni: giorni(), target: TARGET, floor: FLOOR,
      extra: 420, indiceEvento: 2, modo: 'dopo',
    });
    expect(r.perGiorno.slice(0, 3).every((v) => v === 0)).toBe(true);
    expect(r.perGiorno.slice(3).some((v) => v > 0)).toBe(true);
  });

  it('se l’evento è l’ultimo giorno non c’è dove recuperare', () => {
    const r = calcolaRecupero({
      giorni: giorni(), target: TARGET, floor: FLOOR,
      extra: 500, indiceEvento: 6, modo: 'dopo',
    });
    expect(r.recuperato).toBe(0);
    expect(r.residuo).toBe(500);
    expect(r.motivo).toContain('dopo');
  });
});

describe('vincoli che non si aggirano', () => {
  it('nessun giorno viene tagliato oltre il tetto percentuale', () => {
    const r = calcolaRecupero({
      giorni: giorni(), target: TARGET, floor: FLOOR,
      extra: 5000, indiceEvento: 3, modo: 'prima',
    });
    for (const taglio of r.perGiorno) {
      expect(taglio).toBeLessThanOrEqual(Math.ceil(TARGET * TAGLIO_MAX));
    }
  });

  it('non scende sotto il pavimento calorico', () => {
    // Giorni già poco sopra il floor: la capienza è quasi nulla.
    const r = calcolaRecupero({
      giorni: giorni(FLOOR + 50), target: TARGET, floor: FLOOR,
      extra: 900, indiceEvento: 0, modo: 'dopo',
    });
    for (let i = 0; i < 7; i++) {
      expect((FLOOR + 50) - r.perGiorno[i]).toBeGreaterThanOrEqual(FLOOR);
    }
    expect(r.residuo).toBeGreaterThan(0);
  });

  it('un giorno rigido non viene toccato', () => {
    const r = calcolaRecupero({
      giorni: giorni(TARGET, [false, false, true, false, false, false, false]),
      target: TARGET, floor: FLOOR, extra: 600, indiceEvento: 6, modo: 'prima',
    });
    expect(r.perGiorno[2]).toBe(0);
    expect(r.recuperato).toBeGreaterThan(0);
  });

  it('se tutti i giorni sono rigidi non recupera nulla e lo dice', () => {
    const r = calcolaRecupero({
      giorni: giorni(TARGET, [true, true, true, true, true, true, true]),
      target: TARGET, floor: FLOOR, extra: 600, indiceEvento: 3, modo: 'prima',
    });
    expect(r.recuperato).toBe(0);
    expect(r.residuo).toBe(600);
    expect(r.motivo).toBeTruthy();
  });
});

describe('quando il conto non torna, dice la verità', () => {
  const r = calcolaRecupero({
    giorni: giorni(), target: TARGET, floor: FLOOR,
    extra: 3000, indiceEvento: 3, modo: 'dopo',
  });

  it('recupera il possibile e restituisce il residuo', () => {
    expect(r.recuperato).toBeGreaterThan(0);
    expect(r.residuo).toBeGreaterThan(0);
    expect(r.recuperato + r.residuo).toBeCloseTo(3000, -1);
  });

  it('il residuo si traduce in giorni sul traguardo', () => {
    expect(slittamentoTraguardo(r.residuo, 500)).toBe(Math.ceil(r.residuo / 500));
    expect(slittamentoTraguardo(0, 500)).toBe(0);
    expect(slittamentoTraguardo(500, 0)).toBe(0);
  });

  it('il racconto non colpevolizza e non inventa', () => {
    const testo = racconta({ recupero: r, extra: 3000, modo: 'dopo', deficitGiornaliero: 500 });
    expect(testo).toMatch(/traguardo/);
    expect(testo).not.toMatch(/digiun|colpa|sbagliat/i);
  });

  it('un residuo si può leggere anche in grammi di peso', () => {
    expect(grammiEquivalenti(770)).toBe(100);
  });
});

describe('extra nullo', () => {
  it('non produce nessun taglio', () => {
    const r = calcolaRecupero({
      giorni: giorni(), target: TARGET, floor: FLOOR, extra: 0, indiceEvento: 2,
    });
    expect(r.perGiorno.every((v) => v === 0)).toBe(true);
    expect(r.recuperato).toBe(0);
  });
});

describe('applicazione al piano vero', () => {
  const settimana = generaSettimana({
    target: TARGET, floor: FLOOR, preferenze: vuote('p'), mese: 6, seme: 42,
    inizio: new Date('2026-07-27T00:00:00'),
  });

  const recupero = calcolaRecupero({
    giorni: settimana.giorni, target: TARGET, floor: FLOOR,
    extra: 850, indiceEvento: 5, modo: 'prima',
  });

  const dopo = applicaRecupero(settimana, recupero, {
    extra: 850, indiceEvento: 5, etichettaSgarro: 'Pizzeria',
  });

  it('non sostituisce nessun piatto: la spesa già fatta resta valida', () => {
    const prima = settimana.giorni.flatMap((g) => tutteLeVoci(g).map((v) => v.id));
    const adesso = dopo.giorni.flatMap((g) => tutteLeVoci(g).map((v) => v.id));
    expect(adesso).toEqual(prima);
  });

  it('ogni taglio dichiarato viene davvero eseguito', () => {
    // Il patto del motore: se dice che toglie kcal a un giorno, quel giorno
    // dimagrisce per davvero. Un taglio annunciato e non fatto sarebbe una
    // bugia nel bilancio della settimana.
    let almenoUno = false;
    for (let i = 0; i < 7; i++) {
      if (!(recupero.perGiorno[i] > 0)) continue;
      almenoUno = true;
      const prima = kcalGiorno(settimana.giorni[i]);
      const adesso = kcalGiorno(dopo.giorni[i]);
      expect(adesso, `giorno ${i}`).toBeLessThan(prima);
      // Tolleranza per l'arrotondamento delle porzioni a passi di 0,05.
      expect(prima - adesso, `giorno ${i}`).toBeGreaterThan(recupero.perGiorno[i] * 0.5);
    }
    expect(almenoUno).toBe(true);
  });

  it('non promette più di quanto le porzioni possano dare', () => {
    const eseguito = settimana.giorni.reduce(
      (s, g, i) => s + (kcalGiorno(g) - kcalGiorno(dopo.giorni[i])), 0,
    );
    // Somma dei tagli reali vicina al recuperato dichiarato.
    expect(eseguito).toBeGreaterThan(recupero.recuperato * 0.6);
  });

  it('nessun giorno finisce sotto il pavimento', () => {
    for (const g of dopo.giorni) {
      if (g.stato === 'sgarro') continue;
      expect(kcalGiorno(g)).toBeGreaterThanOrEqual(FLOOR - 1);
    }
  });

  it('marca il giorno dello sgarro e ne conserva il motivo', () => {
    expect(dopo.giorni[5].stato).toBe('sgarro');
    expect(dopo.giorni[5].sgarro.etichetta).toBe('Pizzeria');
    expect(dopo.giorni[5].sgarro.kcal).toBe(850);
  });

  it('non modifica la settimana di partenza', () => {
    expect(settimana.giorni[0].stato).toBeUndefined();
  });
});

describe('lo sgarro in aggiunta o al posto di un pasto', () => {
  // Una sfogliatella si somma alla colazione. Una pizza al posto della cena no:
  // quella cena non la mangi, e farla recuperare vuol dire togliere calorie
  // agli altri giorni per un pasto che non è mai stato fatto. Misurato prima
  // della correzione: 680 kcal di recupero chiesto per niente.
  function giornoFinto() {
    return {
      etichetta: 'sab',
      pasti: {
        colazione: [{ tipo: 'alimento', id: 'mela', porzioni: 1 }],
        pranzo: [{ tipo: 'piatto', id: 'pasta-ceci', porzioni: 1 }],
        cena: [{ tipo: 'piatto', id: 'genovese', porzioni: 1 }],
      },
    };
  }

  it('in aggiunta pesa tutto', () => {
    expect(extraNetto(giornoFinto(), 850, null)).toBe(850);
  });

  it('al posto di un pasto pesa solo la differenza', () => {
    const g = giornoFinto();
    const cena = Math.round(g.pasti.cena.reduce((a, v) => a + valoriVoce(v).kcal, 0));
    expect(extraNetto(g, 850, 'cena')).toBe(Math.max(0, 850 - cena));
    // E deve essere davvero meno di quanto peserebbe in aggiunta.
    expect(extraNetto(g, 850, 'cena')).toBeLessThan(850);
  });

  it('se lo sgarro pesa meno del pasto non c\'è niente da recuperare', () => {
    // Una pizza più leggera della cena che sostituisce: quel giorno hai
    // mangiato meno del previsto, e va bene così. Mai un numero negativo.
    expect(extraNetto(giornoFinto(), 50, 'cena')).toBe(0);
  });

  it('un pasto che non esiste non cambia niente', () => {
    expect(extraNetto(giornoFinto(), 300, 'merenda')).toBe(300);
    expect(extraNetto(undefined, 300, 'cena')).toBe(300);
    expect(extraNetto(giornoFinto(), 0, 'cena')).toBe(0);
  });

  it('il pasto sostituito sparisce dal conto del giorno e dalla spesa', () => {
    const settimana = {
      target: 2000, floor: 1600,
      giorni: [giornoFinto(), giornoFinto(), giornoFinto()],
    };
    const pieno = kcalGiorno(settimana.giorni[1]);

    const dopo = applicaRecupero(settimana, { perGiorno: [0, 0, 0], recuperato: 0, residuo: 0 }, {
      extra: 850, indiceEvento: 1, etichettaSgarro: 'Pizzeria', alPostoDi: 'cena',
    });
    const g = dopo.giorni[1];

    expect(g.pasti.cena.every((v) => v.saltato)).toBe(true);
    expect(g.sgarro.alPostoDi).toBe('cena');
    // Il giorno vale quello che resta più la pizza, non tutto più la pizza.
    expect(g.quota).toBeLessThan(pieno + 850);
    expect(kcalGiorno(g)).toBeLessThan(pieno);
  });

  it('registrarlo di nuovo non lascia sostituito il pasto di prima', () => {
    const settimana = { target: 2000, floor: 1600, giorni: [giornoFinto()] };
    const uno = applicaRecupero(settimana, { perGiorno: [0], recuperato: 0, residuo: 0 },
      { extra: 850, indiceEvento: 0, alPostoDi: 'cena' });
    const due = applicaRecupero(uno, { perGiorno: [0], recuperato: 0, residuo: 0 },
      { extra: 300, indiceEvento: 0, alPostoDi: 'pranzo' });

    expect(due.giorni[0].pasti.cena.some((v) => v.saltato)).toBe(false);
    expect(due.giorni[0].pasti.pranzo.every((v) => v.saltato)).toBe(true);
  });
});
