/* Equilibrio — chi mangia a casa, e quando.

   Il caso vero: il marito fa colazione e cena con la famiglia, ma pranza e fa
   gli spuntini fuori — tranne il sabato e la domenica, che sta a casa tutto il
   giorno. La moglie e i figli mangiano sempre a casa.

   Prima si poteva dire una cosa sola, sulla spesa: questa persona c'è o non
   c'è, per tutta la settimana. Le due risposte erano sbagliate tutte e due —
   tenendolo dentro si compravano cinque pranzi e dieci spuntini che nessuno
   avrebbe mangiato (misurati: 8,3 kg a settimana su una famiglia di tre),
   togliendolo sparivano anche la sua colazione e la sua cena.

   ── La distinzione che tiene in piedi tutto ──────────────────────────────────

   «Mangia fuori» riguarda LA CUCINA, non la dieta. Il pranzo lui lo mangia
   comunque: se sparisse dal suo piano, il conto della sua giornata crollerebbe
   e l'app gli direbbe di mangiare duemila calorie quando lui ne mangia
   duemilaseicento. Quindi:

     · il suo PIANO resta intero — cinque pasti, con le sue grammature, e il
       pranzo fuori diventa il bersaglio da tenere d'occhio alla mensa;
     · la SPESA conta solo i pasti che escono da questa cucina;
     · e chi cucina, nella divisione delle dosi, non lo conta a pranzo.

   Tre cose diverse dallo stesso dato, e nessuna delle tre indovina. */

import { GIORNI } from './planner.js';

/** I cinque momenti, nell'ordine in cui capitano. */
export const PASTI = [
  // `nome` sta nella griglia, dove la posizione della riga basta a capire di
  // quale spuntino si parla. `lungo` serve nelle frasi, dove non basta:
  // «fuori casa per pranzo, spuntino e spuntino» non si può leggere.
  { id: 'colazione', nome: 'Colazione', lungo: 'colazione' },
  { id: 'spuntino-mattina', nome: 'Spuntino', lungo: 'spuntino del mattino' },
  { id: 'pranzo', nome: 'Pranzo', lungo: 'pranzo' },
  { id: 'spuntino-pomeriggio', nome: 'Spuntino', lungo: 'spuntino del pomeriggio' },
  { id: 'cena', nome: 'Cena', lungo: 'cena' },
];

/** I giorni come si scrivono in una colonna stretta. */
export const GIORNI_BREVI = [
  { id: 'lun', nome: 'lunedì', corto: 'L' },
  { id: 'mar', nome: 'martedì', corto: 'M' },
  { id: 'mer', nome: 'mercoledì', corto: 'M' },
  { id: 'gio', nome: 'giovedì', corto: 'G' },
  { id: 'ven', nome: 'venerdì', corto: 'V' },
  { id: 'sab', nome: 'sabato', corto: 'S' },
  { id: 'dom', nome: 'domenica', corto: 'D' },
];

/**
 * Chi non ha detto niente mangia a casa sempre.
 *
 * È il valore predefinito giusto perché è il caso più comune, ma soprattutto
 * perché è quello che non cambia niente a chi c'era prima: chi aggiorna l'app
 * non deve accorgersi che è successo qualcosa.
 */
export function mangiaACasa(profilo, giorno, pasto) {
  const fuori = profilo?.fuoriCasa;
  if (!fuori) return true;
  return !fuori.includes(`${giorno}|${pasto}`);
}

/** Le assenze come le tiene il profilo: un elenco di «giorno|pasto». */
export function fuoriCasaDi(profilo) {
  return profilo?.fuoriCasa || [];
}

/** Accende o spegne un singolo momento, senza toccare il resto del profilo. */
export function alternaPresenza(profilo, giorno, pasto) {
  const chiave = `${giorno}|${pasto}`;
  const fuori = new Set(profilo?.fuoriCasa || []);
  if (fuori.has(chiave)) fuori.delete(chiave);
  else fuori.add(chiave);
  return { ...profilo, fuoriCasa: [...fuori] };
}

/**
 * Un pasto intero, su tutti i giorni della settimana.
 *
 * Serve perché il caso vero si dice così: «il pranzo lo faccio sempre fuori».
 * Costringere a sette tocchi per una frase sola è il modo di non farlo fare.
 */
export function alternaPasto(profilo, pasto, aCasa) {
  const fuori = new Set(profilo?.fuoriCasa || []);
  for (const g of GIORNI) {
    const chiave = `${g}|${pasto}`;
    if (aCasa) fuori.delete(chiave);
    else fuori.add(chiave);
  }
  return { ...profilo, fuoriCasa: [...fuori] };
}

/** Una giornata intera. «Il sabato mangio a casa» in un tocco solo. */
export function alternaGiorno(profilo, giorno, aCasa) {
  const fuori = new Set(profilo?.fuoriCasa || []);
  for (const p of PASTI) {
    const chiave = `${giorno}|${p.id}`;
    if (aCasa) fuori.delete(chiave);
    else fuori.add(chiave);
  }
  return { ...profilo, fuoriCasa: [...fuori] };
}

/** Quanti dei trentacinque momenti della settimana si mangiano fuori. */
export function quantiFuori(profilo) {
  return (profilo?.fuoriCasa || []).length;
}

/**
 * Come si racconta a voce, per non far contare i pallini a nessuno.
 * Riconosce i due schemi che capitano davvero — sempre a casa, e un pasto
 * fisso fuori tutti i giorni — e per il resto conta.
 */
export function raccontaPresenze(profilo) {
  const fuori = fuoriCasaDi(profilo);
  if (!fuori.length) return 'Mangia a casa tutti i pasti.';

  const perPasto = new Map();
  for (const c of fuori) {
    const [, pasto] = c.split('|');
    perPasto.set(pasto, (perPasto.get(pasto) || 0) + 1);
  }

  // Un pasto che manca tutti e sette i giorni si dice per nome.
  const sempreFuori = [...perPasto.entries()]
    .filter(([, n]) => n === GIORNI.length)
    .map(([p]) => PASTI.find((x) => x.id === p)?.lungo || p);

  if (sempreFuori.length && sempreFuori.length === perPasto.size) {
    const elenco = sempreFuori.length === 1
      ? sempreFuori[0]
      : `${sempreFuori.slice(0, -1).join(', ')} e ${sempreFuori[sempreFuori.length - 1]}`;
    return `Fuori casa per ${elenco}, tutti i giorni.`;
  }

  return `Fuori casa ${fuori.length} pasti su ${GIORNI.length * PASTI.length}.`;
}

/**
 * La settimana come la vede LA CUCINA: senza i pasti che questa persona
 * mangia altrove. Il piano vero non si tocca — questa è una copia per la spesa
 * e per la divisione delle dosi.
 */
export function settimanaACasa(settimana, profilo) {
  if (!settimana || !fuoriCasaDi(profilo).length) return settimana;

  const copia = structuredClone(settimana);
  copia.giorni.forEach((g, i) => {
    const etichetta = g.etichetta || GIORNI[i];
    for (const p of PASTI) {
      if (!mangiaACasa(profilo, etichetta, p.id)) g.pasti[p.id] = [];
    }
  });
  return copia;
}
