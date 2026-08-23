/* Gli allergeni per classe.
 *
 * Prima si segnavano uno per uno: un celiaco doveva spuntare a mano pasta,
 * pane, farina, pangrattato, cous cous, orzo, farro, fette biscottate,
 * tagliatelle e gnocchi. Dimenticarne uno è la cosa più facile del mondo, ed è
 * anche la più pericolosa — è tutta qui la ragione di questi test. */
import { describe, it, expect } from 'vitest';
import {
  CLASSI, PER_CLASSE, classiDi, inClasse, quantiTocca, alternaClasse,
} from '../js/allergeni.js';
import {
  vuote, eAllergene, ammesso, motivoEsclusione, alternaAllergia,
} from '../js/preferenze.js';
import { alimenti, piatti } from '../js/alimenti.js';
import { generaSettimana, tutteLeVoci } from '../js/planner.js';

const INIZIO = new Date('2026-08-17T00:00:00');

/** Le preferenze di chi ha segnato una classe. */
function con(...classi) {
  return classi.reduce((p, c) => alternaClasse(p, c), vuote('p'));
}

/** Tutti gli ingredienti che compaiono nei piatti di una settimana. */
function ingredientiDi(settimana) {
  return settimana.giorni
    .flatMap(tutteLeVoci)
    .flatMap((v) => (v.tipo === 'alimento'
      ? [v.id]
      : (piatti.find((p) => p.id === v.id)?.ingredienti || []).map((i) => i.a)));
}

describe('la mappa degli allergeni', () => {
  it('ogni alimento elencato esiste davvero nel catalogo', () => {
    // Un id scritto male non darebbe errore: toglierebbe silenziosamente
    // niente, ed è il modo peggiore di sbagliare su una cosa così.
    const veri = new Set(alimenti.map((a) => a.id));
    for (const [classe, elenco] of Object.entries(PER_CLASSE)) {
      for (const id of elenco) expect(veri.has(id), `${classe} → ${id}`).toBe(true);
    }
  });

  it('ogni classe dichiarata ha la sua lista, e viceversa', () => {
    const dichiarate = CLASSI.map((c) => c.id).sort();
    expect(Object.keys(PER_CLASSE).sort()).toEqual(dichiarate);
  });

  it('nessuna classe è vuota: mostrarne una senza alimenti direbbe una falsità', () => {
    for (const c of CLASSI) expect(quantiTocca(c.id), c.id).toBeGreaterThan(0);
  });

  it('nessun alimento è ripetuto dentro la stessa classe', () => {
    for (const [classe, elenco] of Object.entries(PER_CLASSE)) {
      expect(new Set(elenco).size, classe).toBe(elenco.length);
    }
  });

  it('un alimento può stare in più classi: le tagliatelle sono glutine e uova', () => {
    expect(classiDi('tagliatelle-uovo').sort()).toEqual(['glutine', 'uova']);
  });
});

describe('i cereali col glutine, uno per uno', () => {
  // L'elenco che un celiaco doveva spuntare a mano. Se un domani si aggiunge
  // il seitan o la pasta di farro, questo test resta la lista di controllo.
  const attesi = [
    'pasta-semola', 'pasta-integrale', 'orzo-perlato', 'farro-perlato',
    'pane', 'pane-integrale', 'fette-biscottate', 'cous-cous', 'pangrattato',
    'farina-00', 'fiocchi-avena', 'tagliatelle-uovo', 'gnocchi-patate',
  ];

  it.each(attesi)('%s contiene glutine', (id) => {
    expect(inClasse(id, ['glutine'])).toBe(true);
  });

  it.each(['riso', 'polenta-farina', 'patate', 'mais-dolce', 'castagne'])(
    '%s non contiene glutine',
    (id) => { expect(inClasse(id, ['glutine'])).toBe(false); },
  );
});

describe('le altre classi, sui casi che si sbagliano', () => {
  it('il pesce non comprende i molluschi né i crostacei: sono classi diverse', () => {
    expect(inClasse('cozze', ['pesce'])).toBe(false);
    expect(inClasse('gamberi', ['pesce'])).toBe(false);
    expect(inClasse('cozze', ['molluschi'])).toBe(true);
    expect(inClasse('gamberi', ['crostacei'])).toBe(true);
  });

  it('i formaggi stagionati restano latte: la stagionatura non è una scelta dell’app', () => {
    for (const id of ['parmigiano', 'pecorino', 'ricotta-salata']) {
      expect(inClasse(id, ['latte']), id).toBe(true);
    }
  });

  it('le castagne non sono frutta a guscio, e sta scritto perché', () => {
    expect(inClasse('castagne', ['frutta-a-guscio'])).toBe(false);
    expect(inClasse('noci', ['frutta-a-guscio'])).toBe(true);
  });
});

describe('la classe vale come il lucchetto sul singolo alimento', () => {
  it('segnare «glutine» rende allergene ogni cereale che lo contiene', () => {
    const p = con('glutine');
    for (const id of PER_CLASSE.glutine) expect(eAllergene(p, id), id).toBe(true);
  });

  it('non tocca niente che non sia in classe', () => {
    const p = con('glutine');
    for (const id of ['riso', 'patate', 'mela', 'petto-pollo']) {
      expect(eAllergene(p, id), id).toBe(false);
    }
  });

  it('il lucchetto sul singolo alimento continua a funzionare da solo', () => {
    const p = alternaAllergia(vuote('p'), 'castagne');
    expect(eAllergene(p, 'castagne')).toBe(true);
    expect(eAllergene(p, 'noci')).toBe(false);
  });

  it('classe e lucchetto convivono, e togliere la classe non toglie il lucchetto', () => {
    let p = alternaAllergia(con('latte'), 'castagne');
    expect(eAllergene(p, 'ricotta')).toBe(true);
    p = alternaClasse(p, 'latte');
    expect(eAllergene(p, 'ricotta')).toBe(false);
    expect(eAllergene(p, 'castagne')).toBe(true);
  });

  it('si accende e si spegne, senza toccare il resto delle preferenze', () => {
    const prima = vuote('p');
    const dopo = alternaClasse(prima, 'soia');
    expect(dopo.classiAllergeni).toEqual(['soia']);
    expect(alternaClasse(dopo, 'soia').classiAllergeni).toEqual([]);
    expect(dopo.piatti).toEqual(prima.piatti);
  });
});

describe('il piatto intero esce, non solo l’ingrediente', () => {
  it('un piatto con un ingrediente in classe non è proponibile', () => {
    const p = con('latte');
    const conLatticino = piatti.find((x) => (x.ingredienti || [])
      .some((i) => inClasse(i.a, ['latte'])));
    expect(conLatticino).toBeDefined();
    expect(ammesso(p, conLatticino)).toBe(false);
    expect(motivoEsclusione(p, conLatticino).tipo).toBe('allergia');
  });

  it('e non viene semplicemente tolto dal piatto, come per un gusto', () => {
    // È la differenza che conta: un ingrediente che non piace si toglie e il
    // piatto resta; un allergene porta via il piatto, perché sta anche nelle
    // tracce e nel procedimento.
    const p = con('latte');
    const conLatticino = piatti.find((x) => (x.ingredienti || [])
      .some((i) => inClasse(i.a, ['latte'])));
    expect(motivoEsclusione(p, conLatticino).testo).toMatch(/contiene/);
  });
});

describe('la settimana di chi ha un’allergia', () => {
  const base = { target: 2000, floor: 1500, mese: 8, inizio: INIZIO };

  it('un celiaco non trova un solo cereale col glutine, in nessun giorno', () => {
    for (let s = 0; s < 30; s++) {
      const w = generaSettimana({ ...base, preferenze: con('glutine'), seme: s });
      const dentro = ingredientiDi(w).filter((id) => inClasse(id, ['glutine']));
      expect(dentro, `seme ${s}`).toEqual([]);
    }
  });

  it('chi non tollera il latte non trova un solo latticino', () => {
    for (let s = 0; s < 30; s++) {
      const w = generaSettimana({ ...base, preferenze: con('latte'), seme: s });
      expect(ingredientiDi(w).filter((id) => inClasse(id, ['latte'])), `seme ${s}`).toEqual([]);
    }
  });

  it('due classi insieme tengono tutte e due', () => {
    const p = con('glutine', 'latte');
    for (let s = 0; s < 20; s++) {
      const w = generaSettimana({ ...base, preferenze: p, seme: s });
      expect(ingredientiDi(w).filter((id) => inClasse(id, ['glutine', 'latte']))).toEqual([]);
    }
  });

  it('e la settimana si genera lo stesso: sette giorni pieni, non un piano a buchi', () => {
    const w = generaSettimana({ ...base, preferenze: con('glutine', 'latte'), seme: 7 });
    expect(w.giorni).toHaveLength(7);
    for (const g of w.giorni) {
      expect(tutteLeVoci(g).length, g.etichetta).toBeGreaterThan(3);
    }
  });
});

describe('gli alimenti fissi dello schema', () => {
  const base = { target: 2000, floor: 1500, mese: 8, inizio: INIZIO };

  it('il pane della cena rispetta il lucchetto, come tutto il resto', () => {
    // Era il buco: il pane entrava da uno slot fisso dello schema, senza
    // passare da `scegli()` e quindi senza guardare le preferenze. Misurato
    // prima della correzione: 86 comparse su 20 settimane, con l'allergia
    // dichiarata proprio sul pane.
    const p = alternaAllergia(vuote('p'), 'pane');
    let quante = 0;
    for (let s = 0; s < 20; s++) {
      const w = generaSettimana({ ...base, preferenze: p, seme: s });
      quante += w.giorni.flatMap(tutteLeVoci)
        .filter((v) => v.tipo === 'alimento' && v.id === 'pane').length;
    }
    expect(quante).toBe(0);
  });

  it('e sparisce anche per classe, che è il caso vero del celiaco', () => {
    for (let s = 0; s < 20; s++) {
      const w = generaSettimana({ ...base, preferenze: con('glutine'), seme: s });
      expect(w.giorni.flatMap(tutteLeVoci)
        .filter((v) => v.tipo === 'alimento' && v.id === 'pane'), `seme ${s}`).toEqual([]);
    }
  });

  it('senza allergie il pane resta dov’era: la correzione non toglie niente a nessun altro', () => {
    let quante = 0;
    for (let s = 0; s < 20; s++) {
      const w = generaSettimana({ ...base, preferenze: vuote('p'), seme: s });
      quante += w.giorni.flatMap(tutteLeVoci)
        .filter((v) => v.tipo === 'alimento' && v.id === 'pane').length;
    }
    expect(quante).toBeGreaterThan(0);
  });

  it('la cena senza pane resta una cena, non un buco', () => {
    const w = generaSettimana({ ...base, preferenze: con('glutine'), seme: 3 });
    for (const g of w.giorni) {
      expect(g.pasti.cena.length, g.etichetta).toBeGreaterThan(0);
    }
  });
});
