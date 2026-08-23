/* Equilibrio — pagina del profilo: raccolta dati, riepilogo dal vivo, salvataggio. */

import { $, $$, num, avvia, icona } from './guscio.js';
import {
  PASTI, GIORNI_BREVI, mangiaACasa, alternaPresenza, alternaPasto, alternaGiorno,
  raccontaPresenze, quantiFuori,
} from './presenze.js';
import { montaTutor } from './tutor.js';
import { PASSI_PROFILO } from './tutor-passi.js';
import { montaBarraPercorso } from './barra-percorso.js';
import {
  riepilogo, LAF, BANDIERE, RITMI, ritmoDi, AVVIO_SETTIMANE,
  margineDisponibile, bmrMifflin, tdee as calcolaTdee, eta,
  giorniAggiuntiDallAvvio, KCAL_PER_KG,
} from './energia.js';
import {
  profiloAttivo, creaProfilo, scrivi, leggi, impostaProfiloAttivo,
} from './store.js';
import { iso } from './planner.js';

let profilo = null;

/**
 * Da dove arriva il profilo che stiamo modificando.
 *   'nuovo'    ?nuovo=1  — form vuoto, si crea
 *   'scelto'   ?id=…     — un profilo preciso, anche se non e' quello in uso
 *   'attivo'   nessuno   — il profilo in uso, come si e' sempre fatto
 */
let modo = 'attivo';

/* --- Costruzione del modulo ------------------------------------------------ */

function montaAttivita() {
  $('#attivita').innerHTML = Object.entries(LAF)
    .map(([id, v]) => `<option value="${id}">${v.testo}</option>`)
    .join('');
}

function montaRitmi() {
  $('#ritmi').innerHTML = Object.entries(RITMI).map(
    ([id, r]) => `<button type="button" role="tab" data-ritmo="${id}"
                    aria-selected="${id === 'regolare'}">
                    <span>${r.testo}</span>
                    <span class="piccolo tenue" data-effetto></span>
                  </button>`,
  ).join('');
  $('#ritmi').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#ritmi').querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    aggiorna();
  });
}

/* --- Chi mangia a casa, e quando --------------------------------------------
   Una griglia sette per cinque: i giorni in colonna, i pasti in riga. Trentacinque
   caselle sono tante da toccare una per una, ma le due frasi vere — «il pranzo lo
   faccio sempre fuori», «il sabato ci sono» — si dicono con un tocco sull'intestazione
   della riga o della colonna. Il caso del marito che pranza fuori in settimana e sta
   a casa nel fine settimana viene via in tre tocchi.
   -------------------------------------------------------------------------- */

function montaPresenze() {
  const nodo = $('#presenze');
  if (!nodo) return;

  nodo.innerHTML = `
    <table class="griglia-presenze">
      <caption class="solo-lettori">Quali pasti mangi a casa, giorno per giorno</caption>
      <thead>
        <tr>
          <td></td>
          ${GIORNI_BREVI.map((g) => `
            <th scope="col">
              <button type="button" data-giorno="${g.id}" title="Tutto il ${g.nome}">${g.corto}</button>
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${PASTI.map((p) => `
          <tr>
            <th scope="row">
              <button type="button" data-pasto="${p.id}" title="${p.nome} tutti i giorni">${p.nome}</button>
            </th>
            ${GIORNI_BREVI.map((g) => {
    const casa = mangiaACasa(profilo, g.id, p.id);
    return `<td>
                <button type="button" class="casella" data-casa="${g.id}|${p.id}"
                        aria-pressed="${casa}"
                        aria-label="${p.nome} di ${g.nome}: ${casa ? 'a casa' : 'fuori'}">
                  ${casa ? icona('spunta', 'icona icona-sm') : ''}
                </button>
              </td>`;
  }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;

  $$('#presenze [data-casa]').forEach((b) => b.addEventListener('click', () => {
    const [g, p] = b.dataset.casa.split('|');
    profilo = alternaPresenza(profilo, g, p);
    salvaPresenze();
  }));

  // Toccare l'intestazione accende tutta la riga o tutta la colonna, e se era
  // gia' tutta accesa la spegne: un interruttore, non un pulsante che fa una
  // cosa sola e poi non si sa come disfarla.
  $$('#presenze [data-pasto]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.pasto;
    const tuttiACasa = GIORNI_BREVI.every((g) => mangiaACasa(profilo, g.id, p));
    profilo = alternaPasto(profilo, p, !tuttiACasa);
    salvaPresenze();
  }));

  $$('#presenze [data-giorno]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.giorno;
    const tuttiACasa = PASTI.every((p) => mangiaACasa(profilo, g, p.id));
    profilo = alternaGiorno(profilo, g, !tuttiACasa);
    salvaPresenze();
  }));

  const fuori = quantiFuori(profilo);
  $('#presenze-riassunto').textContent = fuori
    ? `${raccontaPresenze(profilo)} Quei pasti restano nel tuo piano — li mangi lo stesso — ma non entrano nella lista della spesa di casa.`
    : raccontaPresenze(profilo);
}

async function salvaPresenze() {
  if (profilo?.id) await scrivi('profili', profilo);
  montaPresenze();
}

function montaBandiere() {
  // Le bandiere `automatica` l'app le deduce da sola — l'età dalla data di
  // nascita — e chiederne conferma sarebbe peggio che inutile: si fermerebbe
  // chi la spunta e passerebbe chi se ne dimentica.
  $('#bandiere').innerHTML = BANDIERE.filter((b) => !b.automatica).map(
    (b) => `<label class="interruttore">
              <input type="checkbox" name="bandiera" value="${b.id}">
              <span class="leva"></span>
              <span>${b.testo}</span>
            </label>`,
  ).join('');
}

/* --- Lettura del modulo ---------------------------------------------------- */

function numeroDa(sel) {
  const v = parseFloat($(sel).value.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function leggiModulo() {
  const bandiere = {};
  document.querySelectorAll('input[name="bandiera"]:checked').forEach((c) => { bandiere[c.value] = true; });
  const scelto = $('#ritmi').querySelector('[aria-selected="true"]');
  const graduale = $('#avvio-graduale').checked;

  return {
    nome: $('#nome').value.trim() || 'Profilo',
    sesso: $('#sesso').value,
    dataNascita: $('#nascita').value,
    altezzaCm: numeroDa('#altezza'),
    pesoKg: numeroDa('#peso'),
    vitaCm: numeroDa('#vita'),
    fianchiCm: numeroDa('#fianchi'),
    colloCm: numeroDa('#collo'),
    attivita: $('#attivita').value,
    pesoObiettivoKg: numeroDa('#obiettivo'),
    ritmo: scelto ? scelto.dataset.ritmo : 'regolare',
    // La data di partenza si fissa una volta sola: riaprire il profilo non
    // deve far ricominciare la rampa da capo.
    avvioGraduale: {
      attivo: graduale,
      settimane: AVVIO_SETTIMANE,
      dal: profilo?.avvioGraduale?.dal || iso(new Date()),
    },
    bandiere,
  };
}

function scriviModulo(p) {
  if (!p) {
    // Profilo nuovo: la rampa e' accesa di serie, ed e' il momento giusto per
    // farlo — accenderla a meta' percorso alzerebbe le calorie di sorpresa.
    $('#avvio-graduale').checked = true;
    return;
  }
  $('#avvio-graduale').checked = Boolean(p.avvioGraduale?.attivo);
  $('#nome').value = p.nome ?? '';
  $('#sesso').value = p.sesso ?? 'donna';
  $('#nascita').value = p.dataNascita ?? '';
  $('#altezza').value = p.altezzaCm ?? '';
  $('#peso').value = p.pesoKg ?? '';
  $('#vita').value = p.vitaCm ?? '';
  $('#fianchi').value = p.fianchiCm ?? '';
  $('#collo').value = p.colloCm ?? '';
  $('#attivita').value = p.attivita ?? 'leggera';
  $('#obiettivo').value = p.pesoObiettivoKg ?? '';
  document.querySelectorAll('input[name="bandiera"]').forEach((c) => {
    c.checked = Boolean(p.bandiere?.[c.value]);
  });
  const ritmo = ritmoDi(p);
  $('#ritmi').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.ritmo === ritmo)));
}

/* --- Riepilogo dal vivo ---------------------------------------------------- */

function completo(d) {
  // La data va LETTA, non solo presente: una stringa che non si interpreta
  // faceva scendere NaN fino al fabbisogno, alle porzioni e allo schermo.
  return Number.isFinite(eta(d.dataNascita)) && d.altezzaCm > 0 && d.pesoKg > 0;
}

function riga(etichetta, valore, nota = '', classe = '') {
  return `<div class="riga-tra" style="align-items:baseline">
            <span class="morbido">${etichetta}</span>
            <span class="riga" style="gap:var(--sp-2)">
              <strong class="num">${valore}</strong>
              ${nota ? `<span class="pillola ${classe}">${nota}</span>` : ''}
            </span>
          </div>`;
}

const CLASSE_PILLOLA = {
  ok: 'pillola-verde', normopeso: 'pillola-verde', basso: 'pillola-dato',
  aumentato: 'pillola-sgarro', sovrappeso: 'pillola-sgarro', sottopeso: 'pillola-sgarro',
  alto: 'pillola-pericolo', obesita1: 'pillola-pericolo', obesita2: 'pillola-pericolo', obesita3: 'pillola-pericolo',
};

/** Calo settimanale corrispondente a un deficit giornaliero, in kg. */
function kgSettimana(deficit) {
  return (deficit * 7) / KCAL_PER_KG;
}

/**
 * Su ogni linguetta del ritmo, cosa comporta davvero.
 * Senza questo la scelta resta muta — ed era muta anche nei numeri: tre ritmi
 * che producevano lo stesso identico piano.
 */
function rendiRitmi(dati) {
  for (const b of $('#ritmi').querySelectorAll('button')) {
    // Il confronto e' fra i ritmi a regime: la rampa vale per tutti allo stesso
    // modo e qui confonderebbe soltanto.
    const r = riepilogo({ ...dati, ritmo: b.dataset.ritmo, avvioGraduale: null });
    const kg = kgSettimana(r.fabbisogno.deficit);
    b.querySelector('[data-effetto]').textContent = r.fabbisogno.deficit > 0
      ? `−${kg.toFixed(2).replace('.', ',')} kg/sett`
      : 'mantenimento';
  }
}

const SCALA_ATTIVITA = ['sedentaria', 'leggera', 'moderata', 'intensa', 'moltoIntensa'];

/**
 * Il numero che l'app non ha mai detto: quanto si puo' togliere al massimo, e
 * perche'. E soprattutto come alzarlo, che e' l'unica parte azionabile.
 */
function rendiMargine(dati, r) {
  const nota = $('#nota-margine');
  if (r.bandiere.bloccante || !completo(dati)) { nota.hidden = true; return; }

  const righe = [`Il massimo che posso togliere è <strong class="num">${num(r.margine.kcal)} kcal</strong>
    al giorno: ${r.margine.motivo}.`];

  // Se muoversi di piu' allargherebbe il margine, vale la pena dirlo: e' la
  // sola leva che l'utente ha davvero in mano.
  const dopo = SCALA_ATTIVITA[SCALA_ATTIVITA.indexOf(dati.attivita) + 1];
  if (dopo) {
    const anni = eta(dati.dataNascita);
    const bmr = bmrMifflin({ sesso: dati.sesso, pesoKg: dati.pesoKg, altezzaCm: dati.altezzaCm, anni });
    const piu = margineDisponibile({
      tdee: calcolaTdee(bmr, dopo), bmr, sesso: dati.sesso, pesoKg: dati.pesoKg,
    });
    if (piu.kcal > r.margine.kcal) {
      righe.push(`Con un'attività <em>${LAF[dopo].testo.split(' —')[0].toLowerCase()}</em>
        salirebbe a <strong class="num">${num(piu.kcal)} kcal</strong>
        (−${kgSettimana(piu.kcal).toFixed(2).replace('.', ',')} kg a settimana).`);
    }
  }

  nota.hidden = false;
  nota.innerHTML = `<svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#info"/></svg>
    <div>${righe.join(' ')}</div>`;
}

function aggiorna() {
  const dati = leggiModulo();
  const scheda = $('#riepilogo');

  if (!completo(dati)) {
    scheda.innerHTML = `<div class="vuoto">
        <svg class="icona icona-lg" aria-hidden="true"><use href="/assets/icons.svg#bilancia"/></svg>
        <p>Inserisci data di nascita, altezza e peso:<br>il resto lo calcolo io.</p>
      </div>`;
    $('#salva').disabled = true;
    $('#nota-margine').hidden = true;
    return;
  }

  const r = riepilogo(dati);
  $('#salva').disabled = false;
  rendiRitmi(dati);
  rendiMargine(dati, r);

  const avvisi = [];
  if (r.bandiere.messaggio) {
    avvisi.push(`<div class="avviso ${r.bandiere.bloccante ? 'avviso-pericolo' : 'avviso-sgarro'}">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#avviso"/></svg>
      <div>${r.bandiere.messaggio}</div></div>`);
  }
  if (r.fabbisogno.limitato && !r.bandiere.bloccante) {
    avvisi.push(`<div class="avviso">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#info"/></svg>
      <div>Ho ridotto il ritmo che avevi scelto: ${r.fabbisogno.limiti.join('; ')}.
        Scendere più in fretta non fa perdere più grasso, fa perdere muscolo.</div></div>`);
  }
  // Cosa cambia davvero nel piano per le condizioni dichiarate.
  if (r.bandiere.note?.length) {
    avvisi.push(`<div class="avviso avviso-ok">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#spunta"/></svg>
      <div><strong>Cosa cambio nel piano:</strong> ${r.bandiere.note.join(' ')}</div></div>`);
  }
  // E cosa NON sa fare: un'app che tace su questo lascia credere di aver
  // adattato la dieta a una malattia, che sarebbe peggio di non fare niente.
  if (r.bandiere.limiti?.length) {
    avvisi.push(`<div class="avviso avviso-sgarro">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#avviso"/></svg>
      <div><strong>Quello che invece non posso fare:</strong> ${r.bandiere.limiti.join(' ')}</div></div>`);
  }

  if (r.avvio.attivo) {
    avvisi.push(`<div class="avviso avviso-sgarro">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#info"/></svg>
      <div>Avvio graduale, <strong>settimana ${r.avvio.settimana} di ${r.avvio.di}</strong>:
        oggi il target è ${num(r.fabbisogno.target)} kcal invece di
        ${num(r.fabbisogno.targetPieno)}. Si arriva al pieno fra
        ${num((r.avvio.di - r.avvio.settimana + 1) * 7)} giorni.</div></div>`);
  } else if ($('#avvio-graduale').checked && !r.bandiere.bloccante) {
    avvisi.push(`<div class="avviso">
      <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#info"/></svg>
      <div>Con l'avvio graduale le prime ${AVVIO_SETTIMANE} settimane sono più leggere:
        il traguardo si sposta di circa ${num(giorniAggiuntiDallAvvio(AVVIO_SETTIMANE))} giorni,
        già contati qui sotto.</div></div>`);
  }

  const traguardo = r.traguardo
    ? `Al ritmo scelto, il traguardo è intorno al
       <strong>${r.traguardo.data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
       (${num(r.traguardo.giorni)} giorni).`
    : 'Nessun deficit impostato: il piano punta al mantenimento.';

  scheda.innerHTML = `
    <div class="riga" style="gap:var(--sp-5); align-items:flex-start">
      <div class="pila" style="gap:2px">
        <span class="occhiello">Target giornaliero${r.avvio.attivo ? ' · questa settimana' : ''}</span>
        <span class="dato-grande num">${num(r.fabbisogno.target)}</span>
        <span class="unita">kcal · basale ${num(r.bmr)} · fabbisogno ${num(r.tdee)}${
  r.tdeeDaDiario ? ' (dal tuo diario)' : ''
}${r.avvio.attivo ? ` · a regime ${num(r.fabbisogno.targetPieno)}` : ''}</span>
      </div>
    </div>

    <div class="pila" style="margin-top:var(--sp-4); gap:var(--sp-2)">
      ${riga('Indice di massa corporea', r.bmi.toFixed(1), r.classeBmi.testo, CLASSE_PILLOLA[r.classeBmi.codice])}
      ${r.whtr ? riga('Vita / altezza', r.whtr.toFixed(2), r.classeWhtr.testo, CLASSE_PILLOLA[r.classeWhtr.codice]) : ''}
      ${r.classeVita ? riga('Circonferenza vita', `${num(dati.vitaCm)} cm`, r.classeVita.testo, CLASSE_PILLOLA[r.classeVita.codice]) : ''}
      ${riga('Massa grassa stimata', `${r.massaGrassa.toFixed(1)} %`)}
      ${riga('Peso desiderabile', `${r.pesoDesiderabile.min.toFixed(1)}–${r.pesoDesiderabile.max.toFixed(1)} kg`)}
      ${r.proteineMinime === null
    ? riga('Proteine minime al giorno', '—', 'le decide il medico', 'pillola-sgarro')
    : riga('Proteine minime al giorno', `${num(r.proteineMinime)} g`)}
      ${riga('Non si scende sotto', `${num(r.fabbisogno.floor)} kcal`)}
      ${riga('Calo a settimana', `${kgSettimana(r.fabbisogno.deficitPieno ?? r.fabbisogno.deficit).toFixed(2).replace('.', ',')} kg`)}
    </div>

    <p class="piccolo morbido" style="margin-top:var(--sp-3)">${traguardo}</p>
    ${avvisi.length ? `<div class="pila" style="margin-top:var(--sp-3)">${avvisi.join('')}</div>` : ''}
    <p class="piccolo tenue" style="margin-top:var(--sp-3)">
      Le stime di massa grassa e fabbisogno sono formule predittive, non misure.
      Dopo due settimane di diario Equilibrio le ricalibra sui tuoi dati veri.</p>
  `;
}

/* --- Salvataggio ----------------------------------------------------------- */

async function salva() {
  const dati = leggiModulo();
  const esito = $('#esito');
  let messaggio;

  if (profilo) {
    // Anche in memoria, non solo in archivio: quello che resta qui e' il profilo
    // su cui ragionano l'intestazione e la barra dei primi passi. Senza, dopo un
    // salvataggio dicevano ancora le cose di prima — un nome vecchio, un passo
    // «da fare» su una pagina appena compilata.
    profilo = { ...profilo, ...dati };
    await scrivi('profili', profilo);
    messaggio = `«${dati.nome}» salvato su questo dispositivo.`;
  } else {
    profilo = await creaProfilo(dati);
    // `creaProfilo` mette in uso solo il primo profilo. Chi ne crea uno di
    // proposito se lo aspetta in uso: gli altri restano a un clic da qui.
    await impostaProfiloAttivo(profilo.id);
    modo = 'attivo';
    messaggio = `«${dati.nome}» creato e messo in uso.`;
  }

  esito.hidden = false;
  esito.className = 'avviso avviso-ok';
  esito.innerHTML = `${messaggio} <a href="/impostazioni.html">Tutti i profili</a>`;
  aggiornaIntestazione();
  // Il passo e' appena diventato fatto: la barra si rilegge, o resterebbe a
  // dire «da fare» su una pagina che hai appena compilato.
  await montaBarraPercorso(profilo, 'profilo');
}

/* --- Intestazione ---------------------------------------------------------- */

function aggiornaIntestazione() {
  const nuovo = modo === 'nuovo' || !profilo;
  $('#titolo-profilo').textContent = nuovo ? 'Nuovo profilo' : (profilo.nome || 'Profilo');
  $('#testo-salva').textContent = nuovo ? 'Crea il profilo' : 'Salva le modifiche';

  const occhiello = $('#occhiello-profilo');
  occhiello.hidden = modo !== 'scelto';
  if (modo === 'scelto') occhiello.textContent = 'Stai modificando';
}

/* --- Avvio ----------------------------------------------------------------- */

/**
 * Quale profilo aprire. E' l'unica lettura di query string dell'app, e sta qui
 * perche' senza di essa «Nuovo» finiva per modificare il profilo esistente.
 */
async function quale() {
  const q = new URLSearchParams(location.search);

  if (q.has('nuovo')) {
    modo = 'nuovo';
    return null;
  }

  const id = q.get('id');
  if (id) {
    const scelto = await leggi('profili', id);
    if (scelto) {
      modo = 'scelto';
      return scelto;
    }
    // Id inesistente (profilo cancellato, link vecchio): si ricade sull'attivo
    // dicendolo, invece di presentare un modulo muto.
    const esito = $('#esito');
    esito.hidden = false;
    esito.className = 'avviso';
    esito.textContent = 'Quel profilo non esiste più: ti mostro quello in uso.';
  }

  modo = 'attivo';
  return profiloAttivo();
}

export async function inizializza() {
  // Qui il nome in cima lo mette la pagina stessa, ed e' quello del profilo
  // che si sta MODIFICANDO: mostrare accanto quello in uso direbbe due nomi
  // diversi nello stesso posto.
  avvia({ nav: 'altro', chiSei: false });
  montaAttivita();
  montaRitmi();
  montaBandiere();

  profilo = await quale();
  scriviModulo(profilo);
  montaPresenze();
  aggiornaIntestazione();

  $('#modulo').addEventListener('input', aggiorna);
  $('#modulo').addEventListener('change', aggiorna);
  $('#salva').addEventListener('click', salva);
  aggiorna();
  // Il filo verso il passo dopo: c'e' solo finche' il percorso e' aperto.
  await montaBarraPercorso(profilo, 'profilo');

  // Dopo il disegno, sempre: il tutor chiede i suoi bersagli alla pagina.
  montaTutor(PASSI_PROFILO);
}
