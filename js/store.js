/* Equilibrio — archivio locale (IndexedDB), partizionato per profilo.

   Regola: i dati di un profilo non escono mai da questo dispositivo.
   Ogni record porta un `profiloId`; le letture passano sempre dall'indice,
   mai da una scansione globale, cosi' due profili non si mescolano per errore. */

const NOME_DB = 'equilibrio';
const VERSIONE_DB = 2;

/** Archivi partizionati per profilo (hanno tutti l'indice `profiloId`). */
export const ARCHIVI_PROFILO = [
  'preferenze',
  'settimane',
  'diario',
  'dispensa',
  'spesa',
  'piatti',
  'misure',
  // Chi segue il menu' di un altro tiene qui le proprie porzioni e le proprie
  // alternative: il piano resta uno solo, questo e' lo strato personale.
  'personalizzazioni',
];

/** Archivi globali: non contengono dati sanitari. */
const ARCHIVI_GLOBALI = ['profili', 'impostazioni', 'cacheOff'];

let promessaDb = null;

export function apri() {
  if (promessaDb) return promessaDb;

  promessaDb = new Promise((risolvi, rifiuta) => {
    const req = indexedDB.open(NOME_DB, VERSIONE_DB);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('profili')) {
        db.createObjectStore('profili', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('impostazioni')) {
        db.createObjectStore('impostazioni', { keyPath: 'chiave' });
      }
      if (!db.objectStoreNames.contains('cacheOff')) {
        db.createObjectStore('cacheOff', { keyPath: 'barcode' });
      }

      for (const nome of ARCHIVI_PROFILO) {
        if (!db.objectStoreNames.contains(nome)) {
          const s = db.createObjectStore(nome, { keyPath: 'id' });
          s.createIndex('profiloId', 'profiloId', { unique: false });
        }
      }
    };

    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });

  return promessaDb;
}

/** Chiude la connessione. Serve prima di cancellare il database (test, reset). */
export async function chiudi() {
  if (!promessaDb) return;
  const db = await promessaDb;
  db.close();
  promessaDb = null;
}

/** Attende una IDBRequest. */
function attesa(richiesta) {
  return new Promise((risolvi, rifiuta) => {
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

/** Attende una IDBTransaction: emette `complete`, non `success`. */
function attesaTx(tx) {
  return new Promise((risolvi, rifiuta) => {
    tx.oncomplete = () => risolvi();
    tx.onerror = () => rifiuta(tx.error);
    tx.onabort = () => rifiuta(tx.error);
  });
}

/* --- Operazioni di base ---------------------------------------------------- */

export async function leggi(archivio, id) {
  const db = await apri();
  return attesa(db.transaction(archivio, 'readonly').objectStore(archivio).get(id));
}

export async function scrivi(archivio, oggetto) {
  const db = await apri();
  const record = { ...oggetto, aggiornatoIl: new Date().toISOString() };
  const tx = db.transaction(archivio, 'readwrite');
  tx.objectStore(archivio).put(record);
  await attesaTx(tx);
  return record;
}

export async function elimina(archivio, id) {
  const db = await apri();
  const tx = db.transaction(archivio, 'readwrite');
  tx.objectStore(archivio).delete(id);
  return attesaTx(tx);
}

/** Tutti i record di un archivio appartenenti a un profilo. */
export async function tutti(archivio, profiloId) {
  const db = await apri();
  const s = db.transaction(archivio, 'readonly').objectStore(archivio);
  if (!profiloId) return attesa(s.getAll());
  return attesa(s.index('profiloId').getAll(profiloId));
}

/* --- Profili --------------------------------------------------------------- */

export async function profili() {
  const db = await apri();
  return attesa(db.transaction('profili', 'readonly').objectStore('profili').getAll());
}

export async function creaProfilo(dati) {
  const id = dati.id || `p_${crypto.randomUUID()}`;
  const profilo = { ...dati, id, creatoIl: new Date().toISOString() };
  await scrivi('profili', profilo);
  const elenco = await profili();
  if (elenco.length === 1) await impostaProfiloAttivo(id);
  return profilo;
}

export async function profiloAttivo() {
  const riga = await leggi('impostazioni', 'profiloAttivo');
  if (riga?.valore) {
    const p = await leggi('profili', riga.valore);
    if (p) return p;
  }
  // Primo avvio, o profilo attivo cancellato: si ricade sul primo disponibile.
  const elenco = await profili();
  return elenco[0] || null;
}

export async function impostaProfiloAttivo(id) {
  return scrivi('impostazioni', { chiave: 'profiloAttivo', valore: id });
}

/**
 * Cancella un profilo e TUTTI i suoi dati, in ogni archivio.
 * Un profilo cancellato a meta' e' peggio di un profilo non cancellato.
 */
export async function eliminaProfilo(profiloId) {
  const db = await apri();

  // Una sola transazione su tutti gli archivi, guidata da cursori: niente
  // `await` in mezzo, altrimenti la transazione diventa inattiva e la
  // cancellazione resta a meta'.
  const tx = db.transaction([...ARCHIVI_PROFILO, 'profili'], 'readwrite');
  for (const nome of ARCHIVI_PROFILO) {
    const s = tx.objectStore(nome);
    const req = s.index('profiloId').openKeyCursor(IDBKeyRange.only(profiloId));
    req.onsuccess = () => {
      const cursore = req.result;
      if (!cursore) return;
      s.delete(cursore.primaryKey);
      cursore.continue();
    };
  }
  tx.objectStore('profili').delete(profiloId);
  await attesaTx(tx);

  // Chi seguiva questo profilo resterebbe puntato al vuoto: si stacca, e
  // torna a un piano suo. Meglio slegato che rotto.
  const staccati = [];
  for (const p of await profili()) {
    if (p.seguo !== profiloId) continue;
    await scrivi('profili', { ...p, seguo: null });
    staccati.push(p.nome || 'Profilo');
  }

  const attivo = await leggi('impostazioni', 'profiloAttivo');
  if (attivo?.valore === profiloId) {
    const rimasti = await profili();
    await impostaProfiloAttivo(rimasti[0]?.id ?? null);
  }

  return { staccati };
}

/* --- Fascicolo completo (per export/import) -------------------------------- */

/** Versione dello schema del fascicolo: serve a migrare i file vecchi. */
export const VERSIONE_SCHEMA = 1;

export async function esportaFascicolo(profiloId) {
  const profilo = await leggi('profili', profiloId);
  if (!profilo) throw new Error('Profilo inesistente');

  // Il legame di famiglia punta a un id che sull'altro dispositivo non esiste,
  // quindi all'import viene azzerato. Il NOME invece serve: senza, chi importa
  // non sa nemmeno che quel profilo seguiva qualcuno e va ricollegato.
  const capo = profilo.seguo ? await leggi('profili', profilo.seguo) : null;

  const archivi = {};
  for (const nome of ARCHIVI_PROFILO) {
    archivi[nome] = await tutti(nome, profiloId);
  }

  return {
    schema: VERSIONE_SCHEMA,
    esportatoIl: new Date().toISOString(),
    profilo: capo ? { ...profilo, seguoNome: capo.nome } : profilo,
    archivi,
  };
}

/**
 * L'identita' di un profilo attraverso i dispositivi.
 *
 * L'id locale cambia a ogni import, quindi da solo non basta a riconoscere «lo
 * stesso profilo». `origine` e' l'id del dispositivo dove il profilo e' NATO, e
 * si porta dietro a ogni esportazione: e' quello che permette di riconoscere il
 * fascicolo di Renata come un aggiornamento di quello di Renata gia' presente,
 * invece di ritrovarsi due Renate.
 */
export function origineDi(profilo) {
  return profilo?.origine || profilo?.id || null;
}

/** Il profilo gia' presente che questo fascicolo aggiornerebbe, se c'e'. */
export async function gemelloDi(fascicolo) {
  const origine = origineDi(fascicolo?.profilo);
  if (!origine) return null;
  return (await profili()).find((p) => origineDi(p) === origine) || null;
}

/**
 * Reimporta un fascicolo.
 *
 * Senza `sovrascrivi` assegna un id NUOVO: caricare un profilo su un secondo
 * dispositivo non deve poter cancellare quello che c'e' gia' per sbaglio.
 *
 * Con `sovrascrivi` prende il posto di quel profilo TENENDONE l'id, ed e' il
 * modo in cui una famiglia resta allineata: chi segue Renata continua a
 * seguirla anche dopo che lei ha rigenerato la settimana e ha rimandato il
 * fascicolo, perche' l'id a cui punta non e' cambiato.
 */
export async function importaFascicolo(fascicolo, { nuovoNome, sovrascrivi } = {}) {
  if (!fascicolo || typeof fascicolo !== 'object') throw new Error('Fascicolo illeggibile');
  if (fascicolo.schema > VERSIONE_SCHEMA) {
    throw new Error('Questo file viene da una versione più recente di Equilibrio');
  }

  const vecchio = sovrascrivi ? await leggi('profili', sovrascrivi) : null;
  if (sovrascrivi && !vecchio) throw new Error('Il profilo da sovrascrivere non esiste più');

  const nuovoId = vecchio?.id || `p_${crypto.randomUUID()}`;
  const profilo = {
    ...fascicolo.profilo,
    id: nuovoId,
    origine: origineDi(fascicolo.profilo),
    nome: nuovoNome || fascicolo.profilo?.nome || 'Profilo importato',
    // Il legame di famiglia punta a un id che su QUESTO dispositivo non esiste:
    // portarselo dietro lascerebbe un riferimento pendente. Sovrascrivendo si
    // tiene invece quello gia' scelto qui, che e' valido.
    seguo: vecchio?.seguo ?? null,
    importatoIl: new Date().toISOString(),
  };

  // Sovrascrivere vuol dire prendere il posto, non mescolarsi: i vecchi record
  // vanno via prima, o resterebbero settimane e diari di due versioni diverse.
  if (vecchio) await svuotaArchiviDi(nuovoId);

  await scrivi('profili', profilo);

  const db = await apri();
  for (const nome of ARCHIVI_PROFILO) {
    const record = fascicolo.archivi?.[nome] || [];
    if (!record.length) continue;
    const tx = db.transaction(nome, 'readwrite');
    const s = tx.objectStore(nome);
    for (const r of record) {
      // Le chiavi contengono il vecchio id del profilo: vanno riscritte.
      const id = String(r.id).replace(fascicolo.profilo.id, nuovoId);
      s.put({ ...r, id, profiloId: nuovoId });
    }
    await attesaTx(tx);
  }

  return profilo;
}

/** Cancella i dati di un profilo lasciando in piedi il profilo stesso. */
async function svuotaArchiviDi(profiloId) {
  const db = await apri();
  const tx = db.transaction(ARCHIVI_PROFILO, 'readwrite');
  for (const nome of ARCHIVI_PROFILO) {
    const s = tx.objectStore(nome);
    const req = s.index('profiloId').openKeyCursor(IDBKeyRange.only(profiloId));
    req.onsuccess = () => {
      const cursore = req.result;
      if (!cursore) return;
      s.delete(cursore.primaryKey);
      cursore.continue();
    };
  }
  await attesaTx(tx);
}
