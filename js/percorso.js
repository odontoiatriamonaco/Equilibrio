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
    fatto: verifiche[p.id] || saltati.has(p.id),
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
  };
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
