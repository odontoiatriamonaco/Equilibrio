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
  { id: 'pietanze', href: '/ricette.html', icona: 'panetteria', testo: 'Pietanze' },
  { id: 'spesa', href: '/spesa.html', icona: 'spesa', testo: 'Spesa' },
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

/* --- Di chi e' questo piano ------------------------------------------------
   Sullo stesso dispositivo possono esserci piu' persone, e da quando esiste la
   dieta di famiglia il piano che si vede puo' essere derivato da quello di un
   altro. Guardare i numeri della persona sbagliata e' un errore facile e
   silenzioso: il nome sta in cima a ogni pagina, e si tocca per cambiare.
   -------------------------------------------------------------------------- */

export function rendiChiSei(profilo, riferimento) {
  const testa = document.querySelector('.intestazione');
  if (!testa || !profilo) return;

  const nodo = document.createElement('a');
  nodo.className = 'chi-sei';
  nodo.href = '/impostazioni.html';
  nodo.setAttribute('aria-label', riferimento
    ? `Stai vedendo ${profilo.nome}, che segue il menù di ${riferimento.nome}. Cambia profilo`
    : `Stai vedendo ${profilo.nome}. Cambia profilo`);

  nodo.innerHTML = `
    ${icona(riferimento ? 'famiglia' : 'utente', 'icona icona-sm')}
    <span class="pila">
      <b>${profilo.nome || 'Profilo'}</b>
      ${riferimento ? `<small>segue ${riferimento.nome}</small>` : ''}
    </span>`;

  // Prende il posto dell'icona anonima verso le impostazioni, dove c'e': fa la
  // stessa cosa, ma dice anche di chi si tratta.
  const vecchia = testa.querySelector('a[href="/impostazioni.html"]:not(.chi-sei)');
  if (vecchia) vecchia.replaceWith(nodo);
  else testa.appendChild(nodo);
}

/** Legge il profilo in uso e lo mostra. Non blocca l'avvio della pagina. */
async function mostraChiSei() {
  try {
    const { profiloAttivo, leggi } = await import('./store.js');
    const profilo = await profiloAttivo();
    if (!profilo) return;
    const riferimento = profilo.seguo ? await leggi('profili', profilo.seguo) : null;
    rendiChiSei(profilo, riferimento);
  } catch { /* senza profilo la pagina funziona lo stesso */ }
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

export function avvia({ nav, chiSei = true } = {}) {
  aggiornaColoreBarra();
  if (nav) montaNav(nav);
  // Import pigro dello store: la guida e la style guide non hanno profili e
  // non devono pagarne il costo.
  if (chiSei) mostraChiSei();

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
