/* Equilibrio — pagina Preferenze: gusti su pietanze e alimenti, allergie, tetti.
   Salva da sola: una pagina di preferenze con un pulsante «Salva» e' un invito
   a perdere il lavoro. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { montaBarraPercorso } from './barra-percorso.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import {
  piatti, piattiScartati, alimenti, alimento, gruppi, iconaPiatto, TIPI,
  iconaAlimento, famigliaCibo,
} from './alimenti.js';
import { settimanaPer } from './famiglia.js';
import {
  caricaPreferenze, salvaPreferenze, gustoPiatto, gustoAlimento, eAllergene,
  motivoEsclusione, imposta, alternaAllergia, impostaTetto,
  riepilogo, omessi, NOMI_TETTI, ICONE_TETTI,
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
  // Il filo verso il passo dopo: c'e' solo finche' il percorso e' aperto.
  await montaBarraPercorso(profilo, 'gusti');

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
  const ic = iconaPiatto(p);
  return `
    <div class="riga-gusto" data-gusto="${g}">
      <span class="sigillo-mini" data-cibo="${famigliaCibo(ic)}">${icona(ic, 'icona icona-sm')}</span>
      <span class="nome">${p.nome}${nota ? `<br>${nota}` : ''}</span>
      ${controllo('piatti', p.id, g)}
    </div>`;
}

function rigaAlimento(a) {
  const g = gustoAlimento(pref, a.id);
  const allergia = eAllergene(pref, a.id);
  // Anche gli alimenti hanno la loro icona: una lista di sole parole si legge
  // molto piu' lentamente di una dove il pesce si riconosce da lontano.
  const ic = iconaAlimento(a);
  return `
    <div class="riga-gusto" data-gusto="${g}" ${allergia ? 'data-allergica="si"' : ''}>
      <span class="sigillo-mini" data-cibo="${famigliaCibo(ic)}">${icona(ic, 'icona icona-sm')}</span>
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

  // Per un ALIMENTO il terzo stato non esclude il piatto: lo fa arrivare senza
  // quell'ingrediente. Per un PIATTO invece esclude il piatto, ovviamente.
  const terzo = tipo === 'alimenti'
    ? bottone('omesso', 'chiudi', 'Non lo metto nei piatti')
    : bottone('escluso', 'chiudi', 'Non lo voglio');

  return `
    <div class="gusti" role="group">
      ${bottone('amato', 'cuore', 'Mi piace')}
      ${bottone('neutro', 'meno', 'Indifferente')}
      ${terzo}
    </div>`;
}

async function cambia(tipo, id, valore) {
  const attuale = tipo === 'piatti' ? gustoPiatto(pref, id) : gustoAlimento(pref, id);
  // Ritoccare lo stesso pulsante torna al neutro: evita di restare incastrati.
  const nuovo = attuale === valore ? 'neutro' : valore;
  pref = imposta(pref, tipo, id, nuovo);
  await salvaPreferenze(pref);
  await montaBarraPercorso(profilo, 'gusti');

  // Togliere un alimento cambia i piatti, non solo una preferenza: il
  // ricettario va rifatto perche' i valori tornino giusti subito.
  if (tipo === 'alimenti') await caricaRicettario(profilo.id);

  segnalaSalvato();
  disegnaElenco();
  disegnaRiepilogo();
}

/**
 * Il piano di questa settimana non si riscrive quando cambi un gusto — e non
 * deve: rigenerarlo butterebbe via gli scambi fatti, le quantità corrette a mano
 * e gli sgarri prenotati. Ma quello che hai appena escluso può essere già lì
 * dentro, e scoprirlo mercoledì a pranzo è peggio che saperlo adesso.
 */
async function aggiornaNotaPiano() {
  const dove = $('#nota-piano');
  if (!dove || !profilo) return;

  const { settimana, avvisi, tetti } = await settimanaPer(profilo);
  if (!settimana || (!avvisi.length && !tetti.length)) { dove.innerHTML = ''; return; }

  const righe = [];
  if (avvisi.length) {
    const quante = avvisi.length;
    righe.push(`${quante === 1 ? "C'è ancora una pietanza" : `Ci sono ancora ${quante} pietanze`}
      che ora ${quante === 1 ? 'non ti va' : 'non ti vanno'} bene:
      ${avvisi.slice(0, 3).map((a) => a.nome).join(', ')}${quante > 3 ? ' e altre' : ''}.`);
  }
  if (tetti.length) {
    righe.push(`Supera ${tetti.length === 1 ? 'un tetto' : `${tetti.length} tetti`}:
      ${tetti.map((t) => `${(NOMI_TETTI[t.gruppo] || t.gruppo).toLowerCase()} ${t.quante} invece di ${t.tetto}`).join(', ')}.`);
  }

  dove.innerHTML = `
    <div class="avviso avviso-sgarro" style="margin-top:var(--sp-4)">
      ${icona('avviso', 'icona icona-sm')}
      <div>Nel piano di <strong>questa settimana</strong>: ${righe.join(' ')}
        Le scelte di qui valgono da adesso in avanti, non su quello che è già
        scritto. <a href="/piano.html">Vai al piano</a> e sistemalo a mano,
        oppure rigenera la settimana — sapendo che rigenerando si perdono gli
        scambi già fatti e gli sgarri prenotati.</div>
    </div>`;
}

/* --- Tetti settimanali ----------------------------------------------------- */

function disegnaTetti() {
  $('#tetti').innerHTML = Object.entries(pref.tetti).map(([g, v]) => `
    <div class="riga-tra" style="padding-block: var(--sp-2)">
      <span class="riga" style="gap: var(--sp-3); min-width:0">
        <span class="sigillo-mini" data-cibo="${famigliaCibo(ICONE_TETTI[g])}">
          ${icona(ICONE_TETTI[g] || 'piano', 'icona icona-sm')}
        </span>
        ${NOMI_TETTI[g] || g}
      </span>
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
        proposti in nessun piatto.</p>` : ''}
    ${rendiOmissioni()}
    <div id="nota-piano"></div>`;

  aggiornaNotaPiano();
}

/**
 * Cosa comporta davvero un «non lo metto»: quali piatti arrivano senza
 * quell'ingrediente, e quali non arrivano affatto perche' senza quella cosa
 * non sarebbero piu' loro.
 */
function rendiOmissioni() {
  const senza = omessi(pref);
  if (!senza.length) return '';

  const nomi = senza.map((id) => alimento(id)?.nome || id);
  const ridotti = piatti.filter((p) => p.omessi?.length).length;
  const persi = piattiScartati;

  return `
    <div class="avviso" style="margin-top:var(--sp-4)">
      ${icona('foglia', 'icona icona-sm')}
      <div>
        <strong>${nomi.join(', ')}</strong>: ${nomi.length === 1 ? 'non viene messo' : 'non vengono messi'}
        nei piatti. ${ridotti
    ? `${ridotti} ${ridotti === 1 ? 'pietanza arriva' : 'pietanze arrivano'} senza,
           con le calorie già ricalcolate.`
    : 'Nessuna pietanza del ricettario lo usava.'}
        ${persi.length ? `
          <div style="margin-top:var(--sp-2)">
            ${persi.length === 1 ? 'Una pietanza è invece uscita' : `${persi.length} pietanze sono invece uscite`}
            dal ricettario, perché toglierlo le snaturerebbe:
            ${persi.slice(0, 4).map((x) => `<em>${x.nome}</em> (${x.motivo})`).join(', ')}${persi.length > 4 ? '…' : ''}.
          </div>` : ''}
      </div>
    </div>`;
}

function segnalaSalvato() {
  const n = $('#stato-salvataggio');
  n.textContent = 'Salvato';
  setTimeout(() => { if (n.textContent === 'Salvato') n.textContent = ''; }, 1600);
}

function salva() {
  // Raggruppa le modifiche vicine: toccare cinque chip di fila non deve
  // scrivere cinque volte sul database.
  clearTimeout(attesaSalvataggio);
  $('#stato-salvataggio').textContent = '';
  attesaSalvataggio = setTimeout(async () => {
    await salvaPreferenze(pref);
    await montaBarraPercorso(profilo, 'gusti');
    $('#stato-salvataggio').textContent = 'Salvato';
    setTimeout(() => { $('#stato-salvataggio').textContent = ''; }, 1600);
  }, 400);
}
