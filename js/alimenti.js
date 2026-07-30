/* Equilibrio — alimenti e piatti.
   Il ricettario non contiene valori nutrizionali: si calcolano qui, sommando
   gli ingredienti. Cosi' correggere un alimento corregge tutti i piatti che
   lo usano, invece di lasciare in giro numeri copiati a mano. */

import datiAlimenti from '../data/alimenti.json';
import datiPiatti from '../data/piatti.json';
import datiGruppi from '../data/gruppi.json';

const INDICE = new Map(datiAlimenti.alimenti.map((a) => [a.id, a]));

export const alimenti = datiAlimenti.alimenti;
export const gruppi = datiGruppi;

/** Il ricettario di serie: non si tocca, arriva con gli aggiornamenti dell'app. */
export const piattiDiSerie = datiPiatti.piatti;

/**
 * Il ricettario in uso: quello di serie piu' le pietanze di casa, con le
 * varianti che coprono l'originale da cui nascono.
 *
 * E' `let` di proposito: i moduli che fanno `import { piatti }` vedono il
 * legame vivo, quindi registrare le pietanze dell'utente aggiorna tutti —
 * generatore, scambi, spesa — senza passare il ricettario di mano in mano.
 */
export let piatti = datiPiatti.piatti;

let INDICE_PIATTI = new Map(piatti.map((p) => [p.id, p]));

/**
 * Innesta le pietanze di un profilo nel ricettario.
 * Va chiamata all'avvio di ogni pagina, prima di leggere `piatti`.
 */
export function registraPiattiUtente(deiUtente = []) {
  const coperti = new Set(deiUtente.map((p) => p.derivatoDa).filter(Boolean));
  piatti = [
    ...piattiDiSerie.filter((p) => !coperti.has(p.id)),
    ...deiUtente,
  ];
  INDICE_PIATTI = new Map(piatti.map((p) => [p.id, p]));
  return piatti;
}

export function piatto(id) {
  return INDICE_PIATTI.get(id) || null;
}

export function alimento(id) {
  return INDICE.get(id) || null;
}

export function gruppoDi(id) {
  return datiGruppi.gruppi.find((g) => g.id === id) || null;
}

export function reparto(id) {
  return datiGruppi.reparti.find((r) => r.id === id) || null;
}

const VUOTO = { kcal: 0, pro: 0, car: 0, gra: 0, fib: 0, sod: 0 };

/**
 * Valori nutrizionali di un piatto.
 * @param {object} piatto
 * @param {number} porzioni quante porzioni (le dosi del ricettario sono per una)
 * @returns {{kcal:number, pro:number, car:number, gra:number, fib:number, sod:number, mancanti:string[]}}
 */
export function valoriPiatto(piatto, porzioni = 1) {
  const somma = { ...VUOTO };
  const mancanti = [];

  for (const ing of piatto.ingredienti || []) {
    const a = INDICE.get(ing.a);
    if (!a) {
      // Un ingrediente sconosciuto non deve mai passare per zero calorie in
      // silenzio: viene dichiarato, cosi' l'interfaccia puo' avvisare.
      mancanti.push(ing.a);
      continue;
    }
    const fattore = (ing.g * porzioni) / 100;
    for (const k of Object.keys(VUOTO)) somma[k] += (a.per100g[k] || 0) * fattore;
  }

  for (const k of Object.keys(somma)) somma[k] = arrotonda(somma[k], k === 'kcal' || k === 'sod' ? 0 : 1);
  somma.mancanti = mancanti;
  return somma;
}

function arrotonda(v, decimali) {
  const p = 10 ** decimali;
  return Math.round(v * p) / p;
}

/**
 * Valori di una voce del piano, che puo' essere un piatto o un alimento
 * singolo (il pane della cena, la frutta dello spuntino).
 * @param {{tipo:'piatto'|'alimento', id:string, porzioni:number}} voce
 */
export function valoriVoce(voce, commensali = 1) {
  const p = voce.porzioni ?? 1;
  if (voce.tipo === 'alimento') {
    const a = INDICE.get(voce.id);
    if (!a) return { ...VUOTO, mancanti: [voce.id] };
    const fattore = (a.porzione * p * commensali) / 100;
    const out = { mancanti: [] };
    for (const k of Object.keys(VUOTO)) {
      out[k] = arrotonda((a.per100g[k] || 0) * fattore, k === 'kcal' || k === 'sod' ? 0 : 1);
    }
    return out;
  }
  const trovato = INDICE_PIATTI.get(voce.id);
  if (!trovato) return { ...VUOTO, mancanti: [voce.id] };
  return valoriPiatto(trovato, p * commensali);
}

/** Il piatto o l'alimento a cui punta una voce del piano. */
export function vociOggetto(voce) {
  return voce.tipo === 'alimento'
    ? INDICE.get(voce.id) || null
    : INDICE_PIATTI.get(voce.id) || null;
}

export function nomeVoce(voce) {
  return vociOggetto(voce)?.nome || voce.id;
}

/** Ingredienti con le quantita' gia' moltiplicate per i commensali. */
export function ingredientiScalati(piatto, porzioni = 1) {
  return (piatto.ingredienti || []).map((ing) => ({
    ...ing,
    alimento: INDICE.get(ing.a) || null,
    grammi: Math.round(ing.g * porzioni),
  }));
}

/**
 * Il piatto e' di stagione nel mese dato (1-12)?
 * Vale la stagione dichiarata dal piatto; in mancanza, quella dei suoi
 * ingredienti: se anche uno solo e' fuori stagione, il piatto lo e'.
 */
export function diStagione(piatto, mese) {
  if (Array.isArray(piatto.stagione)) return piatto.stagione.includes(mese);

  const cal = datiGruppi.stagionalita;
  for (const ing of piatto.ingredienti || []) {
    const mesi = cal[ing.a];
    if (Array.isArray(mesi) && !mesi.includes(mese)) return false;
  }
  return true;
}

/** Etichette brevi per la scheda del piatto: «35 min», «di stagione»… */
export function etichette(piatto, mese = new Date().getMonth() + 1) {
  const e = [];
  if (piatto.tempo) e.push({ testo: `${piatto.tempo} min`, tono: '' });
  if (piatto.origine === 'casa') e.push({ testo: 'Piatto di casa', tono: 'pillola-accento' });
  if (Array.isArray(piatto.stagione)) {
    e.push(diStagione(piatto, mese)
      ? { testo: 'Di stagione', tono: 'pillola-verde' }
      : { testo: 'Fuori stagione', tono: '' });
  }
  if (piatto.avanzabile) e.push({ testo: 'Buono il giorno dopo', tono: '' });
  if (piatto.alleggerimento) e.push({ testo: 'Alleggerito', tono: 'pillola-dato' });
  return e;
}

const PER_GRUPPO = {
  carboidrati: 'pasta', legumi: 'legumi', 'proteine-magre': 'pesce',
  'proteine-rosse': 'carne', latticini: 'latticini', uova: 'uovo',
  verdura: 'verdura', frutta: 'ortofrutta', grassi: 'olio',
  dolci: 'dolce', bevande: 'bevande',
};

function iconaAlimento(a) {
  if (!a) return 'piano';
  // Il gruppo non distingue il pollo dal pesce: il banco del supermercato si.
  if (a.reparto === 'banco-pesce') return 'pesce';
  if (a.reparto === 'banco-carne') return 'carne';
  return PER_GRUPPO[a.gruppo] || 'piano';
}

/**
 * Icona da mostrare sulla scheda del piatto.
 * Si puo' forzare con il campo `icona` sul piatto, quando la deduzione non
 * rende l'idea (la parmigiana e' un piatto di melanzane, non di mozzarella).
 */
export function iconaPiatto(piatto) {
  if (piatto.icona) return piatto.icona;
  if (piatto.tipo === 'colazione') return 'caffe';
  if (piatto.tipo === 'spuntino') return 'ortofrutta';
  if (piatto.tipo === 'contorno') return 'verdura';

  const voci = (piatto.ingredienti || [])
    .map((ing) => ({ ing, a: INDICE.get(ing.a) }))
    .filter((v) => v.a);

  const totale = voci.reduce((s, v) => s + (v.a.per100g.kcal * v.ing.g) / 100, 0);

  // Un cereale che porta almeno un terzo delle calorie fa il piatto: e' una
  // pasta, un riso, una zuppa col pane. Le patate no — stanno nello stesso
  // gruppo ma «polpo e patate» resta un piatto di pesce.
  let cereale = null;
  let kcalCereale = 0;
  for (const v of voci) {
    if (v.a.gruppo !== 'carboidrati' || v.a.id === 'patate') continue;
    const k = (v.a.per100g.kcal * v.ing.g) / 100;
    if (k > kcalCereale) { kcalCereale = k; cereale = v.a; }
  }
  if (cereale && totale > 0 && kcalCereale / totale >= 0.3) {
    return cereale.id.startsWith('riso') ? 'riso' : 'pasta';
  }

  // Altrimenti comanda la fonte proteica principale.
  let miglior = null;
  let maxPro = -1;
  for (const v of voci) {
    const pro = (v.a.per100g.pro * v.ing.g) / 100;
    if (pro > maxPro) { maxPro = pro; miglior = v.a; }
  }
  return iconaAlimento(miglior);
}

export const TIPI = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  'piatto-unico': 'Piatto unico',
};
