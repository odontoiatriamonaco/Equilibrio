import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { generaSettimana, kcalGiorno } from '../js/planner.js';
import { vuote } from '../js/preferenze.js';
import {
  menuDaSettimana, porzioniDaSettimana, settimanaDaMenu, porzioniDellaTavola,
  mieProposte, proposteInAttesa, raccontaArrivo,
} from '../js/spazio-famiglia.js';

const RENATA = {
  id: 'p_renata', origine: 'o_renata', nome: 'Renata',
  sesso: 'F', pesoKg: 78, altezzaCm: 164, dataNascita: '1979-05-11', attivita: 'leggera',
};
const NINA = {
  id: 'p_nina', origine: 'o_nina', nome: 'Nina', seguo: 'p_renata',
  sesso: 'F', pesoKg: 35, altezzaCm: 138, dataNascita: '2016-04-02', attivita: 'media',
};

function settimana(seme = 7) {
  return generaSettimana({
    inizio: new Date('2026-08-17T00:00:00'),
    target: 1581,
    floor: 1360,
    seme,
    preferenze: vuote(),
  });
}

describe('il menù che viaggia', () => {
  it('porta le pietanze e lascia a casa il fabbisogno', () => {
    const s = settimana();
    const menu = menuDaSettimana(s, 'Renata');

    expect(menu.target).toBeUndefined();
    expect(menu.floor).toBeUndefined();
    expect(menu.commensali).toBeUndefined();
    expect(menu.inizio).toBe(s.inizio);
    expect(menu.giorni).toHaveLength(7);

    for (const g of menu.giorni) {
      expect(g.quota).toBeUndefined();
      for (const voci of Object.values(g.pasti)) {
        for (const v of voci) {
          expect(Object.keys(v).sort()).toEqual(['id', 'tipo']);
        }
      }
    }
  });

  it('rimesso insieme, dà le stesse pietanze negli stessi posti', () => {
    const s = settimana();
    const rifatta = settimanaDaMenu(menuDaSettimana(s, 'Renata'), porzioniDaSettimana(s), {
      target: s.target, floor: s.floor,
    });

    expect(rifatta.giorni).toHaveLength(7);
    for (let g = 0; g < 7; g += 1) {
      for (const pasto of Object.keys(s.giorni[g].pasti)) {
        expect(rifatta.giorni[g].pasti[pasto].map((v) => v.id))
          .toEqual(s.giorni[g].pasti[pasto].map((v) => v.id));
      }
    }
  });

  it('con le porzioni pubblicate torna la stessa giornata, caloria più caloria meno', () => {
    // E' la prova che le porzioni bastano: se ritornano le stesse kcal senza
    // che sia passato un solo numero di calorie, mandare i grammi e' inutile.
    const s = settimana();
    const rifatta = settimanaDaMenu(menuDaSettimana(s, 'Renata'), porzioniDaSettimana(s));

    for (let g = 0; g < 7; g += 1) {
      expect(kcalGiorno(rifatta.giorni[g])).toBeCloseTo(kcalGiorno(s.giorni[g]), 0);
    }
  });

  it('senza porzioni riparte da una porzione piena', () => {
    const rifatta = settimanaDaMenu(menuDaSettimana(settimana(), 'Renata'));
    for (const g of rifatta.giorni) {
      for (const voci of Object.values(g.pasti)) {
        for (const v of voci) expect(v.porzioni).toBe(1);
      }
    }
  });

  it('le chiavi delle porzioni sono le stesse dello strato personale', () => {
    // `js/famiglia.js` legge le personalizzazioni con `etichetta|pasto|indice`:
    // se qui si usasse un'altra forma, le due cose non si troverebbero mai.
    const p = porzioniDaSettimana(settimana());
    for (const chiave of Object.keys(p)) {
      expect(chiave).toMatch(/^(lun|mar|mer|gio|ven|sab|dom)\|[a-z-]+\|\d+$/);
    }
    expect(Object.keys(p).length).toBeGreaterThan(20);
  });
});

describe('chi mangia cosa, per chi cucina', () => {
  it('mette insieme chi c\'è nello spazio con chi c\'è su questo telefono', () => {
    const spazio = {
      capo: 'o_renata',
      membri: {
        o_renata: { nome: 'Renata', porzioni: { 'lun|pranzo|0': 1 }, aggiornatoIl: 'A' },
        o_nina: { nome: 'Nina', porzioni: { 'lun|pranzo|0': 0.7 }, aggiornatoIl: 'B' },
        o_tommaso: { nome: 'Tommaso', porzioni: { 'lun|pranzo|0': 1.4 }, aggiornatoIl: 'C' },
      },
    };
    // Su questo dispositivo ci sono solo Renata e Nina.
    const tavola = porzioniDellaTavola(spazio, [{ profilo: RENATA }, { profilo: NINA }]);

    expect(tavola).toHaveLength(3);
    expect(tavola.find((m) => m.origine === 'o_nina').senzaProfilo).toBe(false);
    // Tommaso si vede lo stesso: chi cucina deve sapere quanto mettere in
    // pentola anche per chi qui non ha un profilo.
    const t = tavola.find((m) => m.origine === 'o_tommaso');
    expect(t.senzaProfilo).toBe(true);
    expect(t.nome).toBe('Tommaso');
    expect(t.porzioni['lun|pranzo|0']).toBe(1.4);
  });

  it('il nome di casa vince su quello pubblicato', () => {
    const spazio = { membri: { o_nina: { nome: 'nina', porzioni: {} } } };
    const [m] = porzioniDellaTavola(spazio, [{ profilo: NINA }]);
    expect(m.nome).toBe('Nina');
  });

  it('quelle pubblicate vincono su quelle ricalcolate qui', () => {
    // Se l\'altro telefono ha corretto una quantità con la bilancia, quella è
    // la porzione vera: ricalcolarla qui darebbe un numero che nessuno mangia.
    const s = settimana();
    const spazio = {
      membri: { o_nina: { nome: 'Nina', porzioni: { 'lun|pranzo|0': 2.5 } } },
    };
    const [m] = porzioniDellaTavola(spazio, [{ profilo: NINA, settimana: s }]);

    expect(m.porzioni['lun|pranzo|0']).toBe(2.5);
    // Le altre restano quelle ricalcolate: si sovrascrive voce per voce, non
    // tutto il blocco, o le voci mai toccate sparirebbero.
    expect(Object.keys(m.porzioni).length).toBeGreaterThan(20);
    expect(m.porzioni['mar|cena|0']).toBeDefined();
  });

  it('regge uno spazio vuoto senza rompersi', () => {
    expect(porzioniDellaTavola(null, [])).toEqual([]);
    expect(porzioniDellaTavola({}, null)).toEqual([]);
  });
});

describe('le richieste di scambio', () => {
  const spazio = {
    proposte: [
      { id: 'a', da: 'o_nina', nuovoId: 'frittata', stato: 'attesa' },
      { id: 'b', da: 'o_tommaso', nuovoId: 'pollo', stato: 'attesa' },
      { id: 'c', da: 'o_tommaso', nuovoId: 'riso', stato: 'rifiutata' },
    ],
  };

  it('ognuno vede le proprie, e chi cucina quelle degli altri', () => {
    expect(mieProposte(spazio, NINA).map((p) => p.id)).toEqual(['a']);
    // A chi decide interessano solo quelle ancora aperte: le già decise
    // resterebbero lì a chiedere una cosa su cui si è già risposto.
    expect(proposteInAttesa(spazio, RENATA).map((p) => p.id)).toEqual(['a', 'b']);
    expect(proposteInAttesa(spazio, NINA).map((p) => p.id)).toEqual(['b']);
  });
});

describe('cosa si racconta a chi apre l\'app', () => {
  const nomeDi = (id) => ({ frittata: 'Frittata di zucchine' }[id] || id);

  it('tace quando non c\'è uno spazio', () => {
    expect(raccontaArrivo(null)).toBe('');
    expect(raccontaArrivo({ attivo: false })).toBe('');
    // E anche quando c\'è ma non è successo niente: un avviso che non dice
    // niente insegna a non leggere gli avvisi.
    expect(raccontaArrivo({ attivo: true, cambiato: false })).toBe('');
  });

  it('dice chi ha cambiato il menù, non solo che è cambiato', () => {
    const t = raccontaArrivo({ attivo: true, cambiato: true, da: 'Renata', quando: '2026-08-17T09:00:00.000Z' });
    expect(t).toContain('Renata');
    expect(t).toMatch(/lunedì/);
  });

  it('spiega l\'esito di una richiesta col nome del piatto', () => {
    const ok = raccontaArrivo({ attivo: true, esiti: [{ nuovoId: 'frittata', stato: 'accettata' }] }, nomeDi);
    expect(ok).toContain('Frittata di zucchine');
    expect(ok).toContain('Accettata');

    const no = raccontaArrivo({ attivo: true, esiti: [{ nuovoId: 'frittata', stato: 'rifiutata' }] }, nomeDi);
    expect(no).toContain('Non accettata');
    expect(no).toContain('quello di prima');
  });

  it('quando manca il profilo del riferimento dice cosa fare', () => {
    const t = raccontaArrivo({ attivo: true, manca: 'Renata' });
    expect(t).toContain('Renata');
    expect(t).toMatch(/una volta sola/);
  });
});

describe('lo spazio ricordato da questo dispositivo', () => {
  let mod;
  let store;

  beforeEach(async () => {
    const s = await import('../js/store.js');
    await s.chiudi();
    await new Promise((ok) => {
      const req = indexedDB.deleteDatabase('equilibrio');
      req.onsuccess = req.onerror = req.onblocked = ok;
    });
    vi.resetModules();
    store = await import('../js/store.js');
    mod = await import('../js/spazio-famiglia.js');
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('non c\'è finché non si entra in uno spazio', async () => {
    expect(await mod.spazioLocale()).toBe(null);
    expect(await mod.comando()).toBe(false);
  });

  it('tiene la chiave solo su chi lo ha creato', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ ok: true, codice: 'ABCDEFGHJK', chiave: 'K'.repeat(20) }),
    })));
    await store.creaProfilo(RENATA);

    await mod.creaSpazio(RENATA, settimana());
    const loc = await mod.spazioLocale();
    expect(loc.codice).toBe('ABCDEFGHJK');
    expect(loc.chiave).toHaveLength(20);
    expect(await mod.comando()).toBe(true);

    // Chi entra col solo codice non comanda: non puo' cambiare il menù a tutti.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ ok: true, menu: null, membri: {} }),
    })));
    await mod.entraNelloSpazio('MNPQRSTVWX', NINA, settimana());
    expect((await mod.spazioLocale()).chiave).toBe(null);
    expect(await mod.comando()).toBe(false);
  });

  it('quello che parte non contiene il corpo di nessuno', async () => {
    const chiamate = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opz) => {
      chiamate.push(JSON.parse(opz.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, codice: 'ABCDEFGHJK', chiave: 'K'.repeat(20) }) };
    }));
    await store.creaProfilo(RENATA);
    await mod.creaSpazio(RENATA, settimana());

    // Si cercano i NOMI dei campi e la data di nascita: un numero nudo come 78
    // potrebbe ricomparire per caso dentro una porzione, e renderebbe questa
    // prova capricciosa invece che severa.
    const corpo = JSON.stringify(chiamate[0]);
    for (const segreto of ['1979-05-11', 'pesoKg', 'altezzaCm', 'dataNascita',
      'attivita', 'sesso', 'target', 'floor', 'quota', 'patologie']) {
      expect(corpo).not.toContain(segreto);
    }
    expect(chiamate[0].membro.id).toBe('o_renata');
    expect(chiamate[0].membro.nome).toBe('Renata');
  });

  it('si presenta con l\'identità che sopravvive agli import, non con l\'id locale', async () => {
    // L'id locale cambia a ogni import: usandolo, la stessa persona comparirebbe
    // nello spazio due volte dopo aver cambiato telefono.
    const chiamate = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opz) => {
      chiamate.push(JSON.parse(opz.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, menu: null, membri: {} }) };
    }));
    await store.creaProfilo(RENATA);
    await store.creaProfilo(NINA);

    await mod.entraNelloSpazio('ABCDEFGHJK', NINA, settimana());
    expect(chiamate[0].membro.id).toBe('o_nina');
    expect(chiamate[0].membro.segue).toBe('o_renata');
  });

  it('una richiesta accettata finisce nelle personalizzazioni di chi l\'ha fatta', async () => {
    const pl = await import('../js/planner.js');
    const fam = await import('../js/famiglia.js');
    const inizio = pl.iso(pl.inizioSettimana(new Date()));

    await store.creaProfilo(RENATA);
    await store.creaProfilo(NINA);
    await store.impostaProfiloAttivo(NINA.id);

    const s = settimana();
    s.inizio = inizio;
    s.giorni.forEach((g, i) => {
      const d = pl.inizioSettimana(new Date());
      d.setDate(d.getDate() + i);
      g.data = pl.iso(d);
    });

    const spazio = {
      ok: true,
      capo: 'o_renata',
      menu: { ...mod.menuDaSettimana(s, 'Renata'), inizio },
      membri: { o_renata: { nome: 'Renata', porzioni: mod.porzioniDaSettimana(s) } },
      proposte: [{
        id: 'o_nina:mar|cena|0', da: 'o_nina', nome: 'Nina', inizio,
        chiave: 'mar|cena|0', nuovoId: 'frittata-zucchine', stato: 'accettata',
      }],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => spazio,
    })));

    // Prima si entra: senza codice locale `allinea` non fa niente.
    await mod.entraNelloSpazio('ABCDEFGHJK', NINA, null);
    const esito = await mod.allinea(NINA);

    expect(esito.attivo).toBe(true);
    expect(esito.esiti).toHaveLength(1);

    const pers = await fam.caricaPersonalizzazioni(NINA.id, inizio);
    expect(pers.voci['mar|cena|0'].sostituto).toBe('frittata-zucchine');

    // Il menù del riferimento è arrivato in casa: senza, Nina non avrebbe
    // niente da cui derivare la propria settimana.
    const d = await import('../js/dati.js');
    expect(await d.caricaSettimana(RENATA.id, new Date())).toBeTruthy();

    // Alla seconda apertura la stessa richiesta non si riapplica, o ogni volta
    // che si apre l'app tornerebbe fuori lo stesso annuncio.
    const ancora = await mod.allinea(NINA);
    expect(ancora.esiti).toBe(null);
  });

  it('senza rete lo dice, e non si porta via il codice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await store.creaProfilo(RENATA);
    const esito = await mod.creaSpazio(RENATA, settimana());
    expect(esito.ok).toBe(false);
    expect(esito.messaggio).toMatch(/Nessuna rete/);
    expect(await mod.spazioLocale()).toBe(null);
  });
});

describe('chi vive da solo, su due dispositivi suoi', () => {
  let mod;
  let store;

  beforeEach(async () => {
    const s = await import('../js/store.js');
    await s.chiudi();
    await new Promise((ok) => {
      const req = indexedDB.deleteDatabase('equilibrio');
      req.onsuccess = req.onerror = req.onblocked = ok;
    });
    vi.resetModules();
    store = await import('../js/store.js');
    mod = await import('../js/spazio-famiglia.js');
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  /** Lo spazio come lo restituisce il server, col menù di questa settimana. */
  async function spazioConMenu(pl) {
    const inizio = pl.iso(pl.inizioSettimana(new Date()));
    const s = settimana();
    s.inizio = inizio;
    s.giorni.forEach((g, i) => {
      const d = pl.inizioSettimana(new Date());
      d.setDate(d.getDate() + i);
      g.data = pl.iso(d);
    });
    return {
      ok: true,
      capo: 'o_renata',
      menu: { ...mod.menuDaSettimana(s, 'Renata'), inizio },
      membri: { o_renata: { nome: 'Renata', porzioni: mod.porzioniDaSettimana(s) } },
      proposte: [],
    };
  }

  it('il menù arriva sul secondo dispositivo, dove la chiave non c\'è', async () => {
    // È lo stesso profilo — stessa `origine` — ma su un altro apparecchio: la
    // settimana qui non c'è ancora. Prima veniva scartata come «l'ho fatta io»,
    // e chi vive da solo non poteva ritrovare il piano sul tablet.
    const pl = await import('../js/planner.js');
    const d = await import('../js/dati.js');
    const spazio = await spazioConMenu(pl);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => spazio })));

    await store.creaProfilo(RENATA);
    await store.impostaProfiloAttivo(RENATA.id);
    await mod.entraNelloSpazio('ABCDEFGHJK', RENATA, null);
    expect((await mod.spazioLocale()).chiave).toBe(null);

    const esito = await mod.allinea(RENATA);
    expect(esito.cambiato).toBe(true);
    expect(esito.mio).toBeUndefined();
    expect(await d.caricaSettimana(RENATA.id, new Date())).toBeTruthy();
  });

  it('ma sul dispositivo che ha la chiave la settimana non si riscrive', async () => {
    // Lì il piano è l'originale, con le porzioni calibrate a mano: rifarlo
    // dallo scheletro sarebbe una perdita, non un aggiornamento.
    const pl = await import('../js/planner.js');
    const spazio = await spazioConMenu(pl);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ ...spazio, codice: 'ABCDEFGHJK', chiave: 'K'.repeat(20) }),
    })));

    await store.creaProfilo(RENATA);
    await mod.creaSpazio(RENATA, settimana());
    expect((await mod.spazioLocale()).chiave).toHaveLength(20);

    const esito = await mod.allinea(RENATA);
    expect(esito.mio).toBe(true);
    expect(esito.cambiato).toBe(false);
  });
});
