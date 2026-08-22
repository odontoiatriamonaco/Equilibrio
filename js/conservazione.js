/* Equilibrio — quanto tiene quello che hai in casa.

   L'antispreco fino a qui divideva il mondo in due: deperibile o no, guardando
   il reparto. Ma «deperibile» non è un interruttore, è una scadenza: il riso e
   l'olio aspettano mesi, la ricotta e la mozzarella tre giorni. Se il piano
   deve consumare prima quello che sta per andare a male, gli serve sapere
   QUANTO manca, non SE manca.

   ── Che cosa sono questi numeri, e cosa non sono ─────────────────────────────

   Sono stime prudenti, mie, non una fonte. Servono a METTERE IN ORDINE le
   priorità — prima la mozzarella, poi le carote, il riso quando capita — e a
   nient'altro. L'app non scrive mai «scade il 3 settembre» e non dice mai che
   una cosa si può ancora mangiare: quello lo dice la confezione, e in dubbio il
   naso. Per questo, dove ho avuto un dubbio, ho scritto il numero più corto:
   sbagliare per difetto ti fa cucinare una cosa un giorno prima, sbagliare per
   eccesso te la fa trovare andata.

   I valori nutrizionali di questo progetto portano `fonte` e `verificato`
   perché vengono da una tabella. Questi no, e non fingo il contrario: sono qui,
   in chiaro, uno per riga, perché correggerli sia banale. */

import { alimento } from './alimenti.js';

/** Quanto tiene, per reparto, quando dell'alimento non si sa altro. */
export const GIORNI_REPARTO = {
  'banco-pesce': 2,
  'banco-carne': 3,
  panetteria: 3,
  ortofrutta: 6,
  latticini: 7,
  surgelati: 120,
  bevande: 180,
  dispensa: 365,
};

/**
 * Dove il reparto sbaglia di grosso, alimento per alimento.
 *
 * Le patate stanno in ortofrutta ma durano un mese e mezzo; il parmigiano sta
 * nei latticini insieme alla burrata, che dura due giorni. Un reparto è uno
 * scaffale del supermercato, non una durata.
 */
export const GIORNI_ALIMENTO = {
  // Ortofrutta che aspetta: radici, bulbi, agrumi, frutta soda.
  patate: 45,
  cipolla: 45,
  aglio: 60,
  zucca: 30,
  castagne: 20,
  barbabietola: 20,
  carota: 20,
  mela: 21,
  limone: 21,
  kiwi: 18,
  arancia: 18,
  mandarini: 14,
  pera: 12,
  sedano: 12,
  porri: 12,
  verza: 12,
  cachi: 10,

  // Ortofrutta che non aspetta: foglie, erbe, frutta molle.
  basilico: 3,
  rucola: 3,
  spinaci: 3,
  fragole: 3,
  fichi: 3,
  insalata: 4,
  prezzemolo: 4,
  bietola: 4,
  funghi: 4,
  asparagi: 4,
  ciliegie: 4,
  nespole: 4,
  albicocche: 4,
  pesche: 4,
  'fave-fresche': 4,
  'piselli-freschi': 4,
  friarielli: 4,

  // Latticini: fra la burrata e il parmigiano ci sono due mesi di differenza.
  burrata: 2,
  'mozzarella-bufala': 3,
  ricotta: 3,
  mozzarella: 4,
  'latte-ps': 5,
  tofu: 10,
  'yogurt-bianco': 10,
  'yogurt-greco-magro': 10,
  provola: 14,
  'ricotta-salata': 21,
  uova: 28,
  parmigiano: 60,
  pecorino: 60,

  // Salumi e affumicati: durano piu' della carne fresca accanto a cui stanno.
  'prosciutto-crudo': 14,
  bresaola: 14,
  'prosciutto-cotto': 5,
  'salmone-affumicato': 14,
  baccala: 5,

  // Dispensa: quello che conta e' quanto tiene UNA VOLTA APERTO, perche' in
  // dispensa ci finisce il mezzo barattolo, non quello sigillato.
  'tonno-naturale': 2,
  'pomodori-pelati': 4,
  'passata-pomodoro': 4,
  'mais-dolce': 3,
  'fagioli-cannellini-lessi': 3,
  'ceci-lessi': 3,
  'lenticchie-lesse': 3,
  'gnocchi-patate': 7,
  confettura: 30,
  'olive-nere': 30,
  'olive-verdi': 30,
  capperi: 60,
};

/** Il pane fresco dura meno di quello integrale, di poco. */
GIORNI_ALIMENTO.pane = 2;

/**
 * Quanti giorni tiene questo alimento, da quando entra in casa.
 * Senza notizie: trenta giorni, che è prudente per una scorta ma non la mette
 * in cima alla lista delle urgenze.
 */
export function giorniDiTenuta(alimentoId) {
  const suo = GIORNI_ALIMENTO[alimentoId];
  if (suo !== undefined) return suo;
  const a = alimento(alimentoId);
  return GIORNI_REPARTO[a?.reparto] ?? 30;
}

/** Da quanti giorni è in casa. Senza data, si presume da oggi. */
export function giorniInCasa(scorta, oggi = new Date()) {
  if (!scorta?.dal) return 0;
  const entrata = new Date(`${scorta.dal}T00:00:00`);
  if (Number.isNaN(entrata.getTime())) return 0;
  const g = Math.floor((oggi - entrata) / 86400000);
  return Math.max(0, g);
}

/** Quanti giorni le restano. Negativo vuol dire che il tempo è già passato. */
export function giorniRimasti(scorta, oggi = new Date()) {
  return giorniDiTenuta(scorta?.alimentoId) - giorniInCasa(scorta, oggi);
}

/**
 * Quanto urge consumarla, da 0 a 1.
 *
 * Non è lineare sulla durata, ma sui GIORNI CHE RESTANO, e per una ragione: al
 * riso comprato ieri restano 364 giorni e alla ricotta comprata ieri ne restano
 * due — ma anche al riso di undici mesi fa ne restano trenta, e trenta giorni
 * non sono un'emergenza per niente. Quello che conta è il tempo davanti, non la
 * frazione di vita consumata.
 *
 * Sopra i quattordici giorni l'urgenza è zero: non c'è motivo di storcere il
 * menù della settimana per una cosa che arriva tranquilla a fine mese.
 */
export const ORIZZONTE_G = 14;

export function urgenza(scorta, oggi = new Date()) {
  const restano = giorniRimasti(scorta, oggi);
  if (restano >= ORIZZONTE_G) return 0;
  if (restano <= 0) return 1;
  return (ORIZZONTE_G - restano) / ORIZZONTE_G;
}

/**
 * Come si dice a voce. Mai una data e mai un permesso: «scade il 3» sarebbe una
 * promessa che questi numeri non possono mantenere.
 */
export function comeStaMessa(scorta, oggi = new Date()) {
  const restano = giorniRimasti(scorta, oggi);
  if (restano <= 0) return { stato: 'scaduta', testo: 'controllala prima di usarla' };
  if (restano <= 2) return { stato: 'urgente', testo: 'da usare subito' };
  if (restano <= 5) return { stato: 'presto', testo: 'da usare presto' };
  if (restano <= ORIZZONTE_G) return { stato: 'settimana', testo: `entro ${restano} giorni` };
  return { stato: 'calma', testo: 'tiene a lungo' };
}

/** Le scorte in ordine di fretta: prima quello che sta per andare a male. */
export function perFretta(dispensa, oggi = new Date()) {
  return [...(dispensa || [])].sort((a, b) => giorniRimasti(a, oggi) - giorniRimasti(b, oggi));
}
