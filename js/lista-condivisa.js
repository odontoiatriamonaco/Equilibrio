/* Equilibrio — client della lista condivisa.
   Manda al server SOLO alimenti, quantita' e spunte: la ripulitura avviene
   qui e viene ripetuta lato server, perche' su una cosa cosi' non si delega. */

import { quantitaLeggibile } from './spesa.js';
import { fondiSpunte } from './spesa.js';

const API = '/api/lista-pubblica';

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
  const risposta = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voci: perLaRete(lista, spunte) }),
  });
  return interpreta(risposta);
}

export async function scarica(codice) {
  const risposta = await fetch(`${API}?codice=${encodeURIComponent(codice)}`);
  return interpreta(risposta);
}

export async function sincronizza(codice, lista, spunte) {
  const esito = await patch(codice, perLaRete(lista, spunte));
  if (esito.ok) {
    // Le spunte remote si fondono con le locali per singola voce: chi spunta
    // al supermercato non cancella la modifica appena fatta a casa.
    esito.voci = fondiSpunte([...spunte.values()], esito.voci);
  }
  return esito;
}

/** Manda una sola spunta. Il server fonde per voce, quindi e' sicuro. */
export async function mandaSpunta(codice, voce) {
  return patch(codice, [voce]);
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
    return { ok: false, messaggio: 'Nessuna rete: riprovo alla prossima spunta.' };
  }
}

async function interpreta(risposta) {
  let dati = {};
  try { dati = await risposta.json(); } catch { /* corpo non JSON */ }

  if (risposta.ok) return { ok: true, ...dati };

  if (dati.codice === 'kv-assente') {
    return {
      ok: false,
      messaggio: 'La condivisione non è ancora attiva su questo indirizzo: '
        + "manca l'archivio sul server. Nel frattempo puoi usare «Condividi», "
        + 'che manda la lista come testo.',
    };
  }
  if (risposta.status === 404) {
    return { ok: false, messaggio: 'Quel codice non esiste più: le liste scadono dopo due giorni.' };
  }
  return { ok: false, messaggio: dati.error || 'Non riesco a raggiungere il servizio.' };
}
