import { describe, it, expect } from 'vitest';
import {
  cifra, decifra, ispeziona, nomeFile,
  FormatoNonValido, PassphraseErrata,
} from '../js/profilo-file.js';

const FASCICOLO = {
  schema: 1,
  esportatoIl: '2026-07-29T10:00:00.000Z',
  profilo: { id: 'p_1', nome: 'Carmela', pesoKg: 78, vitaCm: 92, bandiere: { tiroide: true } },
  archivi: {
    diario: [{ id: 'p_1:2026-07-28', profiloId: 'p_1', kcal: 1680 }],
    dispensa: [{ id: 'p_1:ricotta', profiloId: 'p_1', grammi: 150 }],
  },
};

describe('file di profilo cifrato', () => {
  it('cifra e ridà indietro esattamente gli stessi dati', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    const tornato = await decifra(byte, 'zuppa-di-cicoria-42');
    expect(tornato).toEqual(FASCICOLO);
  });

  it('il file non contiene i dati in chiaro', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    const testo = new TextDecoder().decode(byte);
    expect(testo).not.toContain('Carmela');
    expect(testo).not.toContain('tiroide');
    expect(testo).not.toContain('78');
    // L'intestazione resta riconoscibile: serve a migrare i file vecchi.
    expect(testo.startsWith('EQBR')).toBe(true);
  });

  it('due export della stessa cosa danno file diversi (salt e IV casuali)', async () => {
    const a = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    const b = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    expect(a.slice(9)).not.toEqual(b.slice(9));
  });

  it('con la passphrase sbagliata fallisce in modo pulito', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    await expect(decifra(byte, 'zuppa-di-cicoria-43')).rejects.toBeInstanceOf(PassphraseErrata);
  });

  it('se il file è stato manomesso non si apre', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    byte[byte.length - 5] ^= 0xff;
    await expect(decifra(byte, 'zuppa-di-cicoria-42')).rejects.toBeInstanceOf(PassphraseErrata);
  });

  it('rifiuta un file che non è di Equilibrio', async () => {
    const finto = new TextEncoder().encode('{"peso":78,"nome":"Carmela"} ancora testo a caso');
    await expect(decifra(finto, 'qualunque')).rejects.toBeInstanceOf(FormatoNonValido);
    expect(ispeziona(finto).valido).toBe(false);
  });

  it('rifiuta un file scritto da una versione futura', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    byte[4] = 99;
    await expect(decifra(byte, 'zuppa-di-cicoria-42')).rejects.toBeInstanceOf(FormatoNonValido);
  });

  it('espone versione e iterazioni senza chiedere la passphrase', async () => {
    const byte = await cifra(FASCICOLO, 'zuppa-di-cicoria-42');
    expect(ispeziona(byte)).toEqual({ valido: true, versione: 1, iterazioni: 210_000 });
  });

  it('pretende una passphrase di lunghezza minima', async () => {
    await expect(cifra(FASCICOLO, 'corta')).rejects.toThrow(/almeno 8/);
  });

  it('costruisce un nome file leggibile e senza accenti', () => {
    const n = nomeFile({ nome: 'Carmela Rüsso' }, new Date('2026-07-29T10:00:00Z'));
    expect(n).toBe('equilibrio-carmela-russo-2026-07-29.equilibrio');
    expect(/^[\x20-\x7e]+$/.test(n)).toBe(true);
  });
});
