import { describe, it, expect } from 'vitest';
import { piatti } from '../js/alimenti.js';
import {
  vuote, gustoPiatto, gustoAlimento, eAllergene, motivoEsclusione, ammesso,
  peso, prossimoGusto, imposta, alternaAllergia, impostaTetto, riepilogo, omessi,
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

  it('non mettere un alimento NON fa sparire il piatto', () => {
    // Il piatto resta e arriva senza quell'ingrediente: e' `applicaOmissioni`
    // in alimenti.js a togliere la roba dal piatto. Cancellare tutte le
    // colazioni perche' non piace il miele sarebbe un'accetta.
    const pref = imposta(vuote(P), 'alimenti', 'friarielli', 'omesso');
    expect(ammesso(pref, conFriarielli)).toBe(true);
    expect(motivoEsclusione(pref, conFriarielli)).toBeNull();
  });

  it('un profilo salvato con la vecchia parola continua a funzionare', () => {
    // «escluso» sugli alimenti voleva dire la stessa cosa: non lo voglio nel
    // piatto. I profili scritti prima non devono rompersi.
    const pref = imposta(vuote(P), 'alimenti', 'friarielli', 'escluso');
    expect(gustoAlimento(pref, 'friarielli')).toBe('omesso');
    expect(omessi(pref)).toContain('friarielli');
    expect(ammesso(pref, conFriarielli)).toBe(true);
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
  it('gira neutro → amato → omesso → neutro', () => {
    expect(prossimoGusto('neutro')).toBe('amato');
    expect(prossimoGusto('amato')).toBe('omesso');
    expect(prossimoGusto('omesso')).toBe('neutro');
    // La vecchia parola chiude comunque il giro invece di incastrarsi.
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
  it('senza preferenze conta tutto il ricettario', () => {
    const pieno = riepilogo(vuote(P), piatti);
    expect(pieno.ammessi).toBe(piatti.length);
    expect(pieno.scarso).toBe(false);
  });

  it('non mettere un alimento non riduce i piatti proponibili', () => {
    // I piatti restano: perdono l'ingrediente, non il posto in tavola.
    const pieno = riepilogo(vuote(P), piatti);
    const senzaOlio = riepilogo(imposta(vuote(P), 'alimenti', 'olio-evo', 'omesso'), piatti);
    expect(senzaOlio.ammessi).toBe(pieno.ammessi);
  });

  it('escludere un piatto invece lo riduce', () => {
    const pieno = riepilogo(vuote(P), piatti);
    const meno = riepilogo(imposta(vuote(P), 'piatti', piatti[0].id, 'escluso'), piatti);
    expect(meno.ammessi).toBe(pieno.ammessi - 1);
  });

  it('avvisa quando restano troppo pochi piatti per variare la settimana', () => {
    // La soglia va provata per se stessa, non attraverso la dimensione del
    // ricettario: quella cresce, e il test non deve rompersi ogni volta.
    const pochi = piatti.slice(0, 10);
    expect(riepilogo(vuote(P), pochi).scarso).toBe(true);

    const abbastanza = piatti.slice(0, 20);
    expect(riepilogo(vuote(P), abbastanza).scarso).toBe(false);
  });
});
