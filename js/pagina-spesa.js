/* Equilibrio — pagina Spesa: la lista per reparto, la dispensa, l'antispreco. */

import { avvia, icona, $, $$, num, condividiTesto } from './guscio.js';
import { montaTutor } from './tutor.js';
import { PASSI_SPESA } from './tutor-passi.js';
import { montaBarraPercorso } from './barra-percorso.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import {
  caricaSettimana, caricaDispensa, salvaScorta, caricaSpesa, salvaSpesa, segnaAvanzi,
} from './dati.js';
import {
  costruisciLista, quantitaLeggibile, comeTesto, residuiInDispensa, avanzoDi,
} from './spesa.js';
import { suggerimentiAntispreco, residuoDaSegnalare } from './packaging.js';
import { caricaPreferenze } from './preferenze.js';
import { alimento, gruppi } from './alimenti.js';
import {
  pubblica, scarica, mandaSpunta, sincronizza,
  normalizzaCodice, codiceValido, codiceLeggibile,
} from './lista-condivisa.js';
import { riferimentoDi, settimaneDellaTavola } from './famiglia.js';

let codiceLista = null;
let avanziIl = null;
let profilo = null;
let settimana = null;
let membri = [];
const esclusi = new Set();
let lista = null;
let spunte = new Map();
let dispensa = [];
let pref = null;

export async function inizializza() {
  avvia({ nav: 'spesa' });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg) return mostraSolo('#senza-profilo');

  // La spesa si fa per chi mangia a casa. Se il profilo attivo segue qualcuno,
  // il carrello e' quello della tavola di quel qualcuno: si compra una volta.
  const capo = (await riferimentoDi(profilo)) || profilo;
  membri = await settimaneDellaTavola(capo);

  settimana = membri.find((m) => m.profilo.id === profilo.id)?.settimana
    || membri[0]?.settimana;
  if (!settimana) return mostraSolo('#senza-piano');

  await caricaRicettario(profilo.id);
  pref = await caricaPreferenze(profilo.id);
  dispensa = await caricaDispensa(profilo.id);

  const salvata = await caricaSpesa(profilo.id, settimana.inizio);
  spunte = new Map((salvata?.voci || []).map((v) => [v.alimentoId, v]));
  codiceLista = salvata?.codice || null;
  avanziIl = salvata?.avanziIl || null;
  if (codiceLista) {
    $('#riquadro-codice').hidden = false;
    $('#codice-lista').textContent = codiceLeggibile(codiceLista);
  }

  $('#commensali').value = String(settimana.commensali || 1);
  $('#commensali').addEventListener('change', ricostruisci);
  rendiTavola();
  $('#copia').addEventListener('click', copia);
  $('#stampa').addEventListener('click', () => window.print());
  $('#in-dispensa').addEventListener('click', metteInDispensa);
  $('#svuota-spunte').addEventListener('click', async () => {
    spunte = new Map();
    await persisti();
    disegna();
  });

  $('#pubblica').addEventListener('click', pubblicaLista);
  $('#apri-codice').addEventListener('click', () => $('#dialogo-remota').showModal());
  $('#chiudi-remota').addEventListener('click', () => $('#dialogo-remota').close());
  $('#carica-remota').addEventListener('click', caricaRemota);
  $('#manda-codice').addEventListener('click', mandaCodice);

  ricostruisci();
  // Il filo verso il passo dopo: c'e' solo finche' il percorso e' aperto.
  await montaBarraPercorso(profilo, 'spesa');

  // Dopo il disegno, sempre: il tutor chiede i suoi bersagli alla pagina, e
  // prima che sia disegnata non ne troverebbe nessuno.
  montaTutor(PASSI_SPESA);
}

/* --- Condivisione col codice ----------------------------------------------- */

async function pubblicaLista() {
  const esito = await pubblica(lista, spunte);
  const nota = $('#esito-condivisione');

  if (!esito.ok) {
    nota.hidden = false;
    nota.className = 'avviso avviso-pericolo';
    nota.textContent = esito.messaggio;
    return;
  }

  codiceLista = esito.codice;
  await salvaSpesa(profilo.id, settimana.inizio, [...spunte.values()], codiceLista);
  $('#riquadro-codice').hidden = false;
  $('#codice-lista').textContent = codiceLeggibile(codiceLista);
  nota.hidden = true;
}

/**
 * Riallinea la copia condivisa, se ce n'e' una.
 * Senza questo, chi e' al supermercato continua a vedere la lista com'era al
 * momento della pubblicazione: cambiare i commensali o mettere qualcosa in
 * dispensa non arrivava a destinazione.
 */
async function allineaCondivisa() {
  if (!codiceLista || !lista) return;
  await sincronizza(codiceLista, lista, spunte);
}

async function caricaRemota() {
  const codice = normalizzaCodice($('#codice-inserito').value);
  const nota = $('#esito-remota');

  if (!codiceValido(codice)) {
    nota.hidden = false;
    nota.className = 'avviso avviso-pericolo';
    nota.textContent = 'Il codice è di dieci caratteri, come ABCDE-FGHJK.';
    return;
  }

  const esito = await scarica(codice);
  if (!esito.ok) {
    nota.hidden = false;
    nota.className = 'avviso avviso-pericolo';
    nota.textContent = esito.messaggio;
    $('#remota-elenco').innerHTML = '';
    return;
  }

  nota.hidden = true;
  disegnaRemota(codice, esito.voci);
}

function disegnaRemota(codice, voci) {
  const perReparto = new Map();
  for (const v of voci) {
    if (!perReparto.has(v.reparto)) perReparto.set(v.reparto, []);
    perReparto.get(v.reparto).push(v);
  }

  const ordine = new Map(gruppi.reparti.map((r) => [r.id, r]));
  const sezioni = [...perReparto.entries()]
    .sort((a, b) => (ordine.get(a[0])?.ordine || 99) - (ordine.get(b[0])?.ordine || 99));

  $('#remota-elenco').innerHTML = sezioni.map(([rep, elenco]) => `
    <section class="reparto">
      <h3>${icona(ordine.get(rep)?.icona || 'spesa', 'icona icona-sm')} ${ordine.get(rep)?.nome || rep}</h3>
      ${elenco.map((v) => `
        <label class="voce-spesa">
          <input type="checkbox" data-remota="${v.alimentoId}" ${v.spuntato ? 'checked' : ''}>
          <span class="spunta"></span>
          <span class="nome">${v.nome}</span>
          <span class="qta num">${v.quantita}</span>
        </label>`).join('')}
    </section>`).join('');

  const stato = new Map(voci.map((v) => [v.alimentoId, v]));

  $$('#remota-elenco [data-remota]').forEach((c) => c.addEventListener('change', async () => {
    const id = c.dataset.remota;
    const voce = {
      ...stato.get(id),
      spuntato: c.checked,
      spuntatoIl: new Date().toISOString(),
    };
    stato.set(id, voce);

    // Si manda subito la singola voce: al supermercato la rete va e viene, e
    // una spunta trattenuta e' una spunta persa. Il server fonde per voce,
    // quindi mandarne una sola non cancella il lavoro dell'altro.
    const esito = await mandaSpunta(codice, voce);
    const nota = $('#esito-remota');
    if (esito.ok) {
      nota.hidden = true;
    } else {
      nota.hidden = false;
      nota.className = 'avviso';
      nota.textContent = 'Spunta segnata qui, ma non ancora inviata: riprovo alla prossima.';
    }
  }));
}

function mostraSolo(sel) {
  $$('#contenuto, #senza-profilo, #senza-piano').forEach((e) => { e.hidden = true; });
  $(sel).hidden = false;
}

/**
 * Chi mangia a casa questa settimana. Con una persona sola resta il vecchio
 * selettore del numero; da due in su non ha piu' senso — ognuno ha le sue
 * porzioni e la lista e' la loro somma.
 */
function rendiTavola() {
  const soloUno = membri.length < 2;
  $('#riquadro-commensali').hidden = !soloUno;
  $('#riquadro-tavola').hidden = soloUno;
  if (soloUno) return;

  $('#tavola').innerHTML = membri.map((m) => `
    <label class="interruttore">
      <input type="checkbox" data-membro="${m.profilo.id}" ${esclusi.has(m.profilo.id) ? '' : 'checked'}>
      <span class="leva"></span>
      <span>${m.profilo.nome || 'Profilo'}</span>
    </label>`).join('');

  $$('#tavola [data-membro]').forEach((c) => c.addEventListener('change', () => {
    if (c.checked) esclusi.delete(c.dataset.membro);
    else esclusi.add(c.dataset.membro);
    ricostruisci();
  }));
}

function ricostruisci() {
  // Con piu' persone a tavola il moltiplicatore non serve piu': ognuno ha le
  // sue porzioni e la lista e' la loro somma, non una moltiplicazione.
  const aTavola = membri.filter((m) => !esclusi.has(m.profilo.id));
  if (aTavola.length > 1) {
    lista = costruisciLista(settimana, { membri: aTavola, dispensa });
  } else {
    const commensali = Number($('#commensali').value) || 1;
    lista = costruisciLista(settimana, { commensali, dispensa });
  }
  disegna();
  allineaCondivisa();
}

/* --- Disegno --------------------------------------------------------------- */

function disegna() {
  const fatte = lista.voci.filter((v) => spunte.get(v.alimentoId)?.spuntato).length;

  // Niente euro: i prezzi sono stime, e «92,80 €» su uno scontrino che ne farà
  // 71 fa dubitare anche dei grammi, che invece sono giusti. Quello che serve
  // davvero mentre si spinge il carrello è quante cose restano.
  $('#riepilogo').innerHTML = `
    <div class="griglia-2">
      <div><p class="dato-grande num">${num(lista.articoli)}</p><p class="unita">articoli</p></div>
      <div><p class="dato-grande num">${num(fatte)}</p><p class="unita">già nel carrello</p></div>
    </div>
    ${lista.coperti > 0 ? `
      <p class="piccolo morbido" style="margin-top:var(--sp-3)">
        ${lista.coperti} ${lista.coperti === 1 ? 'cosa' : 'cose'} non ${lista.coperti === 1 ? 'la' : 'le'}
        compri: ${lista.coperti === 1 ? 'ce l’hai' : 'ce le hai'} già in dispensa.</p>` : ''}`;

  $('#reparti').innerHTML = lista.reparti.map(rendiReparto).join('');

  $$('#reparti input[type="checkbox"]').forEach((c) => c.addEventListener('change', async () => {
    spunte.set(c.dataset.id, {
      ...spunte.get(c.dataset.id),
      alimentoId: c.dataset.id,
      spuntato: c.checked,
      spuntatoIl: new Date().toISOString(),
    });
    await persisti();
    aggiornaConteggio();
  }));

  $$('#reparti [data-presi]').forEach((i) => i.addEventListener('input', () => {
    // Subito, mentre scrivi: se dici 1000 g su una retina da 2 kg, l'avanzo
    // deve scendere sotto gli occhi. Aggiornare la sola riga, e non ridisegnare
    // tutto, serve a non farti sparire la casella da sotto le dita.
    const v = lista.voci.find((x) => x.alimentoId === i.dataset.presi);
    const nodo = $(`[data-nota="${i.dataset.presi}"]`);
    if (v && nodo) nodo.textContent = notaVoce(v, i.value === '' ? undefined : Number(i.value));
  }));

  $$('#reparti [data-presi]').forEach((i) => i.addEventListener('change', async () => {
    const g = Number(i.value);
    const id = i.dataset.presi;
    spunte.set(id, {
      ...spunte.get(id),
      alimentoId: id,
      // Vuoto vuol dire «quello che c'era scritto»: non è zero, è «non l'ho
      // corretto». Zero lo si scrive, e vuol dire che non l'hai trovato.
      acquistato: i.value === '' ? undefined : Math.max(0, g || 0),
    });
    await persisti();
  }));

  disegnaAntispreco();
  rendiAvanzi();
}

function rendiReparto(r) {
  return `
    <section class="reparto">
      <h3>${icona(r.icona, 'icona icona-sm')} ${r.nome}</h3>
      ${r.voci.map(rigaVoce).join('')}
    </section>`;
}

/**
 * Una riga della lista, con quanto ne hai preso DAVVERO.
 *
 * La lista dice «1 mazzo (500 g)», ma al banco il mazzo era da 700. Prima
 * quella differenza si perdeva: gli avanzi di fine settimana si calcolavano
 * sulla confezione teorica, e i 200 g in più non esistevano per nessuno.
 * Adesso la casella si corregge, e quei grammi la settimana prossima ci sono.
 */
function rigaVoce(v) {
  const segno = spunte.get(v.alimentoId);
  const stato = segno?.spuntato ? 'checked' : '';
  const nota = notaVoce(v, segno?.acquistato);

  return `
    <div class="voce-spesa">
      <label class="presa">
        <input type="checkbox" data-id="${v.alimentoId}" ${stato}>
        <span class="spunta"></span>
        <span class="nome">${v.nome}
          <br><span class="piccolo tenue" data-nota="${v.alimentoId}">${nota}</span>
        </span>
      </label>
      <span class="qta num">${quantitaLeggibile(v)}</span>
      <span class="presi">
        <input class="num" type="number" inputmode="numeric" min="0" step="10"
               data-presi="${v.alimentoId}" placeholder="${v.acquistato}"
               value="${segno?.acquistato ?? ''}"
               aria-label="Quanti grammi di ${v.nome} hai preso davvero">
        <span class="piccolo tenue">g presi</span>
      </span>
    </div>`;
}

/**
 * La riga sotto il nome: quanto ne chiede la dieta, poi il resto.
 *
 * «Servono» è il numero che si va a cercare davanti allo scaffale — la quantità
 * a destra dice quanto se ne COMPRA, un mazzo o una confezione, e non è la
 * stessa cosa. E l'avanzo segue quello che hai preso DAVVERO: se scrivi 1000 g
 * di arance su una retina da 2 kg, l'avanzo scende subito, invece di continuare
 * a dire il numero della confezione che non hai comprato.
 */
function notaVoce(v, presi) {
  const pezzi = [`servono ${num(v.serve)} g`];
  if (v.inCasa > 0) pezzi.push(`${num(v.inCasa)} g già in casa`);

  const avanzo = avanzoDi(v, presi);
  if (residuoDaSegnalare(v.alimentoId, avanzo)) pezzi.push(`ne avanzano ${num(avanzo)} g`);
  return pezzi.join(' · ');
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

/* --- Dispensa ---------------------------------------------------------------
   Qui c'era l'elenco della dispensa, con la cancellazione voce per voce e lo
   svuotamento. Era di prima che la dispensa avesse una pagina sua: adesso e'
   un doppione, e due posti dove fare la stessa cosa sono due posti dove
   chiedersi se siano davvero la stessa cosa. Di questa pagina resta il
   passaggio che le appartiene — quello che avanza dalla spesa entra in
   dispensa — e per il resto c'e' il pulsante «Dispensa» in cima.
   -------------------------------------------------------------------------- */

/**
 * Mettere gli avanzi in dispensa CHIUDE la settimana, e si fa una volta sola.
 *
 * Premendolo due volte, prima, la lista impazziva: gli avanzi si ricalcolavano
 * su una dispensa gia' avanzata di una settimana, quindi la stessa settimana
 * veniva contata due volte. Su un piano da 1900 kcal la dispensa rimbalzava fra
 * 18,7 kg e 2 kg e la spesa fra 159 e 40 euro, a ogni pressione.
 */
async function metteInDispensa() {
  if (avanziIl) return rendiAvanzi();

  // Quello che hai corretto a mano vince su quello che la confezione prevedeva.
  const comprato = new Map();
  for (const s of spunte.values()) {
    if (s?.acquistato !== undefined && s.acquistato !== null) comprato.set(s.alimentoId, s.acquistato);
  }
  const scorte = residuiInDispensa(lista, profilo.id, { comprato });
  for (const s of scorte) await salvaScorta(profilo.id, s.alimentoId, s.grammi);
  await segnaAvanzi(profilo.id, settimana.inizio);
  avanziIl = new Date().toISOString().slice(0, 10);

  dispensa = await caricaDispensa(profilo.id);
  ricostruisci();
  rendiAvanzi();
  $('#esito').hidden = false;
  $('#esito').textContent = `${scorte.length} avanzi messi in dispensa. `
    + 'La settimana prossima li sottraggo dalla lista.';
}

/**
 * Il pulsante dice da solo se il lavoro e' gia' fatto.
 * Disattivarlo e basta lascerebbe chiedere perche'; e per correggere un avanzo
 * sbagliato c'e' il cestino sulla riga, che e' il posto giusto.
 */
function rendiAvanzi() {
  const b = $('#in-dispensa');
  b.disabled = Boolean(avanziIl);
  b.title = avanziIl
    ? 'Gli avanzi di questa settimana sono già in dispensa. Per correggerne uno, '
      + 'usa il cestino sulla sua riga.'
    : '';
  b.lastChild.textContent = avanziIl ? ' Avanzi già messi' : ' Metti gli avanzi';
}

/* --- Condivisione ---------------------------------------------------------- */

/**
 * Il messaggio che parte in chat.
 *
 * Porta il codice E dove usarlo: un codice da solo, arrivato su WhatsApp fra
 * altri venti messaggi, non dice a nessuno cosa farsene. L'indirizzo si prende
 * da dove gira l'app, cosi' resta giusto anche se un giorno cambia.
 */
function messaggioCodice() {
  return [
    'Ecco la lista della spesa.',
    '',
    `Codice: ${codiceLeggibile(codiceLista)}`,
    '',
    `Aprila qui: ${location.origin}`,
    'Vai su Spesa, poi «Apri con un codice». Le spunte tornano indietro.',
    'Il codice scade fra due giorni.',
  ].join('\n');
}

async function mandaCodice() {
  if (!codiceLista) return;
  const nota = $('#esito-condivisione');
  const esito = await condividiTesto(messaggioCodice(), 'Lista della spesa');

  nota.hidden = esito === 'condiviso';
  nota.className = esito === 'niente' ? 'avviso avviso-pericolo' : 'avviso';
  if (esito === 'copiato') nota.textContent = 'Messaggio copiato: incollalo dove vuoi.';
  if (esito === 'niente') {
    nota.textContent = `Non riesco a copiare da qui: detta il codice ${codiceLeggibile(codiceLista)}.`;
  }
}

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
  allineaCondivisa();
}

export { gruppi };
