/* Equilibrio — quello che gli sgarri non hanno restituito.

   Uno sgarro si riassorbe sui giorni della sua settimana. Quando non ci sta
   tutto — perché sotto il pavimento calorico non si scende — la parte che
   avanza resta fuori, e l'app lo diceva una volta sola, nel momento in cui
   registravi lo sgarro: «il traguardo si sposta di due giorni». Poi se lo
   dimenticava. Nessuno teneva il conto, e la data del traguardo continuava a
   ignorarlo anche dopo dieci volte.

   ── Perché non si recupera la settimana dopo ────────────────────────────────

   Perché rimandare vuol dire cominciare la settimana nuova già in debito, ed è
   il meccanismo esatto con cui una dieta diventa una rincorsa: si mangia meno
   per rimediare, si regge tre giorni, si molla. Il costo si paga in tempo, non
   in fame. Ma pagarlo in tempo vuol dire dirlo — altrimenti è solo un condono.

   ── Cosa serve per farlo ────────────────────────────────────────────────────

   Niente di nuovo: ogni settimana salvata porta già `recupero.residuo`, che
   `applicaSgarri` calcola sommando TUTTI gli sgarri di quella settimana, e le
   settimane non si cancellano mai. Lo storico c'era, mancava solo chi lo
   guardasse. */

import { slittamentoTraguardo, grammiEquivalenti } from './sgarro.js';

/** Quanto indietro si guarda per dire «di recente». Quattro settimane. */
export const GIORNI_RECENTI = 28;

/**
 * Il conto degli arretrati, dalle settimane salvate.
 *
 * @param {object[]} settimane        tutte le settimane del profilo
 * @param {object} o
 * @param {number} o.deficitGiornaliero  serve a tradurre le kcal in giorni
 * @param {Date} o.oggi
 * @returns {{totale:number, quante:number, giorni:number, grammi:number,
 *   recenti:number, giorniRecenti:number, righe:object[]}}
 */
export function arretrati(settimane = [], { deficitGiornaliero = 0, oggi = new Date() } = {}) {
  const limite = new Date(oggi);
  limite.setDate(limite.getDate() - GIORNI_RECENTI);
  const sogliaRecenti = limite.toISOString().slice(0, 10);
  const oggiIso = new Date(oggi).toISOString().slice(0, 10);

  const righe = settimane
    .filter((s) => s?.inizio && (s.recupero?.residuo || 0) > 0)
    .map((s) => {
      const residuo = Math.round(s.recupero.residuo);
      return {
        inizio: s.inizio,
        residuo,
        giorni: slittamentoTraguardo(residuo, deficitGiornaliero),
        // Una settimana che deve ancora cominciare porta sgarri prenotati: il
        // costo è vero ma non ancora speso, e chiamarlo «arretrato» sarebbe
        // sbagliato. Si conta lo stesso — è un impegno già preso — ma si dice.
        prenotata: s.inizio > oggiIso,
        recente: s.inizio >= sogliaRecenti,
      };
    })
    .sort((a, b) => b.inizio.localeCompare(a.inizio));

  const somma = (v) => v.reduce((n, r) => n + r.residuo, 0);
  const totale = somma(righe);
  const recenti = somma(righe.filter((r) => r.recente));

  return {
    totale,
    quante: righe.length,
    giorni: slittamentoTraguardo(totale, deficitGiornaliero),
    grammi: grammiEquivalenti(totale),
    recenti,
    giorniRecenti: slittamentoTraguardo(recenti, deficitGiornaliero),
    righe,
  };
}

/**
 * Come si racconta a voce, che è il modo in cui si legge davvero.
 *
 * Non è una sgridata: il tono è quello di un conto, come lo sgarro stesso —
 * ocra, non rosso. Chi si sente in colpa smette di aprire l'app, e un'app
 * chiusa non aiuta nessuno.
 */
export function raccontaArretrati(a, { conTotale = true } = {}) {
  if (!a || a.totale <= 0) return 'Finora è rientrato tutto: nessuno sgarro ha lasciato scoperto niente.';

  const g = a.giorni;
  const quando = g === 1 ? 'un giorno' : `${g} giorni`;
  const dove = a.quante === 1 ? 'una settimana' : `${a.quante} settimane`;

  // Accanto al numero grande la frase non lo ripete: «955 kcal» seguito da
  // «955 kcal non sono rientrate» e' una balbuzie, non un rafforzativo.
  const testa = conTotale
    ? `${a.totale} kcal non sono rientrate, su ${dove}.`
    : `Su ${dove}.`;
  const costo = g > 0
    ? ` Il traguardo si sposta di ${quando}.`
    : ' Non abbastanza da spostare il traguardo.';
  const coda = a.recenti > 0 && a.recenti < a.totale
    ? ` Di queste, ${a.recenti} nelle ultime quattro settimane.`
    : '';

  return testa + costo + coda;
}
