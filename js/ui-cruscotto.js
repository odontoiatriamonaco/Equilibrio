/* Equilibrio — il disegno del quadro d'insieme.

   Una striscia sempre in vista con tre numeri, e sotto il quadro intero che si
   apre a richiesta. La forma non e' un dettaglio: Oggi risponde a «cosa mangio
   adesso», che e' la domanda per cui si apre l'app venti volte a settimana. Il
   cruscotto risponde a «come sta andando», che ci si chiede una volta ogni
   tanto. Mettere la seconda sopra la prima vuol dire pagare un pedaggio ogni
   giorno per una risposta che non si stava cercando.

   Qui c'e' solo il DISEGNO: il quadro lo mette insieme js/cruscotto.js. */

import { num } from './guscio.js';

/** Un chilo si scrive con la virgola, e con una cifra sola. */
function kg(v) {
  return v == null ? '—' : `${v.toFixed(1).replace('.', ',')} kg`;
}

function giorniParola(n) {
  return `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
}

function riga(etichetta, valore, nota = '') {
  if (valore == null || valore === '' || valore === '—') return '';
  return `<div class="riga-tra" style="gap: var(--sp-4); align-items: baseline">
      <span class="piccolo morbido">${etichetta}</span>
      <span class="num" style="font-weight:600; text-align:right">${valore}${
  nota ? `<span class="piccolo tenue" style="font-weight:400"> ${nota}</span>` : ''}</span>
    </div>`;
}

function blocco(titolo, righe) {
  const dentro = righe.filter(Boolean).join('');
  if (!dentro) return '';
  return `<div style="margin-top: var(--sp-4)">
      <p class="occhiello" style="margin-bottom: var(--sp-2)">${titolo}</p>
      ${dentro}
    </div>`;
}

/** La scomposizione del traguardo: la cosa che prima non si vedeva. */
function bloccoTraguardo(t) {
  if (!t) return '';
  const data = t.data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  return blocco('Il traguardo', [
    riga('Data prevista', data),
    riga('Giorni in tutto', giorniParola(t.giorni)),
    riga('— di dieta piena', giorniParola(t.base)),
    t.avvio > 0 ? riga('— per l’avvio graduale', `+${giorniParola(t.avvio)}`, 'finisce da sé') : '',
    t.sgarri > 0 ? riga('— per gli sgarri non rientrati', `+${giorniParola(t.sgarri)}`) : '',
  ]);
}

/**
 * @param {HTMLElement} contenitore
 * @param {object} q  quello che torna da cruscotto()
 */
export function rendiCruscotto(contenitore, q) {
  const { peso, traguardo, motore, vincoli, sgarri, famiglia } = q;

  // I tre numeri della striscia. Il terzo cambia con quello che c'e' da dire:
  // un posto fisso per «la cosa che sposta il traguardo», qualunque sia.
  const terzo = sgarri
    ? { occhiello: 'Sgarri', valore: `+${giorniParola(sgarri.giorni)}` }
    : motore.avvio
      ? { occhiello: 'Avvio', valore: `${motore.avvio.settimana} di ${motore.avvio.di}` }
      : { occhiello: 'Obiettivo', valore: kg(peso.obiettivo) };

  const cella = (occhiello, valore) => `
    <div>
      <p class="occhiello">${occhiello}</p>
      <p class="num" style="font-size: 1.0625rem; font-weight: 700; margin-top: 2px">${valore}</p>
    </div>`;

  contenitore.innerHTML = `
    <details class="cruscotto">
      <summary>
        <div class="cruscotto-numeri">
          ${cella('Peso', kg(peso.adesso))}
          ${cella('Al traguardo', traguardo ? giorniParola(traguardo.giorni) : '—')}
          ${cella(terzo.occhiello, terzo.valore)}
        </div>
        <span class="apri-spiega"><span class="apri">Premi qui</span><span class="chiudi">Chiudi</span></span>
      </summary>

      <div class="cruscotto-dentro">
        ${blocco('Il peso', [
    riga('Di partenza', kg(peso.iniziale),
      peso.da ? `dal ${new Date(peso.da).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}` : ''),
    riga('Adesso', kg(peso.adesso)),
    riga('Obiettivo', kg(peso.obiettivo)),
    peso.delta ? riga('Fatto finora', `${peso.delta <= 0 ? '−' : '+'}${kg(Math.abs(peso.delta))}`) : '',
    riga('Velocità', peso.velocitaDicibile
      ? `${peso.perSettimana <= 0 ? '−' : '+'}${
        Math.abs(peso.perSettimana).toFixed(1).replace('.', ',')} kg a settimana`
      : 'non ancora dicibile', peso.velocitaDicibile ? '' : 'servono più pesate'),
  ])}

        ${bloccoTraguardo(traguardo)}

        ${blocco('Come è calcolato', [
    riga('Metabolismo basale', motore.bmr ? `${num(motore.bmr)} kcal` : null),
    riga('Consumo giornaliero', motore.tdee ? `${num(motore.tdee)} kcal` : null),
    riga('Attività', motore.attivita),
    riga('Ritmo scelto', motore.ritmo),
    riga('Bersaglio di oggi', motore.target ? `${num(motore.target)} kcal` : null,
      motore.avvio && motore.targetPieno ? `a regime ${num(motore.targetPieno)}` : ''),
    riga('Non si scende sotto', motore.floor ? `${num(motore.floor)} kcal` : null),
  ])}

        ${blocco('Quello che il piano non ti propone', [
    vincoli.classi.length ? riga('Allergie', vincoli.classi.join(', ')) : '',
    vincoli.singoli.length ? riga('Singoli alimenti', vincoli.singoli.join(', ')) : '',
  ])}

        ${vincoli.messaggio ? `
          <div class="avviso ${vincoli.bloccante ? 'avviso-pericolo' : 'avviso-sgarro'}"
               style="margin-top: var(--sp-4)">
            <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#avviso"/></svg>
            <div>${vincoli.messaggio}</div>
          </div>` : ''}

        ${blocco('In famiglia', [
    riga('Segui il menù di', famiglia.seguo),
    famiglia.seguaci.length ? riga('Seguono il tuo', famiglia.seguaci.join(', ')) : '',
  ])}

        <p class="piccolo tenue" style="margin-top: var(--sp-4)">
          Questi numeri si cambiano dal <a href="/profilo.html">profilo</a>.
          Le pesate e l’andamento stanno in <a href="/progressi.html">progressi</a>.</p>
      </div>
    </details>`;
}
