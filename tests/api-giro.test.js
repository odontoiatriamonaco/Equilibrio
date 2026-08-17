/* Il giro completo contro le funzioni vere, con un archivio finto al posto di
   Redis. Qui si prova la cosa che nessun test di funzione pura può provare:
   CHI può fare COSA. */

import { describe, it, expect, beforeEach } from 'vitest';
import famiglia from '../api/famiglia.js';
import lista from '../api/lista-pubblica.js';
import lib from '../api/_lib.js';

/** Redis, ridotto alle cinque operazioni che le funzioni usano davvero. */
function archivioFinto() {
  const dati = new Map();
  return {
    dati,
    async get(k) { return dati.has(k) ? structuredClone(dati.get(k)) : null; },
    async set(k, v) { dati.set(k, structuredClone(v)); },
    async incr(k) { const n = Number(dati.get(k) || 0) + 1; dati.set(k, n); return n; },
    async expire() { /* la scadenza non entra in queste prove */ },
  };
}

function finta(metodo, { corpo, query, ip = '1.2.3.4' } = {}) {
  const res = {
    stato: 0,
    corpo: null,
    intestazioni: {},
    setHeader(k, v) { this.intestazioni[k] = v; },
    status(s) { this.stato = s; return this; },
    json(c) { this.corpo = c; return this; },
  };
  const req = { method: metodo, body: corpo, query: query || {}, headers: { 'x-forwarded-for': ip } };
  return { req, res };
}

async function chiama(handler, archivio, metodo, opzioni) {
  const { req, res } = finta(metodo, opzioni);
  await handler(req, res, archivio);
  return res;
}

const MENU = {
  inizio: '2026-08-17',
  seme: 42,
  da: 'Renata',
  giorni: [{
    etichetta: 'lun',
    data: '2026-08-17',
    pasti: { pranzo: [{ tipo: 'piatto', id: 'pasta-cozze' }] },
  }],
};

describe('lo spazio famiglia, dall\'inizio alla fine', () => {
  let a;

  beforeEach(() => { a = archivioFinto(); });

  async function apri() {
    const res = await chiama(famiglia, a, 'POST', {
      corpo: { menu: MENU, membro: { id: 'o_renata', nome: 'Renata', porzioni: { 'lun|pranzo|0': 1 } } },
    });
    return res.corpo;
  }

  it('si apre, si legge, e la chiave non torna mai indietro', async () => {
    const creato = await apri();
    expect(creato.ok).toBe(true);
    expect(lib.codiceValido(creato.codice)).toBe(true);
    expect(creato.chiave).toHaveLength(lib.LUNGHEZZA_CHIAVE);

    const letto = await chiama(famiglia, a, 'GET', { query: { codice: creato.codice } });
    expect(letto.stato).toBe(200);
    expect(letto.corpo.menu.giorni[0].pasti.pranzo[0].id).toBe('pasta-cozze');
    // Né la chiave né la sua impronta: leggere non deve dare di che riscrivere.
    expect(letto.corpo.chiave).toBeUndefined();
    expect(letto.corpo.chiaveImpronta).toBeUndefined();
    expect(JSON.stringify(letto.corpo)).not.toContain(creato.chiave);
  });

  it('col solo codice si parla per sé, non per gli altri', async () => {
    const { codice } = await apri();

    const entra = await chiama(famiglia, a, 'PATCH', {
      corpo: { codice, membro: { id: 'o_nina', nome: 'Nina', porzioni: { 'lun|pranzo|0': 0.7 } } },
    });
    expect(entra.stato).toBe(200);
    expect(Object.keys(entra.corpo.membri).sort()).toEqual(['o_nina', 'o_renata']);
    // E non si è cancellato il menù di chi c'era prima.
    expect(entra.corpo.menu.inizio).toBe('2026-08-17');

    // Ma il menù no: quello lo decide chi ha la chiave.
    const senza = await chiama(famiglia, a, 'PUT', {
      corpo: { codice, chiave: lib.nuovaChiave(), menu: { ...MENU, inizio: '2026-08-24' } },
    });
    expect(senza.stato).toBe(403);
    expect(senza.corpo.codice).toBe('non-sei-tu');

    const dopo = await chiama(famiglia, a, 'GET', { query: { codice } });
    expect(dopo.corpo.menu.inizio).toBe('2026-08-17');
  });

  it('con la chiave il menù si cambia per tutti', async () => {
    const { codice, chiave } = await apri();
    const res = await chiama(famiglia, a, 'PUT', {
      corpo: { codice, chiave, menu: { ...MENU, inizio: '2026-08-24', da: 'Renata' } },
    });
    expect(res.stato).toBe(200);
    expect(res.corpo.menu.inizio).toBe('2026-08-24');
    // I membri restano: cambia il menù, non la famiglia.
    expect(res.corpo.membri.o_renata).toBeTruthy();
  });

  it('una richiesta si manda col codice e si decide con la chiave', async () => {
    const { codice, chiave } = await apri();

    const chiesto = await chiama(famiglia, a, 'PATCH', {
      corpo: {
        codice,
        proposta: {
          da: 'o_nina', nome: 'Nina', inizio: '2026-08-17',
          chiave: 'lun|pranzo|0', nuovoId: 'frittata', alPostoDi: 'pasta-cozze',
          // Chi propone non può approvarsi da solo.
          stato: 'accettata',
        },
      },
    });
    expect(chiesto.stato).toBe(200);
    expect(chiesto.corpo.proposte[0].stato).toBe('attesa');

    const id = chiesto.corpo.proposte[0].id;
    const deciso = await chiama(famiglia, a, 'PUT', {
      corpo: { codice, chiave, esiti: [{ id, stato: 'accettata' }] },
    });
    expect(deciso.corpo.proposte[0].stato).toBe('accettata');
  });

  it('cambiare settimana porta via le richieste di quella prima', async () => {
    // Una richiesta sulla cena di martedì non vuol dire più niente quando
    // martedì c'è un altro piatto: accettarla metterebbe in tavola una cosa
    // che nessuno ha chiesto.
    const { codice, chiave } = await apri();
    await chiama(famiglia, a, 'PATCH', {
      corpo: { codice, proposta: { da: 'o_nina', chiave: 'lun|pranzo|0', nuovoId: 'frittata' } },
    });

    const stessa = await chiama(famiglia, a, 'PUT', { corpo: { codice, chiave, menu: MENU } });
    expect(stessa.corpo.proposte).toHaveLength(1);

    const nuova = await chiama(famiglia, a, 'PUT', {
      corpo: { codice, chiave, menu: { ...MENU, inizio: '2026-08-24' } },
    });
    expect(nuova.corpo.proposte).toEqual([]);
  });

  it('un codice che non esiste dà 404, e dopo un po\' dà 429', async () => {
    for (let i = 0; i < lib.TENTATIVI_MAX; i += 1) {
      const res = await chiama(famiglia, a, 'GET', { query: { codice: 'ZZZZZZZZZZ' } });
      expect(res.stato).toBe(404);
    }
    const bloccato = await chiama(famiglia, a, 'GET', { query: { codice: 'ZZZZZZZZZZ' } });
    expect(bloccato.stato).toBe(429);
    expect(bloccato.corpo.codice).toBe('troppi-tentativi');

    // Da un altro indirizzo si passa ancora: il freno è per chi bussa, non
    // una serranda calata su tutti.
    const altrove = await chiama(famiglia, a, 'GET', { query: { codice: 'ZZZZZZZZZZ' }, ip: '9.9.9.9' });
    expect(altrove.stato).toBe(404);
  });

  it('anche la chiave sbagliata conta come tentativo', async () => {
    const { codice } = await apri();
    for (let i = 0; i < lib.TENTATIVI_MAX; i += 1) {
      const res = await chiama(famiglia, a, 'PUT', { corpo: { codice, chiave: lib.nuovaChiave(), menu: MENU } });
      expect(res.stato).toBe(403);
    }
    const bloccato = await chiama(famiglia, a, 'PUT', { corpo: { codice, chiave: lib.nuovaChiave(), menu: MENU } });
    expect(bloccato.stato).toBe(429);
  });

  it('un codice scritto male non arriva nemmeno all\'archivio', async () => {
    for (const storto of ['', '123', 'ABCDEFGHI', '123456']) {
      const res = await chiama(famiglia, a, 'GET', { query: { codice: storto } });
      expect(res.stato).toBe(400);
    }
    // Il vecchio formato a sei cifre vale per la spesa, non qui: uno spazio
    // famiglia dura mesi, e un milione di codici si prova tutto.
  });

  it('un metodo che non esiste si rifiuta dicendo quali ci sono', async () => {
    const res = await chiama(famiglia, a, 'DELETE', {});
    expect(res.stato).toBe(405);
    expect(res.intestazioni.Allow).toContain('PUT');
  });
});

describe('la lista della spesa, dall\'inizio alla fine', () => {
  let a;

  beforeEach(() => { a = archivioFinto(); });

  it('si pubblica con un codice nuovo, e si riapre con quello', async () => {
    const creato = await chiama(lista, a, 'POST', {
      corpo: { voci: [{ alimentoId: 'pasta', nome: 'Pasta', quantita: '500 g', reparto: 'dispensa' }] },
    });
    expect(creato.corpo.ok).toBe(true);
    expect(creato.corpo.codice).toHaveLength(lib.LUNGHEZZA_CODICE);

    const letta = await chiama(lista, a, 'GET', { query: { codice: creato.corpo.codice } });
    expect(letta.corpo.voci[0].nome).toBe('Pasta');
  });

  it('si riapre anche scrivendolo con la O al posto dello zero', async () => {
    const creato = await chiama(lista, a, 'POST', {
      corpo: { voci: [{ alimentoId: 'pasta', nome: 'Pasta' }] },
    });
    const storto = creato.corpo.codice.replace(/0/g, 'O').replace(/1/g, 'l').toLowerCase();
    const letta = await chiama(lista, a, 'GET', { query: { codice: storto } });
    expect(letta.stato).toBe(200);
  });

  it('due telefoni che spuntano insieme non si cancellano a vicenda', async () => {
    const { corpo: { codice } } = await chiama(lista, a, 'POST', {
      corpo: {
        voci: [
          { alimentoId: 'pasta', nome: 'Pasta' },
          { alimentoId: 'tonno', nome: 'Tonno' },
        ],
      },
    });

    await chiama(lista, a, 'PATCH', {
      corpo: { codice, voci: [{ alimentoId: 'pasta', nome: 'Pasta', spuntato: true, spuntatoIl: '2026-08-17T10:00:00Z' }] },
    });
    const dopo = await chiama(lista, a, 'PATCH', {
      corpo: { codice, voci: [{ alimentoId: 'tonno', nome: 'Tonno', spuntato: true, spuntatoIl: '2026-08-17T10:01:00Z' }] },
    });

    const per = new Map(dopo.corpo.voci.map((v) => [v.alimentoId, v]));
    expect(per.get('pasta').spuntato).toBe(true);
    expect(per.get('tonno').spuntato).toBe(true);
  });

  it('il freno vale anche qui', async () => {
    for (let i = 0; i < lib.TENTATIVI_MAX; i += 1) {
      expect((await chiama(lista, a, 'GET', { query: { codice: 'ZZZZZZZZZZ' } })).stato).toBe(404);
    }
    expect((await chiama(lista, a, 'GET', { query: { codice: 'ZZZZZZZZZZ' } })).stato).toBe(429);
  });
});
