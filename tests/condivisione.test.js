import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  normalizzaCodice, codiceValido, codiceLeggibile,
  mandaSpunta, spunteInSospeso, perLaRete,
} from '../js/lista-condivisa.js';

/** Come in store.test.js: un database pulito a ogni prova. */
async function moduliPuliti() {
  const store = await import('../js/store.js');
  await store.chiudi();
  await new Promise((ok) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = req.onerror = req.onblocked = ok;
  });
  vi.resetModules();
  return {
    store: await import('../js/store.js'),
    dati: await import('../js/dati.js'),
  };
}

describe('il codice, dal lato del telefono', () => {
  it('riconosce le stesse forme che riconosce il server', () => {
    expect(normalizzaCodice('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(codiceValido(normalizzaCodice('abcde-fghjk'))).toBe(true);
    expect(codiceValido(normalizzaCodice('O2345-6789P'))).toBe(true);
    expect(codiceValido('123456')).toBe(true);
    expect(codiceValido('ABCDE')).toBe(false);
    expect(codiceLeggibile('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
  });
});

describe('le spunte che non sono ancora passate', () => {
  const fetchVero = globalThis.fetch;

  afterEach(() => { globalThis.fetch = fetchVero; });

  function rispostaFinta(dati, stato = 200) {
    return { ok: stato >= 200 && stato < 300, status: stato, json: async () => dati };
  }

  it('restano in coda quando manca la rete, e partono con la spunta dopo', async () => {
    // La frase mostrata all'utente e' «riprovo alla prossima spunta»: senza
    // questa coda era una promessa che nessuno manteneva.
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline'); });

    let esito = await mandaSpunta('ABCDEFGHJK', { alimentoId: 'pasta', spuntato: true });
    expect(esito.ok).toBeFalsy();
    expect(spunteInSospeso()).toBe(1);

    esito = await mandaSpunta('ABCDEFGHJK', { alimentoId: 'tonno', spuntato: true });
    expect(spunteInSospeso()).toBe(2);

    // Torna la rete: la spunta successiva porta con se' anche le due arretrate.
    globalThis.fetch = vi.fn(async () => rispostaFinta({ ok: true, voci: [] }));
    esito = await mandaSpunta('ABCDEFGHJK', { alimentoId: 'mele', spuntato: true });

    expect(esito.ok).toBe(true);
    const mandate = JSON.parse(globalThis.fetch.mock.calls[0][1].body).voci;
    expect(mandate.map((v) => v.alimentoId).sort()).toEqual(['mele', 'pasta', 'tonno']);
    expect(spunteInSospeso()).toBe(0);
  });

  it('non insiste quando il server ha risposto che il codice non c\'e\' piu\'', async () => {
    // Un 404 non si aggiusta riprovando: tenere la coda vorrebbe dire
    // rimandare per sempre spunte a un codice che non esiste.
    globalThis.fetch = vi.fn(async () => rispostaFinta({ ok: false }, 404));
    const esito = await mandaSpunta('ABCDEFGHJK', { alimentoId: 'pasta', spuntato: true });
    expect(esito.ok).toBeFalsy();
    expect(esito.messaggio).toMatch(/non esiste più/);
    expect(spunteInSospeso()).toBe(0);
  });

  it('spiega il freno invece di dire «non raggiungo il servizio»', async () => {
    globalThis.fetch = vi.fn(async () => rispostaFinta({ ok: false, codice: 'troppi-tentativi' }, 429));
    const esito = await mandaSpunta('ABCDEFGHJK', { alimentoId: 'pasta', spuntato: true });
    expect(esito.messaggio).toMatch(/Troppi codici sbagliati/);
  });
});

describe('quello che parte per la rete', () => {
  it('non porta con se\' calorie, pesi o identificativi', () => {
    const lista = {
      voci: [{
        alimentoId: 'pasta-semola', nome: 'Pasta', reparto: 'dispensa',
        grammi: 500, kcal: 1750, profiloId: 'p_1',
      }],
    };
    const [v] = perLaRete(lista, new Map());
    expect(Object.keys(v).sort()).toEqual(
      ['alimentoId', 'nome', 'quantita', 'reparto', 'spuntato', 'spuntatoIl'],
    );
  });
});

describe('il codice della lista sopravvive alle spunte', () => {
  let dati;

  beforeEach(async () => { ({ dati } = await moduliPuliti()); });

  it('non si cancella salvando le spunte', async () => {
    // Era il difetto: salvaSpesa aveva `codice = null` come valore di default,
    // e persisti() la chiamava senza. Alla prima spunta il codice spariva, e
    // alla ricarica della pagina non si sapeva piu' dove fosse la lista.
    await dati.salvaSpesa('p_1', '2026-08-17', [], 'ABCDEFGHJK');
    expect((await dati.caricaSpesa('p_1', '2026-08-17')).codice).toBe('ABCDEFGHJK');

    await dati.salvaSpesa('p_1', '2026-08-17', [{ alimentoId: 'pasta', spuntato: true }]);
    const riga = await dati.caricaSpesa('p_1', '2026-08-17');
    expect(riga.codice).toBe('ABCDEFGHJK');
    expect(riga.voci).toHaveLength(1);
  });

  it('si cancella solo se glielo si chiede', async () => {
    await dati.salvaSpesa('p_1', '2026-08-17', [], 'ABCDEFGHJK');
    await dati.salvaSpesa('p_1', '2026-08-17', [], null);
    expect((await dati.caricaSpesa('p_1', '2026-08-17')).codice).toBe(null);
  });
});
