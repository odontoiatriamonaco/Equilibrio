/* Equilibrio — pagina «Cosa hai già»: la dispensa che esiste davvero.

   Fino a qui la dispensa si riempiva in un modo solo — con gli avanzi, a fine
   settimana. Il che vuol dire che la PRIMA spesa comprava tutto da zero: olio,
   sale, pasta, farina, quelli che in una cucina ci sono già sempre. Si spendeva
   una volta per niente, e non se ne accorgeva nessuno perché dalla seconda
   settimana in poi il conto tornava da sé.

   Qui si guarda negli sportelli prima di uscire. L'elenco è quello che la TUA
   settimana userà e nient'altro: chiedere di censire centoquaranta alimenti per
   usarne quaranta è il modo più sicuro di far abbandonare il censimento a metà. */

import { $, $$, avvia, icona, num } from './guscio.js';
import { montaBarraPercorso } from './barra-percorso.js';
import { profiloAttivo } from './store.js';
import { caricaDispensa, salvaScorta, svuotaDispensa } from './dati.js';
import { riferimentoDi, settimanaPer, settimaneDellaTavola } from './famiglia.js';
import { caricaRicettario } from './piatti-utente.js';
import { daAvereInCasa, costruisciLista } from './spesa.js';
import { alimento } from './alimenti.js';
import { comeStaMessa, perFretta } from './conservazione.js';

let profilo = null;
let settimana = null;
let membri = null;
let commensali = 1;
let dispensa = [];
let quadro = null;

function mostraSolo(sel) {
  $('#contenuto').hidden = true;
  $(sel).hidden = false;
}

export async function inizializza() {
  avvia({ nav: 'spesa' });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg) return mostraSolo('#senza-profilo');

  // La dispensa è di casa, non di una persona: se segui il menù di qualcuno la
  // cucina è la stessa, e quello che c'è nello sportello vale per tutti.
  const capo = (await riferimentoDi(profilo)) || profilo;
  membri = await settimaneDellaTavola(capo);
  settimana = membri.find((m) => m.profilo.id === profilo.id)?.settimana
    || (await settimanaPer(profilo)).settimana
    || membri[0]?.settimana;
  if (!settimana) return mostraSolo('#senza-piano');

  commensali = settimana.commensali || 1;
  await caricaRicettario(profilo.id);
  dispensa = await caricaDispensa(profilo.id);

  $('#ho-le-basi').addEventListener('click', segnaLeBasi);
  $('#azzera').addEventListener('click', azzera);

  disegna();
  await montaBarraPercorso(profilo, 'dispensa');
}

/* --- Il conto, che è poi il motivo per cui uno lo fa ------------------------ */

/**
 * Quante cose resterebbero da comprare, con e senza quello che hai già.
 *
 * Si contano le COSE, non gli euro: i prezzi sono stime e una stima sbagliata
 * confonde più di quanto informi — è la ragione per cui il costo è sparito
 * anche dalla lista della spesa.
 *
 * Il conto si fa costruendo la lista due volte con la stessa funzione, invece
 * di riscriverne la matematica: mezzo pacco di pasta in casa non toglie una
 * riga dalla lista, la toglie solo se quello che resta basta.
 */
function conti() {
  const opz = { commensali, membri: membri?.length > 1 ? membri : null };
  const senza = costruisciLista(settimana, { ...opz, dispensa: [] });
  const con = costruisciLista(settimana, { ...opz, dispensa });
  return { senza, con, inMeno: senza.voci.length - con.voci.length };
}

function rendiConto() {
  const { senza, con, inMeno } = conti();

  if (!quadro.segnati) {
    $('#conto').innerHTML = `
      <p class="occhiello">La lista, per ora</p>
      <p class="dato-grande num" style="margin: var(--sp-2) 0">${senza.voci.length} cose</p>
      <p class="piccolo morbido" style="margin:0">da comprare, come se la cucina fosse
        vuota. Segna qui sotto quello che hai già e questo numero scende.</p>`;
    return;
  }

  rendiFretta();
  $('#conto').innerHTML = `
    <p class="occhiello">La lista, con quello che hai già</p>
    <p style="margin: var(--sp-2) 0">
      <span class="dato-grande num">${con.voci.length} cose</span>
      <span class="piccolo tenue" style="text-decoration: line-through; margin-left: var(--sp-3)">${senza.voci.length}</span>
    </p>
    <p class="piccolo morbido" style="margin:0">${inMeno > 0
    ? `<strong>${inMeno} in meno</strong> da comprare. ` : ''}Hai segnato
      ${quadro.segnati} ${quadro.segnati === 1 ? 'alimento' : 'alimenti'} su ${quadro.quanti}.</p>`;
}

/**
 * Cosa va usato prima. È l'ordine che il piano segue quando sceglie i piatti,
 * e mostrarlo serve a poterlo smentire: se la mozzarella l'hai già finita, la
 * togli da qui e la settimana prossima non ci gira intorno.
 */
function rendiFretta() {
  const urgenti = perFretta(dispensa)
    .map((s) => ({ s, m: comeStaMessa(s) }))
    .filter((x) => x.m.stato === 'urgente' || x.m.stato === 'scaduta' || x.m.stato === 'presto');

  const nodo = $('#fretta');
  nodo.hidden = !urgenti.length;
  if (!urgenti.length) return;

  nodo.innerHTML = `
    ${icona('orologio', 'icona icona-sm')}
    <div><strong>Da usare prima:</strong>
      ${urgenti.slice(0, 6).map((x) => `${nomeAlimento(x.s.alimentoId)} <span class="piccolo tenue">(${x.m.testo})</span>`).join(' · ')}${
  urgenti.length > 6 ? ` e altri ${urgenti.length - 6}` : ''}.
      <br><span class="piccolo">Quando rigeneri la settimana, il piano preferisce i piatti che
      se li portano via.</span></div>`;
}

/**
 * Il nome per esteso. Dal catalogo, non dall'elenco della settimana: in dispensa
 * ci sta anche quello che questa settimana non si usa — ed e' proprio quello il
 * caso in cui urge di piu', perche' nessun piatto in programma se lo porta via.
 */
function nomeAlimento(id) {
  return alimento(id)?.nome || id;
}

/* --- L'elenco, reparto per reparto ------------------------------------------ */

function disegna() {
  quadro = daAvereInCasa(settimana, {
    commensali,
    membri: membri?.length > 1 ? membri : null,
    dispensa,
  });

  rendiConto();

  $('#elenco').innerHTML = quadro.reparti.map((r) => `
    <section class="reparto scheda">
      <h3>${icona(r.icona, 'icona icona-sm')} ${r.nome}</h3>
      ${r.voci.map(rigaAvere).join('')}
    </section>`).join('');

  $$('#elenco [data-tutto]').forEach((b) => b.addEventListener('click', async () => {
    const v = quadro.voci.find((x) => x.alimentoId === b.dataset.tutto);
    // Lo stesso tocco mette e toglie: chi sbaglia sportello non deve cercare
    // un secondo pulsante per disdirsi.
    await scriviScorta(b.dataset.tutto, v.basta ? 0 : v.serve);
  }));

  $$('#elenco [data-quanti]').forEach((i) => i.addEventListener('change', async () => {
    await scriviScorta(i.dataset.quanti, Math.max(0, Number(i.value) || 0));
  }));
}

/**
 * Una riga: quanto ne serve, quanto ne hai, e un modo per dirlo in un tocco.
 *
 * Il caso vero è «ce l'ho», non «ne ho trecentottanta grammi»: chi apre lo
 * sportello vede un pacco, non una bilancia. Quindi un tocco basta, e la
 * casella resta per chi il pacco lo vuole pesare davvero.
 */
function rigaAvere(v) {
  const avanza = v.hoGia > v.serve ? ` · ne hai ${num(v.hoGia)}, avanza` : '';
  // Come sta messa, solo se ce l'hai: su una cosa che non hai la scadenza non
  // vuol dire niente.
  const messa = v.hoGia > 0 ? comeStaMessa({ alimentoId: v.alimentoId, dal: v.dal }) : null;
  const fretta = messa && messa.stato !== 'calma'
    ? ` · <span class="fretta" data-fretta="${messa.stato}">${messa.testo}</span>`
    : '';
  return `
    <div class="riga-avere${v.basta ? ' coperta' : ''}">
      <span class="nome">${v.nome}
        <br><span class="piccolo tenue">ne servono ${num(v.serve)} g${avanza}${fretta}</span></span>
      <input class="quanti num" type="number" inputmode="numeric" min="0" step="10"
             data-quanti="${v.alimentoId}" value="${v.hoGia || ''}" placeholder="0"
             aria-label="Quanti grammi di ${v.nome} hai già">
      <button class="bottone bottone-fantasma" data-tutto="${v.alimentoId}"
              aria-pressed="${v.basta}"
              aria-label="${v.basta ? `Non ho ${v.nome}` : `Ho abbastanza ${v.nome}`}">
        ${icona(v.basta ? 'spunta' : 'piu', 'icona icona-sm')}
        Ce l’ho
      </button>
    </div>`;
}

async function scriviScorta(alimentoId, grammi) {
  await salvaScorta(profilo.id, alimentoId, grammi);
  dispensa = await caricaDispensa(profilo.id);
  disegna();
}

/* --- Le due scorciatoie ----------------------------------------------------- */

/**
 * Il reparto «Dispensa» segnato in blocco: olio, sale, pasta, riso, scatolame.
 *
 * È la scorciatoia onesta perché è lo scaffale che in una cucina avviata c'è
 * quasi sempre. Dice a voce alta quanti ne ha segnati, così quello che non hai
 * lo correggi adesso invece di scoprirlo davanti al fornello.
 */
async function segnaLeBasi() {
  const base = quadro.reparti.find((r) => r.id === 'dispensa');
  if (!base) return;

  for (const v of base.voci) {
    if (v.hoGia < v.serve) await salvaScorta(profilo.id, v.alimentoId, v.serve);
  }
  dispensa = await caricaDispensa(profilo.id);
  disegna();

  $('#conto').insertAdjacentHTML('beforeend', `
    <div class="avviso" style="margin-top: var(--sp-3)">
      ${icona('info', 'icona icona-sm')}
      <div>Segnati <strong>${base.voci.length}</strong> alimenti del reparto Dispensa.
        Quelli che <em>non</em> hai correggili qui sotto: meglio due tocchi adesso
        che accorgersene davanti al fornello.</div>
    </div>`);
}

/**
 * Svuota la dispensa per intero, non solo gli alimenti di questa settimana.
 *
 * Dentro ci finiscono anche gli avanzi delle settimane passate, che in questo
 * elenco non compaiono: azzerare solo quello che si vede lascerebbe scorte
 * invisibili a sottrarsi dalla lista, e nessun modo di accorgersene. Quindi si
 * dice quante sono e si cancella tutto — ma solo dopo aver chiesto, perché è
 * l'unica cosa in questa pagina che non si disfa con un secondo tocco.
 */
async function azzera() {
  const quante = dispensa.length;
  if (!quante) return;

  const fuoriSettimana = quante - quadro.segnati;
  const dettaglio = fuoriSettimana > 0
    ? `

Di ${quante}, ${fuoriSettimana} ${fuoriSettimana === 1 ? 'è un avanzo' : 'sono avanzi'}`
      + ' di settimane passate: qui sotto non si vedono, ma dalla lista si tolgono.'
    : '';

  if (!window.confirm(`Svuoto la dispensa? ${quante} ${quante === 1 ? 'scorta sparisce' : 'scorte spariscono'}`
    + ` e la lista tornerà a comprare tutto.${dettaglio}`)) return;

  await svuotaDispensa(profilo.id);
  dispensa = await caricaDispensa(profilo.id);
  disegna();
}
