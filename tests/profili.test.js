/* I profili devono restare separati: e' la premessa di tutta l'architettura a
   partizioni, e finora nessun test la difendeva. */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  apri, chiudi, leggi, scrivi, profili, creaProfilo,
  profiloAttivo, impostaProfiloAttivo, eliminaProfilo, tutti,
} from '../js/store.js';

async function pulisci() {
  await chiudi();
  await new Promise((risolvi) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = risolvi;
    req.onerror = risolvi;
    req.onblocked = risolvi;
  });
  await apri();
}

const CARMELA = { nome: 'Renata', sesso: 'donna', pesoKg: 73, altezzaCm: 165 };
const ANTONIO = { nome: 'Bruno', sesso: 'uomo', pesoKg: 88, altezzaCm: 178 };

describe('più profili sullo stesso dispositivo', () => {
  beforeEach(pulisci);

  it('il primo profilo va in uso da solo, il secondo no', async () => {
    const primo = await creaProfilo(CARMELA);
    expect((await profiloAttivo()).id).toBe(primo.id);

    // Chi ne crea un secondo non vuole per forza passarci: la pagina Profilo
    // lo attiva di proposito, ma lo store da solo non commuta niente.
    const secondo = await creaProfilo(ANTONIO);
    expect((await profiloAttivo()).id).toBe(primo.id);
    expect(secondo.id).not.toBe(primo.id);
    expect(await profili()).toHaveLength(2);
  });

  it('modificare un profilo non attivo non tocca quello in uso', async () => {
    const primo = await creaProfilo(CARMELA);
    const secondo = await creaProfilo(ANTONIO);

    const salvato = await leggi('profili', secondo.id);
    await scrivi('profili', { ...salvato, pesoKg: 85, ritmo: 'calmo' });

    // Il secondo e' cambiato...
    expect((await leggi('profili', secondo.id)).pesoKg).toBe(85);
    // ...il primo no, e resta lui quello in uso.
    expect((await leggi('profili', primo.id)).pesoKg).toBe(73);
    expect((await profiloAttivo()).id).toBe(primo.id);
  });

  it('commutare il profilo in uso è esplicito e reversibile', async () => {
    const primo = await creaProfilo(CARMELA);
    const secondo = await creaProfilo(ANTONIO);

    await impostaProfiloAttivo(secondo.id);
    expect((await profiloAttivo()).nome).toBe('Bruno');

    await impostaProfiloAttivo(primo.id);
    expect((await profiloAttivo()).nome).toBe('Renata');
  });

  it('salvare un profilo non ne perde i campi già scritti', async () => {
    // E' il rischio di `scrivi`, che fa un put completo: lo spread deve partire
    // dal record letto, non dai soli campi del modulo.
    const p = await creaProfilo({ ...CARMELA, avvioGraduale: { attivo: true, dal: '2026-08-16' } });
    const salvato = await leggi('profili', p.id);
    await scrivi('profili', { ...salvato, pesoKg: 71 });

    const dopo = await leggi('profili', p.id);
    expect(dopo.pesoKg).toBe(71);
    expect(dopo.avvioGraduale).toEqual({ attivo: true, dal: '2026-08-16' });
    expect(dopo.creatoIl).toBe(salvato.creatoIl);
  });

  it('cancellare un profilo porta via i suoi dati e non quelli degli altri', async () => {
    const primo = await creaProfilo(CARMELA);
    const secondo = await creaProfilo(ANTONIO);

    await scrivi('misure', { id: `${primo.id}:2026-08-16`, profiloId: primo.id, peso: 73 });
    await scrivi('misure', { id: `${secondo.id}:2026-08-16`, profiloId: secondo.id, peso: 88 });

    await eliminaProfilo(primo.id);

    expect(await tutti('misure', primo.id)).toHaveLength(0);
    expect(await tutti('misure', secondo.id)).toHaveLength(1);
    expect(await profili()).toHaveLength(1);
    // Cancellato quello in uso, l'app non resta senza: passa a quello rimasto.
    expect((await profiloAttivo()).id).toBe(secondo.id);
  });
});
