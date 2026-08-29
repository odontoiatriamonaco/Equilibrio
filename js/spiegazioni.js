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

/**
 * Perché gli sgarri non rientrati si pagano in tempo e non in fame.
 *
 * @param {object} a  quello che torna da arretrati()
 * @returns {string} HTML
 */
export function percheArretrati(a) {
  const g = a.giorni;
  return `<p>Uno sgarro si riassorbe sui giorni della sua settimana. Quello che
      non ci sta — perché sotto il pavimento calorico non si scende — non passa
      alla settimana dopo, e non è una dimenticanza: <strong>cominciare il
      lunedì già in debito</strong> è il modo in cui una dieta diventa una
      rincorsa. Si mangia meno per rimediare, si regge tre giorni, si molla.</p>
    <p>Si paga invece in tempo. ${g > 0
    ? `Queste <strong>${a.totale} kcal</strong> valgono
        <strong>${g} ${g === 1 ? 'giorno' : 'giorni'}</strong> di dieta in più,
        e sono già dentro la data del traguardo che vedi nel profilo — non un
        conto a parte da ricordarsi.`
    : `Finora sono troppo poche per spostare la data del traguardo, ma il conto
        resta aperto e si aggiorna da solo.`}</p>
    <p>Serve a guardarlo, non a sentirsi in colpa: la riga per settimana dice se
      è una storia vecchia o un'abitudine che sta prendendo piede, e sono due
      cose diverse.</p>`;
}

/** I giorni per esteso: «lunedì e martedì» si legge, «lun, mar» si decifra. */
const PER_ESTESO = {
  lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì',
  ven: 'venerdì', sab: 'sabato', dom: 'domenica',
};

/** «lunedì, martedì e giovedì» — con la e al posto dell'ultima virgola. */
function elenca(nomi) {
  if (nomi.length <= 1) return nomi[0] || '';
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
}

function nomiDi(giorni) {
  return elenca(giorni.map((g) => PER_ESTESO[String(g.etichetta).toLowerCase()] || g.etichetta));
}

/**
 * Come si legge la fascia del budget settimanale.
 *
 * Parla di QUESTA settimana, non della fascia in generale: nomina i giorni che
 * ci sono davvero. Una legenda dice cosa vuol dire ogni colore; questa dice
 * cos'è successo — che è la domanda che uno si fa guardando il disegno.
 *
 * @param {{giorni:Array<{etichetta:string, quota:number, stato?:string}>, target:number}} d
 * @returns {string} HTML
 */
export function percheFascia({ giorni = [], target = 0 } = {}) {
  const di = (stato) => giorni.filter((g) => (g.stato || 'normale') === stato);
  const sgarri = di('sgarro');
  const rigidi = di('rigido');
  // Lo stesso fatto che accende il tratteggio nel disegno: se le parole lo
  // ricavassero per conto loro, prima o poi direbbero il contrario del disegno.
  const alleggeriti = di('recupero');

  const parti = [`<p>Ogni colonna è un giorno e la riga tratteggiata è il tuo
    bersaglio, <strong>${Math.round(target)} kcal</strong>. Quello che deve
    tornare è la <strong>settimana</strong>, non ogni singolo giorno: è tutta
    qui la differenza fra un piano e una punizione.</p>`];

  if (sgarri.length) {
    parti.push(`<p>Le colonne ocra sono gli sgarri — ${nomiDi(sgarri)} — e stanno
      sopra la riga apposta: erano previsti, non sono un errore.
      ${alleggeriti.length
    ? `Il tratteggio in cima a ${nomiDi(alleggeriti)} è quello che è stato tolto
        per riassorbirli: la stessa quantità, spostata di qualche giorno.`
    : 'Questa settimana non c\'era bisogno di alleggerire nessun altro giorno.'}</p>`);
  } else if (alleggeriti.length) {
    parti.push(`<p>Il tratteggio in cima a ${nomiDi(alleggeriti)} è quello che è
      stato tolto per riassorbire uno sgarro delle settimane scorse.</p>`);
  } else {
    parti.push('<p>Questa settimana nessuna colonna esce dalla riga: nessuno '
      + 'sgarro da riassorbire, e nessun giorno alleggerito.</p>');
  }

  if (rigidi.length) {
    parti.push(`<p>${rigidi.length === 1 ? 'La colonna blu è' : 'Le colonne blu sono'}
      ${nomiDi(rigidi)}: ${rigidi.length === 1 ? 'un giorno' : 'giorni'} che hai
      dichiarato non comprimibile — allenamento, turno lungo, quello che è. Il
      recupero di uno sgarro non ${rigidi.length === 1 ? 'lo tocca' : 'li tocca'}.</p>`);
  }

  parti.push('<p>La colonna col bordo colorato è oggi. Se una colonna ti sembra '
    + 'sbagliata, apri quel giorno nel piano qui sotto: lì ci sono i piatti che '
    + 'la compongono.</p>');

  return parti.join('\n');
}
