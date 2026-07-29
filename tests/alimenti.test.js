import { describe, it, expect } from 'vitest';
import {
  alimenti, piatti, gruppi, alimento, valoriPiatto,
  ingredientiScalati, diStagione, iconaPiatto,
} from '../js/alimenti.js';

describe('nucleo alimenti', () => {
  it('ogni alimento ha i campi che il resto dell’app dà per scontati', () => {
    for (const a of alimenti) {
      expect(a.id, `id mancante in ${a.nome}`).toBeTruthy();
      expect(a.nome, `nome mancante in ${a.id}`).toBeTruthy();
      expect(a.gruppo, `gruppo mancante in ${a.id}`).toBeTruthy();
      expect(a.reparto, `reparto mancante in ${a.id}`).toBeTruthy();
      expect(a.porzione, `porzione mancante in ${a.id}`).toBeGreaterThan(0);
      expect(a.confezione?.qta, `confezione mancante in ${a.id}`).toBeGreaterThan(0);
      expect(a.fonte, `fonte mancante in ${a.id}`).toBeTruthy();
      for (const k of ['kcal', 'pro', 'car', 'gra', 'fib', 'sod']) {
        expect(typeof a.per100g[k], `${k} non numerico in ${a.id}`).toBe('number');
        expect(a.per100g[k], `${k} negativo in ${a.id}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gli identificativi sono unici', () => {
    const visti = new Set();
    for (const a of alimenti) {
      expect(visti.has(a.id), `id duplicato: ${a.id}`).toBe(false);
      visti.add(a.id);
    }
  });

  it('ogni gruppo e ogni reparto dichiarato esiste davvero', () => {
    const idGruppi = new Set(gruppi.gruppi.map((g) => g.id));
    const idReparti = new Set(gruppi.reparti.map((r) => r.id));
    for (const a of alimenti) {
      expect(idGruppi.has(a.gruppo), `gruppo sconosciuto in ${a.id}: ${a.gruppo}`).toBe(true);
      expect(idReparti.has(a.reparto), `reparto sconosciuto in ${a.id}: ${a.reparto}`).toBe(true);
    }
  });

  it('le calorie stanno dentro quello che dicono i macronutrienti', () => {
    // Rete contro gli errori di trascrizione, non riconciliazione esatta: le
    // tabelle non trattano la fibra allo stesso modo su tutti gli alimenti
    // (su alcune verdure e' conteggiata a 2 kcal/g, su altre no). Quindi si
    // costruisce una banda fra le due convenzioni e si chiede che il valore
    // dichiarato ci cada dentro, con tolleranza per gli arrotondamenti.
    for (const a of alimenti) {
      const { kcal, pro, car, gra, fib } = a.per100g;
      if (kcal < 20) continue; // su valori minimi la percentuale non dice nulla

      const senzaFibra = pro * 4 + car * 4 + gra * 9;
      const conFibra = senzaFibra + fib * 2;
      const scarto = kcal < senzaFibra ? (senzaFibra - kcal) / kcal
        : kcal > conFibra ? (kcal - conFibra) / kcal
          : 0;

      expect(scarto, `${a.id}: dichiarate ${kcal} kcal, i macro ne danno fra ${Math.round(senzaFibra)} e ${Math.round(conFibra)}`)
        .toBeLessThan(0.25);
    }
  });
});

describe('ricettario', () => {
  it('ogni ingrediente di ogni piatto esiste nel nucleo', () => {
    for (const p of piatti) {
      for (const ing of p.ingredienti) {
        expect(alimento(ing.a), `${p.id} usa un alimento inesistente: ${ing.a}`).not.toBeNull();
        expect(ing.g, `${p.id}: quantità non valida per ${ing.a}`).toBeGreaterThan(0);
      }
    }
  });

  it('gli identificativi dei piatti sono unici e i tipi sono noti', () => {
    const tipi = new Set(['colazione', 'spuntino', 'primo', 'secondo', 'contorno', 'piatto-unico']);
    const visti = new Set();
    for (const p of piatti) {
      expect(visti.has(p.id), `piatto duplicato: ${p.id}`).toBe(false);
      visti.add(p.id);
      expect(tipi.has(p.tipo), `tipo sconosciuto in ${p.id}: ${p.tipo}`).toBe(true);
    }
  });

  it('nessun piatto ha valori assurdi per una porzione', () => {
    for (const p of piatti) {
      const v = valoriPiatto(p);
      expect(v.mancanti, `${p.id} ha ingredienti mancanti`).toHaveLength(0);
      expect(v.kcal, `${p.id}: ${v.kcal} kcal, troppo poche`).toBeGreaterThan(30);
      expect(v.kcal, `${p.id}: ${v.kcal} kcal in una porzione, troppe`).toBeLessThan(900);
    }
  });
});

describe('calcolo dei valori', () => {
  const finto = {
    id: 'finto', nome: 'Finto', tipo: 'primo',
    ingredienti: [{ a: 'olio-evo', g: 10 }, { a: 'pasta-semola', g: 100 }],
  };

  it('somma gli ingredienti in proporzione ai grammi', () => {
    const v = valoriPiatto(finto);
    // olio: 899 kcal/100 g -> 10 g = 89,9 ; pasta: 353 kcal/100 g -> 100 g = 353
    expect(v.kcal).toBe(443);
    expect(v.gra).toBeCloseTo(11.4, 1);
  });

  it('scala linearmente sui commensali', () => {
    const uno = valoriPiatto(finto, 1);
    const quattro = valoriPiatto(finto, 4);
    expect(quattro.kcal).toBe(uno.kcal * 4);
  });

  it('scala anche le quantità degli ingredienti', () => {
    const ing = ingredientiScalati(finto, 3);
    expect(ing.find((i) => i.a === 'pasta-semola').grammi).toBe(300);
    expect(ing[0].alimento.nome).toBe("Olio extravergine d'oliva");
  });

  it('dichiara gli ingredienti sconosciuti invece di contarli zero', () => {
    const rotto = { id: 'x', ingredienti: [{ a: 'unicorno', g: 100 }] };
    expect(valoriPiatto(rotto).mancanti).toEqual(['unicorno']);
  });
});

describe('stagionalità', () => {
  it('rispetta la stagione dichiarata dal piatto', () => {
    const estivo = piatti.find((p) => p.id === 'parmigiana-forno');
    expect(diStagione(estivo, 7)).toBe(true);
    expect(diStagione(estivo, 1)).toBe(false);
  });

  it('in mancanza, la deduce dagli ingredienti', () => {
    const conFriarielli = { id: 'y', ingredienti: [{ a: 'friarielli', g: 200 }] };
    expect(diStagione(conFriarielli, 12)).toBe(true);
    expect(diStagione(conFriarielli, 7)).toBe(false);
  });

  it('un piatto senza ingredienti stagionali vale tutto l’anno', () => {
    const sempre = { id: 'z', ingredienti: [{ a: 'pasta-semola', g: 80 }] };
    expect([1, 5, 9, 12].every((m) => diStagione(sempre, m))).toBe(true);
  });
});

describe('icona del piatto', () => {
  it('sceglie in base al peso calorico, non ai grammi', () => {
    // 250 g di polpo contro 200 g di patate: resta un piatto di pesce.
    expect(iconaPiatto(piatti.find((p) => p.id === 'polpo-patate'))).toBe('pesce');
  });

  it('le colazioni e gli spuntini hanno la loro', () => {
    expect(iconaPiatto({ tipo: 'colazione', ingredienti: [] })).toBe('caffe');
    expect(iconaPiatto({ tipo: 'spuntino', ingredienti: [] })).toBe('ortofrutta');
  });
});
