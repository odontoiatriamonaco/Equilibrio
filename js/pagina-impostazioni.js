/* Equilibrio — impostazioni: profili, export/import cifrato, tema. */

import { $, avvia, applicaTema, temaSalvato, num } from './guscio.js';
import {
  profili, profiloAttivo, impostaProfiloAttivo, eliminaProfilo,
  esportaFascicolo, importaFascicolo,
} from './store.js';
import {
  cifra, decifra, nomeFile, scarica, leggiDaFile,
  PassphraseErrata, FormatoNonValido, AVVISO_PASSPHRASE,
} from './profilo-file.js';

let attivo = null;
let inAttesaDiConferma = null;

/* --- Profili --------------------------------------------------------------- */

async function rendiProfili() {
  const elenco = await profili();
  attivo = await profiloAttivo();

  if (!elenco.length) {
    $('#profili').innerHTML = `<div class="vuoto">
        <svg class="icona icona-lg" aria-hidden="true"><use href="/assets/icons.svg#utente"/></svg>
        <p>Nessun profilo su questo dispositivo.</p>
        <a class="bottone" href="/profilo.html">Crea il primo profilo</a>
      </div>`;
    return;
  }

  $('#profili').innerHTML = elenco.map((p) => {
    const corrente = p.id === attivo?.id;
    const misure = p.pesoKg ? `${num(p.pesoKg, 1)} kg · ${num(p.altezzaCm)} cm` : 'dati incompleti';
    return `<div class="carta-piatto" data-profilo="${p.id}">
      <span class="sigillo"><svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#utente"/></svg></span>
      <span class="corpo">
        <span class="titolo">${p.nome || 'Profilo'}</span>
        <span class="meta"><span>${misure}</span>${corrente ? '<span>in uso</span>' : ''}</span>
      </span>
      ${corrente
        ? '<span class="pillola pillola-accento">attivo</span>'
        : '<button class="bottone bottone-2" data-usa="' + p.id + '">Usa</button>'}
      <button class="bottone-icona" data-elimina="${p.id}" aria-label="Elimina ${p.nome || 'profilo'}">
        <svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#cestino"/></svg>
      </button>
    </div>`;
  }).join('');
}

async function gestisciProfili(e) {
  const usa = e.target.closest('[data-usa]');
  if (usa) {
    await impostaProfiloAttivo(usa.dataset.usa);
    await rendiProfili();
    return;
  }

  const elimina = e.target.closest('[data-elimina]');
  if (!elimina) return;

  const id = elimina.dataset.elimina;
  // Due passaggi invece di una finestra di sistema: la seconda pressione
  // e' una conferma esplicita, e si annulla da sola dopo qualche secondo.
  if (inAttesaDiConferma !== id) {
    inAttesaDiConferma = id;
    elimina.classList.add('bottone', 'bottone-pericolo');
    elimina.innerHTML = 'Confermi?';
    setTimeout(() => { if (inAttesaDiConferma === id) rendiProfili().then(() => { inAttesaDiConferma = null; }); }, 5000);
    return;
  }
  inAttesaDiConferma = null;
  await eliminaProfilo(id);
  await rendiProfili();
}

/* --- Export ---------------------------------------------------------------- */

async function esporta() {
  const p1 = $('#pass1').value;
  const p2 = $('#pass2').value;
  const esito = $('#esito-export');
  esito.hidden = false;
  esito.className = 'avviso avviso-pericolo';

  if (!attivo) { esito.textContent = 'Non c\'è nessun profilo da esportare.'; return; }
  if (p1.length < 8) { esito.textContent = 'La passphrase deve avere almeno 8 caratteri.'; return; }
  if (p1 !== p2) { esito.textContent = 'Le due passphrase non coincidono.'; return; }

  try {
    const fascicolo = await esportaFascicolo(attivo.id);
    const byte = await cifra(fascicolo, p1);
    scarica(byte, nomeFile(attivo));
    esito.className = 'avviso avviso-ok';
    esito.textContent = `Fascicolo di ${attivo.nome} esportato e cifrato. ${AVVISO_PASSPHRASE}`;
    $('#pass1').value = $('#pass2').value = '';
  } catch (err) {
    esito.textContent = `Export non riuscito: ${err.message}`;
  }
}

/* --- Import ---------------------------------------------------------------- */

async function importa() {
  const file = $('#file-import').files[0];
  const pass = $('#pass-import').value;
  const esito = $('#esito-import');
  esito.hidden = false;
  esito.className = 'avviso avviso-pericolo';

  if (!file) { esito.textContent = 'Scegli prima un file .equilibrio.'; return; }
  if (!pass) { esito.textContent = 'Serve la passphrase con cui è stato cifrato.'; return; }

  try {
    const fascicolo = await decifra(await leggiDaFile(file), pass);
    const p = await importaFascicolo(fascicolo);
    esito.className = 'avviso avviso-ok';
    esito.textContent = `Importato come «${p.nome}». Il profilo che era già qui non è stato toccato.`;
    $('#pass-import').value = '';
    $('#file-import').value = '';
    await rendiProfili();
  } catch (err) {
    if (err instanceof PassphraseErrata) {
      esito.textContent = 'Passphrase errata, oppure il file è stato modificato: non si apre.';
    } else if (err instanceof FormatoNonValido) {
      esito.textContent = err.message;
    } else {
      esito.textContent = `Import non riuscito: ${err.message}`;
    }
  }
}

/* --- Tema ------------------------------------------------------------------ */

function montaTema() {
  const corrente = temaSalvato() || 'auto';
  $('#tema').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tema === corrente)));

  $('#tema').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    applicaTema(b.dataset.tema);
    $('#tema').querySelectorAll('button').forEach((x) =>
      x.setAttribute('aria-selected', String(x === b)));
  });
}

/* --- Avvio ----------------------------------------------------------------- */

export async function inizializza() {
  avvia({ nav: 'altro' });
  montaTema();
  await rendiProfili();

  $('#profili').addEventListener('click', gestisciProfili);
  $('#esporta').addEventListener('click', esporta);
  $('#importa').addEventListener('click', importa);
}
