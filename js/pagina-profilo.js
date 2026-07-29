/* Equilibrio — pagina del profilo: raccolta dati, riepilogo dal vivo, salvataggio. */

import { $, num, avvia } from './guscio.js';
import { riepilogo, LAF, BANDIERE } from './energia.js';
import { profiloAttivo, creaProfilo, scrivi } from './store.js';

const RITMI = [
  { id: 'lento', kcal: 300, testo: 'Con calma' },
  { id: 'medio', kcal: 500, testo: 'Regolare' },
  { id: 'deciso', kcal: 700, testo: 'Deciso' },
];

let profilo = null;

/* --- Costruzione del modulo ------------------------------------------------ */

function montaAttivita() {
  $('#attivita').innerHTML = Object.entries(LAF)
    .map(([id, v]) => `<option value="${id}">${v.testo}</option>`)
    .join('');
}

function montaRitmi() {
  $('#ritmi').innerHTML = RITMI.map(
    (r, i) => `<button type="button" role="tab" data-kcal="${r.kcal}"
                 aria-selected="${i === 1}">${r.testo}</button>`,
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
  const ritmo = $('#ritmi').querySelector('[aria-selected="true"]');

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
    deficitRichiesto: ritmo ? Number(ritmo.dataset.kcal) : 500,
    bandiere,
  };
}

function scriviModulo(p) {
  if (!p) return;
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
  const kcal = p.deficitRichiesto ?? 500;
  $('#ritmi').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-selected', String(Number(b.dataset.kcal) === kcal)));
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

function aggiorna() {
  const dati = leggiModulo();
  const scheda = $('#riepilogo');

  if (!completo(dati)) {
    scheda.innerHTML = `<div class="vuoto">
        <svg class="icona icona-lg" aria-hidden="true"><use href="/assets/icons.svg#bilancia"/></svg>
        <p>Inserisci data di nascita, altezza e peso:<br>il resto lo calcolo io.</p>
      </div>`;
    $('#salva').disabled = true;
    return;
  }

  const r = riepilogo(dati);
  $('#salva').disabled = false;

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

  const traguardo = r.traguardo
    ? `Al ritmo scelto, il traguardo è intorno al
       <strong>${r.traguardo.data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
       (${num(r.traguardo.giorni)} giorni).`
    : 'Nessun deficit impostato: il piano punta al mantenimento.';

  scheda.innerHTML = `
    <div class="riga" style="gap:var(--sp-5); align-items:flex-start">
      <div class="pila" style="gap:2px">
        <span class="occhiello">Target giornaliero</span>
        <span class="dato-grande num">${num(r.fabbisogno.target)}</span>
        <span class="unita">kcal · basale ${num(r.bmr)} · fabbisogno ${num(r.tdee)}</span>
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
  if (profilo) {
    await scrivi('profili', { ...profilo, ...dati });
  } else {
    profilo = await creaProfilo(dati);
  }
  const esito = $('#esito');
  esito.hidden = false;
  esito.textContent = 'Profilo salvato su questo dispositivo.';
  setTimeout(() => { esito.hidden = true; }, 2600);
}

/* --- Avvio ----------------------------------------------------------------- */

export async function inizializza() {
  avvia({ nav: 'altro' });
  montaAttivita();
  montaRitmi();
  montaBandiere();

  profilo = await profiloAttivo();
  scriviModulo(profilo);

  $('#modulo').addEventListener('input', aggiorna);
  $('#modulo').addEventListener('change', aggiorna);
  $('#salva').addEventListener('click', salva);
  aggiorna();
}
