/* Equilibrio — il tutor: cosa stai guardando, un riquadro alla volta.

   Il percorso dei primi passi dice DOVE ANDARE, e lo ricava dai dati. Questo
   dice COSA C'È in una pagina, e lo ricava dalla pagina stessa.

   ── La regola che tiene in piedi la cosa ─────────────────────────────────────

   `percorso.js` porta scritto in testa il motivo per cui non era mai stato
   fatto: «niente riquadri che illuminano bottoni: un percorso che si ricava
   dallo stato non può indicare una cosa che non c'è più». È un'obiezione giusta
   — un tutor che illumina il vuoto è peggio di nessun tutor — e qui si risolve
   invece di aggirarla: OGNI PASSO CHIEDE IL SUO BERSAGLIO alla pagina, e se non
   c'è o è nascosto, quel passo non esiste. La numerazione si conta dopo, sui
   passi rimasti, così non si vedono mai buchi tipo «3 di 7» quando i passi
   veri sono quattro.

   Conseguenza voluta: due persone che aprono il tutor sulla stessa pagina
   possono vedere un numero diverso di passi. È giusto così — stanno guardando
   due pagine diverse. */

const CHIUSO = { attivo: false };
let stato = { ...CHIUSO };

/** Il bersaglio esiste, ha una forma e non è nascosto? */
function visibile(el) {
  if (!el) return false;
  if (el.hidden || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** I passi che in QUESTA pagina, adesso, hanno davvero un bersaglio. */
function passiVeri(passi) {
  return passi
    .map((p) => ({ ...p, nodo: document.querySelector(p.sel) }))
    .filter((p) => visibile(p.nodo));
}

function guscioTutor() {
  const vecchio = document.querySelector('.tutor');
  if (vecchio) return vecchio;

  const g = document.createElement('div');
  g.className = 'tutor';
  g.setAttribute('role', 'dialog');
  g.setAttribute('aria-modal', 'true');
  g.setAttribute('aria-label', 'Guida rapida della pagina');
  g.innerHTML = `
    <div class="tutor-velo" data-chiudi></div>
    <div class="tutor-faro" aria-hidden="true"></div>
    <div class="tutor-carta" role="document">
      <p class="occhiello"><span data-conta></span></p>
      <h2 data-titolo></h2>
      <p data-testo></p>
      <div class="tutor-azioni">
        <button class="bottone bottone-fantasma" data-chiudi>Chiudi</button>
        <span style="flex:1"></span>
        <button class="bottone bottone-2" data-indietro>Indietro</button>
        <button class="bottone" data-avanti>Avanti</button>
      </div>
    </div>`;
  document.body.appendChild(g);
  return g;
}

function posiziona(g, nodo) {
  const faro = g.querySelector('.tutor-faro');
  const carta = g.querySelector('.tutor-carta');
  const r = nodo.getBoundingClientRect();
  const m = 6;

  faro.style.top = `${r.top - m}px`;
  faro.style.left = `${r.left - m}px`;
  faro.style.width = `${r.width + m * 2}px`;
  faro.style.height = `${r.height + m * 2}px`;

  // Su schermo stretto la carta resta incollata in basso: inseguire un riquadro
  // alto mezza pagina farebbe saltare il testo da una parte all'altra a ogni
  // passo, e la larghezza non basterebbe comunque per stargli accanto.
  if (window.innerWidth < 640) {
    carta.dataset.dove = 'basso';
    carta.style.top = '';
    carta.style.left = '';
    return;
  }

  const alta = carta.offsetHeight || 220;
  const larga = carta.offsetWidth || 360;
  const bordo = 12;
  const stacco = 14;

  // Sotto il riquadro se ci sta, sopra se ci sta di là, altrimenti in basso
  // nello schermo. Il terzo caso non è teorico: «I pasti di oggi» è più alto
  // della finestra, quindi non ha né un sopra né un sotto, e senza questo ramo
  // la carta finiva fuori dallo schermo — spiegando una cosa che non si legge.
  const spazioSotto = window.innerHeight - r.bottom - stacco - bordo;
  const spazioSopra = r.top - stacco - bordo;
  let top;
  if (spazioSotto >= alta) top = r.bottom + stacco;
  else if (spazioSopra >= alta) top = r.top - alta - stacco;
  else top = window.innerHeight - alta - bordo;

  // E comunque dentro la finestra: è l'ultima rete, e vale anche se il riquadro
  // si sposta mentre la pagina si assesta.
  const tetto = Math.max(bordo, window.innerHeight - alta - bordo);
  carta.dataset.dove = 'libera';
  carta.style.top = `${Math.min(Math.max(bordo, top), tetto)}px`;
  carta.style.left = `${Math.min(
    Math.max(bordo, r.left),
    Math.max(bordo, window.innerWidth - larga - bordo),
  )}px`;
}

function mostra(indice) {
  const { passi, g } = stato;
  stato.indice = Math.max(0, Math.min(indice, passi.length - 1));
  const p = passi[stato.indice];

  g.querySelector('[data-conta]').textContent = `${stato.indice + 1} di ${passi.length}`;
  g.querySelector('[data-titolo]').textContent = p.titolo;
  g.querySelector('[data-testo]').textContent = p.testo;
  g.querySelector('[data-indietro]').disabled = stato.indice === 0;
  g.querySelector('[data-avanti]').textContent = stato.indice === passi.length - 1
    ? 'Ho capito' : 'Avanti';

  // Chi ha chiesto meno movimento salta anche lo scorrimento morbido. Non è
  // solo una cortesia: lo scorrimento fluido ha bisogno di fotogrammi, e dove i
  // fotogrammi non arrivano — una scheda in secondo piano, una macchina sotto
  // sforzo — non parte proprio e il faro resterebbe a illuminare fuori schermo.
  const fermi = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  p.nodo.scrollIntoView({ block: 'center', behavior: fermi ? 'auto' : 'smooth' });

  // Subito, e poi di nuovo a scorrimento finito. Il primo giro evita che resti
  // anche solo un istante dove stava prima; il secondo lo rimette al posto
  // giusto. Nel mezzo ci pensa comunque chi ascolta lo scorrimento.
  posiziona(g, p.nodo);
  setTimeout(() => posiziona(g, p.nodo), 340);
  g.querySelector('[data-avanti]').focus({ preventScroll: true });
}

function chiudi() {
  if (!stato.attivo) return;
  document.removeEventListener('keydown', stato.tasti);
  window.removeEventListener('resize', stato.riposiziona);
  window.removeEventListener('scroll', stato.riposiziona, true);
  stato.g?.remove();
  stato.tornaA?.focus?.();
  stato = { ...CHIUSO };
}

/**
 * Apre il tutor su questa pagina.
 *
 * @param {Array<{sel:string, titolo:string, testo:string}>} passi
 * @returns {number} quanti passi si sono davvero potuti mostrare
 */
export function apriTutor(passi) {
  chiudi();
  const veri = passiVeri(passi);
  if (!veri.length) return 0;

  const g = guscioTutor();
  stato = {
    attivo: true, passi: veri, indice: 0, g, tornaA: document.activeElement,
    tasti: (e) => {
      if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
      if (e.key === 'ArrowRight') mostra(stato.indice + 1);
      if (e.key === 'ArrowLeft') mostra(stato.indice - 1);
    },
    riposiziona: () => {
      if (stato.attivo) posiziona(stato.g, stato.passi[stato.indice].nodo);
    },
  };

  g.querySelectorAll('[data-chiudi]').forEach((b) => b.addEventListener('click', chiudi));
  g.querySelector('[data-avanti]').addEventListener('click', () => {
    if (stato.indice >= veri.length - 1) chiudi();
    else mostra(stato.indice + 1);
  });
  g.querySelector('[data-indietro]').addEventListener('click', () => mostra(stato.indice - 1));
  document.addEventListener('keydown', stato.tasti);
  window.addEventListener('resize', stato.riposiziona);
  window.addEventListener('scroll', stato.riposiziona, true);

  mostra(0);
  return veri.length;
}

/**
 * Mette il pulsante subito sotto l'intestazione, su una riga sua.
 *
 * Nell'intestazione non ci sta, e non è una questione di gusto: su Oggi a 360 px
 * quella riga è larga 328 e i pulsanti che c'erano già — tema, guida, profilo —
 * ne occupano 281 coi distanziatori. Al titolo ne restavano 47 per i 63 che gli
 * servono, e «Oggi» usciva troncato. Su una riga propria il pulsante è anche più
 * grande e più visibile, che è poi quello che deve essere.
 *
 * Non compare se in questa pagina non c'è niente da mostrare: un pulsante che
 * apre il vuoto insegna solo a non premerlo più.
 */
export function montaTutor(passi) {
  if (!passiVeri(passi).length) return null;

  const testa = document.querySelector('.intestazione');
  if (!testa) return null;

  const riga = document.createElement('div');
  riga.className = 'riga-tutor non-stampare';

  const b = document.createElement('button');
  b.className = 'bottone bottone-tutor';
  b.type = 'button';
  b.innerHTML = `
    <svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#domanda"/></svg>
    <span class="lungo">Tutor: cosa c’è in questa pagina</span><span class="corto">Tutor: cosa c’è qui</span>`;
  b.addEventListener('click', () => apriTutor(passi));

  riga.appendChild(b);
  testa.insertAdjacentElement('afterend', riga);
  return b;
}

export { passiVeri, chiudi as chiudiTutor };
