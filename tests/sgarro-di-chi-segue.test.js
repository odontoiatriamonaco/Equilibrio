/* Lo sgarro di chi segue il menu' di un altro.
 *
 * Il difetto: la pagina Piano scriveva sempre con `salvaSettimana(profilo.id)`,
 * ma per chi segue la settimana viene RILETTA da `riferimento.id`. Quello che
 * scriveva finiva quindi in un archivio che per lui non veniva mai riaperto, e
 * al primo ricaricamento sgarri e giorni rigidi sparivano senza dire niente. */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { apri, chiudi, creaProfilo, leggi } from '../js/store.js';
import { registraPiattiUtente } from '../js/alimenti.js';
import { vuote } from '../js/preferenze.js';
import { generaSettimana, inizioSettimana, iso, kcalGiorno } from '../js/planner.js';
import { riepilogo as riepilogoEnergia } from '../js/energia.js';
import { salvaSettimana } from '../js/dati.js';
import {
  settimanaPer, salvaSgarriPersonali, salvaRigidiPersonali, caricaPersonalizzazioni,
  recuperaSgarriOrfani,
} from '../js/famiglia.js';
import { elencoSgarri, applicaSgarri } from '../js/sgarro.js';

async function pulisci() {
  await chiudi();
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = r; req.onerror = r; req.onblocked = r;
  });
  await apri();
  registraPiattiUtente([], []);
}

const LUNEDI = new Date('2026-08-17T12:00:00');
const INIZIO = iso(inizioSettimana(LUNEDI));

const RENATA = {
  nome: 'Renata', sesso: 'donna', dataNascita: '1978-01-01',
  altezzaCm: 165, pesoKg: 73, attivita: 'sedentaria', pesoObiettivoKg: 65,
};
const NINA = {
  nome: 'Nina', sesso: 'donna', dataNascita: '2008-04-10',
  altezzaCm: 160, pesoKg: 50, attivita: 'moderata',
};

async function famiglia() {
  const c = await creaProfilo(RENATA);
  const g = await creaProfilo({ ...NINA, seguo: c.id });
  const e = riepilogoEnergia(c, LUNEDI);
  await salvaSettimana(c.id, generaSettimana({
    target: e.fabbisogno.target, floor: e.fabbisogno.floor,
    preferenze: vuote(c.id), mese: 8, seme: 42, inizio: inizioSettimana(LUNEDI),
  }));
  return { c, g: await leggi('profili', g.id) };
}

describe('lo sgarro di chi segue non sparisce al ricaricamento', () => {
  beforeEach(pulisci);

  it('resta dopo aver riletto la settimana derivata', async () => {
    const { g } = await famiglia();
    await salvaSgarriPersonali(g.id, INIZIO, [{
      id: 'x1', giorno: 5, kcal: 850, etichetta: 'Pizza margherita',
      pasto: 'cena', sostituisce: true, modo: 'prima',
    }]);

    // E' esattamente quello che fa la pagina all'apertura.
    const { settimana } = await settimanaPer(g, LUNEDI);
    const suoi = elencoSgarri(settimana);

    expect(suoi).toHaveLength(1);
    expect(suoi[0].etichetta).toBe('Pizza margherita');
    expect(settimana.giorni[5].stato).toBe('sgarro');
    expect(settimana.giorni[5].pasti.cena.every((v) => v.saltato)).toBe(true);
  });

  it('due sgarri nello stesso giorno reggono anche per chi segue', async () => {
    const { g } = await famiglia();
    await salvaSgarriPersonali(g.id, INIZIO, [
      { id: 'a', giorno: 4, kcal: 850, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' },
      { id: 'b', giorno: 4, kcal: 420, etichetta: 'Sfogliatella', pasto: 'spuntino-pomeriggio', sostituisce: false, modo: 'prima' },
    ]);
    const { settimana } = await settimanaPer(g, LUNEDI);

    expect(settimana.giorni[4].sgarri).toHaveLength(2);
    expect(settimana.giorni[4].quota).toBe(Math.round(kcalGiorno(settimana.giorni[4])) + 1270);
  });

  it('lo sgarro di chi cucina NON diventa quello di chi segue', async () => {
    const { c, g } = await famiglia();
    // Renata registra il suo, nella sua settimana.
    const sua = (await settimanaPer(c, LUNEDI)).settimana;
    sua.giorni[3].sgarri = [{ id: 'suo', kcal: 900, etichetta: 'Pizza', pasto: 'cena', sostituisce: true }];
    sua.giorni[3].stato = 'sgarro';
    for (const v of sua.giorni[3].pasti.cena) v.saltato = true;
    await salvaSettimana(c.id, sua);

    const mia = (await settimanaPer(g, LUNEDI)).settimana;
    expect(elencoSgarri(mia)).toHaveLength(0);
    // E la cena di Nina torna nel piatto: lei quella sera cena.
    expect(mia.giorni[3].pasti.cena.some((v) => v.saltato)).toBe(false);
    expect(mia.giorni[3].stato).toBeUndefined();
  });

  it('i giorni rigidi di chi segue sono i suoi', async () => {
    const { g } = await famiglia();
    await salvaRigidiPersonali(g.id, INIZIO, [false, true, false, false, false, false, false]);
    const { settimana } = await settimanaPer(g, LUNEDI);
    expect(settimana.giorni.map((x) => x.rigido))
      .toEqual([false, true, false, false, false, false, false]);
  });

  it('lo strato personale scritto prima continua a leggersi', async () => {
    const { g } = await famiglia();
    const p = await caricaPersonalizzazioni(g.id, INIZIO);
    expect(p.sgarri).toEqual([]);
    expect(p.rigidi).toEqual([]);
    // E gli scambi gia' salvati non vengono persi aggiungendo gli sgarri.
    await salvaSgarriPersonali(g.id, INIZIO, [{ id: 'z', giorno: 0, kcal: 100 }]);
    const dopo = await caricaPersonalizzazioni(g.id, INIZIO);
    expect(dopo.voci).toEqual({});
    expect(dopo.sgarri).toHaveLength(1);
  });
});

describe('il recupero di quelli gia\u0300 persi', () => {
  beforeEach(pulisci);

  it('ripesca gli sgarri scritti nell\u0027archivio sbagliato', async () => {
    const { g } = await famiglia();
    // Il percorso vecchio: la settimana con lo sgarro salvata sotto il PROPRIO id.
    const mia = (await settimanaPer(g, LUNEDI)).settimana;
    const conSgarro = applicaSgarri(mia, [
      { id: 'x', giorno: 5, kcal: 850, etichetta: 'Pizza margherita', pasto: 'cena', sostituisce: true, modo: 'prima' },
      { id: 'y', giorno: 5, kcal: 420, etichetta: 'Sfogliatella riccia', pasto: 'spuntino-pomeriggio', sostituisce: false, modo: 'prima' },
    ]);
    conSgarro.giorni[1].rigido = true;
    await salvaSettimana(g.id, conSgarro);

    // Prima del recupero: persi.
    expect(elencoSgarri((await settimanaPer(g, LUNEDI)).settimana)).toHaveLength(0);

    const esito = await recuperaSgarriOrfani(g, LUNEDI);
    expect(esito.recuperati).toBe(2);

    const dopo = (await settimanaPer(g, LUNEDI)).settimana;
    expect(elencoSgarri(dopo).map((s) => s.etichetta).sort())
      .toEqual(['Pizza margherita', 'Sfogliatella riccia']);
    expect(dopo.giorni[1].rigido).toBe(true);
  });

  it('non risorge uno sgarro cancellato apposta', async () => {
    const { g } = await famiglia();
    const mia = (await settimanaPer(g, LUNEDI)).settimana;
    await salvaSettimana(g.id, applicaSgarri(mia, [
      { id: 'x', giorno: 5, kcal: 850, etichetta: 'Pizza', pasto: 'cena', sostituisce: true, modo: 'prima' },
    ]));

    expect((await recuperaSgarriOrfani(g, LUNEDI)).recuperati).toBe(1);
    // Lo tolgo a mano, come farebbe il cestino.
    await salvaSgarriPersonali(g.id, INIZIO, []);
    // Riapro la pagina: il recupero non deve rifarlo tornare.
    expect((await recuperaSgarriOrfani(g, LUNEDI)).recuperati).toBe(0);
    expect(elencoSgarri((await settimanaPer(g, LUNEDI)).settimana)).toHaveLength(0);
  });

  it('non tocca chi non segue nessuno', async () => {
    const { c } = await famiglia();
    expect((await recuperaSgarriOrfani(c, LUNEDI)).recuperati).toBe(0);
  });
});
