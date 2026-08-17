/* Equilibrio — pagina Piano: la settimana, gli scambi, lo sgarro. */

import { avvia, icona, $, $$, num } from './guscio.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import { settimanaPer, salvaPersonalizzazione, lenteDi } from './famiglia.js';
import { caricaPreferenze } from './preferenze.js';
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

  const derivata = await settimanaPer(profilo);
  settimana = derivata.settimana;
  riferimento = derivata.riferimento;
  avvisiFamiglia = derivata.avvisi;

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
  disegna();
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
  nota.hidden = !riferimento;
  if (!riferimento) return;

  const righe = [`Segui il menù di <strong>${riferimento.nome}</strong>: gli stessi piatti,
    con le porzioni calcolate sul tuo fabbisogno.`];

  if (avvisiFamiglia.length) {
    const quanti = avvisiFamiglia.length;
    righe.push(`<strong>${quanti} ${quanti === 1 ? 'pietanza' : 'pietanze'}</strong>
      ${quanti === 1 ? 'non va' : 'non vanno'} bene per te: ${
  avvisiFamiglia.slice(0, 3).map((a) => `${a.nome} (${a.motivo})`).join(', ')
}${quanti > 3 ? ' e altre' : ''}. Tocca lo scambio su quella riga per sceglierne un'altra:
      cambia solo nel tuo piatto.`);
  }

  nota.className = avvisiFamiglia.length ? 'avviso avviso-sgarro' : 'avviso';
  nota.querySelector('div').innerHTML = righe.join(' ');
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
    ? `<span class="pillola pillola-sgarro" title="${voce.nonPerMe}">non per te</span>`
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
    </details>`;
}

/* --- Scambio --------------------------------------------------------------- */

async function apriScambio(giorno, pasto, indice) {
  const voce = settimana.giorni[giorno].pasti[pasto][indice];
  scambioAperto = { giorno, pasto, indice };

  const usati = new Set(settimana.giorni
    .flatMap((g) => Object.values(g.pasti).flat())
    .map((v) => v.id));

  // Chi segue cerca nel PROPRIO ricettario: le sue pietanze di casa, i suoi
  // alimenti tolti. Quello in uso porta la lente di chi decide il menù.
  const lente = riferimento ? await lenteDi(profilo.id) : null;

  const alternative = alternativePiatto(voce, {
    preferenze: pref,
    mese: new Date().getMonth() + 1,
    esclusiIds: usati,
    quanti: 10,
    ...(lente ? { piatti: lente.piatti } : {}),
  });

  $('#scambio-titolo').textContent = riferimento
    ? `Al posto di «${nomeVoce(voce)}», solo per te`
    : `Al posto di «${nomeVoce(voce)}»`;
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
    : `<div class="vuoto"><p>Non ci sono alternative disponibili con le tue preferenze.</p></div>`;

  $$('#scambio-elenco [data-nuovo]').forEach((b) => b.addEventListener('click', async () => {
    if (riferimento) {
      // Il menù è di un altro: si cambia solo nel proprio piatto, e resta
      // scritto nello strato personale. Gli altri non se ne accorgono.
      const g = settimana.giorni[scambioAperto.giorno];
      await salvaPersonalizzazione(profilo.id, settimana.inizio,
        `${g.etichetta}|${scambioAperto.pasto}|${scambioAperto.indice}`,
        { sostituto: b.dataset.nuovo });
      const derivata = await settimanaPer(profilo);
      settimana = derivata.settimana;
      avvisiFamiglia = derivata.avvisi;
    } else {
      settimana = scambiaPiatto(settimana, { ...scambioAperto, nuovoId: b.dataset.nuovo });
      await salvaSettimana(profilo.id, settimana);
    }
    $('#scambio').close();
    disegna();
  }));

  $('#scambio').showModal();
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
