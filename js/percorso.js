/* Equilibrio — da dove si comincia.

   Otto pagine e nessun ordine dichiarato: chi apre l'app la prima volta non ha
   modo di sapere che prima viene il profilo, poi i gusti, poi il menu' e infine
   la spesa. Questo modulo non spiega l'interfaccia — dice a che punto sei,
   leggendolo dai dati veri, e ti porta al passo che manca.

   Niente riquadri che illuminano bottoni: un percorso che si ricava dallo stato
   non puo' indicare una cosa che non c'e' piu'. */

import { caricaPreferenze } from './preferenze.js';
import { caricaSettimana, caricaSpesa } from './dati.js';
import { inizioSettimana, iso } from './planner.js';

/**
 * I quattro passi che portano dal nulla a «stasera so cosa cucino e ho fatto
 * la spesa». Il resto — famiglia, sgarro, diario — si scopre quando serve, ed
 * e' li' che c'e' la guida.
 */
export const PASSI = [
  {
    id: 'profilo',
    titolo: 'I tuoi dati',
    perche: 'Altezza, peso e data di nascita: da lì escono le calorie che ti servono.',
    azione: 'Compila il profilo',
    dove: '/profilo.html',
    saltabile: false,
  },
  {
    id: 'gusti',
    titolo: 'Cosa ti piace',
    perche: 'Segna quello che non mangi e le allergie, così il menù non te lo propone.',
    azione: 'Scegli i gusti',
    dove: '/preferenze.html',
    saltabile: true,
  },
  {
    id: 'settimana',
    titolo: 'Il menù della settimana',
    perche: 'Sette giorni di pasti scelti fra i piatti che ti vanno.',
    azione: 'Genera la settimana',
    dove: '/piano.html',
    saltabile: false,
  },
  {
    id: 'spesa',
    titolo: 'La lista della spesa',
    perche: 'Esce da sola dal menù, ordinata come gli scaffali del supermercato.',
    azione: 'Vedi la lista',
    dove: '/spesa.html',
    saltabile: true,
  },
];

/** Un profilo si considera compilato quando basta a calcolare il fabbisogno. */
export function profiloCompleto(profilo) {
  return Boolean(profilo?.pesoKg && profilo?.altezzaCm && profilo?.dataNascita);
}

/** Qualcosa e' stato detto sui gusti: un piatto, un alimento o un'allergia. */
export function gustiImpostati(pref) {
  if (!pref) return false;
  return Object.keys(pref.piatti || {}).length
    + Object.keys(pref.alimenti || {}).length
    + (pref.allergie || []).length > 0;
}

/**
 * A che punto e' questa persona.
 *
 * @param {object} profilo
 * @param {Date} oggi
 * @returns {Promise<{passi:Array, fatti:number, totale:number,
 *          prossimo:object|null, completo:boolean}>}
 */
export async function statoPercorso(profilo, oggi = new Date()) {
  const saltati = new Set(profilo?.percorso?.saltati || []);
  // Chi ha aperto la sezione e ha detto «ho finito». Non e' «saltato»: ci sei
  // stato. Serve all'ultimo passo, dove «vedi la lista» si esaurisce nel
  // vederla e non lascia niente scritto da cui accorgersene.
  const visti = new Set(profilo?.percorso?.visti || []);
  const inizio = iso(inizioSettimana(oggi));

  // Chi segue il menu' di un altro non lo genera: il suo passo e' gia' assolto
  // da chi decide, e chiedergli di farlo sarebbe chiedergli l'impossibile.
  const segue = Boolean(profilo?.seguo);
  const proprietario = profilo?.seguo || profilo?.id;

  const [pref, settimana, spesa] = profilo?.id
    ? await Promise.all([
      caricaPreferenze(profilo.id),
      caricaSettimana(proprietario, oggi),
      caricaSpesa(profilo.id, inizio),
    ])
    : [null, null, null];

  const verifiche = {
    profilo: profiloCompleto(profilo),
    gusti: gustiImpostati(pref),
    settimana: Boolean(settimana),
    spesa: Boolean(spesa),
  };

  const passi = PASSI.map((p) => ({
    ...p,
    fatto: verifiche[p.id] || saltati.has(p.id) || visti.has(p.id),
    saltato: !verifiche[p.id] && saltati.has(p.id),
    // Il testo cambia per chi segue: il menù non lo decide lui.
    ...(p.id === 'settimana' && segue
      ? { perche: 'Lo decide chi guida la dieta di famiglia: a te arrivano gli stessi piatti, con le tue porzioni.', azione: 'Vedi il piano' }
      : {}),
  }));

  const prossimo = passi.find((p) => !p.fatto) || null;

  return {
    passi,
    fatti: passi.filter((p) => p.fatto).length,
    totale: passi.length,
    prossimo,
    completo: !prossimo,
    chiuso: Boolean(profilo?.percorso?.chiuso),
    iniziato: Boolean(profilo?.percorso?.iniziato),
    finito: Boolean(profilo?.percorso?.finito),
  };
}

/**
 * Che cosa dice il pulsante in fondo a una sezione del percorso.
 *
 * Pura apposta: è la frase che decide se ti senti a metà strada o alla fine,
 * e va provata senza aprire una pagina. Torna `null` quando la barra non deve
 * comparire — percorso finito, messo via, o pagina che non è un passo.
 *
 * @param {object} stato  quello che torna da statoPercorso()
 * @param {string} idPasso
 */
export function guidaPagina(stato, idPasso) {
  if (!stato || stato.chiuso) return null;
  // A percorso finito il filo non serve più. Resta però finché la fine non è
  // stata annunciata, o l'ultima sezione perderebbe il pulsante proprio nel
  // momento in cui la si completa.
  if (stato.completo && (stato.finito || !stato.iniziato)) return null;

  const indice = stato.passi.findIndex((x) => x.id === idPasso);
  if (indice < 0) return null;
  const passo = stato.passi[indice];

  // Quelli che restano da fare oltre a questo. Se non ne resta nessuno, questa
  // sezione è l'ultima: il pulsante non dice «avanti» verso il nulla.
  const restano = stato.passi.filter((x) => !x.fatto && x.id !== idPasso).length;
  const ultimo = restano === 0;

  // «Ho finito» chiude il passo dichiarandolo — ma solo dove dichiararlo è
  // onesto. Aprire la lista della spesa si esaurisce nell'averla vista, e di
  // quello non resta traccia da nessuna parte; compilare il profilo o generare
  // il menù no: quelli o li hai fatti o non li hai fatti, e un pulsante non
  // può farli al posto tuo.
  const conferma = ultimo && !passo.fatto && passo.saltabile;

  return {
    id: idPasso,
    numero: indice + 1,
    totale: stato.passi.length,
    titolo: passo.titolo,
    fatto: passo.fatto,
    ultimo,
    conferma,
    etichetta: ultimo && (passo.fatto || conferma) ? 'Ho finito' : 'Avanti',
  };
}

/** Questa sezione l'ho vista e ho detto che basta. Diverso da «saltato». */
export function conVisto(profilo, id) {
  const visti = new Set(profilo?.percorso?.visti || []);
  visti.add(id);
  return { ...profilo, percorso: { ...(profilo.percorso || {}), visti: [...visti] } };
}

/**
 * Segna che la fine del percorso è stata vista.
 *
 * Senza, il percorso finiva sparendo e basta: quattro sezioni compilate e
 * nessuno che dicesse «ci siamo». Sparire in silenzio somiglia troppo a un
 * guasto per essere il modo di annunciare che hai finito.
 */
export function conFinito(profilo, visto = true) {
  return { ...profilo, percorso: { ...(profilo.percorso || {}), finito: visto } };
}

/**
 * Segna che questa persona il percorso lo ha visto aperto almeno una volta.
 *
 * Serve a non dire «hai finito i primi passi» a chi usa l'app da mesi e non ha
 * mai avuto un passo da fare: per lui non c'e' stato nessun percorso, e
 * annunciargliene la fine sarebbe raccontargli una cosa che non e' successa.
 */
export function conIniziato(profilo) {
  if (profilo?.percorso?.iniziato) return profilo;
  return { ...profilo, percorso: { ...(profilo.percorso || {}), iniziato: true } };
}

/** Va annunciata la fine? Solo a chi il percorso lo ha davvero attraversato. */
export function fineDaDire(profilo, stato) {
  return Boolean(stato?.completo
    && profilo?.percorso?.iniziato
    && !profilo?.percorso?.finito);
}

/** Aggiunge un passo a quelli saltati, senza toccare il resto del profilo. */
export function conSaltato(profilo, id) {
  const saltati = new Set(profilo?.percorso?.saltati || []);
  saltati.add(id);
  return { ...profilo, percorso: { ...(profilo.percorso || {}), saltati: [...saltati] } };
}

/** Chiude il percorso a mano. Resta il collegamento per riaprirlo. */
export function conChiuso(profilo, chiuso = true) {
  return { ...profilo, percorso: { ...(profilo.percorso || {}), chiuso } };
}
