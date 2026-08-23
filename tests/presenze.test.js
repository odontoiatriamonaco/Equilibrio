/* Chi mangia a casa, e quando.
 *
 * Il marito fa colazione e cena con la famiglia, pranza e fa gli spuntini
 * fuori, e il fine settimana c'è tutto il giorno. Prima si poteva dire una cosa
 * sola — c'è o non c'è per tutta la settimana — e sbagliavano tutte e due. */
import { describe, it, expect } from 'vitest';
import {
  PASTI, GIORNI_BREVI, mangiaACasa, alternaPresenza, alternaPasto, alternaGiorno,
  quantiFuori, raccontaPresenze, settimanaACasa, fuoriCasaDi,
} from '../js/presenze.js';
import { generaSettimana, inizioSettimana, tutteLeVoci } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';
import { aggregaFamiglia, aggregaSettimana, costruisciLista } from '../js/spesa.js';

const LUN = new Date('2026-08-17T12:00:00');
const settimana = () => generaSettimana({
  target: 2200, floor: 1600, preferenze: vuote('p'), mese: 8, seme: 4,
  inizio: inizioSettimana(LUN),
});

/** Il marito del caso vero: fuori a pranzo e agli spuntini, ma non nel weekend. */
function marito() {
  let p = { id: 'm', nome: 'Tommaso' };
  for (const pasto of ['pranzo', 'spuntino-mattina', 'spuntino-pomeriggio']) {
    p = alternaPasto(p, pasto, false);
  }
  p = alternaGiorno(p, 'sab', true);
  p = alternaGiorno(p, 'dom', true);
  return p;
}

describe('chi non dice niente mangia a casa', () => {
  it('un profilo senza il campo è a casa per tutti e trentacinque i momenti', () => {
    const p = { id: 'x' };
    for (const g of GIORNI_BREVI) {
      for (const m of PASTI) expect(mangiaACasa(p, g.id, m.id), `${g.id} ${m.id}`).toBe(true);
    }
    expect(quantiFuori(p)).toBe(0);
  });

  it('e la sua settimana per la cucina è la settimana intera, senza copie inutili', () => {
    const s = settimana();
    // Stesso oggetto, non un clone: chi non ha assenze non paga niente.
    expect(settimanaACasa(s, { id: 'x' })).toBe(s);
  });
});

describe('accendere e spegnere', () => {
  it('una casella sola', () => {
    const p = alternaPresenza({ id: 'x' }, 'mar', 'pranzo');
    expect(mangiaACasa(p, 'mar', 'pranzo')).toBe(false);
    expect(mangiaACasa(p, 'mer', 'pranzo')).toBe(true);
    expect(mangiaACasa(p, 'mar', 'cena')).toBe(true);
    expect(alternaPresenza(p, 'mar', 'pranzo').fuoriCasa).toEqual([]);
  });

  it('un pasto su tutti i giorni: «il pranzo lo faccio sempre fuori»', () => {
    const p = alternaPasto({ id: 'x' }, 'pranzo', false);
    expect(quantiFuori(p)).toBe(7);
    for (const g of GIORNI_BREVI) expect(mangiaACasa(p, g.id, 'pranzo'), g.id).toBe(false);
    expect(mangiaACasa(p, 'lun', 'cena')).toBe(true);
  });

  it('una giornata intera: «il sabato ci sono»', () => {
    let p = alternaPasto({ id: 'x' }, 'pranzo', false);
    p = alternaGiorno(p, 'sab', true);
    expect(mangiaACasa(p, 'sab', 'pranzo')).toBe(true);
    expect(mangiaACasa(p, 'dom', 'pranzo')).toBe(false);
  });

  it('il caso vero si dice in cinque mosse e torna il conto giusto', () => {
    const p = marito();
    // Tre pasti fuori per cinque giorni feriali = 15 assenze.
    expect(quantiFuori(p)).toBe(15);
    expect(mangiaACasa(p, 'lun', 'colazione')).toBe(true);
    expect(mangiaACasa(p, 'lun', 'pranzo')).toBe(false);
    expect(mangiaACasa(p, 'lun', 'cena')).toBe(true);
    expect(mangiaACasa(p, 'sab', 'pranzo')).toBe(true);
    expect(mangiaACasa(p, 'dom', 'spuntino-mattina')).toBe(true);
  });
});

describe('come si racconta', () => {
  it('senza assenze non gira intorno', () => {
    expect(raccontaPresenze({ id: 'x' })).toMatch(/tutti i pasti/);
  });

  it('un pasto fisso fuori si dice per nome, non a numeri', () => {
    const p = alternaPasto({ id: 'x' }, 'pranzo', false);
    expect(raccontaPresenze(p)).toBe('Fuori casa per pranzo, tutti i giorni.');
  });

  it('due pasti fissi si elencano', () => {
    let p = alternaPasto({ id: 'x' }, 'pranzo', false);
    p = alternaPasto(p, 'colazione', false);
    expect(raccontaPresenze(p)).toMatch(/colazione e pranzo|pranzo e colazione/);
  });

  it('uno schema irregolare si conta, invece di inventare una frase', () => {
    const p = marito();
    expect(raccontaPresenze(p)).toBe('Fuori casa 15 pasti su 35.');
  });
});

describe('la settimana come la vede la cucina', () => {
  it('svuota i pasti mangiati fuori e lascia gli altri intatti', () => {
    const s = settimana();
    const casa = settimanaACasa(s, marito());

    for (let i = 0; i < 5; i++) {
      expect(casa.giorni[i].pasti.pranzo, `giorno ${i}`).toEqual([]);
      expect(casa.giorni[i].pasti['spuntino-mattina']).toEqual([]);
      expect(casa.giorni[i].pasti.colazione.length).toBeGreaterThan(0);
      expect(casa.giorni[i].pasti.cena.length).toBeGreaterThan(0);
    }
    // Sabato e domenica restano pieni.
    expect(casa.giorni[5].pasti.pranzo.length).toBeGreaterThan(0);
    expect(casa.giorni[6].pasti.pranzo.length).toBeGreaterThan(0);
  });

  it('NON tocca il piano vero: il pranzo lui lo mangia comunque', () => {
    // È la distinzione che tiene in piedi tutto. Se il piano perdesse il
    // pranzo, la sua giornata crollerebbe di seicento calorie sulla carta.
    const s = settimana();
    const prima = s.giorni.map((g) => g.pasti.pranzo.length);
    settimanaACasa(s, marito());
    expect(s.giorni.map((g) => g.pasti.pranzo.length)).toEqual(prima);
    expect(prima.every((n) => n > 0)).toBe(true);
  });
});

describe('la spesa non compra quello che si mangia fuori', () => {
  const s = settimana();

  function famiglia() {
    return [
      { profilo: marito(), settimana: s, aCasa: settimanaACasa(s, marito()) },
      { profilo: { id: 'r' }, settimana: s, aCasa: s },
      { profilo: { id: 'n' }, settimana: s, aCasa: s },
    ];
  }

  it('si compra meno di quando lui c’è a tutti i pasti', () => {
    const tot = (m) => [...m].reduce((n, [, g]) => n + g, 0);
    const conAssenze = tot(aggregaFamiglia(famiglia()));
    const comeSeCiFosse = tot(aggregaFamiglia(
      famiglia().map((m) => ({ ...m, aCasa: m.settimana })),
    ));
    expect(conAssenze).toBeLessThan(comeSeCiFosse);
    // Tre pasti su cinque per cinque giorni: il taglio è consistente.
    expect(comeSeCiFosse - conAssenze).toBeGreaterThan(3000);
  });

  it('ma si compra più di quando lui non c’è per niente', () => {
    // È l'errore opposto, quello che faceva la spunta di prima: togliendolo
    // sparivano anche la sua colazione e la sua cena.
    const tot = (m) => [...m].reduce((n, [, g]) => n + g, 0);
    const conAssenze = tot(aggregaFamiglia(famiglia()));
    const senzaDiLui = tot(aggregaFamiglia(famiglia().slice(1)));
    expect(conAssenze).toBeGreaterThan(senzaDiLui);
  });

  it('la sua colazione e la sua cena restano nel carrello', () => {
    const soloLui = aggregaFamiglia([famiglia()[0]]);
    const suaCasa = aggregaSettimana(settimanaACasa(s, marito()), 1);
    expect([...soloLui].length).toBe([...suaCasa].length);
    expect([...soloLui].length).toBeGreaterThan(0);
  });

  it('un membro senza `aCasa` entra per intero, invece di sparire', () => {
    // Il ripiego conta: sbagliare per eccesso fa comprare troppo, sbagliare per
    // difetto lascia qualcuno senza cena.
    const vecchioStile = [{ profilo: { id: 'v' }, settimana: s }];
    const tot = (m) => [...m].reduce((n, [, g]) => n + g, 0);
    expect(tot(aggregaFamiglia(vecchioStile))).toBe(tot(aggregaSettimana(s, 1)));
  });

  it('e la lista finale ha meno articoli, o quantomeno non di più', () => {
    const con = costruisciLista(s, { membri: famiglia() });
    const senza = costruisciLista(s, { membri: famiglia().map((m) => ({ ...m, aCasa: m.settimana })) });
    expect(con.articoli).toBeLessThanOrEqual(senza.articoli);
  });
});

describe('l’elenco delle assenze non si sporca', () => {
  it('accendere due volte lo stesso pasto non lascia doppioni', () => {
    let p = alternaPasto({ id: 'x' }, 'pranzo', false);
    p = alternaPasto(p, 'pranzo', false);
    expect(quantiFuori(p)).toBe(7);
  });

  it('spegnere tutto riporta l’elenco a vuoto', () => {
    let p = marito();
    for (const g of GIORNI_BREVI) p = alternaGiorno(p, g.id, true);
    expect(fuoriCasaDi(p)).toEqual([]);
  });

  it('non tocca il resto del profilo', () => {
    const p = alternaPresenza({ id: 'x', nome: 'Tommaso', pesoKg: 88 }, 'lun', 'pranzo');
    expect(p.nome).toBe('Tommaso');
    expect(p.pesoKg).toBe(88);
  });
});
