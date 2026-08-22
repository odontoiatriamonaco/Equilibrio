/* Equilibrio — accesso ai dati di dominio.
   Sopra store.js, che non sa niente di settimane e di diario. */

import { leggi, scrivi, tutti, elimina } from './store.js';
import { iso, inizioSettimana } from './planner.js';

/* --- Settimane ------------------------------------------------------------- */

function chiaveSettimana(profiloId, inizio) {
  return `${profiloId}:${inizio}`;
}

export async function caricaSettimana(profiloId, data = new Date()) {
  const inizio = iso(inizioSettimana(data));
  const riga = await leggi('settimane', chiaveSettimana(profiloId, inizio));
  return riga?.settimana || null;
}

export async function salvaSettimana(profiloId, settimana) {
  return scrivi('settimane', {
    id: chiaveSettimana(profiloId, settimana.inizio),
    profiloId,
    inizio: settimana.inizio,
    settimana,
  });
}

export async function eliminaSettimana(profiloId, inizio) {
  return elimina('settimane', chiaveSettimana(profiloId, inizio));
}

export async function tutteLeSettimane(profiloId) {
  const righe = await tutti('settimane', profiloId);
  return righe.sort((a, b) => b.inizio.localeCompare(a.inizio));
}

/* --- Dispensa -------------------------------------------------------------- */

export async function caricaDispensa(profiloId) {
  return tutti('dispensa', profiloId);
}

export async function salvaScorta(profiloId, alimentoId, grammi) {
  const id = `${profiloId}:${alimentoId}`;
  if (grammi <= 0) return elimina('dispensa', id);

  // La data di entrata NON si riscrive correggendo la quantità: altrimenti una
  // ricotta comprata cinque giorni fa tornava fresca ogni volta che si toccava
  // il numero, e la dispensa perdeva la memoria proprio di quello che le serve
  // ricordare. Quando la scorta finisce il record sparisce, quindi ricomprando
  // la data riparte da sé.
  const gia = await leggi('dispensa', id);
  return scrivi('dispensa', {
    id,
    profiloId,
    alimentoId,
    grammi,
    dal: gia?.dal || new Date().toISOString().slice(0, 10),
  });
}

export async function svuotaDispensa(profiloId) {
  const scorte = await caricaDispensa(profiloId);
  await Promise.all(scorte.map((s) => elimina('dispensa', s.id)));
}

/* --- Spesa ----------------------------------------------------------------- */

export async function caricaSpesa(profiloId, inizio) {
  const riga = await leggi('spesa', `${profiloId}:${inizio}`);
  return riga || null;
}

/**
 * Salva le spunte della settimana.
 *
 * `codice` omesso vuol dire «non ne so nulla, lascia quello che c'e'»: chi
 * segna una spunta non deve cancellare il codice con cui la lista e' stata
 * condivisa. Passare `null` invece e' una scelta, e revoca la condivisione.
 */
export async function salvaSpesa(profiloId, inizio, voci, codice) {
  const id = `${profiloId}:${inizio}`;
  const prima = await leggi('spesa', id);
  // Si riparte da quello che c'e' gia'. Elencare i campi uno per uno vuol dire
  // che il primo che ci si dimentica sparisce in silenzio: e' successo col
  // codice della lista, e succederebbe di nuovo al campo dopo.
  return scrivi('spesa', {
    ...prima,
    id,
    profiloId,
    inizio,
    voci,
    codice: codice === undefined ? (prima?.codice ?? null) : codice,
  });
}

/**
 * Segna che gli avanzi di questa settimana sono gia' finiti in dispensa.
 *
 * Serve perche' e' un'azione che chiude la settimana, e va fatta una volta
 * sola: rifarla ricalcolerebbe gli avanzi su una dispensa gia' avanzata, cioe'
 * conterebbe due volte la stessa settimana.
 */
export async function segnaAvanzi(profiloId, inizio) {
  const id = `${profiloId}:${inizio}`;
  const prima = await leggi('spesa', id);
  return scrivi('spesa', {
    ...prima,
    id,
    profiloId,
    inizio,
    voci: prima?.voci || [],
    avanziIl: new Date().toISOString().slice(0, 10),
  });
}

/* --- Diario ---------------------------------------------------------------- */

/**
 * Un record al giorno. `consumato` sono gli id delle voci del piano che sono
 * state effettivamente mangiate; `sgarri` le eccedenze registrate.
 */
export async function caricaDiario(profiloId, data = new Date()) {
  const g = typeof data === 'string' ? data : iso(data);
  const riga = await leggi('diario', `${profiloId}:${g}`);
  return riga || { id: `${profiloId}:${g}`, profiloId, data: g, consumato: [], sgarri: [], acqua: 0 };
}

export async function salvaDiario(voce) {
  return scrivi('diario', voce);
}

export async function tuttoIlDiario(profiloId) {
  const righe = await tutti('diario', profiloId);
  return righe.sort((a, b) => a.data.localeCompare(b.data));
}

/* --- Misure ---------------------------------------------------------------- */

export async function aggiungiMisura(profiloId, { peso, vita, fianchi, data = new Date() }) {
  const g = typeof data === 'string' ? data : iso(data);
  return scrivi('misure', {
    id: `${profiloId}:${g}`, profiloId, data: g, peso, vita, fianchi,
  });
}

export async function tutteLeMisure(profiloId) {
  const righe = await tutti('misure', profiloId);
  return righe
    .filter((m) => typeof m.peso === 'number')
    .sort((a, b) => a.data.localeCompare(b.data));
}

/* --- Aderenza -------------------------------------------------------------- */

/**
 * Quanto e' stato compilato il diario negli ultimi giorni.
 * Serve al TDEE adattivo, che senza questo dato non deve fidarsi di se stesso.
 */
export async function aderenza(profiloId, giorni = 14) {
  const diario = await tuttoIlDiario(profiloId);
  const limite = new Date();
  limite.setDate(limite.getDate() - giorni);
  const recenti = diario.filter((d) => new Date(d.data) >= limite);
  const compilati = recenti.filter((d) => (d.consumato?.length || 0) > 0).length;
  return { compilati, giorni, quota: giorni ? compilati / giorni : 0 };
}
