/* Equilibrio — il filo che lega le sezioni dei primi passi.

   Il percorso su Oggi diceva già a che punto sei e ti portava al passo giusto,
   ma poi ti lasciava lì: compilavi il profilo e restavi sul profilo, senza
   niente che ti riportasse indietro. Quattro sezioni e nessun filo fra loro —
   chi apre l'app la prima volta deve indovinare che ora tocca ai gusti.

   Questa barra è quel filo. Compare solo mentre il percorso è aperto: chi ha
   già finito non la vede mai, e chi l'ha messa via nemmeno. */

import { statoPercorso, guidaPagina, conVisto } from './percorso.js';
import { scrivi } from './store.js';
import { icona } from './guscio.js';

/**
 * Attacca in fondo alla pagina la barra «Passo 2 di 4 — Avanti».
 *
 * Rimonta da capo a ogni chiamata: dopo un salvataggio il passo può essere
 * appena diventato fatto, e la barra deve dirlo invece di restare a com'era.
 *
 * @param {object} profilo
 * @param {string} idPasso  quale dei PASSI è questa pagina
 * @returns {Promise<object|null>} la guida mostrata, o null se non serviva
 */
export async function montaBarraPercorso(profilo, idPasso) {
  document.querySelector('.barra-passo')?.remove();

  const guida = guidaPagina(await statoPercorso(profilo), idPasso);
  if (!guida) return null;

  // La spunta dice «questa sezione è a posto», senza impedirti di andare
  // comunque: tornare a Oggi non dev’essere mai bloccato. A percorso finito lo
  // dicono già le parole accanto, e ripeterlo sarebbe rumore.
  const spunta = guida.fatto && !guida.tuttoFatto ? ` ${icona('spunta', 'icona icona-sm')}` : '';
  const dentro = `${guida.etichetta} ${icona('avanti', 'icona icona-sm')}`;

  const barra = document.createElement('div');
  barra.className = 'barra-passo non-stampare';
  barra.innerHTML = `
    <span class="dove">
      <span class="conta${guida.contatore ? ' num' : ''}">${guida.occhiello}</span>
      <span class="titolo">${guida.intestazione}${spunta}</span>
    </span>
    ${guida.conferma
    ? `<button class="bottone" data-chiudi-passo>${dentro}</button>`
    : `<a class="bottone" href="/index.html">${dentro}</a>`}`;

  document.body.appendChild(barra);

  // Sull'ultimo passo che si esaurisce nell'averlo visto, «Ho finito» lo chiude
  // davvero: altrimenti tornerebbe a Oggi lasciandolo aperto, e il pulsante
  // avrebbe detto una cosa che non è successa.
  barra.querySelector('[data-chiudi-passo]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await scrivi('profili', conVisto(profilo, idPasso));
    location.href = '/index.html';
  });

  return guida;
}
