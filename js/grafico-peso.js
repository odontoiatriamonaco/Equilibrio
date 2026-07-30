/* Equilibrio — grafico del peso di tendenza.
   SVG inline, nessuna libreria, un solo asse. Due tracce dello stesso dato:
   il peso misurato (punti, in inchiostro tenue) e la tendenza (linea, in
   evidenza), piu' la banda dell'oscillazione tipica.

   La linea e' quella che conta: da un giorno all'altro il peso e' quasi tutta
   acqua, e mostrare i picchi come se fossero grasso fa smettere le persone. */

import { pesoDiTendenza } from './energia.js';

const L = 44;   // margine sinistro per le etichette dell'asse
const R = 16;
const T = 14;
const B = 26;
const LARG = 720;
const ALT = 300;

/**
 * @param {HTMLElement} contenitore
 * @param {Array<{data:string, peso:number}>} misure  in ordine cronologico
 * @param {{obiettivo?:number}} opzioni
 */
export function rendiGraficoPeso(contenitore, misure, { obiettivo } = {}) {
  if (misure.length < 2) {
    contenitore.innerHTML = `
      <div class="vuoto">
        <p>Servono almeno due pesate per disegnare una tendenza.<br>
           Pesati sempre alla stessa ora, appena sveglia.</p>
      </div>`;
    return null;
  }

  const serie = pesoDiTendenza(misure);
  const residui = serie.map((p) => Math.abs(p.peso - p.tendenza));
  // Oscillazione tipica: scarto medio assoluto fra misura e tendenza. E' la
  // larghezza del rumore, e va mostrata perche' spiega i picchi.
  const rumore = Math.max(0.2, residui.reduce((s, v) => s + v, 0) / residui.length);

  const tempi = serie.map((p) => new Date(p.data).getTime());
  const xMin = tempi[0];
  const xMax = tempi[tempi.length - 1];
  const valori = serie.flatMap((p) => [p.peso, p.tendenza]);
  if (obiettivo) valori.push(obiettivo);
  const margine = Math.max(0.6, (Math.max(...valori) - Math.min(...valori)) * 0.12);
  const yMin = Math.min(...valori) - margine;
  const yMax = Math.max(...valori) + margine;

  const x = (t) => (xMax === xMin ? L : L + ((t - xMin) / (xMax - xMin)) * (LARG - L - R));
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (ALT - T - B);

  const puntiTendenza = serie.map((p, i) => `${x(tempi[i]).toFixed(1)},${y(p.tendenza).toFixed(1)}`);
  const bandaSopra = serie.map((p, i) => `${x(tempi[i]).toFixed(1)},${y(p.tendenza + rumore).toFixed(1)}`);
  const bandaSotto = serie.map((p, i) => `${x(tempi[i]).toFixed(1)},${y(p.tendenza - rumore).toFixed(1)}`).reverse();

  const tacche = tacchePeso(yMin, yMax);
  const ultimo = serie[serie.length - 1];

  contenitore.innerHTML = `
    <figure class="grafico" style="margin:0">
      <div class="grafico-legenda">
        <span><i class="segno-linea"></i>Tendenza</span>
        <span><i class="segno-punto"></i>Pesate</span>
        <span><i class="segno-banda"></i>Oscillazione tipica (±${rumore.toFixed(1).replace('.', ',')} kg)</span>
      </div>

      <svg viewBox="0 0 ${LARG} ${ALT}" class="grafico-svg" role="img"
           aria-label="${descrizione(serie, rumore)}">
        <!-- griglia recessiva: c'e', non si vede -->
        ${tacche.map((v) => `
          <line x1="${L}" x2="${LARG - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
                class="grafico-griglia"/>
          <text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" class="grafico-tacca">${v.toFixed(1).replace('.', ',')}</text>
        `).join('')}

        ${obiettivo ? `
          <line x1="${L}" x2="${LARG - R}" y1="${y(obiettivo).toFixed(1)}" y2="${y(obiettivo).toFixed(1)}"
                class="grafico-obiettivo"/>
          <text x="${LARG - R}" y="${(y(obiettivo) - 6).toFixed(1)}" text-anchor="end"
                class="grafico-etichetta-obiettivo">obiettivo</text>` : ''}

        <polygon class="grafico-banda" points="${[...bandaSopra, ...bandaSotto].join(' ')}"/>
        <polyline class="grafico-linea" points="${puntiTendenza.join(' ')}"/>

        ${serie.map((p, i) => `
          <circle cx="${x(tempi[i]).toFixed(1)}" cy="${y(p.peso).toFixed(1)}" r="4"
                  class="grafico-punto" data-i="${i}"/>`).join('')}

        <circle cx="${x(tempi[serie.length - 1]).toFixed(1)}" cy="${y(ultimo.tendenza).toFixed(1)}"
                r="5.5" class="grafico-ultimo"/>

        <line class="grafico-mirino" x1="0" x2="0" y1="${T}" y2="${ALT - B}" style="opacity:0"/>
        <rect x="${L}" y="${T}" width="${LARG - L - R}" height="${ALT - T - B}"
              fill="transparent" class="grafico-cattura"/>

        <text x="${L}" y="${ALT - 8}" class="grafico-tacca">${data(serie[0].data)}</text>
        <text x="${LARG - R}" y="${ALT - 8}" text-anchor="end" class="grafico-tacca">${data(ultimo.data)}</text>
      </svg>

      <div class="grafico-tooltip" hidden></div>

      <details class="domanda" style="margin-top: var(--sp-3)">
        <summary>Vedi i numeri</summary>
        <div class="risposta" style="overflow-x:auto">
          <table class="tabella">
            <thead><tr><th>Data</th><th class="num">Pesata</th><th class="num">Tendenza</th></tr></thead>
            <tbody>
              ${[...serie].reverse().map((p) => `
                <tr><td>${data(p.data)}</td>
                    <td class="num">${p.peso.toFixed(1).replace('.', ',')} kg</td>
                    <td class="num">${p.tendenza.toFixed(1).replace('.', ',')} kg</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>
    </figure>`;

  collegaPuntatore(contenitore, { serie, tempi, x, y });
  return { serie, rumore, ultimo };
}

/* --- Interazione ----------------------------------------------------------- */

function collegaPuntatore(contenitore, { serie, tempi, x, y }) {
  const svg = contenitore.querySelector('.grafico-svg');
  const mirino = contenitore.querySelector('.grafico-mirino');
  const tooltip = contenitore.querySelector('.grafico-tooltip');
  const cattura = contenitore.querySelector('.grafico-cattura');
  if (!cattura) return;

  const mostra = (evento) => {
    const box = svg.getBoundingClientRect();
    const scala = LARG / box.width;
    const px = (evento.clientX - box.left) * scala;

    let vicino = 0;
    let minimo = Infinity;
    tempi.forEach((t, i) => {
      const d = Math.abs(x(t) - px);
      if (d < minimo) { minimo = d; vicino = i; }
    });

    const p = serie[vicino];
    const cx = x(tempi[vicino]);
    mirino.setAttribute('x1', cx);
    mirino.setAttribute('x2', cx);
    mirino.style.opacity = '1';

    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${data(p.data)}</strong><br>
      Pesata <span class="num">${p.peso.toFixed(1).replace('.', ',')} kg</span><br>
      Tendenza <span class="num">${p.tendenza.toFixed(1).replace('.', ',')} kg</span>`;
    const sinistra = (cx / LARG) * box.width;
    tooltip.style.left = `${Math.min(box.width - 140, Math.max(0, sinistra - 70))}px`;
    tooltip.style.top = `${(y(p.peso) / ALT) * box.height - 8}px`;
  };

  const nascondi = () => {
    mirino.style.opacity = '0';
    tooltip.hidden = true;
  };

  cattura.addEventListener('pointermove', mostra);
  cattura.addEventListener('pointerdown', mostra);
  cattura.addEventListener('pointerleave', nascondi);
  svg.addEventListener('pointerleave', nascondi);
}

/* --- Utilita' -------------------------------------------------------------- */

function tacchePeso(min, max) {
  const passo = (max - min) > 8 ? 2 : (max - min) > 4 ? 1 : 0.5;
  const primo = Math.ceil(min / passo) * passo;
  const out = [];
  for (let v = primo; v <= max; v += passo) out.push(Math.round(v * 10) / 10);
  return out;
}

function data(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function descrizione(serie, rumore) {
  const primo = serie[0];
  const ultimo = serie[serie.length - 1];
  const delta = ultimo.tendenza - primo.tendenza;
  const verso = delta < 0 ? 'in calo' : delta > 0 ? 'in salita' : 'stabile';
  // Anche la descrizione per lo screen reader va letta in italiano: la virgola
  // decimale, non il punto.
  return `Peso di tendenza ${verso} di ${kg(Math.abs(delta))} fra il `
    + `${data(primo.data)} e il ${data(ultimo.data)}. Ultima tendenza `
    + `${kg(ultimo.tendenza)}, oscillazione tipica ${kg(rumore)}.`;
}

function kg(v) {
  return `${v.toFixed(1).replace('.', ',')} kg`;
}
