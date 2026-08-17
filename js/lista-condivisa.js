/* Equilibrio — client della lista condivisa.
   Manda al server SOLO alimenti, quantita' e spunte: la ripulitura avviene
   qui e viene ripetuta lato server, perche' su una cosa cosi' non si delega. */

import { quantitaLeggibile } from './spesa.js';
import { fondiSpunte } from './spesa.js';

const API = '/api/lista-pubblica';

/**
 * L'alfabeto dei codici, uguale a quello del server (`api/_lib.js`).
 * E' ripetuto qui apposta: il client non deve importare codice del server, e
 * un codice scritto male va detto prima di fare il viaggio.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LUNGHEZZA_CODICE = 10;

/** Come sopra: O sta per zero, I e L stanno per uno. Si perdona, non si rifiuta. */
export function normalizzaCodice(grezzo) {
  return String(grezzo || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function codiceValido(codice) {
  // I codici a 6 cifre sono quelli di prima: vivono ancora due giorni.
  if (/^\d{6}$/.test(codice)) return true;
  return codice.length === LUNGHEZZA_CODICE && [...codice].every((c) => ALFABETO.includes(c));
}

/** Due gruppi da cinque: si detta e si ricopia senza perdere il segno. */
export function codiceLeggibile(codice) {
  const c = String(codice || '');
  return c.length === LUNGHEZZA_CODICE ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Il minimo indispensabile per fare la spesa, e niente di piu'. */
export function perLaRete(lista, spunte = new Map()) {
  return lista.voci.map((v) => ({
    alimentoId: v.alimentoId,
    nome: v.nome,
    quantita: quantitaLeggibile(v),
    reparto: v.reparto,
    spuntato: Boolean(spunte.get(v.alimentoId)?.spuntato),
    spuntatoIl: spunte.get(v.alimentoId)?.spuntatoIl || null,
  }));
}

export async function pubblica(lista, spunte) {
  try {
    const risposta = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voci: perLaRete(lista, spunte) }),
    });
    return interpreta(risposta);
  } catch {
    return { ok: false, rete: false, messaggio: 'Nessuna rete: riprova quando torna il segnale.' };
  }
}

export async function scarica(codice) {
  try {
    const risposta = await fetch(`${API}?codice=${encodeURIComponent(codice)}`);
    return interpreta(risposta);
  } catch {
    return { ok: false, rete: false, messaggio: 'Nessuna rete: riprova quando torna il segnale.' };
  }
}

/**
 * Riallinea la lista condivisa a quella di casa.
 * Serve quando la lista cambia DOPO essere stata pubblicata — cambiano i
 * commensali, entra qualcosa in dispensa — perche' altrimenti chi e' al
 * supermercato sta guardando una lista che non esiste piu'.
 */
export async function sincronizza(codice, lista, spunte) {
  const esito = await patch(codice, perLaRete(lista, spunte));
  if (esito.ok) {
    // Le spunte remote si fondono con le locali per singola voce: chi spunta
    // al supermercato non cancella la modifica appena fatta a casa.
    esito.voci = fondiSpunte([...spunte.values()], esito.voci);
  }
  return esito;
}

/**
 * Le spunte che non sono ancora passate.
 *
 * Al supermercato la rete va e viene, e senza questo la frase «riprovo alla
 * prossima spunta» sarebbe una bugia: non c'era nessun ritentativo. Ora ogni
 * spunta si porta dietro quelle rimaste indietro.
 */
const inSospeso = new Map();

export function spunteInSospeso() {
  return inSospeso.size;
}

/** Manda una spunta, e con lei quelle rimaste indietro. Il server fonde per voce. */
export async function mandaSpunta(codice, voce) {
  inSospeso.set(voce.alimentoId, voce);
  const esito = await patch(codice, [...inSospeso.values()]);
  // Se il server ha risposto — codice scaduto, per esempio — riprovare non
  // serve a niente: la coda si tiene solo quando e' mancata la rete.
  if (esito.rete !== false) inSospeso.clear();
  return esito;
}

async function patch(codice, voci) {
  try {
    const risposta = await fetch(API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codice, voci }),
    });
    return interpreta(risposta);
  } catch {
    return { ok: false, rete: false, messaggio: 'Nessuna rete: riprovo alla prossima spunta.' };
  }
}

async function interpreta(risposta) {
  let dati = null;
  try { dati = await risposta.json(); } catch { /* corpo non JSON */ }

  // Un 200 che non porta JSON non e' un successo: e' la pagina di un portale
  // wi-fi, o l'app servita al posto della funzione. Trattarlo come «fatto»
  // vorrebbe dire dire all'utente che la lista e' partita quando non e' vero.
  if (risposta.ok && !dati) {
    return { ok: false, messaggio: 'Il servizio ha risposto qualcosa che non capisco. Riprova.' };
  }
  if (risposta.ok) return { ok: true, ...dati };
  dati = dati || {};

  if (dati.codice === 'kv-assente') {
    return {
      ok: false,
      messaggio: 'La condivisione non è ancora attiva su questo indirizzo: '
        + "manca l'archivio sul server. Nel frattempo puoi usare «Condividi», "
        + 'che manda la lista come testo.',
    };
  }
  if (dati.codice === 'troppi-tentativi') {
    return {
      ok: false,
      messaggio: 'Troppi codici sbagliati da questo dispositivo. '
        + "Riprova fra un'ora, e controlla di averlo ricopiato bene.",
    };
  }
  if (risposta.status === 404) {
    return { ok: false, messaggio: 'Quel codice non esiste più: le liste scadono dopo due giorni.' };
  }
  return { ok: false, messaggio: dati.error || 'Non riesco a raggiungere il servizio.' };
}
