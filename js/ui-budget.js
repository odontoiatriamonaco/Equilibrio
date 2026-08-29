/* Equilibrio — la fascia del budget settimanale.
   Componente firma: sette segmenti, uno per giorno. La linea tratteggiata e'
   il target standard; sopra si vede lo sgarro, sotto il recupero che lo ripaga.
   Qui c'e' solo il DISEGNO: il motore che calcola le quote sta in js/sgarro.js. */

import { num } from './guscio.js';
import { percheFascia } from './spiegazioni.js';

const NOMI_STATO = {
  normale: 'nella norma',
  sgarro: 'sgarro',
  recupero: 'alleggerito per il recupero',
  rigido: 'giorno non comprimibile',
};

/**
 * @param {HTMLElement} contenitore
 * @param {{giorni: Array<{etichetta:string, quota:number, stato?:string, oggi?:boolean}>,
 *          target:number, legenda?:boolean, spiega?:boolean}} dati
 *
 * `spiega` segue `legenda`: dove la fascia sta per intero sta anche il suo
 * perche', e dove sta in piccolo — su Oggi, nell'anteprima dello sgarro — resta
 * in piccolo. Un'anteprima larga tre dita non e' il posto di un paragrafo.
 */
export function rendiFascia(contenitore, {
  giorni, target, legenda = true, spiega = legenda,
}) {
  // Un po' di aria sopra la barra piu' alta, altrimenti lo sgarro tocca il bordo.
  const massimo = Math.max(target, ...giorni.map((g) => g.quota)) * 1.1;

  const piano = giorni
    .map((g) => {
      const h = (g.quota / massimo).toFixed(4);
      const stato = g.stato || 'normale';
      // Il tratteggio dice «questo giorno e' stato alleggerito per ripagare uno
      // sgarro»: e' un fatto, e va letto dal fatto. Prima lo si indovinava dalla
      // quota — sotto il target di piu' di 1 kcal — ma la calibrazione atterra
      // di suo a cinquanta calorie dal bersaglio, quindi il tratteggio compariva
      // su giornate normalissime. Una settimana senza nemmeno uno sgarro ne
      // mostrava tre, e il disegno diceva una cosa che non era mai successa.
      const recupero = stato === 'recupero' ? 'si' : 'no';
      return `<div class="fb-giorno" style="--h:${h}"
                   data-stato="${stato}" data-recupero="${recupero}"
                   data-oggi="${g.oggi ? 'si' : 'no'}">
                <div class="fb-barra"></div>
              </div>`;
    })
    .join('');

  const etichette = giorni
    .map((g) => `<span data-oggi="${g.oggi ? 'si' : 'no'}">${g.etichetta}</span>`)
    .join('');

  contenitore.className = 'fascia-budget';
  contenitore.style.setProperty('--target', (target / massimo).toFixed(4));
  contenitore.innerHTML = `
    <div class="fb-piano" role="img" aria-label="${descrizione(giorni, target)}">
      ${piano}
      <div class="fb-linea"><span>${num(target)} kcal</span></div>
    </div>
    <div class="fb-etichette" aria-hidden="true">${etichette}</div>
    ${legenda ? LEGENDA : ''}
    ${spiega ? spiegazione({ giorni, target }) : ''}
  `;
}

/* La legenda dice cosa vuol dire ogni colore. Questa dice cos'e' successo,
   che e' la domanda vera di chi guarda il disegno. */
function spiegazione(dati) {
  return `
    <details class="avviso avviso-apre" style="margin-top: var(--sp-4)">
      <summary>
        <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#info"/></svg>
        <div>
          <div class="testo">Come si legge questa fascia</div>
          <span class="apri-spiega"><span class="apri">Premi qui</span><span class="chiudi">Chiudi</span></span>
        </div>
      </summary>
      <div class="spiega">${percheFascia(dati)}</div>
    </details>`;
}

const LEGENDA = `
  <div class="fb-legenda">
    <span><i style="background:var(--verde)"></i>quota del giorno</span>
    <span><i style="background:var(--sgarro)"></i>sgarro</span>
    <span><i style="background:var(--dato)"></i>giorno rigido</span>
    <span><i style="background:repeating-linear-gradient(-45deg,var(--sgarro) 0 3px,transparent 3px 6px)"></i>recupero</span>
  </div>`;

// Il grafico non e' leggibile da uno screen reader: la descrizione lo e'.
function descrizione(giorni, target) {
  const parti = giorni.map((g) => {
    const scarto = Math.round(g.quota - target);
    const segno = scarto > 0 ? `+${num(scarto)}` : num(scarto);
    return `${g.etichetta} ${num(g.quota)} kcal (${segno}, ${NOMI_STATO[g.stato || 'normale']})`;
  });
  return `Budget della settimana, target ${num(target)} kcal al giorno. ${parti.join('; ')}.`;
}
