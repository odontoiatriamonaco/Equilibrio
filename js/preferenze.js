/* Equilibrio — preferenze alimentari.
   Un solo record per profilo. Si salvano solo gli scostamenti dal neutro:
   un profilo appena creato non ha nessuna preferenza scritta, e va bene cosi'. */

import { leggi, scrivi } from './store.js';
import { alimento } from './alimenti.js';

/** Quante volte a settimana, al massimo. Sono tetti, non obiettivi. */
export const TETTI_PREDEFINITI = {
  pesce: 4,
  'carne-bianca': 3,
  'carne-rossa': 1,
  salumi: 1,
  uova: 3,
  formaggi: 3,
};

export const NOMI_TETTI = {
  pesce: 'Pesce e frutti di mare',
  'carne-bianca': 'Carni bianche',
  'carne-rossa': 'Carne rossa',
  salumi: 'Salumi',
  uova: 'Uova',
  formaggi: 'Formaggi',
};

function chiave(profiloId) {
  return `${profiloId}:preferenze`;
}

export function vuote(profiloId) {
  return {
    id: chiave(profiloId),
    profiloId,
    piatti: {},
    alimenti: {},
    allergie: [],
    tetti: { ...TETTI_PREDEFINITI },
  };
}

export async function caricaPreferenze(profiloId) {
  const salvate = await leggi('preferenze', chiave(profiloId));
  if (!salvate) return vuote(profiloId);
  // Un record vecchio puo' non avere tutti i campi: si completa senza rompere.
  return {
    ...vuote(profiloId),
    ...salvate,
    tetti: { ...TETTI_PREDEFINITI, ...(salvate.tetti || {}) },
  };
}

export async function salvaPreferenze(pref) {
  return scrivi('preferenze', pref);
}

/* --- Letture --------------------------------------------------------------- */

export function gustoPiatto(pref, id) {
  return pref.piatti?.[id] || 'neutro';
}

export function gustoAlimento(pref, id) {
  return pref.alimenti?.[id] || 'neutro';
}

export function eAllergene(pref, id) {
  return (pref.allergie || []).includes(id);
}

/**
 * Perche' un piatto non e' proponibile, o null se lo e'.
 * L'ordine conta: l'allergia viene prima di tutto ed e' un'esclusione dura,
 * non una preferenza. Un gusto si puo' ignorare in emergenza, un'allergia no.
 */
export function motivoEsclusione(pref, piatto) {
  for (const ing of piatto.ingredienti || []) {
    if (eAllergene(pref, ing.a)) {
      return { tipo: 'allergia', alimento: ing.a, testo: `contiene ${nome(ing.a)}` };
    }
  }
  if (gustoPiatto(pref, piatto.id) === 'escluso') {
    return { tipo: 'piatto-escluso', testo: 'l’hai escluso' };
  }
  for (const ing of piatto.ingredienti || []) {
    if (gustoAlimento(pref, ing.a) === 'escluso') {
      return { tipo: 'alimento-escluso', alimento: ing.a, testo: `contiene ${nome(ing.a)}` };
    }
  }
  return null;
}

export function ammesso(pref, piatto) {
  return motivoEsclusione(pref, piatto) === null;
}

/**
 * Quanto pesa un piatto nella scelta del generatore: piu' alto, piu' spesso
 * viene proposto. Servira' alla Fase 2; sta qui perche' e' logica di gusto.
 */
export function peso(pref, piatto) {
  if (!ammesso(pref, piatto)) return 0;

  let p = 1;
  if (gustoPiatto(pref, piatto.id) === 'amato') p *= 3;
  if (piatto.origine === 'casa') p *= 2; // i piatti di casa vengono prima

  const amati = (piatto.ingredienti || [])
    .filter((i) => gustoAlimento(pref, i.a) === 'amato').length;
  p *= 1 + 0.4 * amati;

  return p;
}

function nome(id) {
  return alimento(id)?.nome?.toLowerCase() || id;
}

/* --- Scritture ------------------------------------------------------------- */

const CICLO = { neutro: 'amato', amato: 'escluso', escluso: 'neutro' };

export function prossimoGusto(attuale) {
  return CICLO[attuale] || 'amato';
}

/** Imposta un gusto, togliendo la voce quando torna neutro (record compatto). */
export function imposta(pref, tipo, id, valore) {
  const mappa = { ...(pref[tipo] || {}) };
  if (valore === 'neutro') delete mappa[id];
  else mappa[id] = valore;
  return { ...pref, [tipo]: mappa };
}

export function alternaAllergia(pref, id) {
  const attuali = new Set(pref.allergie || []);
  if (attuali.has(id)) attuali.delete(id);
  else attuali.add(id);
  return { ...pref, allergie: [...attuali] };
}

export function impostaTetto(pref, gruppo, volte) {
  return { ...pref, tetti: { ...pref.tetti, [gruppo]: volte } };
}

/* --- Riepilogo ------------------------------------------------------------- */

/** Quante pietanze restano proponibili: il numero che conta davvero. */
export function riepilogo(pref, piatti) {
  const ammessi = piatti.filter((p) => ammesso(pref, p));
  const amati = piatti.filter((p) => gustoPiatto(pref, p.id) === 'amato');
  return {
    totale: piatti.length,
    ammessi: ammessi.length,
    esclusi: piatti.length - ammessi.length,
    amati: amati.length,
    allergie: (pref.allergie || []).length,
    // Sotto una certa soglia il generatore non riesce a variare la settimana.
    scarso: ammessi.length < 15,
  };
}
