/* Il filo fra le sezioni dei primi passi.
 *
 * Il percorso su Oggi diceva gia' dove andare, ma poi ti lasciava li': quattro
 * sezioni e niente che ti riportasse indietro. Qui si prova la frase del
 * pulsante — che decide se ti senti a meta' strada o alla fine — senza dover
 * aprire una pagina. */
import { describe, it, expect } from 'vitest';
import {
  guidaPagina, conFinito, conIniziato, conVisto, fineDaDire, PASSI,
} from '../js/percorso.js';

/** Uno stato come quello che torna da statoPercorso(), con i passi fatti dati. */
function stato(fatti = [], extra = {}) {
  const passi = PASSI.map((p) => ({ ...p, fatto: fatti.includes(p.id) }));
  const prossimo = passi.find((p) => !p.fatto) || null;
  return {
    passi,
    fatti: passi.filter((p) => p.fatto).length,
    totale: passi.length,
    prossimo,
    completo: !prossimo,
    chiuso: false,
    ...extra,
  };
}

describe('la barra sotto ogni sezione', () => {
  it('dice a che punto sei, col numero e il titolo', () => {
    const g = guidaPagina(stato(['profilo']), 'gusti');
    expect(g.numero).toBe(2);
    expect(g.totale).toBe(5);
    expect(g.titolo).toBe('Cosa ti piace');
    expect(g.etichetta).toBe('Avanti');
  });

  it('sull\u2019ultima sezione che resta dice «Ho finito», non «Avanti»', () => {
    // Fatti tutti tranne la spesa: sono sulla spesa.
    const g = guidaPagina(stato(['profilo', 'gusti', 'settimana', 'dispensa']), 'spesa');
    expect(g.ultimo).toBe(true);
    expect(g.etichetta).toBe('Ho finito');
  });

  it('«avanti» resta «avanti» se restano altri passi, anche a sezione fatta', () => {
    const g = guidaPagina(stato(['profilo']), 'profilo');
    expect(g.fatto).toBe(true);
    expect(g.ultimo).toBe(false);
    expect(g.etichetta).toBe('Avanti');
  });

  it('non compare a percorso finito: non c\u2019e\u0300 nessun avanti', () => {
    const tutto = stato(['profilo', 'gusti', 'settimana', 'dispensa', 'spesa']);
    expect(tutto.completo).toBe(true);
    expect(guidaPagina(tutto, 'spesa')).toBeNull();
  });

  it('non compare a chi l\u2019ha messo via', () => {
    expect(guidaPagina(stato([], { chiuso: true }), 'profilo')).toBeNull();
  });

  it('non compare su una pagina che non e\u0300 un passo', () => {
    expect(guidaPagina(stato([]), 'ricette')).toBeNull();
  });

  it('regge uno stato che non c\u2019e\u0300', () => {
    expect(guidaPagina(null, 'profilo')).toBeNull();
  });
});

describe('la fine, detta a chi l\u2019ha attraversata', () => {
  const tutto = stato(['profilo', 'gusti', 'settimana', 'dispensa', 'spesa']);

  it('non si annuncia a chi non ha mai avuto un passo da fare', () => {
    // E\u0300 il caso di chi usa l\u2019app da mesi: per lui non c\u2019e\u0300 stato nessun
    // percorso, e dirgli «hai finito» sarebbe raccontargli una cosa mai successa.
    expect(fineDaDire({ id: 'p' }, tutto)).toBe(false);
  });

  it('si annuncia a chi il percorso lo stava facendo', () => {
    const p = conIniziato({ id: 'p' });
    expect(p.percorso.iniziato).toBe(true);
    expect(fineDaDire(p, tutto)).toBe(true);
  });

  it('si dice una volta sola', () => {
    const p = conFinito(conIniziato({ id: 'p' }));
    expect(fineDaDire(p, tutto)).toBe(false);
  });

  it('finche\u0301 manca un passo non e\u0300 finita', () => {
    expect(fineDaDire(conIniziato({ id: 'p' }), stato(['profilo']))).toBe(false);
  });

  it('segnare l\u2019inizio non tocca il resto del profilo, ne\u0301 lo riscrive due volte', () => {
    const p = { id: 'p', nome: 'Antonio', pesoKg: 80, percorso: { saltati: ['spesa'] } };
    const dopo = conIniziato(p);
    expect(dopo.nome).toBe('Antonio');
    expect(dopo.percorso.saltati).toEqual(['spesa']);
    expect(conIniziato(dopo)).toBe(dopo);   // gia' segnato: stesso oggetto
  });
});

describe('l\u2019ultimo passo, e come si chiude', () => {
  it('«Ho finito» chiude un passo che si esaurisce nell\u2019averlo visto', () => {
    // La spesa e\u0300 saltabile: aprirla e vederla e\u0300 tutto quello che c\u2019e\u0300 da fare,
    // e di quello non resta traccia da nessuna parte.
    const g = guidaPagina(stato(['profilo', 'gusti', 'settimana', 'dispensa'], { iniziato: true }), 'spesa');
    expect(g.conferma).toBe(true);
    expect(g.etichetta).toBe('Ho finito');
  });

  it('non chiude un passo che o lo fai o non lo fai', () => {
    // Solo il menu\u0300 manca, e un pulsante non puo\u0300 generarlo al posto tuo.
    const g = guidaPagina(stato(['profilo', 'gusti', 'dispensa', 'spesa'], { iniziato: true }), 'settimana');
    expect(g.ultimo).toBe(true);
    expect(g.conferma).toBe(false);
    expect(g.etichetta).toBe('Avanti');
  });

  it('appena completato l\u2019ultimo passo la barra resta, per dire «Ho finito»', () => {
    // Senza questo la barra spariva proprio nell\u2019istante in cui finivi.
    const tutto = stato(['profilo', 'gusti', 'settimana', 'dispensa', 'spesa'], { iniziato: true });
    const g = guidaPagina(tutto, 'spesa');
    expect(g).not.toBeNull();
    expect(g.etichetta).toBe('Ho finito');
  });

  it('annunciata la fine, la barra se ne va', () => {
    const tutto = stato(['profilo', 'gusti', 'settimana', 'dispensa', 'spesa'], { iniziato: true, finito: true });
    expect(guidaPagina(tutto, 'spesa')).toBeNull();
  });

  it('chi non ha mai avuto un passo da fare non la vede mai', () => {
    const tutto = stato(['profilo', 'gusti', 'settimana', 'dispensa', 'spesa'], { iniziato: false });
    expect(guidaPagina(tutto, 'spesa')).toBeNull();
  });

  it('«visto» non e\u0300 «saltato»: nell\u2019elenco non compare come saltato', () => {
    const p = conVisto({ id: 'p' }, 'spesa');
    expect(p.percorso.visti).toEqual(['spesa']);
    expect(p.percorso.saltati).toBeUndefined();
  });
});
