import { describe, it, expect } from 'vitest';
import { generaSettimana, kcalGiorno } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';
import {
  aggregaSettimana, costruisciLista, quantitaLeggibile, fondiSpunte,
  residuiInDispensa, comeTesto,
} from '../js/spesa.js';
import {
  confezioniNecessarie, residuoDaSegnalare, suggerimentiAntispreco,
  sprecoTotale, RESIDUO_MINIMO_G,
} from '../js/packaging.js';
import { alternativeAlimento, alternativePiatto, scambiaPiatto } from '../js/scambi.js';
import { alimento, piatti, valoriVoce, valoriPiatto } from '../js/alimenti.js';

const PREF = vuote('p_test');
const settimana = generaSettimana({
  target: 1700, floor: 1300, preferenze: PREF, mese: 6, seme: 42,
  inizio: new Date('2026-07-27T00:00:00'),
});

describe('formati di vendita', () => {
  it('arrotonda per eccesso alla confezione intera', () => {
    // Ricotta: vaschetta da 250 g. Se ne servono 300, se ne comprano due.
    const c = confezioniNecessarie('ricotta', 300);
    expect(c.confezioni).toBe(2);
    expect(c.acquistato).toBe(500);
    expect(c.residuo).toBe(200);
  });

  it('una confezione basta quando serve meno del formato', () => {
    const c = confezioniNecessarie('ricotta', 100);
    expect(c.confezioni).toBe(1);
    expect(c.residuo).toBe(150);
  });

  it('gli sfusi si comprano al peso e non lasciano residuo', () => {
    const c = confezioniNecessarie('zucchine', 380);
    expect(c.residuo).toBe(0);
    expect(c.acquistato).toBe(380);
  });

  it('segnala solo i residui deperibili e non irrisori', () => {
    expect(residuoDaSegnalare('ricotta', 150)).toBe(true);
    // La pasta in dispensa non e' uno spreco: dura mesi.
    expect(residuoDaSegnalare('pasta-semola', 200)).toBe(false);
    expect(residuoDaSegnalare('ricotta', RESIDUO_MINIMO_G - 1)).toBe(false);
  });
});

describe('aggregazione della settimana', () => {
  const somma = aggregaSettimana(settimana, 1);

  it('somma gli ingredienti di tutti i piatti', () => {
    expect(somma.size).toBeGreaterThan(20);
    for (const [id, g] of somma) {
      expect(alimento(id), `alimento sconosciuto: ${id}`).not.toBeNull();
      expect(g).toBeGreaterThan(0);
    }
  });

  it('raddoppia se i commensali raddoppiano', () => {
    const doppia = aggregaSettimana(settimana, 2);
    for (const [id, g] of somma) {
      expect(doppia.get(id)).toBeCloseTo(g * 2, 5);
    }
  });
});

describe('lista della spesa', () => {
  const lista = costruisciLista(settimana, { commensali: 1 });

  it('è ordinata come gli scaffali, non come l’alfabeto', () => {
    const ordini = lista.reparti.map((r) => r.ordine);
    expect([...ordini].sort((a, b) => a - b)).toEqual(ordini);
  });

  it('dentro un reparto è in ordine di nome', () => {
    for (const r of lista.reparti) {
      const nomi = r.voci.map((v) => v.nome);
      expect([...nomi].sort((a, b) => a.localeCompare(b, 'it'))).toEqual(nomi);
    }
  });

  it('non perde nessun ingrediente per strada', () => {
    const somma = aggregaSettimana(settimana, 1);
    expect(lista.voci.length).toBe(somma.size);
  });

  it('stima un costo plausibile per una settimana', () => {
    expect(lista.costo).toBeGreaterThan(20);
    expect(lista.costo).toBeLessThan(300);
  });

  it('scrive le quantità come si leggono su una lista', () => {
    const ricotta = lista.voci.find((v) => v.alimentoId === 'ricotta');
    if (ricotta) expect(quantitaLeggibile(ricotta)).toMatch(/vaschett|g\b/);
    const zucchine = lista.voci.find((v) => v.alimentoId === 'zucchine');
    if (zucchine) expect(quantitaLeggibile(zucchine)).toMatch(/g|kg/);
  });

  it('il testo da condividere contiene i reparti e il totale', () => {
    const t = comeTesto(lista);
    expect(t).toMatch(/ORTOFRUTTA|DISPENSA/);
    expect(t).toMatch(/articoli/);
  });
});

describe('dispensa', () => {
  it('quello che c’è in casa non si ricompra', () => {
    const senza = costruisciLista(settimana, { commensali: 1 });
    const voce = senza.voci.find((v) => v.grammi > 100);

    const con = costruisciLista(settimana, {
      commensali: 1,
      dispensa: [{ alimentoId: voce.alimentoId, grammi: 100000 }],
    });

    expect(con.voci.find((v) => v.alimentoId === voce.alimentoId)).toBeUndefined();
    expect(con.articoli).toBe(senza.articoli - 1);
    expect(con.risparmiato).toBeGreaterThan(0);
  });

  it('una scorta parziale riduce la quantità da comprare', () => {
    const senza = costruisciLista(settimana, { commensali: 1 });
    const voce = senza.voci.find((v) => v.grammi > 200);

    const con = costruisciLista(settimana, {
      commensali: 1,
      dispensa: [{ alimentoId: voce.alimentoId, grammi: 100 }],
    });
    const dopo = con.voci.find((v) => v.alimentoId === voce.alimentoId);
    expect(dopo.grammi).toBe(voce.grammi - 100);
    expect(dopo.inCasa).toBe(100);
  });

  it('i residui delle confezioni finiscono in dispensa', () => {
    const lista = costruisciLista(settimana, { commensali: 1 });
    const scorte = residuiInDispensa(lista, 'p_test');
    expect(scorte.every((s) => s.profiloId === 'p_test' && s.grammi > 0)).toBe(true);
  });
});

describe('antispreco', () => {
  it('propone piatti che consumano il residuo', () => {
    const proposte = suggerimentiAntispreco(
      [{ alimentoId: 'ricotta', residuo: 150 }],
      { preferenze: PREF, mese: 6 },
    );
    expect(proposte).toHaveLength(1);
    expect(proposte[0].proposte.length).toBeGreaterThan(0);
    for (const p of proposte[0].proposte) {
      const piatto = piatti.find((x) => x.id === p.id);
      expect(piatto.ingredienti.some((i) => i.a === 'ricotta')).toBe(true);
    }
  });

  it('non propone piatti già in settimana', () => {
    const tutti = new Set(piatti.map((p) => p.id));
    const proposte = suggerimentiAntispreco(
      [{ alimentoId: 'ricotta', residuo: 150 }],
      { preferenze: PREF, mese: 6, giaInSettimana: tutti },
    );
    expect(proposte).toHaveLength(0);
  });

  it('ignora i residui di dispensa e quelli minimi', () => {
    const proposte = suggerimentiAntispreco(
      [{ alimentoId: 'pasta-semola', residuo: 400 }, { alimentoId: 'ricotta', residuo: 10 }],
      { preferenze: PREF, mese: 6 },
    );
    expect(proposte).toHaveLength(0);
  });

  it('conta solo lo spreco che conta', () => {
    const totale = sprecoTotale([
      { alimentoId: 'ricotta', residuo: 150 },
      { alimentoId: 'pasta-semola', residuo: 400 },
    ]);
    expect(totale).toBe(150);
  });
});

describe('scambi fra alimenti', () => {
  it('pasta, riso e pane si scambiano a parità di gruppo', () => {
    const alt = alternativeAlimento('pasta-semola');
    const ids = alt.map((a) => a.id);
    expect(ids).toContain('riso');
    expect(ids).toContain('pane');

    const riso = alt.find((a) => a.id === 'riso');
    const pane = alt.find((a) => a.id === 'pane');
    expect(riso.grammi).toBe(80);
    expect(pane.grammi).toBe(100);
    expect(riso.equivalenzaDichiarata).toBe(true);
  });

  it('le equivalenze dichiarate vengono prima di quelle calcolate', () => {
    const alt = alternativeAlimento('pasta-semola');
    const primoCalcolato = alt.findIndex((a) => !a.equivalenzaDichiarata);
    const ultimoDichiarato = alt.map((a) => a.equivalenzaDichiarata).lastIndexOf(true);
    if (primoCalcolato !== -1) expect(ultimoDichiarato).toBeLessThan(primoCalcolato);
  });

  it('un alimento inesistente non fa esplodere niente', () => {
    expect(alternativeAlimento('unicorno')).toEqual([]);
  });
});

describe('scambi fra piatti', () => {
  const voce = { tipo: 'piatto', id: 'pasta-fagioli', porzioni: 1 };

  it('propone solo piatti dello stesso ruolo nel pasto', () => {
    const alt = alternativePiatto(voce, { preferenze: PREF, mese: 6 });
    expect(alt.length).toBeGreaterThan(0);
    for (const a of alt) expect(a.tipo).toBe('piatto-unico');
    expect(alt.map((a) => a.id)).not.toContain('pasta-fagioli');
  });

  it('lo scambio mantiene l’apporto del giorno', () => {
    const nuovo = scambiaPiatto(settimana, {
      giorno: 0, pasto: 'pranzo', indice: 0,
      nuovoId: settimana.giorni[0].pasti.pranzo[0].id === 'pasta-fagioli'
        ? 'pasta-ceci' : 'pasta-fagioli',
    });
    const prima = valoriVoce(settimana.giorni[0].pasti.pranzo[0]).kcal;
    const dopo = valoriVoce(nuovo.giorni[0].pasti.pranzo[0]).kcal;
    expect(Math.abs(dopo - prima) / prima).toBeLessThan(0.3);
  });

  it('non modifica la settimana di partenza', () => {
    const idPrima = settimana.giorni[0].pasti.pranzo[0].id;
    scambiaPiatto(settimana, { giorno: 0, pasto: 'pranzo', indice: 0, nuovoId: 'genovese' });
    expect(settimana.giorni[0].pasti.pranzo[0].id).toBe(idPrima);
  });
});

describe('fusione delle spunte', () => {
  it('vince la spunta più recente, voce per voce', () => {
    const locale = [
      { alimentoId: 'latte-ps', spuntato: false, spuntatoIl: '2026-07-27T10:00:00Z' },
      { alimentoId: 'pane', spuntato: true, spuntatoIl: '2026-07-27T10:00:00Z' },
    ];
    const remota = [
      { alimentoId: 'latte-ps', spuntato: true, spuntatoIl: '2026-07-27T11:00:00Z' },
    ];
    const fusa = fondiSpunte(locale, remota);
    expect(fusa.find((v) => v.alimentoId === 'latte-ps').spuntato).toBe(true);
    // La modifica dell'altro non deve cancellare la propria.
    expect(fusa.find((v) => v.alimentoId === 'pane').spuntato).toBe(true);
    expect(fusa).toHaveLength(2);
  });
});

/* --- Lo scambio non deve lasciare indietro il totale del giorno -------------
   Le porzioni si adattano per conservare le calorie, ma fra 0,6 e 1,5 c'e' un
   limite: scambiando un piatto leggero con uno molto piu' pesante il giorno
   cambia davvero. Se `quota` restasse quella di prima mentirebbe alla fascia
   della settimana e al motore dello sgarro, che su quel numero calcola quanto
   si puo' recuperare.
   -------------------------------------------------------------------------- */

describe('scambio e totale del giorno', () => {
  const settimanaFinta = (idPiatto) => ({
    inizio: '2026-08-17',
    target: 1600,
    floor: 1400,
    giorni: [{
      data: '2026-08-17', etichetta: 'lun', quota: 999,
      pasti: { pranzo: [{ tipo: 'piatto', id: idPiatto, porzioni: 1 }] },
    }],
  });

  it('ricalcola la quota dopo lo scambio', () => {
    const leggero = piatti.find((p) => p.tipo === 'primo');
    const s = settimanaFinta(leggero.id);
    const altro = piatti.find((p) => p.tipo === 'primo' && p.id !== leggero.id);

    const dopo = scambiaPiatto(s, { giorno: 0, pasto: 'pranzo', indice: 0, nuovoId: altro.id });
    expect(dopo.giorni[0].quota).not.toBe(999);
    expect(dopo.giorni[0].quota).toBe(kcalGiorno(dopo.giorni[0]));
  });

  it('la quota resta vera anche quando il limite delle porzioni morde', () => {
    // Il caso che il difetto lasciava passare: due piatti molto diversi.
    const per = piatti.filter((p) => p.tipo === 'primo')
      .map((p) => ({ p, kcal: valoriPiatto(p, 1).kcal }))
      .sort((a, b) => a.kcal - b.kcal);
    const leggero = per[0].p;
    const pesante = per[per.length - 1].p;

    const dopo = scambiaPiatto(settimanaFinta(leggero.id), {
      giorno: 0, pasto: 'pranzo', indice: 0, nuovoId: pesante.id,
    });
    expect(dopo.giorni[0].quota).toBe(kcalGiorno(dopo.giorni[0]));
  });

  it('non tocca la quota di un giorno di sgarro, dove porta l’extra', () => {
    const a = piatti.find((p) => p.tipo === 'primo');
    const b = piatti.find((p) => p.tipo === 'primo' && p.id !== a.id);
    const s = settimanaFinta(a.id);
    s.giorni[0].stato = 'sgarro';
    s.giorni[0].quota = 2600;

    const dopo = scambiaPiatto(s, { giorno: 0, pasto: 'pranzo', indice: 0, nuovoId: b.id });
    expect(dopo.giorni[0].quota).toBe(2600);
  });
});
