/* Equilibrio — pagina Progressi: peso di tendenza, aderenza, TDEE adattivo. */

import { avvia, icona, $, num } from './guscio.js';
import { profiloAttivo, scrivi } from './store.js';
import {
  riepilogo as riepilogoEnergia, pesoDiTendenza, tdeeAdattivo,
  ADATTIVO_GIORNI_MIN,
} from './energia.js';
import { tutteLeMisure, aggiungiMisura, tuttoIlDiario, aderenza } from './dati.js';
import { rendiGraficoPeso } from './grafico-peso.js';

let profilo = null;
let energia = null;

export async function inizializza() {
  avvia({ nav: 'progressi' });

  profilo = await profiloAttivo();
  if (!profilo?.pesoKg) {
    $('#senza-profilo').hidden = false;
    $('#contenuto').hidden = true;
    return;
  }

  energia = riepilogoEnergia(profilo);
  $('#salva-peso').addEventListener('click', salvaPeso);
  $('#peso-nuovo').addEventListener('keydown', (e) => { if (e.key === 'Enter') salvaPeso(); });
  $('#adotta-tdee').addEventListener('click', cambiaFabbisogno);

  await disegna();
}

async function disegna() {
  const misure = await tutteLeMisure(profilo.id);

  // Il peso del profilo e' la prima misura: senza, il grafico non partirebbe mai.
  const serie = misure.length
    ? misure
    : [{ data: (profilo.creatoIl || new Date().toISOString()).slice(0, 10), peso: profilo.pesoKg }];

  const esito = rendiGraficoPeso($('#grafico'), serie, {
    obiettivo: profilo.pesoObiettivoKg || null,
  });

  disegnaTitolo(serie, esito);
  await disegnaAdattivo(serie);
}

function disegnaTitolo(serie, esito) {
  const tendenza = pesoDiTendenza(serie);
  const ultimo = tendenza[tendenza.length - 1];
  const primo = tendenza[0];
  const delta = ultimo.tendenza - primo.tendenza;

  const settimane = Math.max(1,
    (new Date(ultimo.data) - new Date(primo.data)) / (1000 * 60 * 60 * 24 * 7));
  const perSettimana = delta / settimane;

  $('#titolo-peso').innerHTML = `
    <p class="occhiello">Peso di tendenza</p>
    <p class="dato-grande num">${ultimo.tendenza.toFixed(1).replace('.', ',')}
      <span class="unita">kg</span></p>
    ${serie.length > 1 ? `
      <p class="piccolo ${delta < 0 ? 'verde-testo' : 'morbido'}" style="margin-top:var(--sp-1)">
        ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(1).replace('.', ',')} kg
        da ${new Date(primo.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
        ${Math.abs(perSettimana) > 0.05
          ? ` · ${Math.abs(perSettimana).toFixed(1).replace('.', ',')} kg a settimana`
          : ''}
      </p>` : ''}
    ${esito ? `
      <p class="piccolo tenue" style="margin-top:var(--sp-2)">
        La pesata di un giorno oscilla di circa
        ${esito.rumore.toFixed(1).replace('.', ',')} kg per l'acqua: è la banda azzurra.
        Guarda la linea, non i punti.</p>` : ''}`;
}

async function disegnaAdattivo(serie) {
  const diario = await tuttoIlDiario(profilo.id);
  const ad = await aderenza(profilo.id, ADATTIVO_GIORNI_MIN);

  const conKcal = diario.filter((d) => typeof d.kcalTotali === 'number' && d.kcalTotali > 0);
  const kcalMedie = conKcal.length
    ? conKcal.reduce((s, d) => s + d.kcalTotali, 0) / conKcal.length
    : 0;

  const tendenza = pesoDiTendenza(serie);
  const giorni = Math.max(1, Math.round(
    (new Date(tendenza[tendenza.length - 1].data) - new Date(tendenza[0].data))
    / (1000 * 60 * 60 * 24),
  ));
  const deltaPeso = tendenza[tendenza.length - 1].tendenza - tendenza[0].tendenza;

  const stima = tdeeAdattivo({
    kcalMedie,
    deltaPesoTendenzaKg: deltaPeso,
    giorni,
    aderenza: ad.quota,
  });

  $('#aderenza').innerHTML = `
    <div class="griglia-2">
      <div><p class="dato-grande num">${num(ad.compilati)}<span class="unita">/${ad.giorni}</span></p>
           <p class="unita">giorni segnati</p></div>
      <div><p class="dato-grande num">${num(energia.tdee)}</p>
           <p class="unita">fabbisogno da formula</p></div>
      <div><p class="dato-grande num">${stima.affidabile ? num(stima.tdee) : '—'}</p>
           <p class="unita">fabbisogno dai tuoi dati</p></div>
    </div>`;

  if (stima.affidabile) {
    // Il confronto e' con il numero su cui il piano e' tarato ADESSO, che puo'
    // gia' essere una misura adottata in passato.
    const scarto = stima.tdee - energia.tdee;
    $('#nota-adattivo').className = 'avviso avviso-ok';
    $('#nota-adattivo div').innerHTML = Math.abs(scarto) < 80
      ? 'I tuoi dati confermano la formula: il fabbisogno stimato è quello giusto.'
      : `Dai tuoi dati il fabbisogno reale risulta <strong>${num(Math.abs(scarto))} kcal `
        + `${scarto > 0 ? 'più alto' : 'più basso'}</strong> di quanto dicesse la formula. `
        + 'Vale più questo: è misurato su di te, non su una media.';
    proponiAdozione(stima, scarto);
  } else {
    $('#nota-adattivo').className = 'avviso';
    $('#nota-adattivo div').innerHTML = `Il fabbisogno calcolato sui tuoi dati veri non è ancora
      affidabile: ${stima.motivo}. Fino a quel momento resta valida la stima da formula —
      dirti un numero preciso adesso sarebbe inventarlo.`;
    $('#azione-adattivo').hidden = true;
  }
}

/** Sotto questo scarto ritarare il piano sarebbe rumore, non correzione. */
const SCARTO_MINIMO = 0.05;

/**
 * Propone di adottare il fabbisogno misurato, non lo applica da solo.
 * Il piano non deve cambiare sotto i piedi: e' la stessa scelta di tono del
 * resto dell'app, che dichiara invece di agire di nascosto.
 */
function proponiAdozione(stima, scarto) {
  const azione = $('#azione-adattivo');
  const rilevante = Math.abs(scarto) / energia.tdee >= SCARTO_MINIMO;

  // Gia' adottato e ancora valido: non c'e' niente da proporre.
  if (!rilevante) {
    azione.hidden = !profilo.tdeeMisurato;
    if (profilo.tdeeMisurato) {
      $('#testo-adotta').textContent = 'Torna al fabbisogno da formula';
      azione.dataset.azione = 'annulla';
    }
    return;
  }

  azione.hidden = false;
  azione.dataset.azione = 'adotta';
  azione.dataset.tdee = String(stima.tdee);
  $('#testo-adotta').textContent = `Taglia il piano su ${num(stima.tdee)} kcal`;
}

async function cambiaFabbisogno() {
  const azione = $('#azione-adattivo');
  const adotta = azione.dataset.azione === 'adotta';

  profilo = { ...profilo, tdeeMisurato: adotta ? Number(azione.dataset.tdee) : null };
  await scrivi('profili', profilo);
  energia = riepilogoEnergia(profilo);

  $('#esito').hidden = false;
  $('#esito').className = 'avviso avviso-ok';
  $('#esito').textContent = adotta
    ? `Piano tarato su ${num(profilo.tdeeMisurato)} kcal: il target giornaliero è ora `
      + `${num(energia.fabbisogno.target)} kcal. Il menù già fatto non cambia.`
    : 'Sei tornata al fabbisogno calcolato dalla formula.';

  await disegna();
}

async function salvaPeso() {
  const peso = Number(String($('#peso-nuovo').value).replace(',', '.'));
  if (!(peso > 20 && peso < 400)) {
    $('#esito').hidden = false;
    $('#esito').className = 'avviso avviso-pericolo';
    $('#esito').textContent = 'Il peso non sembra un peso: controlla il numero.';
    return;
  }

  await aggiungiMisura(profilo.id, { peso });
  // Il profilo segue l'ultima pesata, altrimenti il fabbisogno resterebbe
  // ancorato al peso del primo giorno.
  profilo = { ...profilo, pesoKg: peso };
  await scrivi('profili', profilo);
  energia = riepilogoEnergia(profilo);

  $('#peso-nuovo').value = '';
  $('#esito').hidden = false;
  $('#esito').className = 'avviso avviso-ok';
  $('#esito').textContent = 'Pesata registrata.';
  await disegna();
}
