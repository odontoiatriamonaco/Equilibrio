/* I primi passi. La regola: lo stato si ricava dai dati veri, non da un
   contatore di schermate viste — altrimenti il percorso dice «fatto» a chi non
   ha fatto niente, ed e' peggio che non averlo. */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { apri, chiudi, creaProfilo, leggi, scrivi } from '../js/store.js';
import { registraPiattiUtente } from '../js/alimenti.js';
import { vuote, salvaPreferenze, alternaAllergia } from '../js/preferenze.js';
import { generaSettimana, inizioSettimana, iso } from '../js/planner.js';
import { salvaSettimana, salvaSpesa, salvaScorta } from '../js/dati.js';
import {
  statoPercorso, conSaltato, conChiuso, profiloCompleto, gustiImpostati, PASSI,
} from '../js/percorso.js';

const LUNEDI = new Date('2026-08-17T12:00:00');

const COMPLETO = {
  nome: 'Renata', sesso: 'donna', dataNascita: '1978-01-01',
  altezzaCm: 165, pesoKg: 73, attivita: 'sedentaria', pesoObiettivoKg: 65,
};

async function pulisci() {
  await chiudi();
  await new Promise((r) => {
    const q = indexedDB.deleteDatabase('equilibrio');
    q.onsuccess = r; q.onerror = r; q.onblocked = r;
  });
  await apri();
  registraPiattiUtente([], []);
}

async function menuPer(profiloId) {
  const s = generaSettimana({
    target: 1428, floor: 1360, preferenze: vuote(profiloId),
    mese: 8, seme: 7, inizio: inizioSettimana(LUNEDI),
  });
  await salvaSettimana(profiloId, s);
  return s;
}

describe('a che punto sono', () => {
  beforeEach(pulisci);

  it('un profilo appena creato ha solo il primo passo fatto', async () => {
    const p = await creaProfilo(COMPLETO);
    const s = await statoPercorso(p, LUNEDI);

    expect(s.totale).toBe(5);
    expect(s.fatti).toBe(1);
    expect(s.completo).toBe(false);
    expect(s.prossimo.id).toBe('gusti');
    expect(s.passi.map((x) => x.fatto)).toEqual([true, false, false, false, false]);
  });

  it('un profilo senza misure non ha nemmeno il primo', async () => {
    const p = await creaProfilo({ nome: 'Vuoto' });
    const s = await statoPercorso(p, LUNEDI);
    expect(s.fatti).toBe(0);
    expect(s.prossimo.id).toBe('profilo');
  });

  it('i passi si accendono man mano che le cose vengono fatte davvero', async () => {
    const p = await creaProfilo(COMPLETO);
    expect((await statoPercorso(p, LUNEDI)).fatti).toBe(1);

    await salvaPreferenze(alternaAllergia(vuote(p.id), 'uova'));
    expect((await statoPercorso(p, LUNEDI)).fatti).toBe(2);

    await menuPer(p.id);
    expect((await statoPercorso(p, LUNEDI)).fatti).toBe(3);

    // Basta una cosa segnata: il passo è «ho guardato negli sportelli».
    await salvaScorta(p.id, 'pasta-semola', 500);
    expect((await statoPercorso(p, LUNEDI)).fatti).toBe(4);

    await salvaSpesa(p.id, iso(inizioSettimana(LUNEDI)), []);
    const finale = await statoPercorso(p, LUNEDI);
    expect(finale.fatti).toBe(5);
    expect(finale.completo).toBe(true);
    expect(finale.prossimo).toBeNull();
  });

  it('un passo saltato conta come fatto, ma resta marcato', async () => {
    const p = await creaProfilo(COMPLETO);
    const dopo = conSaltato(p, 'gusti');
    await scrivi('profili', dopo);

    const s = await statoPercorso(await leggi('profili', p.id), LUNEDI);
    const gusti = s.passi.find((x) => x.id === 'gusti');
    expect(gusti.fatto).toBe(true);
    expect(gusti.saltato).toBe(true);
    expect(s.prossimo.id).toBe('settimana');
  });

  it('saltare un passo non ne cancella un altro già saltato', async () => {
    const p = await creaProfilo(COMPLETO);
    const due = conSaltato(conSaltato(p, 'gusti'), 'spesa');
    expect(due.percorso.saltati.sort()).toEqual(['gusti', 'spesa']);
  });

  it('si può chiudere e riaprire senza perdere quello che è stato fatto', async () => {
    const p = await creaProfilo(COMPLETO);
    await salvaPreferenze(alternaAllergia(vuote(p.id), 'uova'));

    const chiuso = conChiuso(p, true);
    expect((await statoPercorso(chiuso, LUNEDI)).chiuso).toBe(true);

    const riaperto = conChiuso(chiuso, false);
    const s = await statoPercorso(riaperto, LUNEDI);
    expect(s.chiuso).toBe(false);
    expect(s.fatti).toBe(2);
  });

  it('la settimana di chi segue è quella di chi decide il menù', async () => {
    // Chiedere a chi segue di generare il menu' sarebbe chiedergli l'impossibile:
    // il pulsante non ce l'ha nemmeno.
    const capo = await creaProfilo(COMPLETO);
    const seguace = await creaProfilo({ ...COMPLETO, nome: 'Nina', seguo: capo.id });
    await menuPer(capo.id);

    const s = await statoPercorso(await leggi('profili', seguace.id), LUNEDI);
    const passo = s.passi.find((x) => x.id === 'settimana');
    expect(passo.fatto).toBe(true);
    expect(passo.perche).toMatch(/famiglia/);
  });

  it('regge un profilo che non esiste, invece di esplodere', async () => {
    const s = await statoPercorso(null, LUNEDI);
    expect(s.fatti).toBe(0);
    expect(s.prossimo.id).toBe('profilo');
  });
});

describe('le singole verifiche', () => {
  it('il profilo è completo solo con quello che serve al calcolo', () => {
    expect(profiloCompleto(COMPLETO)).toBe(true);
    expect(profiloCompleto({ ...COMPLETO, pesoKg: null })).toBe(false);
    expect(profiloCompleto({ ...COMPLETO, dataNascita: '' })).toBe(false);
    expect(profiloCompleto(null)).toBe(false);
  });

  it('i gusti contano in tutte e tre le forme', () => {
    expect(gustiImpostati(vuote('p'))).toBe(false);
    expect(gustiImpostati({ ...vuote('p'), piatti: { genovese: 'amato' } })).toBe(true);
    expect(gustiImpostati({ ...vuote('p'), alimenti: { miele: 'omesso' } })).toBe(true);
    expect(gustiImpostati(alternaAllergia(vuote('p'), 'uova'))).toBe(true);
  });

  it('ogni passo sa dove mandare e perché', () => {
    for (const p of PASSI) {
      expect(p.dove, p.id).toMatch(/^\/\w+\.html$/);
      expect(p.titolo.length, p.id).toBeGreaterThan(0);
      expect(p.perche.length, p.id).toBeGreaterThan(20);
    }
  });
});
