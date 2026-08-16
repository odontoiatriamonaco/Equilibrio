/* Equilibrio — la home: i pasti di oggi, la spunta, l'acqua, la settimana. */

import { avvia, alternaTema, icona, $, $$, num } from './guscio.js';
import { profiloAttivo } from './store.js';
import { caricaRicettario } from './piatti-utente.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import {
  caricaSettimana, salvaSettimana, caricaDiario, salvaDiario,
} from './dati.js';
import {
  kcalGiorno, indiceOggi, iso,
  ribilanciaGiorno, applicaRibilanciamento, vociConChiave,
} from './planner.js';
import { calcolaRecupero, applicaRecupero, racconta } from './sgarro.js';
import {
  nomeVoce, valoriVoce, iconaPiatto, vociOggetto, TIPI, dosiVoce,
  dosePrincipale, porzioniPerGrammi,
} from './alimenti.js';
import { rendiFascia } from './ui-budget.js';
import {
  cercaBarcode, valoriUtilizzabili, kcalPer, scansiona, scansioneDisponibile,
  ATTRIBUZIONE,
} from './off-client.js';

const NOMI_PASTO = {
  colazione: 'Colazione',
  'spuntino-mattina': 'Spuntino del mattino',
  pranzo: 'Pranzo',
  'spuntino-pomeriggio': 'Spuntino del pomeriggio',
  cena: 'Cena',
};

const BICCHIERI = 8;

let profilo = null;
let energia = null;
let settimana = null;
let diario = null;
let giorno = null;

export async function inizializza() {
  avvia({ nav: 'oggi' });
  $('#cambia-tema').addEventListener('click', alternaTema);

  const oggi = new Date();
  $('#data-oggi').textContent = oggi.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg || !profilo?.altezzaCm || !profilo?.dataNascita) return;

  $('#benvenuto').hidden = true;
  $('#giornata').hidden = false;

  await caricaRicettario(profilo.id);
  energia = riepilogoEnergia(profilo, oggi);
  settimana = await caricaSettimana(profilo.id, oggi);
  diario = await caricaDiario(profilo.id, oggi);

  const i = settimana ? indiceOggi(settimana, oggi) : -1;
  giorno = i >= 0 ? settimana.giorni[i] : null;

  collegaProdotto();
  collegaQuantita();
  disegna(i);
}

function disegna(indice) {
  const target = giorno?.quota ?? energia.fabbisogno.target;

  disegnaFascia(indice, target);
  disegnaAnello(target);
  disegnaPasti();
  disegnaExtra();
  disegnaAcqua();
}

function disegnaFascia(indice, target) {
  if (!settimana) {
    $('#riquadro-settimana').hidden = true;
    return;
  }
  rendiFascia($('#fascia'), {
    target: settimana.target,
    legenda: false,
    giorni: settimana.giorni.map((g, i) => ({
      etichetta: g.etichetta,
      quota: g.quota ?? kcalGiorno(g),
      stato: g.stato || (g.rigido ? 'rigido' : 'normale'),
      oggi: i === indice,
    })),
  });
}

function kcalConsumate() {
  let somma = 0;
  if (giorno) {
    const fatte = new Set(diario.consumato || []);
    for (const [pasto, voci] of Object.entries(giorno.pasti)) {
      voci.forEach((v, i) => {
        if (fatte.has(`${pasto}|${i}`)) somma += valoriVoce(v).kcal;
      });
    }
  }
  for (const s of diario.sgarri || []) somma += s.kcal || 0;
  for (const e of diario.extra || []) somma += e.kcal || 0;
  return Math.round(somma);
}

function disegnaAnello(target) {
  const fatte = kcalConsumate();
  const anello = $('#anello-oggi');
  anello.style.setProperty('--p', String(Math.min(1, target ? fatte / target : 0)));
  anello.dataset.stato = (diario.sgarri || []).length ? 'sgarro' : '';
  $('#kcal-oggi').textContent = num(fatte);
  $('#kcal-target').textContent = `di ${num(target)} kcal`;

  const resta = target - fatte;
  $('#resta').textContent = resta > 0
    ? `Restano ${num(resta)} kcal`
    : `Sei oltre di ${num(-resta)} kcal`;
  $('#resta').className = resta > 0 ? 'piccolo morbido' : 'piccolo sgarro-testo';
}

function disegnaPasti() {
  if (!giorno) {
    $('#pasti-oggi').innerHTML = `
      <div class="scheda"><div class="vuoto">
        ${icona('piano', 'icona icona-lg')}
        <p>Per oggi non c'è nessun piano.<br>Ne genero uno in un attimo.</p>
        <a class="bottone" href="/piano.html">Genera la settimana</a>
      </div></div>`;
    return;
  }

  const fatte = new Set(diario.consumato || []);

  $('#pasti-oggi').innerHTML = Object.entries(giorno.pasti).map(([pasto, voci]) => `
    <section class="scheda">
      <p class="occhiello" style="margin-bottom: var(--sp-2)">${NOMI_PASTO[pasto]}</p>
      ${voci.map((voce, i) => {
        const chiave = `${pasto}|${i}`;
        const oggetto = vociOggetto(voce);
        return `
          <label class="voce-spesa">
            <input type="checkbox" data-chiave="${chiave}" ${fatte.has(chiave) ? 'checked' : ''}>
            <span class="spunta"></span>
            <span class="nome">${nomeVoce(voce)}
              <br><span class="piccolo tenue">
                ${voce.tipo === 'piatto' ? TIPI[oggetto?.tipo] || '' : 'Pane'}
                · ${num(valoriVoce(voce).kcal)} kcal
              </span>
              ${dosiVoce(voce).length ? `<br><span class="piccolo dosi-riga num">${
  dosiVoce(voce).map((d) => `${d.alimento?.nome || d.a} ${num(d.grammi)} g`).join(' · ')
}</span>` : ''}
            </span>
            <button class="bottone-icona" data-quantita="${chiave}"
                    aria-label="Cambia la quantità di ${nomeVoce(voce)}">
              ${icona('bilancia', 'icona icona-sm')}
            </button>
            ${voce.tipo === 'piatto'
              ? `<a class="bottone-icona" href="/ricette.html" aria-label="Vedi la ricetta di ${nomeVoce(voce)}">
                   ${icona(iconaPiatto(oggetto || {}), 'icona icona-sm')}</a>`
              : ''}
          </label>`;
      }).join('')}
    </section>`).join('');

  $$('#pasti-oggi [data-quantita]').forEach((b) => b.addEventListener('click', (e) => {
    // Il bottone sta dentro la <label> della spunta: senza questo, cambiare la
    // quantita' segnerebbe anche il pasto come consumato.
    e.preventDefault();
    e.stopPropagation();
    const [pasto, i] = b.dataset.quantita.split('|');
    apriQuantita(pasto, Number(i));
  }));

  $$('#pasti-oggi input[type="checkbox"]').forEach((c) =>
    c.addEventListener('change', async () => {
      const insieme = new Set(diario.consumato || []);
      if (c.checked) insieme.add(c.dataset.chiave);
      else insieme.delete(c.dataset.chiave);
      diario.consumato = [...insieme];
      diario.kcalTotali = kcalConsumate();
      await salvaDiario(diario);
      disegnaAnello(giorno?.quota ?? energia.fabbisogno.target);
    }));
}

/* --- Quanto ne ho mangiato davvero ------------------------------------------
   Il piano dice 40 g di pasta; capita di farne 100. Si scrivono i grammi
   dell'ingrediente che fa il piatto, il piatto scala tutto in proporzione, e i
   pasti che restano nella giornata si riassestano. Quello che la giornata non
   riesce ad assorbire si puo' spalmare sulla settimana, col motore dello
   sgarro, che sa gia' farlo dentro i vincoli.
   -------------------------------------------------------------------------- */

let quantitaAperta = null;

function collegaQuantita() {
  $('#chiudi-quantita').addEventListener('click', () => $('#dialogo-quantita').close());
  $('#quantita-grammi').addEventListener('input', anteprimaQuantita);
  $('#conferma-quantita').addEventListener('click', () => confermaQuantita(false));
  $('#spalma-quantita').addEventListener('click', () => confermaQuantita(true));
}

function apriQuantita(pasto, indice) {
  const voce = giorno?.pasti?.[pasto]?.[indice];
  if (!voce) return;

  const base = dosePrincipale({ ...voce, porzioni: 1 });
  if (!base) return;

  quantitaAperta = { pasto, indice, chiave: `${pasto}|${indice}`, base };

  $('#quantita-piatto').textContent = nomeVoce(voce);
  $('#quantita-etichetta').textContent = `Quanti grammi di ${base.alimento.nome.toLowerCase()}`;
  $('#quantita-aiuto').textContent = `il piano ne prevede ${num(base.grammi)} g`
    + ' — scrivi 0 se non l’hai mangiato';
  $('#quantita-grammi').value = dosePrincipale(voce).grammi;

  anteprimaQuantita();
  $('#dialogo-quantita').showModal();
}

/**
 * Calcola tutto senza applicare niente, su una copia della giornata.
 * L'anteprima e la conferma chiamano questa stessa funzione: se divergessero,
 * si confermerebbe una cosa e se ne otterrebbe un'altra.
 */
function simulaQuantita() {
  const { pasto, indice, chiave } = quantitaAperta;
  const grammi = Math.max(0, Number($('#quantita-grammi').value) || 0);

  const copia = structuredClone(giorno);
  const voce = copia.pasti[pasto][indice];
  const porzioni = porzioniPerGrammi(voce, grammi);
  if (porzioni === null) return null;

  voce.porzioni = porzioni;
  voce.fissata = true;

  // Ferme restano le voci gia' mangiate e tutte quelle gia' decise a mano.
  const ferme = new Set(diario.consumato || []);
  ferme.add(chiave);
  for (const x of vociConChiave(copia)) if (x.voce.fissata) ferme.add(x.chiave);

  const bersaglio = energia.fabbisogno.target;
  const esito = ribilanciaGiorno(copia, bersaglio, {
    ferme, floor: energia.fabbisogno.floor,
  });

  return { copia, voce, grammi, esito, bersaglio };
}

function anteprimaQuantita() {
  const sim = simulaQuantita();
  const riquadro = $('#quantita-anteprima');
  if (!sim) { riquadro.innerHTML = ''; return; }

  const { pasto, indice } = quantitaAperta;
  const prima = valoriVoce(giorno.pasti[pasto][indice]).kcal;
  const dopo = valoriVoce(sim.voce).kcal;

  // Cosa si muove nella giornata, in grammi: e' il punto di tutta la funzione.
  const perChiave = new Map(vociConChiave(sim.copia).map((x) => [x.chiave, x.voce]));
  const mosse = sim.esito.porzioni
    .filter((p) => p.a !== p.da)
    .map((p) => {
      // Le grammature vanno lette con la porzione NUOVA: `ribilanciaGiorno` non
      // applica niente, quindi la voce nella copia porta ancora quella vecchia.
      const voce = perChiave.get(p.chiave);
      const g = dosePrincipale({ ...voce, porzioni: p.a });
      return g ? `${nomeVoce(voce)} → ${num(g.grammi)} g` : nomeVoce(voce);
    });

  const residuo = sim.esito.residuo;
  const sopra = residuo > 20;
  const sotto = residuo < -20;

  $('#spalma-quantita').hidden = !sopra;
  $('#testo-conferma-quantita').textContent = sopra ? 'Tienilo solo su oggi' : 'Conferma';

  riquadro.innerHTML = `
    <div class="riga-tra">
      <span class="morbido">${nomeVoce(sim.voce)}</span>
      <span class="num"><span class="tenue">${num(prima)}</span> → <strong>${num(dopo)}</strong> kcal</span>
    </div>
    <div class="riga-tra" style="margin-top:var(--sp-2)">
      <span class="morbido">La giornata</span>
      <span class="num"><strong>${num(sim.esito.kcalDopo)}</strong> di ${num(sim.bersaglio)} kcal</span>
    </div>
    ${mosse.length ? `<p class="piccolo morbido" style="margin-top:var(--sp-2)">
      Si riassestano: ${mosse.join(' · ')}.</p>` : ''}
    ${sopra ? `<p class="piccolo sgarro-testo" style="margin-top:var(--sp-2)">
      La giornata non riassorbe ${num(residuo)} kcal: i pasti che restano sono già al minimo.
      ${raccontoSettimana(residuo)}</p>` : ''}
    ${sotto ? `<p class="piccolo morbido" style="margin-top:var(--sp-2)">
      Resti sotto di ${num(-residuo)} kcal e va bene così: non ti faccio mangiare
      per far quadrare un numero.</p>` : ''}`;
}

/** La frase sulla settimana, scritta dal motore dello sgarro. */
function raccontoSettimana(extra) {
  const i = indiceOggi(settimana);
  if (!settimana || i < 0) return '';
  const recupero = calcolaRecupero({
    giorni: settimana.giorni,
    target: settimana.target,
    floor: settimana.floor,
    extra,
    indiceEvento: i,
    modo: 'dopo',
  });
  return racconta({
    recupero,
    extra,
    modo: 'dopo',
    deficitGiornaliero: energia.fabbisogno.deficit || 300,
    etichetta: 'Il di più',
  });
}

async function confermaQuantita(spalma) {
  const sim = simulaQuantita();
  if (!sim) return;

  const { pasto, indice } = quantitaAperta;
  giorno.pasti[pasto][indice].porzioni = sim.voce.porzioni;
  giorno.pasti[pasto][indice].fissata = true;
  applicaRibilanciamento(giorno, sim.esito);

  if (spalma && sim.esito.residuo > 0) {
    const i = indiceOggi(settimana);
    const recupero = calcolaRecupero({
      giorni: settimana.giorni,
      target: settimana.target,
      floor: settimana.floor,
      extra: sim.esito.residuo,
      indiceEvento: i,
      modo: 'dopo',
    });
    // `indiceEvento: null` perche' questo non e' uno sgarro: le calorie in piu'
    // sono gia' dentro la giornata, non vanno aggiunte una seconda volta.
    settimana = applicaRecupero(settimana, recupero, { indiceEvento: null });
    giorno = settimana.giorni[i];
  }

  await salvaSettimana(profilo.id, settimana);
  diario.kcalTotali = kcalConsumate();
  await salvaDiario(diario);

  $('#dialogo-quantita').close();
  disegna(indiceOggi(settimana));
}

/* --- Prodotti confezionati -------------------------------------------------- */

let prodottoAperto = null;

function collegaProdotto() {
  $('#apri-prodotto').addEventListener('click', () => {
    $('#esito-prodotto').hidden = true;
    $('#prodotto-trovato').hidden = true;
    $('#attribuzione-off').textContent = ATTRIBUZIONE;
    $('#scansiona').hidden = !scansioneDisponibile();
    $('#dialogo-prodotto').showModal();
  });

  $('#chiudi-prodotto').addEventListener('click', () => $('#dialogo-prodotto').close());
  $('#cerca-prodotto').addEventListener('click', () => cerca($('#barcode').value));
  $('#barcode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') cerca($('#barcode').value);
  });
  $('#prodotto-grammi').addEventListener('input', aggiornaKcalProdotto);
  $('#aggiungi-prodotto').addEventListener('click', aggiungiProdotto);

  $('#scansiona').addEventListener('click', async () => {
    const video = $('#video-barcode');
    video.hidden = false;
    try {
      const codice = await scansiona(video);
      video.hidden = true;
      $('#barcode').value = codice;
      await cerca(codice);
    } catch {
      video.hidden = true;
      avvisa('Non riesco a leggere il codice: scrivilo a mano.', 'avviso');
    }
  });
}

async function cerca(barcode) {
  avvisa('Cerco…', 'avviso');
  const esito = await cercaBarcode(barcode);

  if (!esito.trovato) {
    $('#prodotto-trovato').hidden = true;
    avvisa(esito.messaggio, 'avviso avviso-pericolo');
    return;
  }

  if (!valoriUtilizzabili(esito.prodotto)) {
    $('#prodotto-trovato').hidden = true;
    avvisa('Il prodotto c\'è ma non ha le calorie registrate: non posso contarlo. '
      + 'Meglio saperlo che sommare uno zero.', 'avviso avviso-pericolo');
    return;
  }

  prodottoAperto = esito.prodotto;
  const p = prodottoAperto;
  $('#esito-prodotto').hidden = !esito.daCache;
  if (esito.daCache) avvisa('Senza rete: valori presi dall\'ultima lettura.', 'avviso');

  $('#prodotto-marca').textContent = p.marca || 'Prodotto confezionato';
  $('#prodotto-nome').textContent = p.nome;
  $('#prodotto-valori').textContent = `Per 100 g: ${num(p.per100g.kcal)} kcal`
    + (p.per100g.pro != null ? ` · P ${num(p.per100g.pro, 1)} g` : '')
    + (p.per100g.car != null ? ` · C ${num(p.per100g.car, 1)} g` : '')
    + (p.per100g.gra != null ? ` · G ${num(p.per100g.gra, 1)} g` : '')
    + (p.nutriScore ? ` · Nutri-Score ${p.nutriScore.toUpperCase()}` : '');
  $('#prodotto-trovato').hidden = false;
  aggiornaKcalProdotto();
}

function aggiornaKcalProdotto() {
  const g = Number($('#prodotto-grammi').value) || 0;
  const k = kcalPer(prodottoAperto, g);
  $('#prodotto-kcal').textContent = k ? `· ${num(k)} kcal` : '';
}

async function aggiungiProdotto() {
  const grammi = Number($('#prodotto-grammi').value) || 0;
  const kcal = kcalPer(prodottoAperto, grammi);
  if (!kcal) return;

  diario.extra = [...(diario.extra || []), {
    nome: prodottoAperto.nome,
    marca: prodottoAperto.marca,
    barcode: prodottoAperto.barcode,
    grammi,
    kcal,
  }];
  diario.kcalTotali = kcalConsumate();
  await salvaDiario(diario);

  $('#dialogo-prodotto').close();
  disegnaExtra();
  disegnaAnello(giorno?.quota ?? energia.fabbisogno.target);
}

function disegnaExtra() {
  const extra = diario.extra || [];
  $('#sezione-extra').hidden = !extra.length;
  if (!extra.length) return;

  $('#extra-elenco').innerHTML = extra.map((e, i) => `
    <div class="riga-tra" style="padding-block: var(--sp-2); border-bottom:1px solid var(--bordo)">
      <span>${e.nome}
        <br><span class="piccolo tenue">${e.marca ? `${e.marca} · ` : ''}${num(e.grammi)} g</span>
      </span>
      <span class="riga" style="gap: var(--sp-2)">
        <span class="num morbido">${num(e.kcal)} kcal</span>
        <button class="bottone-icona" data-togli-extra="${i}" aria-label="Togli">
          ${icona('cestino', 'icona icona-sm')}
        </button>
      </span>
    </div>`).join('');

  $$('#extra-elenco [data-togli-extra]').forEach((b) => b.addEventListener('click', async () => {
    diario.extra = (diario.extra || []).filter((_, i) => i !== Number(b.dataset.togliExtra));
    diario.kcalTotali = kcalConsumate();
    await salvaDiario(diario);
    disegnaExtra();
    disegnaAnello(giorno?.quota ?? energia.fabbisogno.target);
  }));
}

function avvisa(testo, classe) {
  const n = $('#esito-prodotto');
  n.hidden = false;
  n.className = classe;
  n.textContent = testo;
}

function disegnaAcqua() {
  const bevuti = diario.acqua || 0;
  $('#acqua').innerHTML = Array.from({ length: BICCHIERI }, (_, i) => `
    <button class="bicchiere ${i < bevuti ? 'pieno' : ''}" data-b="${i + 1}"
            aria-label="${i + 1} bicchieri">${icona('acqua', 'icona icona-sm')}</button>`).join('');

  $('#acqua-testo').textContent = `${bevuti} ${bevuti === 1 ? 'bicchiere' : 'bicchieri'} su ${BICCHIERI}`;

  $$('#acqua .bicchiere').forEach((b) => b.addEventListener('click', async () => {
    const n = Number(b.dataset.b);
    diario.acqua = diario.acqua === n ? n - 1 : n;
    await salvaDiario(diario);
    disegnaAcqua();
  }));
}
