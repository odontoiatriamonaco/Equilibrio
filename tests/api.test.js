import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import lib from '../api/_lib.js';
import { credenziali } from '../api/_kv.js';

/** Archivio finto: tiene i valori in memoria e registra le scadenze imposte. */
function archivioFinto() {
  const dati = new Map();
  const scadenze = [];
  return {
    dati,
    scadenze,
    async get(k) { return dati.has(k) ? dati.get(k) : null; },
    async incr(k) { const n = Number(dati.get(k) || 0) + 1; dati.set(k, n); return n; },
    async expire(k, s) { scadenze.push([k, s]); },
  };
}

describe('il codice di condivisione', () => {
  it('non contiene lettere che si confondono leggendo', () => {
    // I, L, O e U sono fuori dall'alfabeto: chi ricopia da un foglio non deve
    // dover indovinare se quello e' uno zero o una O.
    for (const proibita of ['I', 'L', 'O', 'U']) {
      expect(lib.ALFABETO).not.toContain(proibita);
    }
    for (let i = 0; i < 500; i += 1) {
      expect(lib.nuovoCodice()).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    }
  });

  it('ha lo spazio dichiarato, e non si ripete', () => {
    expect(lib.ALFABETO.length).toBe(32);
    expect(lib.LUNGHEZZA_CODICE).toBe(10);
    // 32^10 e' circa 1,1 x 10^15: un milione di volte piu' delle vecchie 6 cifre.
    expect(Math.pow(32, 10)).toBeGreaterThan(1e15);

    const visti = new Set();
    for (let i = 0; i < 2000; i += 1) visti.add(lib.nuovoCodice());
    expect(visti.size).toBe(2000);
  });

  it('usa tutte e trentadue le lettere, senza favorirne nessuna', () => {
    // Se il sorteggio prendesse il resto su un alfabeto non divisore di 256
    // alcune lettere uscirebbero piu' spesso: qui non deve succedere.
    const conteggio = new Map();
    for (let i = 0; i < 4000; i += 1) {
      for (const c of lib.nuovoCodice()) conteggio.set(c, (conteggio.get(c) || 0) + 1);
    }
    expect(conteggio.size).toBe(32);
    const attesi = 40000 / 32;
    for (const n of conteggio.values()) {
      expect(n).toBeGreaterThan(attesi * 0.8);
      expect(n).toBeLessThan(attesi * 1.2);
    }
  });

  it('perdona chi scrive O per zero e l per uno', () => {
    expect(lib.normalizzaCodice('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(lib.normalizzaCodice('  ABCDE FGHJK  ')).toBe('ABCDEFGHJK');
    expect(lib.normalizzaCodice('O1234-5678O')).toBe('0123456780');
    expect(lib.normalizzaCodice('IL234-56789')).toBe('1123456789');
  });

  it('accetta i vecchi codici a sei cifre, ma non ne genera piu\'', () => {
    // Una lista pubblicata prima di questo cambiamento vive ancora 48 ore, e
    // chi la sta usando al supermercato non deve vedersela smettere di colpo.
    expect(lib.codiceValido('123456')).toBe(true);
    expect(lib.codiceValido('ABCDEFGHJK')).toBe(true);
    expect(lib.codiceValido('ABCDEF')).toBe(false);
    expect(lib.codiceValido('ABCDEFGHJ')).toBe(false);
    expect(lib.codiceValido('ABCDEFGHJKM')).toBe(false);
    expect(lib.codiceValido('ABCDEFGHIK')).toBe(false); // la I non e' nell'alfabeto
    expect(lib.codiceValido('')).toBe(false);

    for (let i = 0; i < 200; i += 1) {
      expect(lib.nuovoCodice()).not.toMatch(/^\d{6}$/);
    }
  });

  it('si mostra a gruppi di cinque', () => {
    expect(lib.codiceLeggibile('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(lib.codiceLeggibile('123456')).toBe('123456');
    // E la forma leggibile deve tornare valida se la si ridigita com\'e'.
    expect(lib.codiceValido(lib.normalizzaCodice(lib.codiceLeggibile(lib.nuovoCodice())))).toBe(true);
  });
});

describe('la chiave di chi comanda lo spazio', () => {
  it('e\' piu\' lunga del codice: non si detta a voce', () => {
    expect(lib.LUNGHEZZA_CHIAVE).toBeGreaterThan(lib.LUNGHEZZA_CODICE);
    expect(lib.nuovaChiave()).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
  });

  it('si confronta senza far trapelare quanto ci si e\' avvicinati', () => {
    const k = lib.nuovaChiave();
    expect(lib.segretiUguali(k, k)).toBe(true);
    expect(lib.segretiUguali(k, lib.nuovaChiave())).toBe(false);
    expect(lib.segretiUguali(k, k.slice(0, 19))).toBe(false);
    expect(lib.segretiUguali(k, k + 'A')).toBe(false);
    // Il vuoto non e' una chiave: senza questo, chi non ne manda nessuna passa.
    expect(lib.segretiUguali('', '')).toBe(false);
    expect(lib.segretiUguali(null, undefined)).toBe(false);
  });
});

describe('il freno ai tentativi', () => {
  it('scatta dopo il numero dichiarato di codici sbagliati', async () => {
    const a = archivioFinto();
    for (let i = 0; i < lib.TENTATIVI_MAX; i += 1) {
      expect(await lib.troppiTentativi(a, 'spesa', '1.2.3.4')).toBe(false);
      await lib.segnaTentativo(a, 'spesa', '1.2.3.4');
    }
    expect(await lib.troppiTentativi(a, 'spesa', '1.2.3.4')).toBe(true);
  });

  it('conta ogni indirizzo per conto suo', async () => {
    const a = archivioFinto();
    for (let i = 0; i < lib.TENTATIVI_MAX + 5; i += 1) {
      await lib.segnaTentativo(a, 'spesa', '1.2.3.4');
    }
    expect(await lib.troppiTentativi(a, 'spesa', '1.2.3.4')).toBe(true);
    expect(await lib.troppiTentativi(a, 'spesa', '5.6.7.8')).toBe(false);
    // E ogni funzione per conto suo: sbagliare la spesa non chiude la famiglia.
    expect(await lib.troppiTentativi(a, 'famiglia', '1.2.3.4')).toBe(false);
  });

  it('fa partire la finestra dal primo errore, e non la allunga', async () => {
    // Se ogni tentativo rinnovasse la scadenza, chi sbaglia molte volte
    // resterebbe bloccato per sempre invece che per un'ora.
    const a = archivioFinto();
    for (let i = 0; i < 5; i += 1) await lib.segnaTentativo(a, 'spesa', '1.2.3.4');
    expect(a.scadenze).toEqual([['freno:spesa:1.2.3.4', lib.FINESTRA_TENTATIVI]]);
  });

  it('riconosce chi sta bussando anche dietro un proxy', () => {
    expect(lib.ipDi({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })).toBe('9.9.9.9');
    expect(lib.ipDi({ headers: { 'x-real-ip': '9.9.9.9' } })).toBe('9.9.9.9');
    expect(lib.ipDi({ headers: {} })).toBe('ignoto');
    expect(lib.ipDi({})).toBe('ignoto');
  });
});

describe('cosa esce davvero dal dispositivo', () => {
  it('della lista della spesa passano sei campi e basta', () => {
    const [v] = lib.sanifica([{
      alimentoId: 'pasta-semola',
      nome: 'Pasta di semola',
      quantita: '500 g',
      reparto: 'dispensa',
      spuntato: true,
      spuntatoIl: '2026-08-17T10:00:00.000Z',
      // Tutto quello che segue non deve arrivare al server.
      kcal: 1750,
      profiloId: 'p_123',
      peso: 78,
      target: 1581,
    }]);
    expect(Object.keys(v).sort()).toEqual(
      ['alimentoId', 'nome', 'quantita', 'reparto', 'spuntato', 'spuntatoIl'],
    );
    expect(v.kcal).toBeUndefined();
    expect(v.profiloId).toBeUndefined();
  });

  it('non si fida della lunghezza di quello che riceve', () => {
    const lunga = Array.from({ length: 500 }, (_, i) => ({ alimentoId: `a${i}` }));
    expect(lib.sanifica(lunga)).toHaveLength(300);
    expect(lib.sanifica('non un array')).toEqual([]);
    expect(lib.sanifica(null)).toEqual([]);
    const [v] = lib.sanifica([{ nome: 'x'.repeat(500) }]);
    expect(v.nome).toHaveLength(80);
  });
});

describe('il collegamento all\'archivio', () => {
  const salvate = { ...process.env };

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...salvate };
  });

  it('non esiste finche\' non c\'e\' nulla di configurato', () => {
    expect(credenziali()).toBe(null);
  });

  it('pretende indirizzo E token della stessa coppia', () => {
    // Era il difetto di prima: con il solo indirizzo il controllo passava, il
    // client cadeva alla prima operazione e l'utente leggeva «errore del
    // servizio» invece di «la condivisione non e' attiva».
    process.env.UPSTASH_REDIS_REST_URL = 'https://esempio.upstash.io';
    expect(credenziali()).toBe(null);

    process.env.UPSTASH_REDIS_REST_TOKEN = 'segreto';
    expect(credenziali()).toEqual({
      url: 'https://esempio.upstash.io',
      token: 'segreto',
    });
  });

  it('accetta entrambi i modi in cui l\'archivio puo\' essere collegato', () => {
    process.env.KV_REST_API_URL = 'https://kv.esempio';
    process.env.KV_REST_API_TOKEN = 'kv-segreto';
    expect(credenziali().url).toBe('https://kv.esempio');

    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.esempio';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'up-segreto';
    // Con tutte e due configurate vince quella di Vercel, che e' la coppia
    // che l'integrazione scrive per prima.
    expect(credenziali().url).toBe('https://kv.esempio');
  });
});
