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
 * Quanta parte delle calorie di un piatto puo' sparire prima che il piatto non
 * sia piu' quel piatto. Oltre questa soglia si preferisce non proporlo.
 */
export const OMISSIONE_MAX = 0.4;

/**
 * Quanta parte delle PROTEINE puo' sparire.
 * Serve perche' le calorie da sole non bastano: il polpo porta un terzo delle
 * calorie di «polpo e patate» — olio e patate pesano di piu' — ma ne porta
 * l'ottanta per cento delle proteine. E' quello il piatto.
 */
export const OMISSIONE_PRO_MAX = 0.4;

/** Sotto queste calorie non resta un pasto: resta un piatto vuoto. */
const KCAL_MINIME = 60;

/**
 * Toglie da un piatto gli alimenti che non si vogliono mettere.
 *
 * Non modifica niente in archivio: e' una lente applicata in lettura, quindi
 * rimettere l'alimento fra i graditi lo fa ricomparire dov'era, con i valori
 * che tornano da soli.
 *
 * @returns {{piatto:object|null, motivo?:string}} `piatto` null se togliere
 *          quell'ingrediente snatura il piatto: senza il polpo, «polpo e
 *          patate» non e' un piatto di pesce alleggerito — e' un contorno.
 */
export function applicaOmissioni(p, omessi) {
  if (!omessi?.size) return { piatto: p };

  const dentro = (p.ingredienti || []).filter((i) => omessi.has(i.a));
  if (!dentro.length) return { piatto: p };

  const totali = valoriPiatto(p);
  const somma = (voci, campo) => voci.reduce((s, i) => {
    const a = INDICE.get(i.a);
    return s + (a ? (a.per100g[campo] * i.g) / 100 : 0);
  }, 0);

  const kcalTolte = somma(dentro, 'kcal');
  const proTolte = somma(dentro, 'pro');
  const nomi = dentro.map((i) => INDICE.get(i.a)?.nome?.toLowerCase() || i.a);
  const esse = dentro.length === 1 ? "e'" : 'sono';

  if (totali.kcal > 0 && kcalTolte / totali.kcal > OMISSIONE_MAX) {
    return { piatto: null, motivo: `${nomi.join(' e ')} ${esse} il cuore del piatto` };
  }

  // La prova delle proteine: se sparisce la fonte proteica, non resta un
  // secondo alleggerito — resta un contorno.
  if (totali.pro > 1 && proTolte / totali.pro > OMISSIONE_PRO_MAX) {
    return { piatto: null, motivo: `${nomi.join(' e ')} ${esse} il cuore del piatto` };
  }

  const ingredienti = (p.ingredienti || []).filter((i) => !omessi.has(i.a));
  if (!ingredienti.length) {
    return { piatto: null, motivo: 'non resterebbe nessun ingrediente' };
  }

  const ridotto = { ...p, ingredienti, omessi: nomi };
  if (valoriPiatto(ridotto).kcal < KCAL_MINIME) {
    return { piatto: null, motivo: 'quello che resta non fa un pasto' };
  }

  return { piatto: ridotto };
}

/** I piatti scartati dall'ultima registrazione, col perche'. */
export let piattiScartati = [];

/**
 * Il ricettario come lo vede UNA persona: le sue pietanze di casa innestate,
 * i suoi alimenti sgraditi tolti dai piatti.
 *
 * Pura di proposito, e non tocca `piatti`: a tavola ci sono piu' persone, e per
 * sapere cosa puo' mangiare Nina non si deve sporcare il ricettario in uso di
 * Renata. Il globale qui sotto e' solo il suo primo consumatore.
 *
 * @param {Array} deiUtente pietanze di casa
 * @param {Iterable<string>} idOmessi alimenti da non mettere nei piatti
 * @returns {{piatti:Array, indice:Map, scartati:Array}}
 */
export function lenteRicettario(deiUtente = [], idOmessi = []) {
  const coperti = new Set(deiUtente.map((p) => p.derivatoDa).filter(Boolean));
  const base = [
    ...piattiDiSerie.filter((p) => !coperti.has(p.id)),
    ...deiUtente,
  ];

  const omessi = new Set(idOmessi);
  const buoni = [];
  const scartati = [];

  for (const p of base) {
    const esito = applicaOmissioni(p, omessi);
    if (esito.piatto) buoni.push(esito.piatto);
    else scartati.push({ id: p.id, nome: p.nome, motivo: esito.motivo });
  }

  return { piatti: buoni, indice: new Map(buoni.map((p) => [p.id, p])), scartati };
}

/**
 * Innesta le pietanze di un profilo nel ricettario IN USO e applica le omissioni.
 * Va chiamata all'avvio di ogni pagina, prima di leggere `piatti`.
 *
 * @param {Array} deiUtente pietanze di casa
 * @param {Iterable<string>} idOmessi alimenti da non mettere nei piatti
 */
export function registraPiattiUtente(deiUtente = [], idOmessi = []) {
  const lente = lenteRicettario(deiUtente, idOmessi);
  piatti = lente.piatti;
  piattiScartati = lente.scartati;
  INDICE_PIATTI = lente.indice;
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
  // Il piatto e' arrivato senza un ingrediente: va detto, non nascosto.
  if (piatto.omessi?.length) {
    e.push({ testo: `senza ${piatto.omessi.join(' e ')}`, tono: 'pillola-sgarro' });
  }
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
 * L'ingrediente che fa il piatto: quello che si pesa davvero.
 *
 * Serve a due cose diverse — scegliere l'icona della scheda e dire in una riga
 * quanto riso mettere nel risotto — e la regola e' la stessa, quindi sta scritta
 * una volta sola.
 *
 * @returns {{ing:object, a:object, cereale:boolean}|null} `cereale` dice quale
 *          dei due criteri ha deciso: serve all'icona, che distingue il riso
 *          dalla pasta solo quando e' il cereale a comandare.
 */
export function ingredienteGuida(piatto) {
  const voci = (piatto.ingredienti || [])
    .map((ing) => ({ ing, a: INDICE.get(ing.a) }))
    .filter((v) => v.a);
  if (!voci.length) return null;

  const totale = voci.reduce((s, v) => s + (v.a.per100g.kcal * v.ing.g) / 100, 0);

  // Un cereale che porta almeno un terzo delle calorie fa il piatto: e' una
  // pasta, un riso, una zuppa col pane. Le patate no — stanno nello stesso
  // gruppo ma «polpo e patate» resta un piatto di pesce.
  let cereale = null;
  let kcalCereale = 0;
  for (const v of voci) {
    if (v.a.gruppo !== 'carboidrati' || v.a.id === 'patate') continue;
    const k = (v.a.per100g.kcal * v.ing.g) / 100;
    if (k > kcalCereale) { kcalCereale = k; cereale = v; }
  }
  if (cereale && totale > 0 && kcalCereale / totale >= 0.3) {
    return { ...cereale, cereale: true };
  }

  // Altrimenti comanda la fonte proteica principale.
  let miglior = null;
  let maxPro = -1;
  for (const v of voci) {
    const pro = (v.a.per100g.pro * v.ing.g) / 100;
    if (pro > maxPro) { maxPro = pro; miglior = v; }
  }
  return miglior ? { ...miglior, cereale: false } : null;
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

  const guida = ingredienteGuida(piatto);
  if (!guida) return iconaAlimento(null);
  if (guida.cereale) return guida.a.id.startsWith('riso') ? 'riso' : 'pasta';
  return iconaAlimento(guida.a);
}

/**
 * Le grammature di una voce del piano, gia' moltiplicate per porzioni e
 * commensali. E' quello che serve per cucinare: «0,65 ×» non si pesa.
 */
export function dosiVoce(voce, commensali = 1) {
  const quante = (voce.porzioni ?? 1) * commensali;

  if (voce.tipo === 'alimento') {
    const a = INDICE.get(voce.id);
    return a ? [{ a: voce.id, alimento: a, grammi: Math.round(a.porzione * quante) }] : [];
  }
  const p = INDICE_PIATTI.get(voce.id);
  return p ? ingredientiScalati(p, quante) : [];
}

/**
 * La sola grammatura da mostrare quando ce n'e' spazio per una: l'ingrediente
 * che fa il piatto, gia' scalato.
 */
export function dosePrincipale(voce, commensali = 1) {
  const quante = (voce.porzioni ?? 1) * commensali;

  if (voce.tipo === 'alimento') {
    const a = INDICE.get(voce.id);
    return a ? { alimento: a, grammi: Math.round(a.porzione * quante) } : null;
  }
  const p = INDICE_PIATTI.get(voce.id);
  const guida = p && ingredienteGuida(p);
  return guida ? { alimento: guida.a, grammi: Math.round(guida.ing.g * quante) } : null;
}

/**
 * Quante porzioni valgono i grammi scritti a mano per l'ingrediente guida.
 *
 * 100 g di pasta su una ricetta che ne prevede 40 fanno 2,5 porzioni: il piatto
 * scala tutto, sugo compreso, e resta una puttanesca. Se uno ha fatto il doppio
 * di pasta, il sugo che ci vuole e' di piu' — tenerlo fermo darebbe un piatto
 * che non e' mai esistito.
 *
 * Non si arrotonda a 0,05 come fa il generatore: qui il numero l'ha scritto una
 * persona, e arrotondarlo le restituirebbe grammi diversi da quelli che ha
 * pesato.
 *
 * @returns {number|null} null se il piatto non ha un ingrediente guida
 */
export function porzioniPerGrammi(voce, grammi, commensali = 1) {
  const base = dosePrincipale({ ...voce, porzioni: 1 }, commensali);
  if (!base || !(base.grammi > 0)) return null;
  return Math.max(0, grammi) / base.grammi;
}

export const TIPI = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  'piatto-unico': 'Piatto unico',
};
