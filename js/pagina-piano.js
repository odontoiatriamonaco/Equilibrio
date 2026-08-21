/* Equilibrio — pagina Piano: la settimana, gli scambi, lo sgarro. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { profiloAttivo, profili, origineDi } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import {
  settimanaPer, salvaPersonalizzazione, lenteDi, settimaneDellaTavola,
} from './famiglia.js';
import {
  allinea, porzioniDellaTavola, pubblicaMenu, spazioLocale, leggiSpazio,
  proponiScambio, decidiProposte, proposteInAttesa, raccontaArrivo,
} from './spazio-famiglia.js';
import { caricaPreferenze, NOMI_TETTI } from './preferenze.js';
import { caricaSettimana, salvaSettimana } from './dati.js';
import {
  generaSettimana, kcalGiorno, valoriGiorno, inizioSettimana, iso,
  indiceOggi, GIORNI,
} from './planner.js';
import {
  nomeVoce, valoriVoce, iconaPiatto, vociOggetto, piatto, TIPI,
  dosiVoce, dosePrincipale,
} from './alimenti.js';
import { alternativePiatto, scambiaPiatto } from './scambi.js';
import {
  calcolaRecupero, applicaRecupero, racconta, slittamentoTraguardo,
} from './sgarro.js';
import { rendiFascia } from './ui-budget.js';
import sgarriCatalogo from '../data/sgarri.json';

const NOMI_PASTO = {
  colazione: 'Colazione',
  'spuntino-mattina': 'Spuntino',
  pranzo: 'Pranzo',
  'spuntino-pomeriggio': 'Spuntino',
  cena: 'Cena',
};

let profilo = null;
let energia = null;
let pref = null;
let settimana = null;
let scambioAperto = null;
let riferimento = null;
let avvisiFamiglia = [];
let tettiSforati = [];
/** Chi mangia quanto, voce per voce. Vuoto per chi non cucina per altri. */
let divisione = [];

export async function inizializza() {
  avvia({ nav: 'piano' });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg) {
    $('#senza-profilo').hidden = false;
    $('#contenuto').hidden = true;
    return;
  }

  energia = riepilogoEnergia(profilo);
  await caricaRicettario(profilo.id);
  pref = await caricaPreferenze(profilo.id);

  // Prima di disegnare: se dallo spazio famiglia è arrivato un menù nuovo va
  // messo in casa adesso, o si guarderebbe la settimana scorsa.
  const arrivo = await allinea(profilo);

  const derivata = await settimanaPer(profilo);
  settimana = derivata.settimana;
  riferimento = derivata.riferimento;
  avvisiFamiglia = derivata.avvisi;
  tettiSforati = derivata.tetti || [];
  divisione = await preparaDivisione();

  // Chi segue non rigenera: il menu' lo decide il riferimento, altrimenti
  // la settimana si sdoppierebbe e non si cucinerebbe piu' una volta sola.
  if (riferimento) {
    $('#rigenera').hidden = true;
    $('#genera').hidden = true;
  }

  $('#rigenera').addEventListener('click', () => rigenera());
  $('#genera').addEventListener('click', () => rigenera());
  $('#apri-sgarro').addEventListener('click', apriSgarro);
  $('#chiudi-scambio').addEventListener('click', () => $('#scambio').close());
  $('#scambio-tempo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tempo]');
    if (!b) return;
    tempoScambio = Number(b.dataset.tempo);
    rendiScaglioni();
    disegnaAlternative();
  });
  $('#chiudi-sgarro').addEventListener('click', () => $('#dialogo-sgarro').close());
  $('#conferma-sgarro').addEventListener('click', confermaSgarro);
  $$('#dialogo-sgarro [name="modo"]').forEach((r) =>
    r.addEventListener('change', aggiornaAnteprimaSgarro));
  $('#sgarro-catalogo').addEventListener('change', () => {
    const scelto = sgarriCatalogo.sgarri.find((s) => s.id === $('#sgarro-catalogo').value);
    if (scelto) $('#sgarro-kcal').value = scelto.kcal;
    aggiornaAnteprimaSgarro();
  });
  $('#sgarro-kcal').addEventListener('input', aggiornaAnteprimaSgarro);
  $('#sgarro-giorno').addEventListener('change', aggiornaAnteprimaSgarro);

  disegna();
  rendiArrivo(arrivo);
  if (arrivo.spazio) await rendiProposte(arrivo.spazio);
}

/* --- Generazione ----------------------------------------------------------- */

async function rigenera() {
  const seme = Math.floor(Math.random() * 2 ** 31);
  settimana = generaSettimana({
    target: energia.fabbisogno.target,
    floor: energia.fabbisogno.floor,
    preferenze: pref,
    mese: new Date().getMonth() + 1,
    seme,
    commensali: profilo.commensali || 1,
    inizio: inizioSettimana(new Date()),
    // Le condizioni dichiarate nel profilo entrano nella scelta dei piatti,
    // non solo in un avviso.
    vincoli: energia.vincoliSalute,
  });
  await salvaSettimana(profilo.id, settimana);
  divisione = await preparaDivisione();
  disegna();

  // Chi ha aperto lo spazio ha appena cambiato la cena a tutta la famiglia:
  // il menù parte subito, senza un secondo pulsante da ricordarsi di premere.
  if ((await spazioLocale())?.chiave) {
    const esito = await pubblicaMenu(profilo, settimana);
    rendiArrivo(esito.ok
      ? { attivo: true, mandato: true }
      : { attivo: true, messaggio: esito.messaggio });
  }
}

/**
 * Dove siamo nella rampa di avvio. Il piano di questa settimana e' tarato su un
 * target piu' alto di quello a regime, e va detto: altrimenti sembra un errore.
 */
function rendiAvvio() {
  const nota = $('#nota-avvio');
  if (!energia.avvio?.attivo) { nota.hidden = true; return; }

  const { settimana: s, di } = energia.avvio;
  nota.hidden = false;
  nota.querySelector('div').innerHTML = `<strong>Avvio graduale, settimana ${s} di ${di}.</strong>
    Il piano di questi giorni è tarato su ${energia.fabbisogno.target} kcal invece di
    ${energia.fabbisogno.targetPieno}: si scende un poco alla volta.
    ${s === di ? 'Da lunedì si va a regime.' : `Ancora ${(di - s) * 7} giorni di salita.`}`;
}

/**
 * Chi decide il menù, e cosa in quel menù non va bene per chi lo segue.
 * I pasti problematici non si tolgono: un buco non si può cucinare, e la
 * scelta del sostituto resta a chi mangia.
 */
function rendiRiferimento() {
  const nota = $('#nota-riferimento');
  const righe = [];

  if (riferimento) {
    righe.push(`Segui il menù di <strong>${riferimento.nome}</strong>: gli stessi piatti,
      con le porzioni calcolate sul tuo fabbisogno.`);
  }

  // Vale per tutti, non solo per chi segue: se dopo aver generato il piano hai
  // escluso una pietanza che c'era dentro, il piano non si riscrive da solo —
  // buttarebbe via scambi, quantità corrette a mano e sgarri prenotati — ma
  // l'app te lo deve dire invece di mostrartela come se niente fosse.
  if (avvisiFamiglia.length) {
    const quanti = avvisiFamiglia.length;
    const elenco = avvisiFamiglia.slice(0, 3).map((a) => `${a.nome} (${a.motivo})`).join(', ');
    righe.push(`In questa settimana ${quanti === 1 ? "c'è" : 'ci sono'}
      <strong>${quanti} ${quanti === 1 ? 'pietanza' : 'pietanze'}</strong> che ora
      ${quanti === 1 ? 'non ti va' : 'non ti vanno'} bene: ${elenco}${quanti > 3 ? ' e altre' : ''}.
      Tocca lo scambio su quella riga per sceglierne un'altra${riferimento
    ? ': cambia solo nel tuo piatto.'
    : ', oppure rigenera la settimana — ma rigenerando si perdono gli scambi già fatti, le quantità corrette a mano e gli sgarri prenotati.'}`);
  }

  // Un tetto parla della settimana, non di un piatto: non si marca nessuna riga,
  // si dice il conto. Tre formaggi sono troppi, non lo è il terzo.
  if (tettiSforati.length) {
    righe.push(`Questa settimana supera ${tettiSforati.length === 1 ? 'un tetto' : `${tettiSforati.length} tetti`}
      che hai impostato: ${tettiSforati.map((t) => `<strong>${(NOMI_TETTI[t.gruppo] || t.gruppo).toLowerCase()}</strong>
      ${t.quante} ${t.quante === 1 ? 'volta' : 'volte'} invece di ${t.tetto}`).join(', ')}.
      I tetti valgono da adesso in avanti: questo piano era già scritto.`);
  }

  nota.hidden = !righe.length;
  nota.className = (avvisiFamiglia.length || tettiSforati.length) ? 'avviso avviso-sgarro' : 'avviso';
  nota.querySelector('div').innerHTML = righe.join(' ');
}

/* --- Lo spazio della famiglia ----------------------------------------------- */

/**
 * Chi mangia quanto, per chi cucina.
 *
 * Serve a chi decide il menù: sono le sue pentole. A chi segue non serve —
 * sapere quanto mangia il fratello non lo aiuta a mangiare il suo piatto.
 */
async function preparaDivisione() {
  if (riferimento || !settimana) return [];

  const membri = await settimaneDellaTavola(profilo);
  const loc = await spazioLocale();
  const dallaRete = loc?.codice ? await leggiSpazio(loc.codice) : null;

  const tavola = porzioniDellaTavola(dallaRete?.ok ? dallaRete : null, membri);
  // Con una persona sola non c'e' niente da dividere.
  return tavola.length > 1 ? tavola : [];
}

/**
 * Il menù è cambiato: si dice, con chi e quando.
 * Automatico ma mai silenzioso — ritrovarsi una cena diversa senza spiegazione
 * è peggio che doverla chiedere.
 */
function rendiArrivo(arrivo) {
  const nota = $('#nota-spazio');
  const testo = raccontaArrivo(arrivo, nomeDiId);
  nota.hidden = !testo;
  if (testo) nota.querySelector('div').innerHTML = testo;
}

/** Il nome di un piatto, o il suo id se qui non lo si conosce. */
function nomeDiId(id) {
  return piatto(id)?.nome || id;
}

/**
 * Le richieste ancora da decidere, per chi cucina.
 *
 * Accettando, il sostituto entra nello strato personale di chi l'ha chiesto:
 * il menù comune non cambia per gli altri, e qui si sa che per quella persona
 * quel piatto è un altro — che è esattamente quello che serve per cucinare.
 */
async function rendiProposte(spazio) {
  const scheda = $('#proposte');
  const attesa = proposteInAttesa(spazio, profilo);
  scheda.hidden = !attesa.length;
  if (!attesa.length) return;

  $('#proposte-elenco').innerHTML = attesa.map((p) => `
    <div class="riga-tra" style="gap:var(--sp-3); padding-block:var(--sp-2);
                border-bottom:1px solid var(--bordo); flex-wrap:wrap">
      <span>
        <strong>${p.nome}</strong> chiede <strong>${nomeDiId(p.nuovoId)}</strong>
        ${p.alPostoDi ? `al posto di ${nomeDiId(p.alPostoDi)}` : ''}
        <br><span class="piccolo tenue">${etichettaChiave(p.chiave)}</span>
      </span>
      <span class="riga" style="gap:var(--sp-2)">
        <button class="bottone bottone-2" data-decide="${p.id}" data-stato="accettata">Va bene</button>
        <button class="bottone bottone-fantasma" data-decide="${p.id}" data-stato="rifiutata">No</button>
      </span>
    </div>`).join('');

  $$('#proposte-elenco [data-decide]').forEach((b) => b.addEventListener('click', async () => {
    const p = attesa.find((x) => x.id === b.dataset.decide);
    const esito = await decidiProposte([{ id: p.id, stato: b.dataset.stato }]);
    if (!esito.ok) return rendiArrivo({ attivo: true, messaggio: esito.messaggio });

    // Accettando si scrive anche qui: il piano e la spesa di casa devono
    // sapere che per quella persona quel piatto è un altro.
    if (b.dataset.stato === 'accettata' && p.inizio) {
      const suo = (await profili()).find((x) => origineDi(x) === p.da);
      if (suo) await salvaPersonalizzazione(suo.id, p.inizio, p.chiave, { sostituto: p.nuovoId });
    }

    divisione = await preparaDivisione();
    await rendiProposte(esito);
    disegna();
    return rendiArrivo({
      attivo: true,
      messaggio: b.dataset.stato === 'accettata'
        ? `Detto a ${p.nome}. Nella spesa entra ${nomeDiId(p.nuovoId)} al posto del suo piatto.`
        : `Detto a ${p.nome}: resta il piatto di prima.`,
    });
  }));
}

/** «lun|pranzo|0» detto in italiano. */
function etichettaChiave(chiave) {
  const [g, pasto] = String(chiave).split('|');
  const giorno = { lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì',
    ven: 'venerdì', sab: 'sabato', dom: 'domenica' }[g] || g;
  return `${giorno}, ${(NOMI_PASTO[pasto] || pasto).toLowerCase()}`;
}

/* --- Disegno --------------------------------------------------------------- */

function disegna() {
  $('#vuoto').hidden = Boolean(settimana);
  $('#settimana').hidden = !settimana;
  $('#barra-azioni').hidden = !settimana;
  if (!settimana) return;

  const oggi = indiceOggi(settimana);

  rendiFascia($('#fascia'), {
    target: settimana.target,
    giorni: settimana.giorni.map((g, i) => ({
      etichetta: g.etichetta,
      quota: g.quota ?? kcalGiorno(g),
      stato: g.stato || (g.rigido ? 'rigido' : 'normale'),
      oggi: i === oggi,
    })),
  });

  if (settimana.recupero?.motivo) {
    $('#nota-recupero').hidden = false;
    $('#nota-recupero div').textContent = settimana.recupero.motivo;
  } else {
    $('#nota-recupero').hidden = true;
  }

  rendiAvvio();
  rendiRiferimento();

  $('#settimana').innerHTML = settimana.giorni
    .map((g, i) => cartaGiorno(g, i, i === oggi)).join('');

  $$('#settimana [data-scambia]').forEach((b) => b.addEventListener('click', (e) => {
    // Il bottone sta dentro un <summary>: senza questo, scambiare aprirebbe
    // anche l'elenco delle dosi.
    e.preventDefault();
    e.stopPropagation();
    const [giorno, pasto, indice] = b.dataset.scambia.split('|');
    apriScambio(Number(giorno), pasto, Number(indice));
  }));

  $$('#settimana [data-rigido]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.rigido);
    settimana.giorni[i].rigido = !settimana.giorni[i].rigido;
    await salvaSettimana(profilo.id, settimana);
    disegna();
  }));

}

function cartaGiorno(giorno, indice, eOggi) {
  const v = valoriGiorno(giorno);
  const kcal = giorno.quota ?? v.kcal;
  const data = new Date(giorno.data);

  const pasti = Object.entries(giorno.pasti).map(([pasto, voci]) => `
    <div class="pasto">
      <p class="occhiello">${NOMI_PASTO[pasto]}</p>
      ${voci.map((voce, i) => rigaVoce(voce, indice, pasto, i)).join('')}
    </div>`).join('');

  const marca = giorno.stato === 'sgarro'
    ? `<span class="pillola pillola-sgarro">${giorno.sgarro?.etichetta || 'Sgarro'}</span>`
    : giorno.stato === 'recupero'
      ? `<span class="pillola pillola-verde">−${num(giorno.recuperoKcal || 0)} kcal</span>`
      : '';

  return `
    <details class="giorno scheda" ${eOggi ? 'open' : ''}>
      <summary>
        <span class="giorno-nome">
          <strong>${data.toLocaleDateString('it-IT', { weekday: 'long' })}</strong>
          <span class="piccolo tenue">${data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
        </span>
        ${marca}
        <span class="num giorno-kcal">${num(kcal)} <span class="unita">kcal</span></span>
      </summary>

      <div class="giorno-corpo">
        <div class="riga-tra piccolo morbido" style="margin-bottom: var(--sp-3)">
          <span>P ${num(v.pro, 0)} g · C ${num(v.car, 0)} g · G ${num(v.gra, 0)} g · fibra ${num(v.fib, 0)} g${
  // Il sale si mostra solo a chi ha un tetto: agli altri e' un numero in piu'
  // che non serve a niente.
  energia.vincoliSalute?.sodioMax
    ? ` · <span class="${v.sod > energia.vincoliSalute.sodioMax ? 'sgarro-testo' : ''}">sale ${
      num((v.sod * 2.5) / 1000, 1)} g</span>`
    : ''
}</span>
          <button class="bottone bottone-fantasma" data-rigido="${indice}"
                  title="Un giorno rigido non viene alleggerito dal recupero di uno sgarro">
            ${icona(giorno.rigido ? 'blocco' : 'orologio', 'icona icona-sm')}
            ${giorno.rigido ? 'Giorno rigido' : 'Rendi rigido'}
          </button>
        </div>
        ${pasti}
      </div>
    </details>`;
}

/**
 * Quanto ne va in pentola in tutto, e quanto ne tocca a ciascuno.
 *
 * E' il numero che serve davvero a chi cucina: «144 g di pasta» si pesa, tre
 * porzioni diverse no. Si divide sull'ingrediente che fa il piatto, lo stesso
 * che si mostra nella pillola: due numeri sulla stessa cosa si confrontano.
 */
function divisioneVoce(voce, chiave) {
  if (!divisione.length || voce.tipo !== 'piatto') return null;

  const quote = divisione
    .map((m) => ({
      nome: m.nome,
      dose: dosePrincipale({ ...voce, porzioni: m.porzioni[chiave] ?? voce.porzioni ?? 1 }),
    }))
    .filter((q) => q.dose?.grammi > 0);
  if (quote.length < 2) return null;

  return {
    totale: quote.reduce((s, q) => s + q.dose.grammi, 0),
    alimento: quote[0].dose.alimento.nome,
    quote,
  };
}

function rigaVoce(voce, giorno, pasto, indice) {
  const oggetto = vociOggetto(voce);
  const kcal = valoriVoce(voce).kcal;
  const tipo = voce.tipo === 'piatto' ? TIPI[oggetto?.tipo] || '' : 'Contorno di pane';
  const commensali = settimana.commensali || 1;

  // La grammatura dell'ingrediente che fa il piatto. E' il numero che si va a
  // cercare: un moltiplicatore non si pesa.
  const guida = dosePrincipale(voce, commensali);
  const dosi = dosiVoce(voce, commensali);

  // La pillola resta corta per stare in riga, ma «73 g» da solo non dice di
  // cosa: il nome per esteso va a chi legge con lo schermo e a chi passa sopra.
  const etichetta = voce.nonPerMe
    ? `<span class="pillola pillola-sgarro" title="${voce.nonPerMe}">da cambiare</span>`
    : guida
      ? `<span class="pillola pillola-dato num" title="${guida.alimento.nome}">
           ${num(guida.grammi)} g<span class="solo-lettori"> di ${guida.alimento.nome.toLowerCase()}</span>
         </span>`
      : '';

  const elenco = dosi.map((d) => `
    <li class="riga-tra">
      <span>${d.alimento?.nome || d.a}</span>
      <span class="num morbido">${num(d.grammi)} g</span>
    </li>`).join('');

  // Le porzioni si dicono ancora, ma in coda e in piccolo: servono a capire
  // perche' le dosi non sono quelle del ricettario, non a cucinare.
  const quante = voce.porzioni !== 1
    ? ` · ${num(voce.porzioni, 2).replace(',00', '')} porzioni` : '';

  return `
    <details class="voce-piano">
      <summary>
        <span class="sigillo-mini">${icona(voce.tipo === 'piatto' ? iconaPiatto(oggetto || {}) : 'panetteria', 'icona icona-sm')}</span>
        <span class="nome">
          ${nomeVoce(voce)}
          <span class="piccolo tenue">${tipo} · ${num(kcal)} kcal${quante}</span>
        </span>
        ${etichetta}
        ${voce.tipo === 'piatto' ? `
          <button class="bottone-icona" data-scambia="${giorno}|${pasto}|${indice}"
                  aria-label="Scambia ${nomeVoce(voce)}">
            ${icona('scambia', 'icona icona-sm')}
          </button>` : ''}
      </summary>
      ${elenco ? `<ul class="dosi">${elenco}</ul>` : ''}
      ${rendiDivisione(divisioneVoce(voce, `${settimana.giorni[giorno].etichetta}|${pasto}|${indice}`))}
    </details>`;
}

function rendiDivisione(d) {
  if (!d) return '';
  return `
    <p class="in-pentola">
      <strong class="num">${num(d.totale)} g</strong> di ${d.alimento.toLowerCase()} in tutto
      <span class="quote">${d.quote
    .map((q) => `${q.nome} <span class="num">${num(q.dose.grammi)}</span>`).join(' · ')}</span>
    </p>`;
}

/* --- Scambio --------------------------------------------------------------- */


/**
 * Il tetto di minuti scelto nel dialogo dello scambio.
 *
 * Vive solo finché il dialogo è aperto, e riparte da «qualsiasi» ogni volta:
 * è la risposta a «giovedì ho un imprevisto», non un'impostazione che uno si
 * porta dietro senza accorgersene.
 */
let tempoScambio = 0;
const SCAGLIONI = [
  { min: 0, testo: 'Qualsiasi' },
  { min: 15, testo: 'entro 15 min' },
  { min: 30, testo: 'entro 30 min' },
  { min: 45, testo: 'entro 45 min' },
];

function rendiScaglioni() {
  $('#scambio-tempo').innerHTML = SCAGLIONI.map((s) => `
    <button type="button" data-tempo="${s.min}" aria-pressed="${s.min === tempoScambio}">${s.testo}</button>
  `).join('');
}

async function apriScambio(giorno, pasto, indice) {
  const voce = settimana.giorni[giorno].pasti[pasto][indice];

  const usati = new Set(settimana.giorni
    .flatMap((g) => Object.values(g.pasti).flat())
    .map((v) => v.id));

  // Chi segue cerca nel PROPRIO ricettario: le sue pietanze di casa, i suoi
  // alimenti tolti. Quello in uso porta la lente di chi decide il menù.
  const lente = riferimento ? await lenteDi(profilo.id) : null;

  // Il contesto resta a disposizione: cambiando il tetto dei minuti la lista si
  // rifà senza dover riaprire il dialogo.
  scambioAperto = { giorno, pasto, indice, voce, lente, usati };
  tempoScambio = 0;
  rendiScaglioni();

  $('#scambio-titolo').textContent = riferimento
    ? `Al posto di «${nomeVoce(voce)}», solo per te`
    : `Al posto di «${nomeVoce(voce)}»`;

  disegnaAlternative();
  $('#scambio').showModal();
}

function disegnaAlternative() {
  const { voce, lente, usati } = scambioAperto;

  const alternative = alternativePiatto(voce, {
    preferenze: pref,
    mese: new Date().getMonth() + 1,
    esclusiIds: usati,
    quanti: 10,
    tempoMax: tempoScambio,
    ...(lente ? { piatti: lente.piatti } : {}),
  });

  $('#scambio-elenco').innerHTML = alternative.length
    ? alternative.map((a) => `
        <button class="carta-piatto" data-nuovo="${a.id}">
          <span class="sigillo">${icona(iconaPiatto(piatto(a.id) || {}))}</span>
          <span class="corpo">
            <span class="titolo">${a.nome}</span>
            <span class="meta">
              <span class="num">${num(a.kcal)} kcal</span>
              <span>${a.tempo} min</span>
              ${a.stagione ? '<span>di stagione</span>' : ''}
            </span>
          </span>
        </button>`).join('')
    : `<div class="vuoto"><p>${tempoScambio
    ? `Niente di adatto entro ${tempoScambio} minuti. Prova ad allargare il tempo.`
    : 'Non ci sono alternative disponibili con le tue preferenze.'}</p></div>`;

  $$('#scambio-elenco [data-nuovo]').forEach((b) => b.addEventListener('click', async () => {
    if (riferimento) {
      const g = settimana.giorni[scambioAperto.giorno];
      const chiave = `${g.etichetta}|${scambioAperto.pasto}|${scambioAperto.indice}`;

      // Con lo spazio famiglia attivo il menù lo cucina qualcuno che sta su un
      // altro telefono: cambiarselo da soli vorrebbe dire trovarsi in tavola un
      // piatto che nessuno ha comprato. Si chiede, e si aspetta.
      if (await spazioLocale()) {
        const esito = await proponiScambio(profilo, {
          inizio: settimana.inizio,
          chiave,
          nuovoId: b.dataset.nuovo,
          alPostoDi: voce.id,
        });
        $('#scambio').close();
        rendiArrivo(esito.ok
          ? { attivo: true, chiesto: riferimento.nome }
          : { attivo: true, messaggio: esito.messaggio });
        return;
      }

      // Tutti sullo stesso dispositivo: si cambia solo nel proprio piatto, e
      // resta scritto nello strato personale. Gli altri non se ne accorgono.
      await salvaPersonalizzazione(profilo.id, settimana.inizio, chiave,
        { sostituto: b.dataset.nuovo });
      const derivata = await settimanaPer(profilo);
      settimana = derivata.settimana;
      avvisiFamiglia = derivata.avvisi;
  tettiSforati = derivata.tetti || [];
    } else {
      settimana = scambiaPiatto(settimana, { ...scambioAperto, nuovoId: b.dataset.nuovo });
      await salvaSettimana(profilo.id, settimana);
    }
    $('#scambio').close();
    disegna();
  }));
}

/* --- Sgarro ---------------------------------------------------------------- */

/* --- Il catalogo degli sgarri -----------------------------------------------
   Novantasette voci: in un elenco unico non si trovano. Prima si dice dov'eri
   con un tocco, poi si sceglie fra le poche voci che restano.
   -------------------------------------------------------------------------- */

let categoriaSgarro = 'tutte';

function rendiCategorieSgarro() {
  const conta = (id) => sgarriCatalogo.sgarri.filter((s) => s.categoria === id).length;
  const voci = [
    { id: 'tutte', nome: 'Tutte', quante: sgarriCatalogo.sgarri.length },
    ...sgarriCatalogo.categorie.map((c) => ({ ...c, quante: conta(c.id) })),
  ];

  $('#sgarro-categorie').innerHTML = voci.map((c) => `
    <button type="button" data-categoria="${c.id}" aria-pressed="${c.id === categoriaSgarro}">
      ${c.nome} <span class="conta">${c.quante}</span>
    </button>`).join('');

  $$('#sgarro-categorie [data-categoria]').forEach((b) => b.addEventListener('click', () => {
    categoriaSgarro = b.dataset.categoria;
    $$('#sgarro-categorie [data-categoria]').forEach((x) =>
      x.setAttribute('aria-pressed', String(x === b)));
    filtraCatalogo(categoriaSgarro);
  }));
}

function filtraCatalogo(categoria) {
  const voci = categoria === 'tutte'
    ? sgarriCatalogo.sgarri
    : sgarriCatalogo.sgarri.filter((s) => s.categoria === categoria);

  // Con «Tutte» restano i gruppi, che senza sarebbero novantasette righe piatte;
  // dentro una categoria sola non servono e toglierli accorcia la lista.
  const dentro = categoria === 'tutte'
    ? sgarriCatalogo.categorie.map((c) => {
      const sue = voci.filter((s) => s.categoria === c.id);
      return sue.length ? `<optgroup label="${c.nome}">${sue.map(opzione).join('')}</optgroup>` : '';
    }).join('')
    : voci.map(opzione).join('');

  $('#sgarro-catalogo').innerHTML = '<option value="">— scegli o scrivi le calorie —</option>' + dentro;
}

function opzione(s) {
  return `<option value="${s.id}">${s.nome} — ${s.kcal} kcal</option>`;
}

function apriSgarro() {
  rendiCategorieSgarro();
  filtraCatalogo(categoriaSgarro);

  $('#sgarro-giorno').innerHTML = settimana.giorni.map((g, i) => {
    const d = new Date(g.data);
    return `<option value="${i}">${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })}</option>`;
  }).join('');

  const oggi = Math.max(0, indiceOggi(settimana));
  $('#sgarro-giorno').value = String(oggi);
  $('#sgarro-kcal').value = '';
  aggiornaAnteprimaSgarro();
  $('#dialogo-sgarro').showModal();
}

function datiSgarro() {
  const extra = Number($('#sgarro-kcal').value) || 0;
  const indiceEvento = Number($('#sgarro-giorno').value) || 0;
  const modo = $('#dialogo-sgarro [name="modo"]:checked')?.value || 'prima';
  return { extra, indiceEvento, modo };
}

function aggiornaAnteprimaSgarro() {
  const { extra, indiceEvento, modo } = datiSgarro();
  const anteprima = $('#sgarro-anteprima');

  if (!(extra > 0)) {
    anteprima.innerHTML = '<p class="piccolo tenue">Scegli lo sgarro o scrivi quante calorie sono.</p>';
    $('#conferma-sgarro').disabled = true;
    return;
  }

  const recupero = calcolaRecupero({
    giorni: settimana.giorni,
    target: settimana.target,
    floor: settimana.floor,
    extra,
    indiceEvento,
    modo,
  });

  const etichetta = $('#sgarro-catalogo').selectedOptions[0]?.textContent?.split(' — ')[0];
  const testo = racconta({
    recupero, extra, modo,
    deficitGiornaliero: energia.fabbisogno.deficit || 300,
    etichetta,
  });

  const proiezione = settimana.giorni.map((g, i) => ({
    etichetta: g.etichetta,
    quota: i === indiceEvento
      ? (g.quota ?? kcalGiorno(g)) + extra
      : (g.quota ?? kcalGiorno(g)) - (recupero.perGiorno[i] || 0),
    stato: i === indiceEvento ? 'sgarro' : recupero.perGiorno[i] > 0 ? 'recupero' : (g.rigido ? 'rigido' : 'normale'),
  }));

  anteprima.innerHTML = `<div id="fascia-anteprima"></div>
    <p class="piccolo morbido" style="margin-top:var(--sp-3)">${testo}</p>`;
  rendiFascia($('#fascia-anteprima'), {
    target: settimana.target, giorni: proiezione, legenda: false,
  });

  $('#conferma-sgarro').disabled = false;
}

async function confermaSgarro() {
  const { extra, indiceEvento, modo } = datiSgarro();
  if (!(extra > 0)) return;

  const recupero = calcolaRecupero({
    giorni: settimana.giorni,
    target: settimana.target,
    floor: settimana.floor,
    extra, indiceEvento, modo,
  });

  const etichetta = $('#sgarro-catalogo').selectedOptions[0]?.textContent?.split(' — ')[0];
  settimana = applicaRecupero(settimana, recupero, {
    extra, indiceEvento, etichettaSgarro: etichetta || 'Sgarro',
  });

  await salvaSettimana(profilo.id, settimana);
  $('#dialogo-sgarro').close();
  disegna();

  if (recupero.residuo > 0) {
    const giorni = slittamentoTraguardo(recupero.residuo, energia.fabbisogno.deficit || 300);
    $('#nota-recupero').hidden = false;
    $('#nota-recupero div').innerHTML = `Recuperate ${num(recupero.recuperato)} kcal su ${num(extra)}. `
      + `Il traguardo si sposta di <strong>${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}</strong> — `
      + 'meglio così che scendere sotto il minimo.';
  }
}
