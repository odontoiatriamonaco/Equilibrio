/* Equilibrio — la home: i pasti di oggi, la spunta, l'acqua, la settimana. */

import { avvia, alternaTema, icona, $, $$, num } from './guscio.js';
import { profiloAttivo } from './store.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import { caricaSettimana, caricaDiario, salvaDiario } from './dati.js';
import { kcalGiorno, indiceOggi, iso } from './planner.js';
import { nomeVoce, valoriVoce, iconaPiatto, vociOggetto, TIPI } from './alimenti.js';
import { rendiFascia } from './ui-budget.js';

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

  energia = riepilogoEnergia(profilo, oggi);
  settimana = await caricaSettimana(profilo.id, oggi);
  diario = await caricaDiario(profilo.id, oggi);

  const i = settimana ? indiceOggi(settimana, oggi) : -1;
  giorno = i >= 0 ? settimana.giorni[i] : null;

  disegna(i);
}

function disegna(indice) {
  const target = giorno?.quota ?? energia.fabbisogno.target;

  disegnaFascia(indice, target);
  disegnaAnello(target);
  disegnaPasti();
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
  if (!giorno) return 0;
  const fatte = new Set(diario.consumato || []);
  let somma = 0;
  for (const [pasto, voci] of Object.entries(giorno.pasti)) {
    voci.forEach((v, i) => {
      if (fatte.has(`${pasto}|${i}`)) somma += valoriVoce(v).kcal;
    });
  }
  for (const s of diario.sgarri || []) somma += s.kcal || 0;
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
                ${voce.porzioni !== 1 ? ` · ${num(voce.porzioni, 2).replace(',00', '')}×` : ''}
              </span>
            </span>
            ${voce.tipo === 'piatto'
              ? `<a class="bottone-icona" href="/ricette.html" aria-label="Vedi la ricetta">
                   ${icona(iconaPiatto(oggetto || {}), 'icona icona-sm')}</a>`
              : ''}
          </label>`;
      }).join('')}
    </section>`).join('');

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
