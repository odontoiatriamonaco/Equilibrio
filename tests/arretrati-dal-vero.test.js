/* Il giro completo: salva settimane, rileggile, conta gli arretrati.
 *
 * `arretrati()` è puro e i suoi test passavano tutti — mentre in pagina la
 * sezione restava sempre vuota. `tutteLeSettimane()` tornava le RIGHE
 * d'archivio, non le settimane, e il residuo stava un livello più sotto:
 * `undefined > 0` è falso, quindi il filtro scartava tutto in silenzio.
 * Nessun test poteva vederlo, perché nessuno faceva il giro intero. Questo
 * lo fa. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { arretrati } from '../js/arretrati.js';

let store;
let dati;

beforeEach(async () => {
  if (store) await store.chiudi();
  await new Promise((ok) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = req.onerror = req.onblocked = ok;
  });
  vi.resetModules();
  store = await import('../js/store.js');
  dati = await import('../js/dati.js');
});

/** Una settimana come la salva l'app, ridotta all'osso. */
function settimana(inizio, residuo) {
  return {
    inizio,
    target: 1500,
    floor: 1360,
    giorni: [],
    recupero: residuo > 0 ? { recuperato: 400, residuo, motivo: 'oltre il recuperabile' } : undefined,
  };
}

describe('dal disco al conto', () => {
  it('ritrova i residui delle settimane salvate', async () => {
    const p = await store.creaProfilo({ nome: 'Prova', pesoKg: 70, altezzaCm: 165 });
    await dati.salvaSettimana(p.id, settimana('2026-08-24', 240));
    await dati.salvaSettimana(p.id, settimana('2026-08-17', 120));
    await dati.salvaSettimana(p.id, settimana('2026-08-10', 0));

    const tutte = await dati.tutteLeSettimane(p.id);
    // Settimane, non righe d'archivio: chi legge deve trovare `recupero` qui.
    expect(tutte).toHaveLength(3);
    expect(tutte[0].inizio).toBe('2026-08-24');
    expect(tutte[0].recupero.residuo).toBe(240);

    const conto = arretrati(tutte, {
      deficitGiornaliero: 300,
      oggi: new Date('2026-08-29T12:00:00'),
    });
    expect(conto.totale).toBe(360);
    expect(conto.quante).toBe(2);
    expect(conto.giorni).toBe(2);
  });

  it('non mescola i profili: gli sgarri di uno non finiscono nel conto dell’altro', async () => {
    const a = await store.creaProfilo({ nome: 'A', pesoKg: 70, altezzaCm: 165 });
    const b = await store.creaProfilo({ nome: 'B', pesoKg: 80, altezzaCm: 180 });
    await dati.salvaSettimana(a.id, settimana('2026-08-24', 500));
    await dati.salvaSettimana(b.id, settimana('2026-08-24', 999));

    const suo = arretrati(await dati.tutteLeSettimane(a.id), { deficitGiornaliero: 300 });
    expect(suo.totale).toBe(500);
  });

  it('senza nessuna settimana il conto è zero, non un errore', async () => {
    const p = await store.creaProfilo({ nome: 'Vuoto', pesoKg: 70, altezzaCm: 165 });
    const conto = arretrati(await dati.tutteLeSettimane(p.id), { deficitGiornaliero: 300 });
    expect(conto.totale).toBe(0);
  });
});
