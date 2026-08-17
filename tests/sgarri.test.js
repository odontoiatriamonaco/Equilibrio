/* Il catalogo degli sgarri e' un file di dati scritto a mano: gli errori qui non
   danno nessun errore a schermo, mettono solo un numero sbagliato nel bilancio
   della settimana. */

import { describe, it, expect } from 'vitest';
import catalogo from '../data/sgarri.json';

describe('catalogo degli sgarri', () => {
  it('ogni voce ha quello che serve per registrarla', () => {
    for (const s of catalogo.sgarri) {
      expect(s.id, JSON.stringify(s)).toMatch(/^[a-z0-9-]+$/);
      expect(s.nome?.length, s.id).toBeGreaterThan(2);
      expect(Number.isInteger(s.kcal), s.id).toBe(true);
      expect(s.kcal, s.id).toBeGreaterThan(0);
    }
  });

  it('nessun id ripetuto: sceglierne uno ne prenderebbe un altro', () => {
    const visti = catalogo.sgarri.map((s) => s.id);
    expect(visti.filter((v, i) => visti.indexOf(v) !== i)).toEqual([]);
  });

  it('le calorie stanno dentro il loro intervallo', () => {
    for (const s of catalogo.sgarri) {
      const [min, max] = s.intervallo;
      expect(min, s.id).toBeLessThanOrEqual(s.kcal);
      expect(max, s.id).toBeGreaterThanOrEqual(s.kcal);
      expect(min, s.id).toBeLessThan(max);
    }
  });

  it('ogni voce sta in una categoria dichiarata', () => {
    const note = new Set(catalogo.categorie.map((c) => c.id));
    for (const s of catalogo.sgarri) {
      expect(note.has(s.categoria), `${s.id}: categoria «${s.categoria}» non dichiarata`).toBe(true);
    }
  });

  it('nessuna categoria dichiarata resta vuota', () => {
    for (const c of catalogo.categorie) {
      const quante = catalogo.sgarri.filter((s) => s.categoria === c.id).length;
      expect(quante, `la categoria «${c.nome}» non ha voci`).toBeGreaterThan(0);
    }
  });

  it('le pizze ci sono tutte, marinara compresa', () => {
    const pizze = catalogo.sgarri.filter((s) => s.categoria === 'pizzeria').map((s) => s.nome);
    expect(pizze).toContain('Pizza marinara');
    expect(pizze).toContain('Pizza margherita');
    // La marinara e' la piu' leggera del gruppo: se non lo fosse, il numero
    // sarebbe sbagliato.
    const marinara = catalogo.sgarri.find((s) => s.nome === 'Pizza marinara');
    const margherita = catalogo.sgarri.find((s) => s.nome === 'Pizza margherita');
    expect(marinara.kcal).toBeLessThan(margherita.kcal);
  });

  it('il catalogo è abbastanza ricco da non costringere a scrivere a mano', () => {
    expect(catalogo.sgarri.length).toBeGreaterThan(80);
    for (const c of catalogo.categorie) {
      const quante = catalogo.sgarri.filter((s) => s.categoria === c.id).length;
      expect(quante, `«${c.nome}» ha solo ${quante} voci`).toBeGreaterThanOrEqual(8);
    }
  });
});
