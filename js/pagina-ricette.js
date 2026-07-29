/* Equilibrio — pagina Pietanze: sfoglia il ricettario, apri la scheda,
   scala le dosi sui commensali. */

import { avvia, icona, $, $$, num } from './guscio.js';
import {
  piatti, valoriPiatto, ingredientiScalati, diStagione,
  etichette, iconaPiatto, alimento, TIPI,
} from './alimenti.js';

const MESE = new Date().getMonth() + 1;

const filtri = { testo: '', tipo: 'tutti', stagione: false, tempo: 0 };
let commensali = 1;
let aperto = null;

export function inizializza() {
  avvia({ nav: 'pietanze' });

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

  $('#tempo').addEventListener('input', (e) => {
    filtri.tempo = Number(e.target.value);
    $('#tempo-valore').textContent = filtri.tempo ? `entro ${filtri.tempo} min` : 'qualsiasi';
    disegna();
  });

  $('#scheda').addEventListener('click', (e) => {
    // Chiude toccando il fondo scuro fuori dal riquadro.
    if (e.target.id === 'scheda') $('#scheda').close();
  });
  $('#chiudi-scheda').addEventListener('click', () => $('#scheda').close());

  $('#meno-commensali').addEventListener('click', () => cambiaCommensali(-1));
  $('#piu-commensali').addEventListener('click', () => cambiaCommensali(1));

  disegna();
}

function selezionati() {
  return piatti.filter((p) => {
    if (filtri.tipo !== 'tutti' && p.tipo !== filtri.tipo) return false;
    if (filtri.stagione && !diStagione(p, MESE)) return false;
    if (filtri.tempo && (p.tempo || 0) > filtri.tempo) return false;
    if (filtri.testo) {
      const cerca = [p.nome, ...(p.ingredienti || []).map((i) => alimento(i.a)?.nome || '')]
        .join(' ').toLowerCase();
      if (!cerca.includes(filtri.testo)) return false;
    }
    return true;
  });
}

function disegna() {
  const elenco = selezionati();
  const dove = $('#elenco');

  $('#conteggio').textContent = elenco.length === 1
    ? '1 pietanza'
    : `${elenco.length} pietanze`;

  if (!elenco.length) {
    dove.innerHTML = `
      <div class="scheda"><div class="vuoto">
        ${icona('cerca', 'icona icona-lg')}
        <p>Nessuna pietanza con questi filtri.<br>Prova ad allargare la ricerca.</p>
      </div></div>`;
    return;
  }

  // Raggruppate per tipo: sfogliare un elenco piatto di quaranta voci e' peggio
  // che scorrere quattro gruppi brevi.
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

function cambiaCommensali(d) {
  commensali = Math.min(8, Math.max(1, commensali + d));
  rendiScheda();
}

function apri(id) {
  aperto = piatti.find((p) => p.id === id);
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
      <span>${i.alimento?.nome || `<em class="pericolo">${i.a} — alimento mancante</em>`}</span>
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
