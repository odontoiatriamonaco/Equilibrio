/* Equilibrio — pagina Preferenze: gusti su pietanze e alimenti, allergie, tetti.
   Salva da sola: una pagina di preferenze con un pulsante «Salva» e' un invito
   a perdere il lavoro. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { montaTutor } from './tutor.js';
import { PASSI_PREFERENZE } from './tutor-passi.js';
import { montaBarraPercorso } from './barra-percorso.js';
import { CLASSI, alternaClasse, quantiTocca, PER_CLASSE } from './allergeni.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import {
  piatti, piattiScartati, alimenti, alimento, gruppi, iconaPiatto, TIPI,
  iconaAlimento, famigliaCibo, lenteRicettario,
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
  disegnaClassi();
  disegnaElenco();
  disegnaRiepilogo();
  // Il filo verso il passo dopo: c'e' solo finche' il percorso e' aperto.
  await montaBarraPercorso(profilo, 'gusti');

  // Dopo il disegno, sempre: il tutor chiede i suoi bersagli alla pagina.
  montaTutor(PASSI_PREFERENZE);
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

/* --- Le classi di allergene -------------------------------------------------
   Un interruttore per classe, con scritto sopra quanti alimenti tocca e quali.
   Il nome della classe da solo non basta: «frutta a guscio» sono le noci e le
   mandorle, ma qualcuno ci mette dentro anche le castagne, e sapere cosa toglie
   davvero e' l'unico modo per accorgersi che manca qualcosa.
   -------------------------------------------------------------------------- */

function disegnaClassi() {
  const attive = pref.classiAllergeni || [];

  $('#classi-allergeni').innerHTML = CLASSI.map((c) => {
    const su = attive.includes(c.id);
    return `
      <label class="riga-classe" data-attiva="${su}">
        <input type="checkbox" data-classe="${c.id}" ${su ? 'checked' : ''}>
        <span class="spunta"></span>
        <span class="nome">
          <strong>${c.nome}</strong>
          <br><span class="piccolo tenue">${c.esempio} · ${quantiTocca(c.id)} ${quantiTocca(c.id) === 1 ? 'alimento' : 'alimenti'}</span>
        </span>
      </label>`;
  }).join('');

  $$('#classi-allergeni [data-classe]').forEach((i) => i.addEventListener('change', () => {
    pref = alternaClasse(pref, i.dataset.classe);
    salva();
    disegnaClassi();
    disegnaElenco();
    disegnaRiepilogo();
  }));

  // Quanti alimenti spariscono in tutto. Le classi si sovrappongono — le
  // tagliatelle all'uovo stanno nel glutine E nelle uova — quindi si contano
  // gli alimenti, non la somma delle classi.
  const tolti = new Set(attive.flatMap((c) => PER_CLASSE[c] || []));
  $('#conta-esclusi').textContent = tolti.size
    ? `${tolti.size} alimenti esclusi, e con loro ogni piatto che li contiene.`
    : 'Nessuna classe segnata: il ricettario è intero.';
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

/**
 * Quante pietanze sparirebbero del tutto togliendo questo alimento.
 *
 * Non e' lo stesso numero per tutti: il prezzemolo non toglie niente, la pasta
 * di semola trenta pietanze su centocinquantatre. Al momento del tocco quel
 * costo non lo diceva nessuno, e chi si e' ritrovato il ricettario dimezzato
 * non aveva modo di collegarlo a sette segni messi settimane prima.
 *
 * `lenteRicettario` e' pura: si puo' chiamare per una simulazione senza
 * toccare il ricettario in uso.
 */
const costoDi = new Map();
function quantePietanzeCosta(alimentoId) {
  if (!costoDi.has(alimentoId)) {
    costoDi.set(alimentoId, lenteRicettario([], [alimentoId]).scartati.length);
  }
  return costoDi.get(alimentoId);
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
        ${g === 'omesso' && quantePietanzeCosta(a.id) > 0
    ? `<br><span class="piccolo" style="color: var(--sgarro-testo)">
        toglie ${quantePietanzeCosta(a.id)}
        ${quantePietanzeCosta(a.id) === 1 ? 'pietanza' : 'pietanze'} dal ricettario</span>`
    : ''}
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
