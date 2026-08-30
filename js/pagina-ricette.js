/* Equilibrio — pagina Pietanze: sfoglia il ricettario, apri la scheda,
   scala le dosi sui commensali, modifica gli ingredienti. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { elenca } from './lingua.js';
import { montaTutor } from './tutor.js';
import { PASSI_PIETANZE } from './tutor-passi.js';
import { profiloAttivo } from './store.js';
import {
  piatti, piatto, valoriPiatto, ingredientiScalati, diStagione,
  etichette, iconaPiatto, alimento, TIPI,
} from './alimenti.js';
import { caricaRicettario } from './piatti-utente.js';
import { apriEditor, collegaEditor } from './editor-pietanza.js';

const MESE = new Date().getMonth() + 1;

const filtri = { testo: '', tipo: 'tutti', stagione: false, casa: false };
let commensali = 1;
let aperto = null;
let profilo = null;

export async function inizializza() {
  avvia({ nav: 'pietanze' });

  profilo = await profiloAttivo();
  await caricaRicettario(profilo?.id);

  $('#cerca').addEventListener('input', (e) => {
    filtri.testo = e.target.value.trim().toLowerCase();
    disegna();
  });

  $$('#tipi button').forEach((b) => b.addEventListener('click', () => {
    filtri.tipo = b.dataset.tipo;
    $$('#tipi button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    disegna();
  }));

  $('#solo-stagione').addEventListener('change', (e) => {
    filtri.stagione = e.target.checked;
    disegna();
  });

  $('#solo-casa').addEventListener('change', (e) => {
    filtri.casa = e.target.checked;
    disegna();
  });

  $('#scheda').addEventListener('click', (e) => {
    // Chiude toccando il fondo scuro fuori dal riquadro.
    if (e.target.id === 'scheda') $('#scheda').close();
  });
  $('#chiudi-scheda').addEventListener('click', () => $('#scheda').close());

  $('#meno-commensali').addEventListener('click', () => cambiaCommensali(-1));
  $('#piu-commensali').addEventListener('click', () => cambiaCommensali(1));

  collegaEditor();
  $('#modifica-piatto').addEventListener('click', modifica);
  $('#nuova-pietanza').addEventListener('click', creaNuova);

  disegna();
  vaiAlPiatto();

  // Dopo il disegno, sempre: il tutor chiede i suoi bersagli alla pagina, e
  // prima che sia disegnata non ne troverebbe nessuno.
  montaTutor(PASSI_PIETANZE);
}

/**
 * Si arriva da Oggi toccando la ricetta di un piatto: si atterra su QUELLA riga,
 * non in cima a centocinquanta.
 *
 * La riga si accende un momento — dire «è questa» e poi spegnersi è meglio di un
 * colore fisso, che resterebbe lì a chiedersi perché. E si apre anche la scheda,
 * perché chi tocca «vedi la ricetta» vuole la ricetta: chiudendola resta in vista
 * la riga giusta.
 *
 * Va chiamata DOPO `disegna()`, o le righe non esistono ancora nel documento.
 */
function vaiAlPiatto() {
  const id = new URLSearchParams(location.search).get('piatto');
  if (!id) return;

  const riga = document.querySelector(`#elenco [data-id="${CSS.escape(id)}"]`);
  if (!riga) return;

  // Istantaneo, non fluido: la scheda che si apre subito dopo e' modale, e
  // interrompe lo scorrimento animato a meta'. Cosi' invece la riga e' gia' al
  // suo posto dietro al dialogo, e chiudendolo ci si ritrova sopra.
  const portaci = () => riga.scrollIntoView({ block: 'center' });
  portaci();
  riga.classList.add('appena-arrivato');
  riga.addEventListener('animationend', () => riga.classList.remove('appena-arrivato'), { once: true });

  apri(id);
  // E di nuovo alla chiusura della scheda: se l'apertura del modale ha
  // spostato la pagina, chiudendola ci si ritrova comunque sulla riga giusta
  // invece che in cima a centocinquanta pietanze.
  $('#scheda').addEventListener('close', portaci, { once: true });
}

/* --- Modifica -------------------------------------------------------------- */

function senzaProfilo() {
  $('#esito-modifica').hidden = false;
  $('#esito-modifica').textContent = 'Le pietanze di casa appartengono a un profilo: '
    + 'creane uno e potrai salvare le tue versioni.';
}

function modifica() {
  if (!profilo) return senzaProfilo();
  $('#scheda').close();
  apriEditor({
    profilo: profilo.id,
    piatto: aperto,
    quandoSalva: (salvata) => {
      disegna();
      if (salvata) apri(salvata.id);
    },
  });
}

function creaNuova() {
  if (!profilo) return senzaProfilo();
  apriEditor({
    profilo: profilo.id,
    nuova: true,
    quandoSalva: (salvata) => {
      disegna();
      if (salvata) apri(salvata.id);
    },
  });
}

/* --- Elenco ---------------------------------------------------------------- */

/** I filtri accesi adesso, detti come si direbbero a voce. */
function attivi() {
  return [
    filtri.testo && `la ricerca «${filtri.testo}»`,
    filtri.tipo !== 'tutti' && `il tipo «${TIPI[filtri.tipo] || filtri.tipo}»`,
    filtri.stagione && 'solo di stagione',
    filtri.casa && 'solo le mie',
  ].filter(Boolean);
}

/** Toglie tutto, moduli compresi: spegnere un filtro che si vede ancora acceso
    sarebbe peggio di non spegnerlo. */
function azzeraFiltri() {
  filtri.testo = '';
  filtri.tipo = 'tutti';
  filtri.stagione = false;
  filtri.casa = false;

  $('#cerca').value = '';
  $('#solo-stagione').checked = false;
  $('#solo-casa').checked = false;
  $$('#tipi button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tipo === 'tutti')));
  disegna();
}

function selezionati() {
  return piatti.filter((p) => {
    if (filtri.tipo !== 'tutti' && p.tipo !== filtri.tipo) return false;
    if (filtri.stagione && !diStagione(p, MESE)) return false;
    if (filtri.casa && p.origine !== 'casa') return false;
    if (filtri.testo) {
      const cerca = [p.nome, ...(p.ingredienti || []).map((i) => alimento(i.a)?.nome || '')]
        .join(' ').toLowerCase();
      if (!cerca.includes(filtri.testo)) return false;
    }
    return true;
  });
}

function disegna() {
  const dove = $('#elenco');
  const diCasa = piatti.filter((p) => p.origine === 'casa').length;

  // «Solo le mie» esiste solo per chi ne ha: sul ricettario di partenza, che di
  // proprie non ne ha nessuna, saprebbe fare una cosa sola — svuotare la lista.
  // Se sparisce mentre e' acceso (hai appena cancellato l'ultima tua ricetta) si
  // spegne da se', o resteresti con un elenco vuoto e nessun comando per capire.
  $('#filtro-mie').hidden = diCasa === 0;
  if (!diCasa && filtri.casa) {
    filtri.casa = false;
    $('#solo-casa').checked = false;
  }

  const elenco = selezionati();

  $('#conteggio').textContent = (elenco.length === 1 ? '1 pietanza' : `${elenco.length} pietanze`)
    + (diCasa ? ` · ${diCasa} ${diCasa === 1 ? 'tua' : 'tue'}` : '');

  if (!elenco.length) {
    // Dire quali filtri stanno tagliando, e offrire di toglierli: «prova ad
    // allargare la ricerca» lascia il lavoro a chi legge, che pero' non vede
    // quanti filtri ha addosso — le linguette del tipo stanno in cima e ci si
    // dimentica di averne premuta una.
    dove.innerHTML = `
      <div class="scheda"><div class="vuoto">
        ${icona('cerca', 'icona icona-lg')}
        <p>Nessuna pietanza${attivi().length ? ` con ${elenca(attivi())}` : ''}.</p>
        ${attivi().length
    ? '<button class="bottone" id="azzera-filtri">Togli i filtri</button>'
    : ''}
      </div></div>`;
    $('#azzera-filtri')?.addEventListener('click', azzeraFiltri);
    return;
  }

  // Raggruppate per tipo: sfogliare un elenco piatto di centocinquanta voci e'
  // peggio che scorrere sei gruppi brevi.
  const perTipo = new Map();
  for (const p of elenco) {
    if (!perTipo.has(p.tipo)) perTipo.set(p.tipo, []);
    perTipo.get(p.tipo).push(p);
  }

  const ordine = ['colazione', 'spuntino', 'piatto-unico', 'primo', 'secondo', 'contorno'];
  dove.innerHTML = ordine
    .filter((t) => perTipo.has(t))
    .map((t) => `
      <section class="sezione" style="margin-block: var(--sp-6)">
        <header><h2>${TIPI[t] || t}</h2><span class="tenue piccolo">${perTipo.get(t).length}</span></header>
        <div class="pila">${perTipo.get(t).map(carta).join('')}</div>
      </section>`)
    .join('');

  $$('#elenco .carta-piatto').forEach((b) =>
    b.addEventListener('click', () => apri(b.dataset.id)));
}

function carta(p) {
  const v = valoriPiatto(p);
  const tag = etichette(p, MESE)
    .map((e) => `<span class="pillola ${e.tono}">${e.testo}</span>`).join('');
  return `
    <button class="carta-piatto" data-id="${p.id}">
      <span class="sigillo">${icona(iconaPiatto(p))}</span>
      <span class="corpo">
        <span class="titolo">${p.nome}</span>
        <span class="meta">
          <span class="num">${num(v.kcal)} kcal a porzione</span>
        </span>
        <span class="meta" style="margin-top:var(--sp-2); gap:var(--sp-1)">${tag}</span>
      </span>
      ${icona('avanti', 'icona icona-sm tenue')}
    </button>`;
}

/* --- Scheda ---------------------------------------------------------------- */

function cambiaCommensali(d) {
  commensali = Math.min(8, Math.max(1, commensali + d));
  rendiScheda();
}

function apri(id) {
  aperto = piatto(id);
  if (!aperto) return;
  commensali = 1;
  rendiScheda();
  $('#scheda').showModal();
}

function rendiScheda() {
  const p = aperto;
  if (!p) return;

  const v = valoriPiatto(p, 1);
  const ing = ingredientiScalati(p, commensali);

  $('#scheda-titolo').textContent = p.nome;
  $('#scheda-sigillo').innerHTML = icona(iconaPiatto(p));
  $('#scheda-tag').innerHTML = etichette(p, MESE)
    .map((e) => `<span class="pillola ${e.tono}">${e.testo}</span>`).join('');

  $('#modifica-piatto').innerHTML = p.origine === 'casa'
    ? `${icona('matita', 'icona icona-sm')} Modifica la tua versione`
    : `${icona('matita', 'icona icona-sm')} Modifica gli ingredienti`;

  $('#commensali').textContent = commensali;
  $('#commensali-parola').textContent = commensali === 1 ? 'porzione' : 'porzioni';

  $('#scheda-valori').innerHTML = `
    <div><dt>Calorie</dt><dd class="num">${num(v.kcal)} kcal</dd></div>
    <div><dt>Proteine</dt><dd class="num">${num(v.pro, 1)} g</dd></div>
    <div><dt>Carboidrati</dt><dd class="num">${num(v.car, 1)} g</dd></div>
    <div><dt>Grassi</dt><dd class="num">${num(v.gra, 1)} g</dd></div>
    <div><dt>Fibra</dt><dd class="num">${num(v.fib, 1)} g</dd></div>
    <div><dt>Sale</dt><dd class="num">${num((v.sod * 2.5) / 1000, 1)} g</dd></div>`;

  $('#scheda-ingredienti').innerHTML = ing.map((i) => `
    <li class="riga-tra" style="padding-block:var(--sp-2); border-bottom:1px solid var(--bordo)">
      <span>${i.alimento?.nome || `<em class="pericolo-testo">${i.a} — alimento mancante</em>`}</span>
      <span class="num morbido">${num(i.grammi)} g</span>
    </li>`).join('');

  const alleg = $('#scheda-alleggerimento');
  if (p.alleggerimento) {
    alleg.hidden = false;
    alleg.querySelector('div').innerHTML = p.alleggerimento;
  } else {
    alleg.hidden = true;
  }

  const proc = $('#scheda-procedimento');
  if (p.procedimento?.length) {
    proc.hidden = false;
    proc.querySelector('ol').innerHTML = p.procedimento
      .map((s) => `<li><strong>${s}</strong></li>`).join('');
  } else {
    proc.hidden = true;
  }

  // I valori del nucleo non sono ancora stati confrontati con la fonte:
  // dirlo e' piu' onesto che lasciar credere a una precisione che non c'e'.
  const daVerificare = (p.ingredienti || [])
    .some((i) => alimento(i.a) && alimento(i.a).verificato === false);
  $('#scheda-nota').hidden = !daVerificare;
}
