/* Equilibrio — il quadro d'insieme.

   La domanda era: «dove controllo i giorni all'obiettivo e come li spostano
   gli sgarri?». La risposta onesta era «in tre schermate diverse»: il basale e
   il ritmo nel Profilo, la velocità e gli arretrati in Progressi, la famiglia
   in Altro. Nessuno di quei numeri mancava — mancava un posto dove stessero
   insieme, e per farsi un'idea bisognava girare l'app.

   Qui non si calcola quasi niente di nuovo: si raduna. L'unica cosa che prima
   non esisteva è la SCOMPOSIZIONE del traguardo — «307 giorni» non dice cosa
   lo sposta, e chi vuole avvicinarlo deve sapere quale pezzo può toccare.

   Modulo puro: prende quello che le pagine hanno già caricato e torna un
   oggetto. Nessun accesso all'archivio, nessun DOM, tutto provabile. */

import { LAF, RITMI, ritmoDi } from './energia.js';
import { CLASSI } from './allergeni.js';
import { alimento } from './alimenti.js';

/**
 * Quanto si sta muovendo il peso, dalla serie delle pesate.
 *
 * Stava dentro la pagina Progressi, e il cruscotto avrebbe dovuto riscriverla:
 * due copie della stessa formula sono due formule che prima o poi divergono, e
 * il giorno che divergono l'app dice due velocità diverse nella stessa app.
 *
 * @param {Array<{data:string, tendenza:number}>} tendenza  già lisciata
 */
export function andamentoPeso(tendenza = []) {
  const vuoto = {
    primo: null, ultimo: null, delta: 0, settimane: 0, perSettimana: 0, abbastanza: false,
  };
  if (tendenza.length < 2) {
    return tendenza.length === 1
      ? { ...vuoto, primo: tendenza[0], ultimo: tendenza[0] }
      : vuoto;
  }

  const primo = tendenza[0];
  const ultimo = tendenza[tendenza.length - 1];
  const delta = ultimo.tendenza - primo.tendenza;
  const settimane = Math.max(1,
    (new Date(ultimo.data) - new Date(primo.data)) / (1000 * 60 * 60 * 24 * 7));
  const perSettimana = delta / settimane;

  return {
    primo,
    ultimo,
    delta,
    settimane,
    perSettimana,
    // Sotto i cinquanta grammi a settimana non è un andamento, è la bilancia:
    // dirlo lo stesso vorrebbe dire vendere il rumore come un risultato.
    abbastanza: Math.abs(perSettimana) > 0.05,
  };
}

/** I nomi delle esclusioni dure, classi e singoli alimenti insieme. */
function nomiAllergeni(preferenze) {
  const classi = (preferenze?.classiAllergeni || [])
    .map((id) => CLASSI.find((c) => c.id === id)?.nome || id);
  // I singoli si dicono solo se non sono già coperti da una classe: chi ha
  // segnato «glutine» non vuole rileggere pane, pasta e pangrattato.
  const singoli = (preferenze?.allergie || [])
    .map((id) => alimento(id)?.nome || id);
  return { classi, singoli };
}

/**
 * Tutto il quadro, da quello che le pagine hanno già in mano.
 *
 * @param {object} o
 * @param {object} o.profilo
 * @param {object} o.energia       quello che torna da riepilogo()
 * @param {Array} o.tendenza       la serie del peso, già lisciata
 * @param {object} o.arretrati     quello che torna da arretrati()
 * @param {object} o.preferenze
 * @param {object|null} o.riferimento  di chi seguo il menù, se seguo qualcuno
 * @param {Array} o.seguaci        chi segue il mio, per nome
 */
export function cruscotto({
  profilo, energia, tendenza = [], arretrati: conto = null,
  preferenze = null, riferimento = null, seguaci = [],
} = {}) {
  const andamento = andamentoPeso(tendenza);
  const allergeni = nomiAllergeni(preferenze);
  const ritmo = ritmoDi(profilo);

  return {
    peso: {
      adesso: andamento.ultimo?.tendenza ?? profilo?.pesoKg ?? null,
      iniziale: andamento.primo?.tendenza ?? profilo?.pesoKg ?? null,
      obiettivo: profilo?.pesoObiettivoKg ?? null,
      delta: andamento.delta,
      perSettimana: andamento.perSettimana,
      // Senza abbastanza pesate la velocità non si dice: «non ancora» è una
      // risposta, un numero inventato no.
      velocitaDicibile: andamento.abbastanza,
      da: andamento.primo?.data || null,
    },

    traguardo: energia?.traguardo
      ? {
        giorni: energia.traguardo.giorni,
        data: energia.traguardo.data,
        ...energia.traguardo.parti,
      }
      : null,

    motore: {
      bmr: energia?.bmr ?? null,
      tdee: energia?.tdee ?? null,
      attivita: LAF[profilo?.attivita]?.testo || null,
      ritmo: RITMI[ritmo]?.testo || null,
      target: energia?.fabbisogno?.target ?? null,
      targetPieno: energia?.fabbisogno?.targetPieno ?? null,
      floor: energia?.fabbisogno?.floor ?? null,
      avvio: energia?.avvio?.attivo
        ? { settimana: energia.avvio.settimana, di: energia.avvio.di }
        : null,
    },

    vincoli: {
      ...allergeni,
      // Le bandiere di salute sono l'unica parte che può fermare il calcolo:
      // vanno viste, non nascoste in fondo a una pagina di impostazioni.
      salute: energia?.bandiere?.daSegnalare?.length
        ? energia.bandiere.daSegnalare
        : [],
      messaggio: energia?.bandiere?.messaggio || null,
      bloccante: Boolean(energia?.bandiere?.bloccante),
    },

    // I giorni non si ricontano qui: li ha gia' scomposti il traguardo, con il
    // deficit che solo riepilogo() conosce. Due conti separati sarebbero due
    // numeri da tenere pari a mano, e prima o poi non lo sarebbero.
    sgarri: conto && conto.totale > 0
      ? {
        kcal: conto.totale,
        giorni: energia?.traguardo?.parti?.sgarri ?? 0,
        settimane: conto.quante,
      }
      : null,

    famiglia: {
      seguo: riferimento?.nome || null,
      seguaci: seguaci.map((p) => p.nome || p).filter(Boolean),
    },
  };
}
