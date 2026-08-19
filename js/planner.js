/* Equilibrio — generatore della settimana.
   Sceglie i piatti a vincoli (gusti, stagione, varieta', tetti settimanali) e
   poi calibra le porzioni sul target. Modulo puro: nessun DOM, nessuno store.

   Non e' un risolutore: e' una scelta pesata con riparazione. Basta, perche'
   il problema non chiede l'ottimo — chiede una settimana che si possa cucinare. */

import { piatti as tuttiPiatti, gruppi, valoriVoce, alimento } from './alimenti.js';
import { diStagione } from './alimenti.js';
import { peso as pesoPreferenza, ammesso } from './preferenze.js';
import { generatore, pescaPesato, semeDaTesto } from './casuale.js';

/** Un piatto non deve ripresentarsi entro questi giorni. */
export const GIORNI_VARIETA = 4;

/** Quanto si possono ritoccare le porzioni per centrare il target. */
export const PORZIONE_MIN = 0.6;
export const PORZIONE_MAX = 1.5;

/** Quanto si accetta di sforare il bersaglio prima di toccare anche i secondi. */
export const TOLLERANZA = 0.06;

/** Fin dove si puo' scendere nel secondo passo, sull'intero piatto del giorno. */
export const PORZIONE_SECONDO_MIN = 0.7;

/**
 * Il minimo assoluto di una porzione, dopo entrambi i passi.
 * Sotto questo la porzione diventa irrisoria e il piatto perde senso: meglio
 * che il generatore scelga piatti piu' leggeri che servire due cucchiai di pasta.
 */
export const PORZIONE_ASSOLUTA_MIN = 0.4;

export const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Le voci che si possono ritoccare sono i carboidrati, non il pesce. */
const TIPI_FLESSIBILI = new Set(['primo', 'piatto-unico', 'colazione', 'spuntino']);

/* --- Tetti settimanali ----------------------------------------------------- */

const CATEGORIE = Object.entries(gruppi.categorieTetti || {})
  .filter(([k]) => k !== 'commento')
  .map(([categoria, ids]) => [categoria, new Set(ids)]);

/** A quali tetti tocca un piatto (puo' toccarne piu' di uno). */
export function categorieDi(piatto) {
  const trovate = new Set();
  for (const ing of piatto.ingredienti || []) {
    for (const [categoria, ids] of CATEGORIE) {
      if (ids.has(ing.a)) trovate.add(categoria);
    }
  }
  return trovate;
}

/* --- Composizione dei pasti ------------------------------------------------ */

/**
 * Come e' fatto un pranzo o una cena. Due schemi, entrambi mediterranei:
 * il piatto unico (pasta e fagioli e un contorno) o la sequenza classica.
 */
function schemaPasto(pasto, rnd) {
  const unico = rnd() < (pasto === 'pranzo' ? 0.45 : 0.4);
  if (unico) return [{ tipo: 'piatto-unico' }, { tipo: 'contorno' }];
  if (pasto === 'pranzo') {
    return [{ tipo: 'primo' }, { tipo: 'secondo' }, { tipo: 'contorno' }];
  }
  // La cena senza primo resterebbe scarica di carboidrati: entra il pane.
  return [{ tipo: 'secondo' }, { tipo: 'contorno' }, { alimento: 'pane' }];
}

/* --- Generazione ----------------------------------------------------------- */

/**
 * @param {{
 *   target:number, floor:number, preferenze:object, mese?:number, seme?:number|string,
 *   rigidi?:boolean[], commensali?:number, piatti?:Array, inizio?:Date
 * }} opzioni
 */
export function generaSettimana(opzioni) {
  const {
    target, floor, preferenze, mese = new Date().getMonth() + 1,
    seme = Date.now(), rigidi = [], commensali = 1,
    piatti = tuttiPiatti, inizio = inizioSettimana(new Date()),
    vincoli = {},
  } = opzioni;

  const semeNum = typeof seme === 'string' ? semeDaTesto(seme) : seme >>> 0;
  const rnd = generatore(semeNum);

  const disponibili = piatti.filter((p) => ammesso(preferenze, p));
  const usati = new Map();          // piattoId -> ultimo giorno in cui e' comparso
  const conteggi = new Map();       // categoria -> volte nella settimana

  // I tetti di salute vincono su quelli scelti a mano, e solo se sono piu'
  // stretti: una condizione dichiarata non deve poter allargare niente.
  const tetti = { ...(preferenze?.tetti || {}) };
  for (const [cat, volte] of Object.entries(vincoli.tetti || {})) {
    tetti[cat] = Math.min(tetti[cat] ?? Infinity, volte);
  }

  const giorni = [];
  for (let g = 0; g < 7; g++) {
    const data = new Date(inizio);
    data.setDate(data.getDate() + g);

    const pasti = {
      colazione: [scegli({ tipo: 'colazione' }, g, { disponibili, usati, conteggi, tetti, preferenze, mese, rnd, vincoli })],
      'spuntino-mattina': [scegli({ tipo: 'spuntino' }, g, { disponibili, usati, conteggi, tetti, preferenze, mese, rnd, vincoli })],
      pranzo: [],
      'spuntino-pomeriggio': [scegli({ tipo: 'spuntino' }, g, { disponibili, usati, conteggi, tetti, preferenze, mese, rnd, vincoli })],
      cena: [],
    };

    for (const pasto of ['pranzo', 'cena']) {
      for (const slot of schemaPasto(pasto, rnd)) {
        const voce = slot.alimento
          ? { tipo: 'alimento', id: slot.alimento, porzioni: 1 }
          : scegli(slot, g, { disponibili, usati, conteggi, tetti, preferenze, mese, rnd, vincoli });
        if (voce) pasti[pasto].push(voce);
      }
    }

    giorni.push({
      data: iso(data),
      etichetta: GIORNI[g],
      rigido: Boolean(rigidi[g]),
      pasti,
    });
  }

  const settimana = {
    inizio: iso(inizio),
    seme: semeNum,
    target,
    floor,
    commensali,
    giorni,
  };

  calibra(settimana, target, floor);
  return settimana;
}

function scegli(slot, giorno, ctx) {
  const { disponibili, usati, conteggi, tetti, preferenze, mese, rnd, vincoli } = ctx;
  const candidati = disponibili.filter((p) => p.tipo === slot.tipo);
  if (!candidati.length) return null;

  // Tre giri, allentando un vincolo alla volta. Meglio un piatto ripetuto che
  // un buco nel piano: un pasto vuoto non si puo' cucinare.
  for (const severita of ['piena', 'senzaVarieta', 'minima']) {
    const ammessi = [];
    const pesi = [];

    for (const p of candidati) {
      if (severita !== 'minima' && sforaTetto(p, conteggi, tetti)) continue;
      if (severita === 'piena') {
        const ultimo = usati.get(p.id);
        if (ultimo !== undefined && giorno - ultimo < GIORNI_VARIETA) continue;
      }

      let w = pesoPreferenza(preferenze, p);
      if (w <= 0) continue;
      // Fuori stagione non si esclude: si rende improbabile. Le pesche a
      // gennaio esistono, ma non e' quello che si vuole vedere nel piano.
      if (!diStagione(p, mese)) w *= 0.15;
      // Col tetto al sodio i piatti molto salati non spariscono — sarebbe una
      // dieta triste — ma diventano rari, come il fuori stagione. Il sodio e'
      // l'unico valore «clinico» che il ricettario conosce su tutti gli alimenti.
      w *= pesoSodio(p, vincoli?.sodioMax);
      w *= pesoFibra(p, vincoli?.fibraMin);
      ammessi.push(p);
      pesi.push(w);
    }

    const scelto = pescaPesato(ammessi, pesi, rnd);
    if (scelto) {
      usati.set(scelto.id, giorno);
      for (const c of categorieDi(scelto)) {
        conteggi.set(c, (conteggi.get(c) || 0) + 1);
      }
      return { tipo: 'piatto', id: scelto.id, porzioni: 1 };
    }
  }
  return null;
}

/**
 * Quanto un piatto va reso improbabile per via del sodio.
 *
 * Un giorno ha cinque momenti: un piatto che da solo copre piu' di un quinto
 * del tetto giornaliero e' «salato» per questo piano. Sopra quella soglia il
 * peso cala in proporzione, senza mai azzerarsi — escludere del tutto
 * lascerebbe fuori mezzo ricettario e la dieta non si seguirebbe.
 */
function pesoSodio(piatto, sodioMax) {
  if (!sodioMax) return 1;
  const sod = valoriVoce({ tipo: 'piatto', id: piatto.id, porzioni: 1 }).sod
    ?? sodioDi(piatto);
  const quota = sodioMax / 5;
  if (sod <= quota) return 1;
  return Math.max(0.1, quota / sod);
}

/**
 * Quanto favorire un piatto per la fibra che porta.
 *
 * Al contrario del sodio qui non si penalizza: si preferisce. Cinque momenti al
 * giorno, quindi un piatto che porta un quinto del bersaglio e' gia' «buono» e
 * non guadagna nulla; sotto, il peso cala un poco. Nessuno viene escluso —
 * anche un secondo di pesce senza fibra deve poter entrare nel menu'.
 */
function pesoFibra(piatto, fibraMin) {
  if (!fibraMin) return 1;
  const fib = valoriVoce({ tipo: 'piatto', id: piatto.id, porzioni: 1 }).fib || 0;
  const quota = fibraMin / 5;
  if (fib >= quota) return 1.6;
  return Math.max(0.5, 0.5 + (fib / quota));
}

/** Il sodio di un piatto, sommato dagli ingredienti come tutto il resto. */
function sodioDi(piatto) {
  return (piatto.ingredienti || []).reduce((s, ing) => {
    const a = alimento(ing.a);
    return s + (a ? (a.per100g.sod * ing.g) / 100 : 0);
  }, 0);
}

function sforaTetto(piatto, conteggi, tetti) {
  for (const c of categorieDi(piatto)) {
    const tetto = tetti[c];
    if (tetto === undefined) continue;
    if ((conteggi.get(c) || 0) >= tetto) return true;
  }
  return false;
}

/* --- Calibrazione delle porzioni ------------------------------------------- */

/**
 * Porta ogni giorno vicino al target ritoccando SOLO le voci flessibili —
 * pasta, pane, colazione, frutta — e lasciando intatti secondi e contorni.
 * Non si scende mai sotto il pavimento calorico.
 */
export function calibra(settimana, target, floor) {
  const bersaglio = Math.max(target, floor);

  for (const giorno of settimana.giorni) {
    const voci = tutteLeVoci(giorno);
    const flessibili = voci.filter(eFlessibile);
    const fisse = voci.filter((v) => !eFlessibile(v));

    // Primo passo: si ritoccano solo i carboidrati. E' il taglio giusto —
    // meno pane e meno pasta, non meno pesce.
    const kcalFisse = fisse.reduce((s, v) => s + valoriVoce({ ...v, porzioni: 1 }).kcal, 0);
    const kcalFless = flessibili.reduce((s, v) => s + valoriVoce({ ...v, porzioni: 1 }).kcal, 0);

    let fattore = kcalFless > 0 ? (bersaglio - kcalFisse) / kcalFless : 1;
    fattore = Math.min(PORZIONE_MAX, Math.max(PORZIONE_MIN, fattore));

    for (const v of flessibili) v.porzioni = arrotondaPorzione(fattore);
    for (const v of fisse) v.porzioni = 1;

    // Secondo passo. Se anche coi carboidrati al minimo il giorno resta molto
    // sopra il bersaglio, si riduce tutto un poco — anche secondi e contorni.
    // Preferire i carboidrati e' una priorita', non un dogma: lasciare un
    // giorno al 30% sopra il target sarebbe peggio che alleggerire il pesce.
    const attuale = kcalGiorno(giorno);
    if (attuale > bersaglio * (1 + TOLLERANZA)) {
      const secondo = Math.max(PORZIONE_SECONDO_MIN, bersaglio / attuale);
      for (const v of voci) {
        v.porzioni = Math.max(PORZIONE_ASSOLUTA_MIN, arrotondaPorzione(v.porzioni * secondo));
      }
    } else if (attuale < bersaglio * (1 - TOLLERANZA)) {
      const secondo = Math.min(1 / PORZIONE_SECONDO_MIN, bersaglio / attuale);
      for (const v of voci) {
        v.porzioni = Math.min(PORZIONE_MAX, arrotondaPorzione(v.porzioni * secondo));
      }
    }

    // Terzo passo: il pavimento non ha tolleranza.
    //
    // Il bersaglio il 6% se lo puo' permettere — e' un obiettivo, e giornate
    // tutte identiche non sono cibo, sono contabilita'. Il PAVIMENTO no: e' un
    // vincolo di sicurezza, e la stessa banda applicata verso il basso lo
    // spostava di fatto a floor x 0,94. Misurato su 6720 giornate prima di
    // questa riga: il 13,2% finiva sotto, fino a 59 kcal, e quasi sempre con
    // margine da vendere — il giorno poteva arrivare al doppio del pavimento,
    // ma la calibrazione si fermava perche' era «abbastanza vicino».
    alzaSopraIlPavimento(giorno, voci, flessibili, floor);

    giorno.quota = kcalGiorno(giorno);
  }
  return settimana;
}

/**
 * Riporta la giornata almeno al pavimento calorico.
 *
 * Prima una scalata proporzionale, poi la rifinitura: l'arrotondamento a 0,05
 * puo' lasciare scoperte poche kcal, e si sale di un passo alla volta girando
 * fra le voci flessibili — pane, pasta, colazione, frutta — invece di gonfiare
 * il pesce. Quando anche tutto al massimo non basta il giorno resta sotto: li'
 * il problema non e' la calibrazione, sono le pietanze scelte, e forzarle
 * oltre PORZIONE_MAX darebbe un piatto che nessuno mangia.
 */
function alzaSopraIlPavimento(giorno, voci, flessibili, floor) {
  if (!(floor > 0)) return;

  let ora = kcalGiorno(giorno);
  if (ora >= floor || !(ora > 0)) return;

  const su = floor / ora;
  for (const v of voci) {
    v.porzioni = Math.min(PORZIONE_MAX, arrotondaPorzione(v.porzioni * su));
  }

  const salibili = flessibili.length ? flessibili : voci;
  for (let giro = 0; giro < 200 && kcalGiorno(giorno) < floor; giro += 1) {
    const spazio = salibili.filter((v) => v.porzioni < PORZIONE_MAX);
    if (!spazio.length) return;
    const v = spazio[giro % spazio.length];
    v.porzioni = Math.min(PORZIONE_MAX, arrotondaPorzione(v.porzioni + 0.05));
  }
}

function eFlessibile(voce) {
  if (voce.tipo === 'alimento') {
    return alimento(voce.id)?.gruppo === 'carboidrati';
  }
  const p = tuttiPiatti.find((x) => x.id === voce.id);
  return p ? TIPI_FLESSIBILI.has(p.tipo) : false;
}

/** Porzioni a passi di 0,05: piu' fine di cosi' e' finta precisione. */
export function arrotondaPorzione(f) {
  return Math.round(f * 20) / 20;
}

/* --- Letture --------------------------------------------------------------- */

export function tutteLeVoci(giorno) {
  return Object.values(giorno.pasti || {}).flat().filter(Boolean);
}

export { eFlessibile as voceFlessibile };

/**
 * Quante kcal si possono ancora togliere a un giorno abbassando le porzioni
 * flessibili fino al minimo consentito.
 *
 * Serve al motore dello sgarro: senza questo dato dichiarerebbe tagli che poi
 * non riesce a fare, perche' pane e pasta sono gia' al minimo.
 */
export function riducibileGiorno(giorno) {
  if (!giorno.pasti) return null;
  return Math.round(tutteLeVoci(giorno)
    .filter(eFlessibile)
    .reduce((s, v) => {
      const ora = valoriVoce(v).kcal;
      const alMinimo = valoriVoce({ ...v, porzioni: PORZIONE_MIN }).kcal;
      return s + Math.max(0, ora - alMinimo);
    }, 0));
}

/* --- Riequilibrio di una giornata sola --------------------------------------
   Quando una quantita' la decide una persona — «di pasta ne ho fatti 100 g,
   non 40» — il resto della giornata deve riassestarsi da solo.

   `calibra` non serve a questo e non si tocca: rifa' la settimana da zero
   assumendo tutte le porzioni a 1, riscrive ogni voce senza eccezioni e passa
   una seconda volta su tutte, disfacendo qualunque esclusione. Qui invece
   quello che e' gia' stato deciso o gia' mangiato deve restare fermo.
   -------------------------------------------------------------------------- */

/** Le voci di un giorno, con la chiave «pasto|indice» usata dal diario. */
export function vociConChiave(giorno) {
  const fuori = [];
  for (const [pasto, voci] of Object.entries(giorno.pasti || {})) {
    (voci || []).forEach((voce, i) => {
      if (voce) fuori.push({ chiave: `${pasto}|${i}`, pasto, indice: i, voce });
    });
  }
  return fuori;
}

/**
 * Riporta una giornata sul bersaglio muovendo solo le voci ancora in gioco.
 *
 * NON applica niente: restituisce le porzioni nuove, cosi' l'anteprima e la
 * conferma girano sullo stesso identico calcolo e non possono divergere.
 *
 * @param {object} giorno
 * @param {number} bersaglio  kcal a cui portare la giornata
 * @param {{ferme?:Set<string>, floor?:number}} opzioni  `ferme` sono chiavi
 *        «pasto|indice» intoccabili: gia' mangiate, o decise a mano
 * @returns {{porzioni:Array<{chiave:string, da:number, a:number}>,
 *           kcalPrima:number, kcalDopo:number, residuo:number, alLimite:boolean}}
 *          `residuo` positivo = la giornata non riassorbe tutto; negativo =
 *          avanza margine.
 */
export function ribilanciaGiorno(giorno, bersaglio, { ferme = new Set(), floor = 0 } = {}) {
  const limite = Math.max(bersaglio, floor);
  const kcalPrima = kcalGiorno(giorno);

  const tutte = vociConChiave(giorno);
  const mobili = tutte.filter((x) => eFlessibile(x.voce) && !ferme.has(x.chiave));
  const chiaviMobili = new Set(mobili.map((x) => x.chiave));

  const kcalFerme = tutte
    .filter((x) => !chiaviMobili.has(x.chiave))
    .reduce((s, x) => s + valoriVoce(x.voce).kcal, 0);
  const kcalMobili = mobili.reduce((s, x) => s + valoriVoce(x.voce).kcal, 0);

  // Niente da muovere: la giornata e' quella che e', e va detto invece di
  // fingere un riequilibrio.
  if (!mobili.length || kcalMobili <= 0) {
    return {
      porzioni: [],
      kcalPrima,
      kcalDopo: kcalPrima,
      residuo: Math.round(kcalPrima - limite),
      alLimite: true,
    };
  }

  const fattore = (limite - kcalFerme) / kcalMobili;

  // Primo passo: si ritoccano solo i carboidrati. Ogni voce parte dalla PROPRIA
  // porzione, non da 1 — e' la differenza che rende utile questa funzione dopo
  // una modifica a mano.
  const nuove = new Map(mobili.map((x) => [
    x.chiave,
    Math.min(PORZIONE_MAX, Math.max(PORZIONE_MIN, arrotondaPorzione((x.voce.porzioni ?? 1) * fattore))),
  ]));

  const conta = () => Math.round(tutte.reduce(
    (s, x) => s + valoriVoce({ ...x.voce, porzioni: nuove.get(x.chiave) ?? x.voce.porzioni }).kcal, 0,
  ));

  // Secondo passo, lo stesso di `calibra`: se anche coi carboidrati al minimo
  // la giornata resta molto sopra, si alleggerisce tutto un poco — secondi
  // compresi. Preferire i carboidrati e' una priorita', non un dogma: lasciare
  // un giorno al 30% sopra il bersaglio sarebbe peggio che alleggerire il pesce.
  const attuale = conta();
  if (attuale > limite * (1 + TOLLERANZA)) {
    const secondo = Math.max(PORZIONE_SECONDO_MIN, limite / attuale);
    for (const x of tutte) {
      if (ferme.has(x.chiave)) continue;
      const da = nuove.get(x.chiave) ?? x.voce.porzioni ?? 1;
      nuove.set(x.chiave, Math.max(PORZIONE_ASSOLUTA_MIN, arrotondaPorzione(da * secondo)));
    }
  }

  const porzioni = tutte
    .filter((x) => nuove.has(x.chiave))
    .map((x) => ({ chiave: x.chiave, da: x.voce.porzioni ?? 1, a: nuove.get(x.chiave) }));

  const kcalDopo = conta();

  return {
    porzioni,
    kcalPrima,
    kcalDopo,
    residuo: kcalDopo - limite,
    alLimite: porzioni.some((p) => p.a <= PORZIONE_MIN || p.a >= PORZIONE_MAX),
  };
}

/** Scrive nel giorno le porzioni calcolate da `ribilanciaGiorno`. */
export function applicaRibilanciamento(giorno, esito) {
  const perChiave = new Map(esito.porzioni.map((p) => [p.chiave, p.a]));
  for (const x of vociConChiave(giorno)) {
    const nuova = perChiave.get(x.chiave);
    if (nuova !== undefined) x.voce.porzioni = nuova;
  }
  // Un giorno di sgarro tiene l'extra dentro `quota` (vedi sgarro.js):
  // ricalcolarla come fa `calibra` cancellerebbe l'evento registrato.
  if (giorno.stato !== 'sgarro') giorno.quota = kcalGiorno(giorno);
  return giorno;
}

export function kcalGiorno(giorno, commensali = 1) {
  return Math.round(tutteLeVoci(giorno)
    .reduce((s, v) => s + valoriVoce(v, commensali).kcal, 0));
}

export function valoriGiorno(giorno) {
  const somma = { kcal: 0, pro: 0, car: 0, gra: 0, fib: 0, sod: 0 };
  for (const v of tutteLeVoci(giorno)) {
    const val = valoriVoce(v);
    for (const k of Object.keys(somma)) somma[k] += val[k] || 0;
  }
  for (const k of Object.keys(somma)) somma[k] = Math.round(somma[k] * 10) / 10;
  somma.kcal = Math.round(somma.kcal);
  return somma;
}

export function kcalSettimana(settimana) {
  return settimana.giorni.reduce((s, g) => s + kcalGiorno(g), 0);
}

/** Quante volte compare ciascuna categoria a tetto: serve al controllo. */
export function conteggiSettimana(settimana) {
  const conteggi = {};
  for (const giorno of settimana.giorni) {
    for (const v of tutteLeVoci(giorno)) {
      if (v.tipo !== 'piatto') continue;
      const p = tuttiPiatti.find((x) => x.id === v.id);
      if (!p) continue;
      for (const c of categorieDi(p)) conteggi[c] = (conteggi[c] || 0) + 1;
    }
  }
  return conteggi;
}

/* --- Date ------------------------------------------------------------------ */

/** Il lunedi' della settimana di `data`. In Italia la settimana parte da li'. */
export function inizioSettimana(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function iso(data) {
  const d = new Date(data);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${g}`;
}

export function indiceOggi(settimana, oggi = new Date()) {
  return settimana.giorni.findIndex((g) => g.data === iso(oggi));
}
