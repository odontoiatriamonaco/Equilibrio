/* Equilibrio — pagina Spesa: la lista per reparto, la dispensa, l'antispreco. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { profiloAttivo } from './store.js';
import { caricaSettimana, caricaDispensa, salvaScorta, caricaSpesa, salvaSpesa } from './dati.js';
import { costruisciLista, quantitaLeggibile, comeTesto, residuiInDispensa } from './spesa.js';
import { suggerimentiAntispreco } from './packaging.js';
import { caricaPreferenze } from './preferenze.js';
import { alimento, gruppi } from './alimenti.js';

let profilo = null;
let settimana = null;
let lista = null;
let spunte = new Map();
let dispensa = [];
let pref = null;

export async function inizializza() {
  avvia({ nav: 'spesa' });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg) return mostraSolo('#senza-profilo');

  settimana = await caricaSettimana(profilo.id);
  if (!settimana) return mostraSolo('#senza-piano');

  pref = await caricaPreferenze(profilo.id);
  dispensa = await caricaDispensa(profilo.id);

  const salvata = await caricaSpesa(profilo.id, settimana.inizio);
  spunte = new Map((salvata?.voci || []).map((v) => [v.alimentoId, v]));

  $('#commensali').value = String(settimana.commensali || profilo.commensali || 1);
  $('#commensali').addEventListener('change', ricostruisci);
  $('#copia').addEventListener('click', copia);
  $('#stampa').addEventListener('click', () => window.print());
  $('#in-dispensa').addEventListener('click', metteInDispensa);
  $('#svuota-spunte').addEventListener('click', async () => {
    spunte = new Map();
    await persisti();
    disegna();
  });

  ricostruisci();
}

function mostraSolo(sel) {
  $$('#contenuto, #senza-profilo, #senza-piano').forEach((e) => { e.hidden = true; });
  $(sel).hidden = false;
}

function ricostruisci() {
  const commensali = Number($('#commensali').value) || 1;
  lista = costruisciLista(settimana, { commensali, dispensa });
  disegna();
}

/* --- Disegno --------------------------------------------------------------- */

function disegna() {
  const fatte = lista.voci.filter((v) => spunte.get(v.alimentoId)?.spuntato).length;

  $('#riepilogo').innerHTML = `
    <div class="griglia-2">
      <div><p class="dato-grande num">${num(lista.articoli)}</p><p class="unita">articoli</p></div>
      <div><p class="dato-grande num">${euro(lista.costo)}</p><p class="unita">spesa stimata</p></div>
      <div><p class="dato-grande num">${num(fatte)}</p><p class="unita">già nel carrello</p></div>
    </div>
    ${lista.risparmiato > 0 ? `
      <p class="piccolo morbido" style="margin-top:var(--sp-3)">
        Dalla dispensa arrivano ${euro(lista.risparmiato)} di roba che non serve ricomprare.</p>` : ''}`;

  $('#reparti').innerHTML = lista.reparti.map(rendiReparto).join('');

  $$('#reparti input[type="checkbox"]').forEach((c) => c.addEventListener('change', async () => {
    spunte.set(c.dataset.id, {
      alimentoId: c.dataset.id,
      spuntato: c.checked,
      spuntatoIl: new Date().toISOString(),
    });
    await persisti();
    aggiornaConteggio();
  }));

  disegnaAntispreco();
  disegnaDispensa();
}

function rendiReparto(r) {
  return `
    <section class="reparto">
      <h3>${icona(r.icona, 'icona icona-sm')} ${r.nome}</h3>
      ${r.voci.map(rigaVoce).join('')}
    </section>`;
}

function rigaVoce(v) {
  const stato = spunte.get(v.alimentoId)?.spuntato ? 'checked' : '';
  const nota = [];
  if (v.inCasa > 0) nota.push(`${num(v.inCasa)} g già in casa`);
  if (v.residuoDaSegnalare) nota.push(`ne avanzano ${num(v.residuo)} g`);

  return `
    <label class="voce-spesa">
      <input type="checkbox" data-id="${v.alimentoId}" ${stato}>
      <span class="spunta"></span>
      <span class="nome">${v.nome}
        ${nota.length ? `<br><span class="piccolo tenue">${nota.join(' · ')}</span>` : ''}
      </span>
      <span class="qta num">${quantitaLeggibile(v)}</span>
    </label>`;
}

function aggiornaConteggio() {
  const fatte = lista.voci.filter((v) => spunte.get(v.alimentoId)?.spuntato).length;
  const nodo = $('#riepilogo .griglia-2 > div:nth-child(3) .dato-grande');
  if (nodo) nodo.textContent = num(fatte);
}

/* --- Antispreco ------------------------------------------------------------ */

function disegnaAntispreco() {
  const giaInSettimana = new Set(settimana.giorni
    .flatMap((g) => Object.values(g.pasti).flat())
    .filter((v) => v.tipo === 'piatto')
    .map((v) => v.id));

  const proposte = suggerimentiAntispreco(lista.residui, {
    preferenze: pref,
    mese: new Date().getMonth() + 1,
    giaInSettimana,
  });

  if (!proposte.length) {
    $('#antispreco').hidden = true;
    return;
  }

  $('#antispreco').hidden = false;
  $('#spreco-totale').textContent = `${num(lista.sprecoG)} g`;
  $('#antispreco-elenco').innerHTML = proposte.map((p) => `
    <div class="scheda scheda-piatta" style="margin-bottom: var(--sp-3)">
      <p><strong>${p.nome}</strong> — se ne compra ${num(p.residuo)} g più del necessario,
        perché si vende a confezioni.</p>
      <p class="piccolo morbido" style="margin-top: var(--sp-2)">Piatti che lo finirebbero:</p>
      <ul class="pila" style="margin-top: var(--sp-2); gap: var(--sp-1)">
        ${p.proposte.map((x) => `
          <li class="riga-tra piccolo">
            <span>${x.nome}</span>
            <span class="tenue num">ne usa ${num(x.usa)} g</span>
          </li>`).join('')}
      </ul>
    </div>`).join('');
}

/* --- Dispensa -------------------------------------------------------------- */

function disegnaDispensa() {
  if (!dispensa.length) {
    $('#dispensa-elenco').innerHTML = `
      <div class="vuoto">
        ${icona('dispensa', 'icona icona-lg')}
        <p>La dispensa è vuota.<br>Quello che avanza dalla spesa finisce qui,
           e la settimana dopo non lo ricompri.</p>
      </div>`;
    return;
  }

  $('#dispensa-elenco').innerHTML = dispensa
    .sort((a, b) => (alimento(a.alimentoId)?.nome || '').localeCompare(alimento(b.alimentoId)?.nome || '', 'it'))
    .map((s) => `
      <div class="riga-tra" style="padding-block: var(--sp-2); border-bottom:1px solid var(--bordo)">
        <span>${alimento(s.alimentoId)?.nome || s.alimentoId}
          <br><span class="piccolo tenue">dal ${formatta(s.dal)}</span></span>
        <span class="riga" style="gap: var(--sp-2)">
          <span class="num morbido">${num(s.grammi)} g</span>
          <button class="bottone-icona" data-togli="${s.alimentoId}" aria-label="Togli dalla dispensa">
            ${icona('cestino', 'icona icona-sm')}
          </button>
        </span>
      </div>`).join('');

  $$('#dispensa-elenco [data-togli]').forEach((b) => b.addEventListener('click', async () => {
    await salvaScorta(profilo.id, b.dataset.togli, 0);
    dispensa = await caricaDispensa(profilo.id);
    ricostruisci();
  }));
}

async function metteInDispensa() {
  const scorte = residuiInDispensa(lista, profilo.id);
  for (const s of scorte) await salvaScorta(profilo.id, s.alimentoId, s.grammi);
  dispensa = await caricaDispensa(profilo.id);
  ricostruisci();
  $('#esito').hidden = false;
  $('#esito').textContent = `${scorte.length} avanzi messi in dispensa. `
    + 'La settimana prossima li sottraggo dalla lista.';
}

/* --- Condivisione ---------------------------------------------------------- */

async function copia() {
  const testo = comeTesto(lista);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Lista della spesa', text: testo });
      return;
    }
    await navigator.clipboard.writeText(testo);
    $('#esito').hidden = false;
    $('#esito').textContent = 'Lista copiata: puoi incollarla dove vuoi.';
  } catch {
    // Niente clipboard (permesso negato, contesto non sicuro): si mostra il
    // testo, che e' sempre meglio di un pulsante che non fa nulla.
    $('#esito').hidden = false;
    $('#esito').textContent = 'Non riesco a copiare da qui: usa Stampa, oppure selezionala a mano.';
  }
}

async function persisti() {
  await salvaSpesa(profilo.id, settimana.inizio, [...spunte.values()]);
}

function euro(v) {
  return `${v.toFixed(2).replace('.', ',')} €`;
}

function formatta(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export { gruppi };
