import { describe, it, expect } from 'vitest';
import lib from '../api/_lib.js';
import sp from '../api/_spazio.js';
/** Una settimana come esce davvero dal generatore, fabbisogno compreso. */
function settimanaVera() {
  return {
    inizio: '2026-08-17',
    seme: 4242,
    target: 1581,
    floor: 1360,
    commensali: 1,
    giorni: [{
      data: '2026-08-17',
      etichetta: 'lun',
      rigido: false,
      quota: 1597,
      stato: 'sgarro',
      recuperoKcal: 320,
      sgarro: { id: 'pizza-margherita', kcal: 850 },
      pasti: {
        colazione: [{ tipo: 'piatto', id: 'latte-cereali', porzioni: 1.35, fissata: true }],
        'spuntino-mattina': [{ tipo: 'alimento', id: 'mela', porzioni: 1 }],
        pranzo: [{ tipo: 'piatto', id: 'pasta-cozze', porzioni: 1.4 }],
        'spuntino-pomeriggio': [],
        cena: [{ tipo: 'piatto', id: 'orata-forno', porzioni: 0.9 }],
      },
    }],
  };
}

describe('cosa esce dello spazio famiglia', () => {
  it('del menù restano le pietanze, e nient\'altro', () => {
    // E' la prova che protegge tutta la scelta di architettura: si passa una
    // settimana INTERA, fabbisogno e sgarro compresi, e dall'altra parte deve
    // uscire soltanto «quale pietanza, in che giorno, in che pasto».
    const menu = sp.sanificaMenu(settimanaVera());

    expect(Object.keys(menu).sort()).toEqual(['da', 'giorni', 'inizio', 'quando', 'seme']);
    expect(menu.target).toBeUndefined();
    expect(menu.floor).toBeUndefined();
    expect(menu.commensali).toBeUndefined();

    const [g] = menu.giorni;
    expect(Object.keys(g).sort()).toEqual(['data', 'etichetta', 'pasti', 'rigido']);
    expect(g.quota).toBeUndefined();
    expect(g.stato).toBeUndefined();
    expect(g.recuperoKcal).toBeUndefined();
    expect(g.sgarro).toBeUndefined();

    expect(g.pasti.colazione).toEqual([{ tipo: 'piatto', id: 'latte-cereali' }]);
    // Nemmeno le porzioni di chi ha generato il menù: sono il suo pasto, e
    // imporle agli altri e' esattamente il difetto che si vuole evitare.
    expect(g.pasti.pranzo[0].porzioni).toBeUndefined();
    expect(g.pasti.colazione[0].fissata).toBeUndefined();
  });

  it('non si fida della forma di quello che riceve', () => {
    expect(sp.sanificaMenu(null)).toBe(null);
    expect(sp.sanificaMenu({ giorni: [] })).toBe(null);
    expect(sp.sanificaMenu({ inizio: 'lunedì', giorni: [{ etichetta: 'lun' }] })).toBe(null);
    // Un giorno che non e' un giorno della settimana non entra.
    expect(sp.sanificaMenu({ inizio: '2026-08-17', giorni: [{ etichetta: 'pippo' }] })).toBe(null);
    // E nemmeno un pasto inventato.
    const m = sp.sanificaMenu({
      inizio: '2026-08-17',
      giorni: [{ etichetta: 'lun', pasti: { merenda: [{ tipo: 'piatto', id: 'x' }] } }],
    });
    expect(Object.keys(m.giorni[0].pasti).sort()).toEqual(sp.PASTI.slice().sort());
    expect(m.giorni[0].pasti.merenda).toBeUndefined();
  });

  it('di una persona passano il nome e le porzioni, non il corpo', () => {
    const m = sp.sanificaMembro({
      id: 'p_origine_nina',
      nome: 'Nina',
      porzioni: { 'lun|pranzo|0': 1.4567, 'lun|cena|0': 0.9 },
      // Niente di tutto questo deve arrivare all'archivio remoto.
      pesoKg: 35,
      altezzaCm: 138,
      dataNascita: '2016-04-02',
      patologie: { celiachia: true },
      target: 1200,
      floor: 1200,
    });

    expect(Object.keys(m).sort()).toEqual(['aggiornatoIl', 'id', 'nome', 'porzioni', 'segue']);
    expect(m.pesoKg).toBeUndefined();
    expect(m.patologie).toBeUndefined();
    expect(m.target).toBeUndefined();
    // Due decimali bastano a pesare, e un numero piu' lungo direbbe di piu' di
    // quanto serva sul fabbisogno di chi lo pubblica.
    expect(m.porzioni['lun|pranzo|0']).toBe(1.46);
  });

  it('le porzioni sono numeri veri, dentro un intervallo', () => {
    const m = sp.sanificaMembro({
      id: 'x',
      porzioni: {
        buona: 1.2, negativa: -5, enorme: 900, testo: 'tanta', nulla: NaN, infinita: Infinity,
      },
    });
    expect(m.porzioni).toEqual({ buona: 1.2, negativa: 0, enorme: 20 });
  });

  it('lo spazio letto non contiene di che riscriverlo', () => {
    const pubblico = sp.spazioPubblico({
      chiaveImpronta: 'a'.repeat(64),
      capo: 'p_renata',
      menu: { inizio: '2026-08-17' },
      membri: {},
      proposte: [],
      creatoIl: 'x',
      aggiornatoIl: 'y',
    });
    expect(pubblico.chiaveImpronta).toBeUndefined();
    expect(Object.keys(pubblico).sort())
      .toEqual(['aggiornatoIl', 'capo', 'creatoIl', 'membri', 'menu', 'proposte']);
  });

  it('un membro non cancella gli altri, e la famiglia ha un tetto', () => {
    let membri = {};
    for (let i = 0; i < sp.MAX_MEMBRI; i += 1) {
      membri = sp.fondiMembro(membri, sp.sanificaMembro({ id: `p${i}`, nome: `N${i}` }));
      expect(membri).not.toBe(null);
    }
    expect(Object.keys(membri)).toHaveLength(sp.MAX_MEMBRI);

    // Chi c'e' gia' puo' sempre riscriversi...
    const suo = sp.fondiMembro(membri, sp.sanificaMembro({ id: 'p0', nome: 'Nuovo nome' }));
    expect(suo.p0.nome).toBe('Nuovo nome');
    expect(Object.keys(suo)).toHaveLength(sp.MAX_MEMBRI);

    // ...ma un nono no: senza tetto chi trovasse il codice lo riempirebbe.
    expect(sp.fondiMembro(membri, sp.sanificaMembro({ id: 'estraneo' }))).toBe(null);
  });

  it('chi cambia idea non lascia due richieste che si contraddicono', () => {
    const una = sp.sanificaProposta({ da: 'nina', chiave: 'mar|cena|1', nuovoId: 'frittata' });
    const altra = sp.sanificaProposta({ da: 'nina', chiave: 'mar|cena|1', nuovoId: 'minestrone' });
    const dAltri = sp.sanificaProposta({ da: 'tommaso', chiave: 'mar|cena|1', nuovoId: 'pollo' });

    let p = sp.fondiProposte([], una);
    p = sp.fondiProposte(p, dAltri);
    p = sp.fondiProposte(p, altra);

    expect(p).toHaveLength(2);
    expect(p.find((x) => x.da === 'nina').nuovoId).toBe('minestrone');
    expect(p.find((x) => x.da === 'tommaso').nuovoId).toBe('pollo');
  });

  it('una proposta nasce sempre in attesa, non gia\' accettata', () => {
    // Senza questo, chi propone potrebbe mandarsi da solo l'approvazione.
    const p = sp.sanificaProposta({
      da: 'nina', chiave: 'mar|cena|1', nuovoId: 'frittata', stato: 'accettata',
    });
    expect(p.stato).toBe('attesa');
    expect(sp.sanificaProposta({ da: 'nina', chiave: 'mar|cena|1' })).toBe(null);
  });
});

describe('la chiave dello spazio', () => {
  it('si archivia come impronta, non in chiaro', () => {
    const chiave = lib.nuovaChiave();
    const impronta = lib.improntaChiave(chiave);
    expect(impronta).toMatch(/^[0-9a-f]{64}$/);
    expect(impronta).not.toContain(chiave);
    expect(lib.improntaChiave(chiave)).toBe(impronta);
    expect(lib.improntaChiave(lib.nuovaChiave())).not.toBe(impronta);
    // E il confronto passa per l'impronta, mai per la chiave.
    expect(lib.segretiUguali(lib.improntaChiave(chiave), impronta)).toBe(true);
    expect(lib.segretiUguali(lib.improntaChiave(''), impronta)).toBe(false);
  });
});

