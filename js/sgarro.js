/* Equilibrio — il motore dello sgarro.
   Ridistribuisce le calorie in eccesso sui giorni della settimana, dentro
   vincoli che NON si possono aggirare da nessuna impostazione.

   Due modi: dopo l'evento (si e' mangiato, si recupera) e prima dell'evento
   (si dichiara la pizzeria di sabato e si mette il margine da parte).

   Quando il recupero non e' ottenibile, questo modulo NON affama: recupera
   il possibile e restituisce il residuo, che l'app traduce in giorni in piu'
   sul traguardo. Dire la verita' e' una funzione, non una rinuncia. */

import { KCAL_PER_KG } from './energia.js';
import { valoriVoce } from './alimenti.js';
import {
  tutteLeVoci, kcalGiorno, riducibileGiorno, PORZIONE_MIN,
  voceFlessibile as flessibile, arrotondaPorzione,
} from './planner.js';

/**
 * Le calorie che lo sgarro AGGIUNGE davvero alla giornata.
 *
 * Una sfogliatella si somma alla colazione: aggiunge tutte le sue calorie. Una
 * pizza al posto della cena no — quella cena non la mangi, e contarla sarebbe
 * far recuperare all'utente un pasto che non ha fatto. Su una cena da 680 kcal
 * e una pizza da 850, la differenza fra i due modi e' 680 kcal di recupero
 * chiesto per niente.
 *
 * @param {object} giorno il giorno dell'evento
 * @param {number} kcalSgarro quanto pesa lo sgarro
 * @param {string|null} alPostoDi la chiave del pasto sostituito, o null
 */
export function extraNetto(giorno, kcalSgarro, alPostoDi) {
  const lordo = Math.max(0, Math.round(kcalSgarro || 0));
  const voci = alPostoDi && giorno?.pasti?.[alPostoDi];
  if (!voci || !voci.length) return lordo;

  const pasto = voci.reduce((s, v) => s + (v ? valoriVoce(v).kcal : 0), 0);
  // Se lo sgarro pesa MENO del pasto che sostituisce non c'e' niente da
  // recuperare: quel giorno si e' mangiato meno del previsto, e va bene cosi'.
  return Math.max(0, lordo - Math.round(pasto));
}

/** Riduzione massima su un singolo giorno, in frazione del suo target. */
export const TAGLIO_MAX = 0.20;

/** Su quanti giorni si spalma al massimo un recupero. */
export const FINESTRA_MAX = 6;

/** Da dove si taglia: i carboidrati e i grassi. Le proteine restano intere. */
export const QUOTA_CARBO = 0.7;
export const QUOTA_GRASSI = 0.3;

/**
 * Calcola la redistribuzione senza applicarla.
 *
 * @param {{
 *   giorni: Array<{quota:number, rigido?:boolean}>,
 *   target:number, floor:number, extra:number,
 *   indiceEvento:number, modo?:'dopo'|'prima'
 * }} p
 * @returns {{
 *   perGiorno: number[], recuperato:number, residuo:number,
 *   giorniCoinvolti:number, tagliMedio:number,
 *   proteineInvariate:true, carboGrammi:number, grassiGrammi:number,
 *   motivi:string[]
 * }}
 */
export function calcolaRecupero({ giorni, target, floor, extra, indiceEvento, modo = 'dopo' }) {
  const perGiorno = giorni.map(() => 0);
  const motivi = [];

  if (!(extra > 0)) {
    return esito(perGiorno, 0, 0, [], 'Nessun extra da recuperare.');
  }

  // Quali giorni possono farsi carico del recupero.
  const candidati = [];
  for (let i = 0; i < giorni.length; i++) {
    if (i === indiceEvento) continue;
    if (modo === 'dopo' && i < indiceEvento) continue;
    if (modo === 'prima' && i > indiceEvento) continue;
    // Un giorno dichiarato rigido (pranzo fuori, cena dai suoceri) non si
    // comprime: alleggerirlo sulla carta e non nella realta' non serve.
    if (giorni[i].rigido) continue;
    candidati.push(i);
  }

  if (!candidati.length) {
    motivi.push(modo === 'prima'
      ? 'non ci sono giorni liberi prima dell’evento'
      : 'non ci sono giorni liberi dopo l’evento');
    return esito(perGiorno, 0, extra, [], motivi.join('; '));
  }

  const scelti = candidati.slice(0, FINESTRA_MAX);
  if (candidati.length > FINESTRA_MAX) {
    motivi.push(`recupero spalmato sui ${FINESTRA_MAX} giorni più vicini`);
  }

  // Capienza di ogni giorno: il minore fra tre limiti, tutti non negoziabili.
  // Il terzo e' quello che rende il motore onesto — quanto si puo' davvero
  // togliere abbassando le porzioni. Senza, dichiarerebbe tagli che poi non
  // riesce a fare, perche' pane e pasta sono gia' al minimo.
  const capienza = scelti.map((i) => {
    const g = giorni[i];
    const quota = g.quota ?? target;
    const perTetto = target * TAGLIO_MAX;
    const perFloor = Math.max(0, quota - floor);
    const riducibile = riducibileGiorno(g);
    const limiti = [perTetto, perFloor];
    if (riducibile !== null) limiti.push(riducibile);
    return Math.max(0, Math.min(...limiti));
  });

  const totaleCapienza = capienza.reduce((s, c) => s + c, 0);
  if (totaleCapienza <= 0) {
    motivi.push(`i giorni disponibili sono già al minimo di ${Math.round(floor)} kcal`);
    return esito(perGiorno, 0, extra, scelti, motivi.join('; '));
  }

  const daRecuperare = Math.min(extra, totaleCapienza);
  for (let k = 0; k < scelti.length; k++) {
    // Proporzionale alla capienza: i giorni che possono di piu' portano di piu'.
    perGiorno[scelti[k]] = Math.round((capienza[k] / totaleCapienza) * daRecuperare);
  }

  const recuperato = perGiorno.reduce((s, v) => s + v, 0);
  const residuo = Math.max(0, Math.round(extra - recuperato));

  if (residuo > 0) {
    motivi.push(`oltre il recuperabile senza scendere sotto ${Math.round(floor)} kcal`);
  }
  if (extra > totaleCapienza) {
    motivi.push(`il tetto è del ${Math.round(TAGLIO_MAX * 100)}% al giorno`);
  }

  return esito(perGiorno, recuperato, residuo, scelti, motivi.join('; '));
}

function esito(perGiorno, recuperato, residuo, scelti, motivo) {
  const coinvolti = perGiorno.filter((v) => v > 0).length;
  return {
    perGiorno,
    recuperato,
    residuo,
    giorniCoinvolti: coinvolti,
    taglioMedio: coinvolti ? Math.round(recuperato / coinvolti) : 0,
    // Il taglio non tocca mai le proteine: e' cio' che protegge il muscolo
    // durante un deficit. Si toglie da carboidrati e grassi.
    proteineInvariate: true,
    carboGrammi: Math.round((recuperato * QUOTA_CARBO) / 4),
    grassiGrammi: Math.round((recuperato * QUOTA_GRASSI) / 9),
    motivo: motivo || null,
    scelti,
  };
}

/**
 * Di quanti giorni si sposta il traguardo se una parte non si recupera.
 * Questa e' l'alternativa onesta al digiuno compensativo.
 */
export function slittamentoTraguardo(residuo, deficitGiornaliero) {
  if (!(residuo > 0) || !(deficitGiornaliero > 0)) return 0;
  return Math.ceil(residuo / deficitGiornaliero);
}

/** Quanto peso vale, in grammi, un'eccedenza non recuperata. */
export function grammiEquivalenti(residuo) {
  return Math.round((residuo / KCAL_PER_KG) * 1000);
}

/* --- Applicazione al piano ------------------------------------------------- */

/**
 * Applica il recupero alla settimana ritoccando le PORZIONI delle voci
 * flessibili dei giorni coinvolti.
 *
 * Vincolo di progetto: non sostituisce nessun piatto. La lista della spesa
 * gia' fatta resta valida — sarebbe assurdo mandare a buttare il carrello.
 */
export function applicaRecupero(settimana, recupero, {
  extra, indiceEvento, etichettaSgarro, alPostoDi = null,
} = {}) {
  const copia = structuredClone(settimana);

  for (let i = 0; i < copia.giorni.length; i++) {
    const taglio = recupero.perGiorno[i] || 0;
    if (taglio <= 0) continue;
    riduciGiorno(copia.giorni[i], taglio, copia.floor);
    copia.giorni[i].stato = 'recupero';
    copia.giorni[i].recuperoKcal = taglio;
  }

  if (indiceEvento != null && copia.giorni[indiceEvento]) {
    const g = copia.giorni[indiceEvento];

    // Si riparte pulito: registrare due volte sullo stesso giorno non deve
    // lasciare sostituito il pasto di prima.
    for (const voci of Object.values(g.pasti || {})) {
      for (const v of voci) if (v) delete v.saltato;
    }
    if (alPostoDi && g.pasti?.[alPostoDi]) {
      for (const v of g.pasti[alPostoDi]) if (v) v.saltato = true;
    }

    g.stato = 'sgarro';
    g.sgarro = {
      kcal: Math.round(extra || 0),
      etichetta: etichettaSgarro || 'Sgarro',
      quando: recupero.residuo > 0 ? 'parziale' : 'coperto',
      alPostoDi: alPostoDi || null,
    };
    // `kcalGiorno` ora esclude gia' il pasto sostituito: la somma torna da sola.
    g.quota = kcalGiorno(g) + Math.round(extra || 0);
  }

  copia.recupero = {
    recuperato: recupero.recuperato,
    residuo: recupero.residuo,
    motivo: recupero.motivo,
  };
  return copia;
}

/**
 * Toglie `taglio` kcal da un giorno riducendo le porzioni flessibili.
 * Se non basta, riduce quanto puo': il pavimento vince sempre.
 */
function riduciGiorno(giorno, taglio, floor) {
  const voci = tutteLeVoci(giorno).filter(flessibile);
  if (!voci.length) return 0;

  const kcalFlessibili = voci.reduce((s, v) => s + valoriVoce(v).kcal, 0);
  if (kcalFlessibili <= 0) return 0;

  const attuale = kcalGiorno(giorno);
  const bersaglio = Math.max(floor, attuale - taglio);
  const daTogliere = attuale - bersaglio;
  if (daTogliere <= 0) return 0;

  const fattore = Math.max(PORZIONE_MIN, (kcalFlessibili - daTogliere) / kcalFlessibili);
  for (const v of voci) {
    v.porzioni = Math.max(PORZIONE_MIN, arrotondaPorzione(v.porzioni * fattore));
  }
  giorno.quota = kcalGiorno(giorno);
  return daTogliere;
}

/* --- Riepilogo leggibile --------------------------------------------------- */

/**
 * La frase che l'app mostra. Il tono conta: lo sgarro e' una voce di bilancio,
 * non una colpa, e quando il conto non torna si dice com'e' andata.
 */
export function racconta({ recupero, extra, modo, deficitGiornaliero, etichetta }) {
  const nome = etichetta || 'Lo sgarro';
  if (!(extra > 0)) return `${nome} non aggiunge niente al conto della settimana.`;

  if (recupero.recuperato <= 0) {
    const giorni = slittamentoTraguardo(recupero.residuo, deficitGiornaliero);
    return `${nome}: ${Math.round(extra)} kcal in più che non posso redistribuire — `
      + `${recupero.motivo}. Il traguardo si sposta di ${giorni} `
      + `${giorni === 1 ? 'giorno' : 'giorni'}.`;
  }

  const dove = modo === 'prima' ? 'sui giorni precedenti' : 'sui giorni che restano';
  const base = `${nome}: ${Math.round(extra)} kcal, redistribuite ${dove} — `
    + `−${recupero.taglioMedio} kcal al giorno su ${recupero.giorniCoinvolti} `
    + `${recupero.giorniCoinvolti === 1 ? 'giorno' : 'giorni'}.`;

  if (recupero.residuo > 0) {
    const giorni = slittamentoTraguardo(recupero.residuo, deficitGiornaliero);
    const quota = Math.round((recupero.recuperato / extra) * 100);
    return `${base} Recupero il ${quota}%: il resto sposta il traguardo di ${giorni} `
      + `${giorni === 1 ? 'giorno' : 'giorni'}, e va bene così.`;
  }

  return `${base} Le proteine restano intere: il taglio è su pane e condimenti.`;
}
