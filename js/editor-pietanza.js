/* Equilibrio — editor di una pietanza: cambia le quantita', aggiunge e toglie
   ingredienti, e salva come pietanza di casa.

   Il ricettario di serie non viene mai modificato: si crea una versione propria
   che copre l'originale. Cancellandola, l'originale torna. */

import { icona, $, $$, num } from './guscio.js';
import { alimenti, alimento, valoriPiatto, gruppi, TIPI } from './alimenti.js';
import {
  salvaPietanza, eliminaPietanza, comeVariante, nuovaPietanza,
  aggiungiIngrediente, cambiaQuantita, togliIngrediente,
  valida, avvertimenti, differenze, TIPI_AMMESSI,
} from './piatti-utente.js';

let bozza = null;
let profiloId = null;
let alSalvataggio = null;

/** @param {(piatto:object|null) => void} quandoSalva  null = cancellata */
export function apriEditor({ profilo, piatto, nuova = false, quandoSalva }) {
  profiloId = profilo;
  alSalvataggio = quandoSalva;

  bozza = nuova
    ? nuovaPietanza()
    : piatto.origine === 'casa' ? structuredClone(piatto) : comeVariante(piatto);

  $('#editor-titolo').textContent = nuova
    ? 'Nuova pietanza'
    : piatto.origine === 'casa' ? 'Modifica' : `Modifica «${piatto.nome}»`;

  $('#editor-elimina').hidden = !(piatto?.origine === 'casa');
  disegna();
  $('#editor').showModal();
}

export function collegaEditor() {
  $('#editor-chiudi').addEventListener('click', () => $('#editor').close());
  $('#editor-salva').addEventListener('click', salva);
  $('#editor-elimina').addEventListener('click', cancella);

  $('#editor-nome').addEventListener('input', (e) => { bozza.nome = e.target.value; aggiornaTesta(); });
  $('#editor-tipo').addEventListener('change', (e) => { bozza.tipo = e.target.value; disegna(); });
  $('#editor-tempo').addEventListener('input', (e) => { bozza.tempo = Number(e.target.value) || 0; });

  $('#editor-cerca').addEventListener('input', disegnaCandidati);
  $('#editor-gruppo').addEventListener('change', disegnaCandidati);
}

/* --- Disegno --------------------------------------------------------------- */

function disegna() {
  $('#editor-nome').value = bozza.nome;
  $('#editor-tempo').value = bozza.tempo ?? 20;

  $('#editor-tipo').innerHTML = TIPI_AMMESSI
    .map((t) => `<option value="${t}" ${t === bozza.tipo ? 'selected' : ''}>${TIPI[t]}</option>`)
    .join('');

  $('#editor-gruppo').innerHTML = '<option value="">Tutti i gruppi</option>'
    + gruppi.gruppi.map((g) => `<option value="${g.id}">${g.nome}</option>`).join('');

  disegnaIngredienti();
  disegnaCandidati();
  aggiornaTesta();
}

function disegnaIngredienti() {
  if (!bozza.ingredienti.length) {
    $('#editor-ingredienti').innerHTML = `
      <p class="piccolo tenue" style="padding-block: var(--sp-3)">
        Nessun ingrediente. Cercalo qui sotto e aggiungilo.</p>`;
    return;
  }

  $('#editor-ingredienti').innerHTML = bozza.ingredienti.map((i) => {
    const a = alimento(i.a);
    const kcal = a ? Math.round((a.per100g.kcal * i.g) / 100) : 0;
    return `
      <div class="riga-ingrediente">
        <span class="nome">${a?.nome || `<em class="pericolo-testo">${i.a}</em>`}
          <br><span class="piccolo tenue">${num(kcal)} kcal</span>
        </span>
        <label class="riga" style="gap:var(--sp-1)">
          <input type="number" class="qta-ingrediente num" data-qta="${i.a}"
                 value="${i.g}" min="0" max="3000" step="5" inputmode="numeric"
                 aria-label="Grammi di ${a?.nome || i.a}">
          <span class="piccolo tenue">g</span>
        </label>
        <button class="bottone-icona" data-togli="${i.a}" aria-label="Togli ${a?.nome || i.a}">
          ${icona('cestino', 'icona icona-sm')}
        </button>
      </div>`;
  }).join('');

  $$('#editor-ingredienti [data-qta]').forEach((inp) => inp.addEventListener('input', () => {
    const g = Math.max(0, Number(inp.value) || 0);
    bozza = cambiaQuantita(bozza, inp.dataset.qta, g);
    aggiornaTesta();
    // La riga non si ridisegna mentre si scrive: il campo perderebbe il fuoco.
    const kcalRiga = inp.closest('.riga-ingrediente').querySelector('.tenue');
    const a = alimento(inp.dataset.qta);
    if (a && kcalRiga) kcalRiga.textContent = `${num(Math.round((a.per100g.kcal * g) / 100))} kcal`;
  }));

  $$('#editor-ingredienti [data-togli]').forEach((b) => b.addEventListener('click', () => {
    bozza = togliIngrediente(bozza, b.dataset.togli);
    disegnaIngredienti();
    disegnaCandidati();
    aggiornaTesta();
  }));
}

function disegnaCandidati() {
  const cerca = $('#editor-cerca').value.trim().toLowerCase();
  const gruppo = $('#editor-gruppo').value;
  const giaDentro = new Set(bozza.ingredienti.map((i) => i.a));

  const trovati = alimenti
    .filter((a) => !giaDentro.has(a.id))
    .filter((a) => !gruppo || a.gruppo === gruppo)
    .filter((a) => !cerca || [a.nome, ...(a.sinonimi || [])].join(' ').toLowerCase().includes(cerca))
    .slice(0, 24);

  $('#editor-candidati').innerHTML = trovati.length
    ? trovati.map((a) => `
        <button class="chip-gusto" data-aggiungi="${a.id}">
          ${icona('piu', 'icona icona-sm')} ${a.nome}
          <span class="piccolo tenue">${a.porzione} g</span>
        </button>`).join('')
    : '<p class="piccolo tenue">Nessun alimento con questi filtri.</p>';

  $$('#editor-candidati [data-aggiungi]').forEach((b) => b.addEventListener('click', () => {
    bozza = aggiungiIngrediente(bozza, b.dataset.aggiungi);
    disegnaIngredienti();
    disegnaCandidati();
    aggiornaTesta();
  }));
}

function aggiornaTesta() {
  const v = valoriPiatto(bozza);

  $('#editor-valori').innerHTML = `
    <span class="dato-grande num">${num(v.kcal)}<span class="unita"> kcal</span></span>
    <span class="piccolo morbido">P ${num(v.pro, 1)} g · C ${num(v.car, 1)} g
      · G ${num(v.gra, 1)} g · fibra ${num(v.fib, 1)} g</span>`;

  const note = [...avvertimenti(bozza, v), ...differenze(bozza).length
    ? [`Rispetto all'originale: ${differenze(bozza).join(', ')}.`] : []];

  $('#editor-note').innerHTML = note.length
    ? note.map((n) => `<div class="avviso" style="margin-top:var(--sp-2)">
        ${icona('info', 'icona icona-sm')}<div>${n}</div></div>`).join('')
    : '';

  const errori = valida(bozza);
  $('#editor-salva').disabled = errori.length > 0;
  $('#editor-errore').hidden = !errori.length;
  if (errori.length) $('#editor-errore').textContent = errori[0];
}

/* --- Azioni ---------------------------------------------------------------- */

async function salva() {
  try {
    const salvata = await salvaPietanza(profiloId, bozza);
    $('#editor').close();
    alSalvataggio?.(salvata);
  } catch (e) {
    $('#editor-errore').hidden = false;
    $('#editor-errore').textContent = e.message;
  }
}

async function cancella() {
  await eliminaPietanza(profiloId, bozza.id);
  $('#editor').close();
  alSalvataggio?.(null);
}
