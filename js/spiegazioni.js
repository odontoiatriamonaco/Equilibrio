/* Equilibrio — il perché dietro gli avvisi che si aprono.

   Certi avvisi dicono una cosa vera e incomprensibile. «Oltre il recuperabile
   senza scendere sotto 1410 kcal» è esatto: è anche esattamente quello che
   nessuno capisce, perché per capirlo bisogna già sapere che esiste un
   pavimento, che uno sgarro si riassorbe sui giorni dopo, e che il pavimento
   vince sul riassorbimento. Tre cose che l'avviso dà per sapute.

   La riga breve resta breve — chi ha già capito non deve rileggere un poema
   ogni volta — e il perché sta qui sotto, per chi lo vuole.

   Stanno in un modulo a parte perché sono testo, non marcatura: si provano
   senza aprire una pagina, e cambiarli non vuol dire toccare la pagina. */

/**
 * Perché una parte dello sgarro non si è riassorbita.
 *
 * @param {object} o
 * @param {number} o.floor      il pavimento calorico di questa persona
 * @param {number} o.residuo    le kcal rimaste fuori dal recupero
 * @param {number} o.taglioMax  la quota massima tagliabile in un giorno (0..1)
 * @returns {string} HTML
 */
export function perchePavimento({ floor, residuo, taglioMax }) {
  const tetto = Math.round(taglioMax * 100);
  return `<p>Uno sgarro si riassorbe togliendo un po' di calorie ai giorni che
      restano nella settimana. Con due limiti: mai più del <strong>${tetto}%</strong>
      in un giorno solo, e mai scendendo sotto il tuo pavimento di
      <strong>${Math.round(floor)} kcal</strong>.</p>
    <p>Il pavimento è il più alto fra il tuo metabolismo basale — le calorie che
      il corpo consuma da fermo — e il minimo di sicurezza, che è 1200 kcal per
      le donne e 1500 per gli uomini. Sotto quella riga non si va, nemmeno per
      rimediare a uno sgarro: è il vincolo che protegge tutto il resto.</p>
    <p>Quindi ${residuo > 0
    ? `quelle <strong>${residuo} kcal</strong>`
    : 'le calorie che avanzano'} restano fuori dal conto. Non sono un debito e
      la settimana prossima non se le porta dietro: restano lì. Uno sgarro ogni
      tanto non sposta il risultato di un mese — rincorrerlo con giorni troppo
      magri sì.</p>`;
}

/**
 * Perché il bersaglio di oggi è più alto di quello a regime.
 *
 * @param {object} o
 * @param {number[]} o.quote        le quote settimanali della rampa (0..1)
 * @param {number} o.giorniAggiunti quanto costa la rampa, in giorni
 * @returns {string} HTML
 */
export function percheAvvio({ quote, giorniAggiunti }) {
  const gradini = quote.map((q) => `${Math.round(q * 100)}%`);
  const elenco = `${gradini.slice(0, -1).join(', ')} e ${gradini[gradini.length - 1]}`;
  return `<p>Le prime settimane sono quelle in cui si molla, e il taglio pieno
      dal primo giorno è il modo più rapido per arrivarci. Per questo si scende
      per gradi: <strong>${elenco}</strong> del taglio, una settimana per volta.</p>
    <p>Non è un trucco per il metabolismo, e non te lo racconto come tale: sul
      grasso perso le prove sono poche e deboli. Serve solo a farti arrivare
      all'ultima settimana, che è la parte difficile.</p>
    <p>Si paga in tempo, non in risultato: la rampa sposta il traguardo di circa
      <strong>${giorniAggiunti} giorni</strong>, già contati nella data che vedi
      nel profilo. Se preferisci partire subito al pieno, l'avvio graduale si
      spegne da lì.</p>`;
}

/**
 * Perché degli sgarri erano spariti e sono tornati.
 *
 * Vale la pena spiegarlo invece di rimediare in silenzio: chi li ha visti
 * sparire ha smesso di fidarsi, e sapere che non ricapita è metà del rimedio.
 */
export function percheRipescati() {
  return `<p>Chi segue il menù di un'altra persona ha uno strato tutto suo, dove
      stanno gli sgarri e i giorni rigidi. Quello strato prima non veniva usato
      per scrivere: gli sgarri finivano sulla settimana condivisa e venivano
      riletti da quella personale, così a ogni ricaricamento sparivano.</p>
    <p>Ora vivono dove devono, e restano dove li metti. Questi erano rimasti
      indietro: li ho rimessi al loro giorno una volta sola. Non ricapita.</p>`;
}
