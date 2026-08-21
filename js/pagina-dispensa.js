/* Equilibrio — pagina «Cosa hai già»: la dispensa che esiste davvero.

   Fino a qui la dispensa si riempiva in un modo solo — con gli avanzi, a fine
   settimana. Il che vuol dire che la PRIMA spesa comprava tutto da zero: olio,
   sale, pasta, farina, quelli che in una cucina ci sono già sempre. Si spendeva
   una volta per niente, e non se ne accorgeva nessuno perché dalla seconda
   settimana in poi il conto tornava da sé.

   Qui si guarda negli sportelli prima di uscire. L'elenco è quello che la TUA
   settimana userà e nient'altro: chiedere di censire centoquaranta alimenti per
   usarne quaranta è il modo più sicuro di far abbandonare il censimento a metà. */

import { $, $$, avvia, icona, num, euro } from './guscio.js';
import { montaBarraPercorso } from './barra-percorso.js';
import { profiloAttivo } from './store.js';
import { caricaDispensa, salvaScorta } from './dati.js';
import { riferimentoDi, settimanaPer, settimaneDellaTavola } from './famiglia.js';
import { caricaRicettario } from './piatti-utente.js';
import { daAvereInCasa, costruisciLista } from './spesa.js';

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
 * Quanto costa la lista con e senza quello che hai già.
 *
 * Il risparmio si misura in confezioni intere, non in grammi: mezzo pacco di
 * pasta in casa non toglie mezzo pacco dal conto — toglie il pacco solo se
 * quello che resta basta. Per non riscrivere quella matematica, e per non
 * rischiare che le due strade dicano numeri diversi, la lista si costruisce due
 * volte con la stessa funzione e si guarda la differenza.
 */
function conti() {
  const opz = { commensali, membri: membri?.length > 1 ? membri : null };
  const senza = costruisciLista(settimana, { ...opz, dispensa: [] });
  const con = costruisciLista(settimana, { ...opz, dispensa });
  return {
    senza,
    con,
    risparmio: Math.round((senza.costo - con.costo) * 100) / 100,
    inMeno: senza.voci.length - con.voci.length,
  };
}

function rendiConto() {
  const { senza, con, risparmio, inMeno } = conti();

  if (!quadro.segnati) {
    $('#conto').innerHTML = `
      <p class="occhiello">La lista, per ora</p>
      <p class="dato-grande num" style="margin: var(--sp-2) 0">${euro(senza.costo)}</p>
      <p class="piccolo morbido" style="margin:0">${senza.voci.length} cose da comprare,
        come se la cucina fosse vuota. Segna qui sotto quello che hai già e questo
        numero scende.</p>`;
    return;
  }

  // «La spesa scende di», non «risparmiati»: sono due numeri diversi e sulla
  // pagina Spesa c'è già l'altro — «dalla dispensa arrivano X € di roba che non
  // serve ricomprare», che è il valore di quello che possiedi, grammo per
  // grammo. Questo qui è quanto pagherai in meno alla cassa, e sale a scatti
  // perché si compra a confezioni intere. Chiamarli tutti e due «risparmio»
  // farebbe sembrare che uno dei due sia sbagliato.
  const guadagno = [
    inMeno > 0 ? `<strong>${inMeno} ${inMeno === 1 ? 'cosa' : 'cose'} in meno</strong> da comprare` : '',
    risparmio > 0 ? `la spesa scende di <strong>${euro(risparmio)}</strong>` : '',
  ].filter(Boolean).join(', ');

  $('#conto').innerHTML = `
    <p class="occhiello">La lista, con quello che hai già</p>
    <p style="margin: var(--sp-2) 0">
      <span class="dato-grande num">${euro(con.costo)}</span>
      <span class="piccolo tenue" style="text-decoration: line-through; margin-left: var(--sp-3)">${euro(senza.costo)}</span>
    </p>
    <p class="piccolo morbido" style="margin:0">${guadagno ? `${guadagno}. ` : ''}Hai
      segnato ${quadro.segnati} ${quadro.segnati === 1 ? 'alimento' : 'alimenti'}
      su ${quadro.quanti}.</p>`;
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
  return `
    <div class="riga-avere${v.basta ? ' coperta' : ''}">
      <span class="nome">${v.nome}
        <br><span class="piccolo tenue">ne servono ${num(v.serve)} g${avanza}</span></span>
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

/** Riparte da cucina vuota. Tocca solo gli alimenti di questa settimana. */
async function azzera() {
  for (const v of quadro.voci) {
    if (v.hoGia > 0) await salvaScorta(profilo.id, v.alimentoId, 0);
  }
  dispensa = await caricaDispensa(profilo.id);
  disegna();
}
