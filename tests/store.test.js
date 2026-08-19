import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// L'archivio tiene in un modulo la promessa del database: per avere un DB
// pulito a ogni test si cancella il database e si azzera il registro dei moduli.
async function archivioPulito() {
  // Senza chiudere la connessione aperta, deleteDatabase resta bloccata.
  if (store) await store.chiudi();
  await new Promise((ok) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = req.onerror = req.onblocked = ok;
  });
  vi.resetModules();
  return import('../js/store.js');
}

let store;

beforeEach(async () => {
  store = await archivioPulito();
});

describe('profili', () => {
  it('crea un profilo e lo rende attivo se è il primo', async () => {
    const p = await store.creaProfilo({ nome: 'Renata', pesoKg: 78 });
    expect(p.id).toMatch(/^p_/);
    expect((await store.profiloAttivo()).id).toBe(p.id);
  });

  it('non cambia il profilo attivo quando se ne aggiunge un secondo', async () => {
    const a = await store.creaProfilo({ nome: 'Renata' });
    await store.creaProfilo({ nome: 'Tommaso' });
    expect((await store.profiloAttivo()).id).toBe(a.id);
    expect(await store.profili()).toHaveLength(2);
  });
});

describe('partizione fra profili', () => {
  it('i dati di un profilo non finiscono mai in quelli di un altro', async () => {
    const a = await store.creaProfilo({ nome: 'Renata' });
    const b = await store.creaProfilo({ nome: 'Tommaso' });

    await store.scrivi('diario', { id: `${a.id}:2026-07-28`, profiloId: a.id, kcal: 1680 });
    await store.scrivi('diario', { id: `${a.id}:2026-07-29`, profiloId: a.id, kcal: 1720 });
    await store.scrivi('diario', { id: `${b.id}:2026-07-29`, profiloId: b.id, kcal: 2400 });

    const dellA = await store.tutti('diario', a.id);
    const delB = await store.tutti('diario', b.id);
    expect(dellA).toHaveLength(2);
    expect(delB).toHaveLength(1);
    expect(delB[0].kcal).toBe(2400);
  });

  it('ogni scrittura porta la data di aggiornamento', async () => {
    const p = await store.creaProfilo({ nome: 'Renata' });
    const r = await store.scrivi('dispensa', { id: `${p.id}:ricotta`, profiloId: p.id, grammi: 150 });
    expect(r.aggiornatoIl).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('cancellazione di un profilo', () => {
  it('porta via TUTTI i suoi dati e lascia intatti gli altri', async () => {
    const a = await store.creaProfilo({ nome: 'Renata' });
    const b = await store.creaProfilo({ nome: 'Tommaso' });

    for (const archivio of store.ARCHIVI_PROFILO) {
      await store.scrivi(archivio, { id: `${a.id}:x`, profiloId: a.id });
      await store.scrivi(archivio, { id: `${b.id}:x`, profiloId: b.id });
    }

    await store.eliminaProfilo(a.id);

    expect(await store.leggi('profili', a.id)).toBeUndefined();
    for (const archivio of store.ARCHIVI_PROFILO) {
      expect(await store.tutti(archivio, a.id)).toHaveLength(0);
      expect(await store.tutti(archivio, b.id)).toHaveLength(1);
    }
  });

  it('se cancello il profilo attivo, ne subentra un altro', async () => {
    const a = await store.creaProfilo({ nome: 'Renata' });
    const b = await store.creaProfilo({ nome: 'Tommaso' });
    await store.eliminaProfilo(a.id);
    expect((await store.profiloAttivo()).id).toBe(b.id);
  });
});

describe('fascicolo di export/import', () => {
  it('esporta profilo e archivi', async () => {
    const p = await store.creaProfilo({ nome: 'Renata', pesoKg: 78 });
    await store.scrivi('diario', { id: `${p.id}:2026-07-28`, profiloId: p.id, kcal: 1680 });

    const f = await store.esportaFascicolo(p.id);
    expect(f.schema).toBe(store.VERSIONE_SCHEMA);
    expect(f.profilo.nome).toBe('Renata');
    expect(f.archivi.diario).toHaveLength(1);
  });

  it('reimporta con un id nuovo, senza sovrascrivere il profilo già presente', async () => {
    const p = await store.creaProfilo({ nome: 'Renata', pesoKg: 78 });
    await store.scrivi('diario', { id: `${p.id}:2026-07-28`, profiloId: p.id, kcal: 1680 });
    const f = await store.esportaFascicolo(p.id);

    const importato = await store.importaFascicolo(f, { nuovoNome: 'Renata (dal telefono)' });

    expect(importato.id).not.toBe(p.id);
    expect(await store.profili()).toHaveLength(2);

    // L'originale è intatto e i record importati puntano al nuovo profilo.
    expect(await store.tutti('diario', p.id)).toHaveLength(1);
    const nuovi = await store.tutti('diario', importato.id);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0].kcal).toBe(1680);
    expect(nuovi[0].id).toContain(importato.id);
  });

  it('rifiuta un fascicolo di uno schema futuro', async () => {
    await expect(store.importaFascicolo({ schema: 99, profilo: { id: 'x' } }))
      .rejects.toThrow(/versione più recente/);
  });

  it('rifiuta di esportare un profilo che non esiste', async () => {
    await expect(store.esportaFascicolo('p_inesistente')).rejects.toThrow(/inesistente/);
  });
});

describe('le chiavi riscritte all\'import', () => {
  it('non mutila una chiave che non comincia col profilo', async () => {
    // Le chiavi degli archivi per profilo sono tutte `<profiloId>:<resto>`, ma
    // un fascicolo vecchio o modificato a mano può portarne una di altra forma.
    // Con la sostituzione di sottostringa, `scaffale_p_abcdef` diventava
    // `scaffale_p_<nuovo>cdef`: la chiave di un record estraneo, tagliata a
    // metà, e il record non più raggiungibile da nessuna parte.
    await store.creaProfilo({ id: 'p_ab', nome: 'Prova', pesoKg: 70 });
    const fascicolo = await store.esportaFascicolo('p_ab');
    fascicolo.archivi.piatti = [
      { id: 'scaffale_p_abcdef', profiloId: 'p_ab', nome: 'Pietanza di casa' },
    ];

    const rientrato = await store.importaFascicolo(fascicolo, { nuovoNome: 'Copia' });
    const [riga] = await store.tutti('piatti', rientrato.id);

    expect(riga.nome).toBe('Pietanza di casa');
    expect(riga.id).toBe(`${rientrato.id}:scaffale_p_abcdef`);
    // Il pezzo originale della chiave resta intero: niente `abcdef` orfano.
    expect(riga.id).toContain('p_abcdef');
  });

  it('sulle chiavi normali riscrive solo il prefisso', async () => {
    await store.creaProfilo({ id: 'p_ab', nome: 'Prova', pesoKg: 70 });
    await store.scrivi('piatti', { id: 'p_ab:casa_p_abcdef', profiloId: 'p_ab', nome: 'Mia' });

    const fascicolo = await store.esportaFascicolo('p_ab');
    const rientrato = await store.importaFascicolo(fascicolo, { nuovoNome: 'Copia' });
    const [riga] = await store.tutti('piatti', rientrato.id);

    expect(riga.id).toBe(`${rientrato.id}:casa_p_abcdef`);
  });
});
