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

/** L'icona di ogni tetto. Sei righe di solo testo si leggono a fatica. */
export const ICONE_TETTI = {
  pesce: 'pesce',
  'carne-bianca': 'carne-bianca',
  'carne-rossa': 'carne',
  salumi: 'salumi',
  uova: 'uovo',
  formaggi: 'latticini',
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

/**
 * Riporta i gusti come appena creato il profilo: niente amati, niente esclusi,
 * niente allergie, tetti ai valori mediterranei di partenza.
 * Irreversibile: chi la chiama deve aver chiesto conferma.
 */
export async function azzeraPreferenze(profiloId) {
  const prima = await caricaPreferenze(profiloId);
  const quante = Object.keys(prima.piatti).length
    + Object.keys(prima.alimenti).length
    + prima.allergie.length;
  await scrivi('preferenze', vuote(profiloId));
  return quante;
}

/* --- Letture --------------------------------------------------------------- */

export function gustoPiatto(pref, id) {
  return pref.piatti?.[id] || 'neutro';
}

export function gustoAlimento(pref, id) {
  const v = pref.alimenti?.[id];
  // «escluso» era la vecchia parola per la stessa intenzione: non lo voglio
  // nel piatto. I profili salvati prima continuano a funzionare.
  if (v === 'escluso') return 'omesso';
  return v || 'neutro';
}

/**
 * Gli alimenti da non mettere nei piatti.
 *
 * Non fanno sparire il piatto: lo fanno arrivare senza quell'ingrediente, con
 * i valori ricalcolati. Il piatto sparisce solo se togliere quella cosa lo
 * snatura, e quella decisione la prende `applicaOmissioni` in alimenti.js.
 */
export function omessi(pref) {
  return Object.keys(pref.alimenti || {})
    .filter((id) => gustoAlimento(pref, id) === 'omesso');
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
  // L'allergia esclude il piatto intero, non solo l'ingrediente. E' la scelta
  // prudente: un allergene sta anche nelle tracce e nel procedimento, e
  // «basta non metterlo» non e' una cosa che un programma possa promettere.
  for (const ing of piatto.ingredienti || []) {
    if (eAllergene(pref, ing.a)) {
      return { tipo: 'allergia', alimento: ing.a, testo: `contiene ${nome(ing.a)}` };
    }
  }
  if (gustoPiatto(pref, piatto.id) === 'escluso') {
    return { tipo: 'piatto-escluso', testo: 'l’hai escluso' };
  }
  // Un alimento che non si vuole NON esclude il piatto: viene tolto dal piatto
  // (vedi applicaOmissioni). Se toglierlo lo snatura, il piatto non arriva
  // fin qui — e' gia' fuori dal ricettario in uso.
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

/* Qui c'era `prossimoGusto`, un ciclo neutro → amato → omesso → neutro.
   Era importato da `pagina-preferenze.js` e mai chiamato: quella pagina scrive
   i valori diretti e riporta a neutro ripremendo lo stesso pulsante.

   Descriveva pero' un modello DIVERSO da quello vivo — per un piatto diceva
   `omesso`, mentre l'esclusione vera si chiama `escluso` — e leggendolo ci ho
   creduto io stesso, arrivando a dichiarare un difetto che non esisteva. Codice
   morto che mente su come funziona l'app e' peggio di codice assente. */

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
