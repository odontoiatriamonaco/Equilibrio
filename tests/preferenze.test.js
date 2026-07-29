import { describe, it, expect } from 'vitest';
import { piatti } from '../js/alimenti.js';
import {
  vuote, gustoPiatto, gustoAlimento, eAllergene, motivoEsclusione, ammesso,
  peso, prossimoGusto, imposta, alternaAllergia, impostaTetto, riepilogo,
  TETTI_PREDEFINITI,
} from '../js/preferenze.js';

const P = 'p_test';
const conFriarielli = piatti.find((p) => p.id === 'pasta-friarielli-salsiccia');
const conPasta = piatti.find((p) => p.id === 'pasta-fagioli');

describe('preferenze vuote', () => {
  it('non escludono niente e partono dai tetti mediterranei', () => {
    const pref = vuote(P);
    expect(piatti.every((p) => ammesso(pref, p))).toBe(true);
    expect(pref.tetti).toEqual(TETTI_PREDEFINITI);
    expect(pref.tetti['carne-rossa']).toBe(1);
  });

  it('tutto è neutro fino a prova contraria', () => {
    const pref = vuote(P);
    expect(gustoPiatto(pref, 'genovese')).toBe('neutro');
    expect(gustoAlimento(pref, 'friarielli')).toBe('neutro');
  });
});

describe('esclusioni', () => {
  it('escludere un piatto toglie solo quel piatto', () => {
    const pref = imposta(vuote(P), 'piatti', 'genovese', 'escluso');
    expect(ammesso(pref, piatti.find((p) => p.id === 'genovese'))).toBe(false);
    expect(ammesso(pref, conPasta)).toBe(true);
  });

  it('escludere un alimento toglie ogni piatto che lo contiene', () => {
    const pref = imposta(vuote(P), 'alimenti', 'friarielli', 'escluso');
    expect(ammesso(pref, conFriarielli)).toBe(false);
    expect(motivoEsclusione(pref, conFriarielli).testo).toContain('friarielli');
  });

  it('l’allergia vince sul gusto e viene dichiarata come tale', () => {
    // Un piatto "amato" che contiene un allergene resta escluso: una
    // preferenza non puo' sovrascrivere una ragione di salute.
    let pref = imposta(vuote(P), 'piatti', conFriarielli.id, 'amato');
    pref = alternaAllergia(pref, 'salsiccia');
    const motivo = motivoEsclusione(pref, conFriarielli);
    expect(motivo.tipo).toBe('allergia');
    expect(ammesso(pref, conFriarielli)).toBe(false);
    expect(peso(pref, conFriarielli)).toBe(0);
  });

  it('le allergie si togglano e si leggono', () => {
    let pref = alternaAllergia(vuote(P), 'uova');
    expect(eAllergene(pref, 'uova')).toBe(true);
    pref = alternaAllergia(pref, 'uova');
    expect(eAllergene(pref, 'uova')).toBe(false);
    expect(pref.allergie).toEqual([]);
  });
});

describe('peso nella scelta', () => {
  it('un piatto amato pesa più di uno neutro', () => {
    const neutro = peso(vuote(P), conPasta);
    const amato = peso(imposta(vuote(P), 'piatti', conPasta.id, 'amato'), conPasta);
    expect(amato).toBeGreaterThan(neutro);
  });

  it('gli ingredienti amati alzano il peso del piatto', () => {
    const base = peso(vuote(P), conPasta);
    const conIngrediente = peso(
      imposta(vuote(P), 'alimenti', 'fagioli-cannellini-secchi', 'amato'), conPasta,
    );
    expect(conIngrediente).toBeGreaterThan(base);
  });

  it('un piatto di casa pesa più di uno della tradizione, a pari gusto', () => {
    const finto = { id: 'f1', ingredienti: [{ a: 'riso', g: 80 }], origine: 'tradizione' };
    const casa = { ...finto, id: 'f2', origine: 'casa' };
    expect(peso(vuote(P), casa)).toBeGreaterThan(peso(vuote(P), finto));
  });

  it('un piatto escluso pesa zero, non poco', () => {
    const pref = imposta(vuote(P), 'piatti', conPasta.id, 'escluso');
    expect(peso(pref, conPasta)).toBe(0);
  });
});

describe('ciclo dei gusti', () => {
  it('gira neutro → amato → escluso → neutro', () => {
    expect(prossimoGusto('neutro')).toBe('amato');
    expect(prossimoGusto('amato')).toBe('escluso');
    expect(prossimoGusto('escluso')).toBe('neutro');
  });

  it('tornare al neutro non lascia residui nel record', () => {
    let pref = imposta(vuote(P), 'piatti', 'genovese', 'amato');
    expect(Object.keys(pref.piatti)).toEqual(['genovese']);
    pref = imposta(pref, 'piatti', 'genovese', 'neutro');
    expect(pref.piatti).toEqual({});
  });
});

describe('tetti settimanali', () => {
  it('si impostano senza toccare gli altri', () => {
    const pref = impostaTetto(vuote(P), 'pesce', 2);
    expect(pref.tetti.pesce).toBe(2);
    expect(pref.tetti['carne-rossa']).toBe(TETTI_PREDEFINITI['carne-rossa']);
  });
});

describe('riepilogo', () => {
  it('conta i proponibili e avvisa quando sono troppo pochi', () => {
    const pieno = riepilogo(vuote(P), piatti);
    expect(pieno.ammessi).toBe(piatti.length);
    expect(pieno.scarso).toBe(false);

    // Escludere l'olio svuota quasi tutto il ricettario: e' il caso in cui
    // l'utente va avvisato, non lasciato con un menu' ripetitivo.
    const povero = riepilogo(imposta(vuote(P), 'alimenti', 'olio-evo', 'escluso'), piatti);
    expect(povero.ammessi).toBeLessThan(pieno.ammessi);
    expect(povero.scarso).toBe(true);
  });
});
