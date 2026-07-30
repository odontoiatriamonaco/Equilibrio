/* Equilibrio — pagina Preferenze: gusti su pietanze e alimenti, allergie, tetti.
   Salva da sola: una pagina di preferenze con un pulsante «Salva» e' un invito
   a perdere il lavoro. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import { piatti, alimenti, gruppi, iconaPiatto, TIPI } from './alimenti.js';
import {
  caricaPreferenze, salvaPreferenze, gustoPiatto, gustoAlimento, eAllergene,
  motivoEsclusione, prossimoGusto, imposta, alternaAllergia, impostaTetto,
  riepilogo, NOMI_TETTI,
} from './preferenze.js';

let pref = null;
let profilo = null;
let vista = 'piatti';
let cerca = '';
let attesaSalvataggio = null;

export async function inizializza() {
  avvia({ nav: 'altro' });

  profilo = await profiloAttivo();
  if (!profilo) {
    $('#senza-profilo').hidden = false;
    $('#contenuto').hidden = true;
    return;
  }

  await caricaRicettario(profilo.id);
  pref = await caricaPreferenze(profilo.id);
  $('#nome-profilo').textContent = profilo.nome || 'il tuo profilo';

  $('#cerca').addEventListener('input', (e) => {
    cerca = e.target.value.trim().toLowerCase();
    disegnaElenco();
  });

  $$('#viste button').forEach((b) => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    $$('#viste button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#cerca').placeholder = vista === 'piatti'
      ? 'Cerca una pietanza…'
      : 'Cerca un alimento…';
    disegnaElenco();
  }));

  disegnaTetti();
  disegnaElenco();
  disegnaRiepilogo();
}

/* --- Elenco dei gusti ------------------------------------------------------ */

function disegnaElenco() {
  const dove = $('#elenco');
  const voci = vista === 'piatti' ? vociPiatti() : vociAlimenti();

  if (!voci.length) {
    dove.innerHTML = `<div class="vuoto">${icona('cerca', 'icona icona-lg')}
      <p>Nessun risultato per «${cerca}».</p></div>`;
    return;
  }

  dove.innerHTML = voci.map(gruppo).join('');

  $$('#elenco [data-gusto-id]').forEach((b) => b.addEventListener('click', () => {
    const { gustoId, gustoTipo, gustoVal } = b.dataset;
    cambia(gustoTipo, gustoId, gustoVal);
  }));

  $$('#elenco [data-allergia]').forEach((b) => b.addEventListener('click', () => {
    pref = alternaAllergia(pref, b.dataset.allergia);
    salva();
    disegnaElenco();
    disegnaRiepilogo();
  }));
}

function vociPiatti() {
  const filtrati = piatti.filter((p) => !cerca || p.nome.toLowerCase().includes(cerca));
  const ordine = ['colazione', 'spuntino', 'piatto-unico', 'primo', 'secondo', 'contorno'];
  return ordine
    .map((t) => ({
      titolo: TIPI[t] || t,
      righe: filtrati.filter((p) => p.tipo === t).map((p) => rigaPiatto(p)),
    }))
    .filter((g) => g.righe.length);
}

function vociAlimenti() {
  const filtrati = alimenti.filter((a) => {
    if (!cerca) return true;
    return [a.nome, ...(a.sinonimi || [])].join(' ').toLowerCase().includes(cerca);
  });
  return gruppi.gruppi
    .map((g) => ({
      titolo: g.nome,
      nota: g.nota,
      righe: filtrati.filter((a) => a.gruppo === g.id).map((a) => rigaAlimento(a)),
    }))
    .filter((g) => g.righe.length);
}

function gruppo(g) {
  return `
    <section class="sezione" style="margin-block: var(--sp-6)">
      <header><h2>${g.titolo}</h2></header>
      ${g.nota ? `<p class="piccolo tenue" style="margin-bottom:var(--sp-3)">${g.nota}</p>` : ''}
      <div class="scheda" style="padding-block: var(--sp-2)">${g.righe.join('')}</div>
    </section>`;
}

function rigaPiatto(p) {
  const g = gustoPiatto(pref, p.id);
  const motivo = motivoEsclusione(pref, p);
  // Un piatto puo' essere fuori gioco per un ingrediente, non per se stesso:
  // dirlo evita la domanda «perche' non me lo propone mai?».
  const nota = motivo && motivo.tipo !== 'piatto-escluso'
    ? `<span class="piccolo ${motivo.tipo === 'allergia' ? 'pericolo-testo' : 'tenue'}">${motivo.testo}</span>`
    : '';
  return `
    <div class="riga-gusto">
      <span class="sigillo-mini">${icona(iconaPiatto(p), 'icona icona-sm')}</span>
      <span class="nome">${p.nome}${nota ? `<br>${nota}` : ''}</span>
      ${controllo('piatti', p.id, g)}
    </div>`;
}

function rigaAlimento(a) {
  const g = gustoAlimento(pref, a.id);
  const allergia = eAllergene(pref, a.id);
  return `
    <div class="riga-gusto" ${allergia ? 'data-allergica="si"' : ''}>
      <span class="nome">${a.nome}
        ${a.sinonimi?.length ? `<br><span class="piccolo tenue">${a.sinonimi.join(', ')}</span>` : ''}
      </span>
      <button class="bottone-icona" data-allergia="${a.id}"
              aria-pressed="${allergia}"
              title="${allergia ? 'Togli dalle allergie' : 'Segna come allergia o intolleranza'}">
        ${icona('blocco', 'icona icona-sm')}
      </button>
      ${controllo('alimenti', a.id, g, allergia)}
    </div>`;
}

function controllo(tipo, id, valore, bloccato = false) {
  const bottone = (v, ic, etichetta) => `
    <button data-gusto-id="${id}" data-gusto-tipo="${tipo}" data-gusto-val="${v}"
            aria-pressed="${valore === v}" aria-label="${etichetta}" title="${etichetta}"
            ${bloccato ? 'disabled' : ''}>${icona(ic, 'icona icona-sm')}</button>`;
  return `
    <div class="gusti" role="group">
      ${bottone('amato', 'cuore', 'Mi piace')}
      ${bottone('neutro', 'meno', 'Indifferente')}
      ${bottone('escluso', 'chiudi', 'Non lo voglio')}
    </div>`;
}

function cambia(tipo, id, valore) {
  const attuale = tipo === 'piatti' ? gustoPiatto(pref, id) : gustoAlimento(pref, id);
  // Ritoccare lo stesso pulsante torna al neutro: evita di restare incastrati.
  const nuovo = attuale === valore ? 'neutro' : valore;
  pref = imposta(pref, tipo, id, nuovo);
  salva();
  disegnaElenco();
  disegnaRiepilogo();
}

/* --- Tetti settimanali ----------------------------------------------------- */

function disegnaTetti() {
  $('#tetti').innerHTML = Object.entries(pref.tetti).map(([g, v]) => `
    <div class="riga-tra" style="padding-block: var(--sp-2)">
      <span>${NOMI_TETTI[g] || g}</span>
      <div class="riga" style="gap: var(--sp-1)">
        <button class="bottone-icona" data-tetto="${g}" data-d="-1" aria-label="Meno">
          ${icona('meno', 'icona icona-sm')}
        </button>
        <span class="num" style="min-width:3.5rem; text-align:center">
          <strong data-valore="${g}">${v}</strong>
          <span class="piccolo tenue">/ sett.</span>
        </span>
        <button class="bottone-icona" data-tetto="${g}" data-d="1" aria-label="Più">
          ${icona('piu', 'icona icona-sm')}
        </button>
      </div>
    </div>`).join('');

  $$('#tetti [data-tetto]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.tetto;
    const v = Math.min(7, Math.max(0, (pref.tetti[g] || 0) + Number(b.dataset.d)));
    pref = impostaTetto(pref, g, v);
    $(`[data-valore="${g}"]`).textContent = v;
    salva();
  }));
}

/* --- Riepilogo e salvataggio ----------------------------------------------- */

function disegnaRiepilogo() {
  const r = riepilogo(pref, piatti);
  $('#riepilogo').innerHTML = `
    <div class="griglia-2">
      <div><p class="dato-grande num">${num(r.ammessi)}</p>
           <p class="unita">pietanze proponibili</p></div>
      <div><p class="dato-grande num">${num(r.amati)}</p>
           <p class="unita">che hai messo tra le preferite</p></div>
      <div><p class="dato-grande num">${num(r.esclusi)}</p>
           <p class="unita">fuori gioco</p></div>
    </div>
    ${r.scarso ? `
      <div class="avviso avviso-pericolo" style="margin-top:var(--sp-4)">
        ${icona('avviso', 'icona icona-sm')}
        <div>Con ${r.ammessi} pietanze disponibili il menù della settimana
          diventerebbe ripetitivo. Prova a rimettere in gioco qualcosa.</div>
      </div>` : ''}
    ${r.allergie ? `
      <p class="piccolo tenue" style="margin-top:var(--sp-3)">
        ${r.allergie === 1 ? 'Un alimento è segnato' : `${r.allergie} alimenti sono segnati`}
        come allergia: sono esclusioni dure, non preferenze, e non verranno mai
        proposti in nessun piatto.</p>` : ''}`;
}

function salva() {
  // Raggruppa le modifiche vicine: toccare cinque chip di fila non deve
  // scrivere cinque volte sul database.
  clearTimeout(attesaSalvataggio);
  $('#stato-salvataggio').textContent = '';
  attesaSalvataggio = setTimeout(async () => {
    await salvaPreferenze(pref);
    $('#stato-salvataggio').textContent = 'Salvato';
    setTimeout(() => { $('#stato-salvataggio').textContent = ''; }, 1600);
  }, 400);
}
