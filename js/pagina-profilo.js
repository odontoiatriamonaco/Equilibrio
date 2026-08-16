/* Equilibrio — pagina del profilo: raccolta dati, riepilogo dal vivo, salvataggio. */

import { $, num, avvia } from './guscio.js';
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

function montaBandiere() {
  $('#bandiere').innerHTML = BANDIERE.map(
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
  return d.dataNascita && d.altezzaCm > 0 && d.pesoKg > 0;
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
      ${riga('Proteine minime al giorno', `${num(r.proteineMinime)} g`)}
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
    await scrivi('profili', { ...profilo, ...dati });
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
  avvia({ nav: 'altro' });
  montaAttivita();
  montaRitmi();
  montaBandiere();

  profilo = await quale();
  scriviModulo(profilo);
  aggiornaIntestazione();

  $('#modulo').addEventListener('input', aggiorna);
  $('#modulo').addEventListener('change', aggiorna);
  $('#salva').addEventListener('click', salva);
  aggiorna();
}
