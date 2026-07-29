/* Equilibrio — il profilo portabile, in un file cifrato.

   Un file esportato in chiaro racconta peso, misure e patologie a chiunque lo
   apra: se passa da WhatsApp o resta nella cartella Download, e' un dato
   sanitario allo scoperto. Qui si cifra sempre.

   Formato del file `.equilibrio` (binario):
     0..3    magic  'EQBR'
     4       versione del formato
     5..8    iterazioni PBKDF2 (uint32, big endian)
     9..24   salt (16 byte)
     25..36  IV   (12 byte)
     37..    testo cifrato AES-GCM-256 (JSON UTF-8, con tag di autenticita')

   L'intestazione resta in chiaro apposta: senza, non si potrebbe riconoscere
   un file di Equilibrio ne' migrare i file scritti da versioni precedenti. */

const MAGIC = [0x45, 0x51, 0x42, 0x52]; // 'EQBR'
const VERSIONE_FORMATO = 1;
const ITERAZIONI = 210_000;
const LUNG_SALT = 16;
const LUNG_IV = 12;
const LUNG_INTESTAZIONE = 4 + 1 + 4 + LUNG_SALT + LUNG_IV; // 37

export class FormatoNonValido extends Error {
  constructor(messaggio = 'Questo non sembra un file di Equilibrio.') {
    super(messaggio);
    this.name = 'FormatoNonValido';
  }
}

export class PassphraseErrata extends Error {
  constructor() {
    super('Passphrase errata: il file non si apre.');
    this.name = 'PassphraseErrata';
  }
}

function subtle() {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto non disponibile in questo contesto');
  return c.subtle;
}

async function derivaChiave(passphrase, salt, iterazioni) {
  const base = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: iterazioni, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {object} fascicolo  quanto restituito da store.esportaFascicolo()
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}
 */
export async function cifra(fascicolo, passphrase) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('La passphrase deve avere almeno 8 caratteri.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(LUNG_SALT));
  const iv = crypto.getRandomValues(new Uint8Array(LUNG_IV));
  const chiave = await derivaChiave(passphrase, salt, ITERAZIONI);

  const chiaro = new TextEncoder().encode(JSON.stringify(fascicolo));
  const cifrato = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv }, chiave, chiaro),
  );

  const out = new Uint8Array(LUNG_INTESTAZIONE + cifrato.length);
  out.set(MAGIC, 0);
  out[4] = VERSIONE_FORMATO;
  new DataView(out.buffer).setUint32(5, ITERAZIONI, false);
  out.set(salt, 9);
  out.set(iv, 9 + LUNG_SALT);
  out.set(cifrato, LUNG_INTESTAZIONE);
  return out;
}

/** Legge la sola intestazione: serve a dare errori sensati prima di provare a decifrare. */
export function ispeziona(byte) {
  const b = new Uint8Array(byte);
  if (b.length < LUNG_INTESTAZIONE + 16) return { valido: false };
  if (!MAGIC.every((m, i) => b[i] === m)) return { valido: false };
  return {
    valido: true,
    versione: b[4],
    iterazioni: new DataView(b.buffer, b.byteOffset).getUint32(5, false),
  };
}

/**
 * @returns {Promise<object>} il fascicolo
 * @throws {FormatoNonValido|PassphraseErrata}
 */
export async function decifra(byte, passphrase) {
  const b = new Uint8Array(byte);
  const testa = ispeziona(b);
  if (!testa.valido) throw new FormatoNonValido();
  if (testa.versione > VERSIONE_FORMATO) {
    throw new FormatoNonValido('Questo file viene da una versione più recente di Equilibrio.');
  }

  const salt = b.slice(9, 9 + LUNG_SALT);
  const iv = b.slice(9 + LUNG_SALT, LUNG_INTESTAZIONE);
  const cifrato = b.slice(LUNG_INTESTAZIONE);
  const chiave = await derivaChiave(passphrase, salt, testa.iterazioni);

  let chiaro;
  try {
    chiaro = await subtle().decrypt({ name: 'AES-GCM', iv }, chiave, cifrato);
  } catch {
    // AES-GCM non distingue "chiave sbagliata" da "file manomesso":
    // in entrambi i casi il tag di autenticita' non torna.
    throw new PassphraseErrata();
  }

  try {
    return JSON.parse(new TextDecoder().decode(chiaro));
  } catch {
    throw new FormatoNonValido('Il contenuto del file è danneggiato.');
  }
}

/* --- Comodita' lato browser ------------------------------------------------ */

export function nomeFile(profilo, oggi = new Date()) {
  const nome = (profilo?.nome || 'profilo')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const data = oggi.toISOString().slice(0, 10);
  return `equilibrio-${nome}-${data}.equilibrio`;
}

export function scarica(byte, nome) {
  const url = URL.createObjectURL(new Blob([byte], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export async function leggiDaFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/** Avviso da mostrare SEMPRE al momento dell'export. Non e' una formalita'. */
export const AVVISO_PASSPHRASE =
  'Se perdi la passphrase, il file non si apre più: non esiste un modo per recuperarlo. ' +
  'Scrivila dove tieni le password, non in un messaggio.';
