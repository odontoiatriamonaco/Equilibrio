/* L'antispreco come criterio del piano, non come suggerimento a valle.
 *
 * «Il riso e l'olio non si deperiscono velocemente, la ricotta sì»: la priorità
 * è la scadenza, e il sistema deve ricordarsi da quando una cosa è in casa. */
import { describe, it, expect } from 'vitest';
import { generaSettimana, tutteLeVoci, pesoDispensa } from '../js/planner.js';
import { vuote, imposta, alternaAllergia } from '../js/preferenze.js';
import { piatti } from '../js/alimenti.js';
import {
  giorniDiTenuta, giorniRimasti, urgenza, comeStaMessa, perFretta, ORIZZONTE_G,
} from '../js/conservazione.js';

const OGGI = new Date('2026-08-21T12:00:00');
const IERI = '2026-08-20';
const base = {
  target: 2000, floor: 1500, preferenze: vuote('p'), mese: 8,
  inizio: new Date('2026-08-17T00:00:00'), oggi: OGGI,
};

/** In quanti piatti della settimana compare questo ingrediente. */
function usa(settimana, id) {
  return settimana.giorni.flatMap(tutteLeVoci)
    .filter((v) => v.tipo === 'piatto')
    .filter((v) => (piatti.find((p) => p.id === v.id)?.ingredienti || []).some((i) => i.a === id))
    .length;
}

function suNSemi(n, conta, opzioni = {}) {
  let tot = 0;
  for (let s = 0; s < n; s++) tot += usa(generaSettimana({ ...base, seme: s, ...opzioni }), conta);
  return tot;
}

describe('quanto tiene, alimento per alimento', () => {
  it('il riso e l’olio aspettano, la ricotta e la mozzarella no', () => {
    expect(giorniDiTenuta('riso')).toBeGreaterThan(300);
    expect(giorniDiTenuta('olio-evo')).toBeGreaterThan(300);
    expect(giorniDiTenuta('ricotta')).toBeLessThanOrEqual(3);
    expect(giorniDiTenuta('mozzarella')).toBeLessThanOrEqual(4);
  });

  it('il reparto non basta: nei latticini stanno la burrata e il parmigiano', () => {
    expect(giorniDiTenuta('burrata')).toBeLessThan(giorniDiTenuta('parmigiano') / 10);
  });

  it('in ortofrutta le patate durano un mese e il basilico tre giorni', () => {
    expect(giorniDiTenuta('patate')).toBeGreaterThan(30);
    expect(giorniDiTenuta('basilico')).toBeLessThanOrEqual(3);
  });

  it('un alimento sconosciuto non finisce in cima alle urgenze', () => {
    expect(giorniDiTenuta('non-esiste')).toBeGreaterThanOrEqual(ORIZZONTE_G);
    expect(urgenza({ alimentoId: 'non-esiste', dal: '2026-08-21' }, OGGI)).toBe(0);
  });
});

describe('la memoria: da quando ce l’hai', () => {
  it('i giorni che restano scalano col tempo passato', () => {
    const fresca = { alimentoId: 'ricotta', dal: '2026-08-21' };
    const vecchia = { alimentoId: 'ricotta', dal: '2026-08-19' };
    expect(giorniRimasti(fresca, OGGI)).toBe(3);
    expect(giorniRimasti(vecchia, OGGI)).toBe(1);
    expect(urgenza(vecchia, OGGI)).toBeGreaterThan(urgenza(fresca, OGGI));
  });

  it('senza data si presume da oggi, invece di dichiararla scaduta', () => {
    expect(giorniRimasti({ alimentoId: 'ricotta' }, OGGI)).toBe(3);
  });

  it('quello che tiene a lungo non urge mai, per vecchio che sia', () => {
    expect(urgenza({ alimentoId: 'riso', dal: '2026-01-01' }, OGGI)).toBe(0);
  });

  it('si mettono in fila per fretta, non per nome', () => {
    const fila = perFretta([
      { alimentoId: 'riso', dal: '2026-08-01' },
      { alimentoId: 'ricotta', dal: IERI },
      { alimentoId: 'patate', dal: '2026-08-15' },
    ], OGGI);
    expect(fila.map((x) => x.alimentoId)).toEqual(['ricotta', 'patate', 'riso']);
  });

  it('non dice mai una data né dà un permesso di mangiare', () => {
    for (const dal of ['2026-08-21', '2026-08-19', '2026-08-10']) {
      const t = comeStaMessa({ alimentoId: 'ricotta', dal }, OGGI).testo;
      expect(t).not.toMatch(/\d{4}|scade il|si può/);
    }
    expect(comeStaMessa({ alimentoId: 'ricotta', dal: '2026-08-01' }, OGGI).stato).toBe('scaduta');
  });
});

describe('il peso nel piano', () => {
  it('una dispensa vuota lascia il piano identico a prima', () => {
    // La garanzia che il criterio nuovo non abbia spostato niente per chi non
    // ha nulla in casa.
    for (let s = 0; s < 20; s++) {
      const a = generaSettimana({ ...base, seme: s });
      const b = generaSettimana({ ...base, seme: s, dispensa: [] });
      expect(b.giorni.flatMap(tutteLeVoci).map((v) => v.id))
        .toEqual(a.giorni.flatMap(tutteLeVoci).map((v) => v.id));
    }
  });

  it('un piatto che consuma qualcosa di urgente pesa di più', () => {
    const conRicotta = piatti.find((p) => (p.ingredienti || []).some((i) => i.a === 'ricotta'));
    const scorte = new Map([['ricotta', { grammi: 500, fretta: 1 }]]);
    expect(pesoDispensa(conRicotta, scorte)).toBeGreaterThan(2);
    expect(pesoDispensa(conRicotta, new Map())).toBe(1);
  });

  it('conta l’ingrediente più urgente, non la media: le ricette lunghe non sono punite', () => {
    const lungo = {
      ingredienti: [
        { a: 'ricotta', g: 100 },
        ...Array.from({ length: 7 }, (_, i) => ({ a: `x${i}`, g: 50 })),
      ],
    };
    const corto = { ingredienti: [{ a: 'ricotta', g: 100 }] };
    const scorte = new Map([['ricotta', { grammi: 500, fretta: 1 }]]);
    expect(pesoDispensa(lungo, scorte)).toBe(pesoDispensa(corto, scorte));
  });

  it('la ricotta che scade entra più spesso nel menù', () => {
    const senza = suNSemi(60, 'ricotta');
    const con = suNSemi(60, 'ricotta', { dispensa: [{ alimentoId: 'ricotta', grammi: 250, dal: IERI }] });
    expect(con).toBeGreaterThan(senza);
  });

  it('il riso, che tiene un anno, non storce il menù di un piatto', () => {
    const senza = suNSemi(60, 'riso');
    const con = suNSemi(60, 'riso', { dispensa: [{ alimentoId: 'riso', grammi: 500, dal: IERI }] });
    expect(con).toBe(senza);
  });

  it('la scorta si consuma: cento grammi non fanno sette piatti uguali', () => {
    for (let s = 0; s < 40; s++) {
      const w = generaSettimana({
        ...base,
        seme: s,
        dispensa: [{ alimentoId: 'ricotta', grammi: 100, dal: IERI }],
      });
      expect(usa(w, 'ricotta')).toBeLessThanOrEqual(4);
    }
  });

  it('dichiara cosa si porta via, invece di farlo di nascosto', () => {
    let dichiarate = 0;
    for (let s = 0; s < 20; s++) {
      const w = generaSettimana({
        ...base,
        seme: s,
        dispensa: [{ alimentoId: 'ricotta', grammi: 400, dal: IERI }],
      });
      if (usa(w, 'ricotta') === 0) continue;
      expect(w.dallaDispensa.some((x) => x.alimentoId === 'ricotta' && x.grammi > 0)).toBe(true);
      dichiarate += 1;
    }
    expect(dichiarate).toBeGreaterThan(0);
  });
});

describe('quello che vale più dell’antispreco', () => {
  const piena = [{ alimentoId: 'ricotta', grammi: 900, dal: IERI }];

  it('un ingrediente omesso non tira niente: verrebbe tolto dal piatto', () => {
    const senzaRic = imposta(vuote('p'), 'alimenti', 'ricotta', 'escluso');
    let a = 0;
    let b = 0;
    for (let s = 0; s < 40; s++) {
      a += usa(generaSettimana({ ...base, preferenze: senzaRic, seme: s }), 'ricotta');
      b += usa(generaSettimana({ ...base, preferenze: senzaRic, seme: s, dispensa: piena }), 'ricotta');
    }
    expect(b).toBe(a);
  });

  it('un allergene resta fuori anche col frigo pieno', () => {
    // Sull'alimento stesso: le CLASSI di allergene (latte -> tutti i latticini)
    // non esistono ancora in questo progetto, e un test non deve fingere che sì.
    const allergica = alternaAllergia(vuote('p'), 'ricotta');
    for (let s = 0; s < 30; s++) {
      const w = generaSettimana({ ...base, preferenze: allergica, seme: s, dispensa: piena });
      for (const v of w.giorni.flatMap(tutteLeVoci)) {
        if (v.tipo !== 'piatto') continue;
        const p = piatti.find((x) => x.id === v.id);
        expect((p?.ingredienti || []).some((i) => i.a === 'ricotta')).toBe(false);
      }
    }
  });
});
