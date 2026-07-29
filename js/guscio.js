/* Equilibrio — guscio dell'app: tema, navigazione, icone, service worker.
   Importato da ogni pagina. Non contiene logica di dominio. */

const CHIAVE_TEMA = 'equilibrio:tema';

/* --- Tema ---------------------------------------------------------------- */

export function temaSalvato() {
  try {
    return localStorage.getItem(CHIAVE_TEMA);
  } catch {
    return null;
  }
}

export function temaEffettivo() {
  const scelto = temaSalvato();
  if (scelto === 'chiaro' || scelto === 'scuro') return scelto;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro';
}

export function applicaTema(tema) {
  const root = document.documentElement;
  if (tema === 'auto' || !tema) {
    root.removeAttribute('data-tema');
    try { localStorage.removeItem(CHIAVE_TEMA); } catch { /* modalita' privata */ }
  } else {
    root.setAttribute('data-tema', tema);
    try { localStorage.setItem(CHIAVE_TEMA, tema); } catch { /* modalita' privata */ }
  }
  aggiornaColoreBarra();
}

export function alternaTema() {
  applicaTema(temaEffettivo() === 'scuro' ? 'chiaro' : 'scuro');
}

// La barra di sistema del telefono deve seguire il tema, altrimenti in
// standalone si vede una striscia di colore sbagliato in cima.
function aggiornaColoreBarra() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const stile = getComputedStyle(document.documentElement);
  meta.content = stile.getPropertyValue('--sfondo').trim() || '#fbf7f0';
}

/* --- Icone ---------------------------------------------------------------- */

export function icona(nome, classe = 'icona') {
  return `<svg class="${classe}" aria-hidden="true"><use href="/assets/icons.svg#${nome}"/></svg>`;
}

/* --- Navigazione ---------------------------------------------------------- */

const VOCI = [
  { id: 'oggi', href: '/index.html', icona: 'oggi', testo: 'Oggi' },
  { id: 'piano', href: '/piano.html', icona: 'piano', testo: 'Piano' },
  { id: 'spesa', href: '/spesa.html', icona: 'spesa', testo: 'Spesa' },
  { id: 'progressi', href: '/progressi.html', icona: 'progressi', testo: 'Progressi' },
  { id: 'altro', href: '/impostazioni.html', icona: 'altro', testo: 'Altro' },
];

export function montaNav(attiva) {
  const nav = document.createElement('nav');
  nav.className = 'barra-nav';
  nav.setAttribute('aria-label', 'Navigazione principale');

  const voci = VOCI.map((v) => {
    const corrente = v.id === attiva ? ' aria-current="page"' : '';
    return `<a href="${v.href}"${corrente}>${icona(v.icona)}<span>${v.testo}</span></a>`;
  }).join('');

  nav.innerHTML = `
    <a class="marchio" href="/index.html">
      <svg aria-hidden="true"><use href="/assets/icons.svg#marchio"/></svg>
      <span>Equilibrio</span>
    </a>
    <div class="voci">${voci}</div>
    <div class="piede">
      <button class="bottone-icona" data-tema-rail aria-label="Cambia tema">
        ${icona('luna')}
      </button>
      <span class="nota">I tuoi dati restano<br>su questo dispositivo.</span>
    </div>
  `;

  // La navigazione va prima del contenuto: su schermo largo e' la prima colonna
  // della griglia, e per la tastiera e' l'ordine corretto.
  document.body.insertBefore(nav, document.body.firstChild);
  nav.querySelector('[data-tema-rail]').addEventListener('click', alternaTema);
}

/* --- Utilita' ------------------------------------------------------------- */

export function $(sel, dove = document) {
  return dove.querySelector(sel);
}

export function $$(sel, dove = document) {
  return Array.from(dove.querySelectorAll(sel));
}

/** Numero formattato all'italiana, senza decimali inutili. */
export function num(valore, decimali = 0) {
  if (valore == null || Number.isNaN(valore)) return '—';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(valore);
}

/* --- Avvio ---------------------------------------------------------------- */

export function avvia({ nav } = {}) {
  aggiornaColoreBarra();
  if (nav) montaNav(nav);

  // Se il tema segue il sistema, va aggiornato quando il sistema cambia.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!temaSalvato()) aggiornaColoreBarra();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* non bloccante */ });
    });
  }
}
