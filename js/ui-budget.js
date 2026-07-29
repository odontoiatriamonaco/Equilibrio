/* Equilibrio — la fascia del budget settimanale.
   Componente firma: sette segmenti, uno per giorno. La linea tratteggiata e'
   il target standard; sopra si vede lo sgarro, sotto il recupero che lo ripaga.
   Qui c'e' solo il DISEGNO: il motore che calcola le quote sta in js/sgarro.js. */

import { num } from './guscio.js';

const NOMI_STATO = {
  normale: 'nella norma',
  sgarro: 'sgarro',
  recupero: 'alleggerito per il recupero',
  rigido: 'giorno non comprimibile',
};

/**
 * @param {HTMLElement} contenitore
 * @param {{giorni: Array<{etichetta:string, quota:number, stato?:string, oggi?:boolean}>,
 *          target:number, legenda?:boolean}} dati
 */
export function rendiFascia(contenitore, { giorni, target, legenda = true }) {
  // Un po' di aria sopra la barra piu' alta, altrimenti lo sgarro tocca il bordo.
  const massimo = Math.max(target, ...giorni.map((g) => g.quota)) * 1.1;

  const piano = giorni
    .map((g) => {
      const h = (g.quota / massimo).toFixed(4);
      const stato = g.stato || 'normale';
      const recupero = g.quota < target - 1 ? 'si' : 'no';
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
  `;
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
