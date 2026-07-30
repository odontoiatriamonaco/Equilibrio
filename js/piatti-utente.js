/* Equilibrio — le pietanze di casa.
   Il ricettario di serie non si modifica mai: le variazioni diventano pietanze
   proprie del profilo, salvate su questo dispositivo. Cosi' un aggiornamento
   dell'app non cancella la pasta e patate come la fa Carmela, e resta sempre
   possibile tornare all'originale.

   Una variante «copre» il piatto da cui nasce: nel ricettario in uso compare
   solo la versione di casa, altrimenti si vedrebbero due pasta e patate. */

import { tutti, scrivi, elimina } from './store.js';
import { registraPiattiUtente, piattiDiSerie, alimento } from './alimenti.js';

export const TIPI_AMMESSI = [
  'colazione', 'spuntino', 'primo', 'secondo', 'contorno', 'piatto-unico',
];

/* --- Lettura e registrazione ----------------------------------------------- */

export async function pietanzeDiCasa(profiloId) {
  const righe = await tutti('piatti', profiloId);
  return righe
    .map((r) => r.piatto)
    .filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

/**
 * Da chiamare all'avvio di ogni pagina, prima di leggere il ricettario.
 * @returns {Promise<Array>} il ricettario in uso
 */
export async function caricaRicettario(profiloId) {
  const mie = profiloId ? await pietanzeDiCasa(profiloId) : [];
  return registraPiattiUtente(mie);
}

/* --- Scrittura ------------------------------------------------------------- */

function chiave(profiloId, piattoId) {
  return `${profiloId}:${piattoId}`;
}

export async function salvaPietanza(profiloId, piatto) {
  const errori = valida(piatto);
  if (errori.length) throw new Error(errori[0]);

  const pulito = {
    ...piatto,
    origine: 'casa',
    modificatoIl: new Date().toISOString(),
    ingredienti: piatto.ingredienti
      .filter((i) => i.a && i.g > 0)
      .map((i) => ({ a: i.a, g: Math.round(i.g) })),
  };

  await scrivi('piatti', {
    id: chiave(profiloId, pulito.id),
    profiloId,
    piattoId: pulito.id,
    piatto: pulito,
  });

  await caricaRicettario(profiloId);
  return pulito;
}

export async function eliminaPietanza(profiloId, piattoId) {
  await elimina('piatti', chiave(profiloId, piattoId));
  await caricaRicettario(profiloId);
}

/* --- Costruzione ----------------------------------------------------------- */

/** Copia modificabile di un piatto di serie: e' il «modifica» della scheda. */
export function comeVariante(originale, { nome } = {}) {
  return {
    id: `casa_${originale.id}_${idBreve()}`,
    derivatoDa: originale.id,
    nome: nome || originale.nome,
    tipo: originale.tipo,
    slot: originale.slot ? [...originale.slot] : undefined,
    tempo: originale.tempo,
    stagione: originale.stagione ? [...originale.stagione] : undefined,
    avanzabile: originale.avanzabile,
    icona: originale.icona,
    procedimento: originale.procedimento ? [...originale.procedimento] : undefined,
    // L'alleggerimento del piatto di serie parla della ricetta di serie: se la
    // ricetta cambia, quella riga non e' piu' vera e va lasciata cadere.
    ingredienti: (originale.ingredienti || []).map((i) => ({ ...i })),
    origine: 'casa',
  };
}

/** Pietanza nuova, da zero. */
export function nuovaPietanza(tipo = 'piatto-unico') {
  return {
    id: `casa_${idBreve()}`,
    derivatoDa: null,
    nome: '',
    tipo,
    slot: tipo === 'colazione' ? ['colazione']
      : tipo === 'spuntino' ? ['spuntino-mattina', 'spuntino-pomeriggio']
        : ['pranzo', 'cena'],
    tempo: 20,
    ingredienti: [],
    origine: 'casa',
  };
}

function idBreve() {
  return Math.random().toString(36).slice(2, 8);
}

/* --- Modifica degli ingredienti -------------------------------------------- */

export function aggiungiIngrediente(piatto, alimentoId, grammi) {
  const a = alimento(alimentoId);
  const g = grammi ?? a?.porzione ?? 100;
  const esistente = piatto.ingredienti.findIndex((i) => i.a === alimentoId);

  // Aggiungere due volte lo stesso alimento non crea due righe: somma.
  const ingredienti = esistente >= 0
    ? piatto.ingredienti.map((i, k) => (k === esistente ? { ...i, g: i.g + g } : i))
    : [...piatto.ingredienti, { a: alimentoId, g }];

  return { ...piatto, ingredienti };
}

export function cambiaQuantita(piatto, alimentoId, grammi) {
  return {
    ...piatto,
    ingredienti: piatto.ingredienti.map((i) => (i.a === alimentoId ? { ...i, g: grammi } : i)),
  };
}

export function togliIngrediente(piatto, alimentoId) {
  return {
    ...piatto,
    ingredienti: piatto.ingredienti.filter((i) => i.a !== alimentoId),
  };
}

/* --- Controlli ------------------------------------------------------------- */

/**
 * Errori che impediscono il salvataggio. Sono pochi di proposito: la ricetta
 * e' di chi cucina, e non sta a un programma dire come si fa la genovese.
 */
export function valida(piatto) {
  const errori = [];
  if (!piatto?.nome?.trim()) errori.push('Serve un nome.');
  if (!TIPI_AMMESSI.includes(piatto?.tipo)) errori.push('Tipo di pietanza non valido.');

  const ingredienti = (piatto?.ingredienti || []).filter((i) => i.a && i.g > 0);
  if (!ingredienti.length) errori.push('Serve almeno un ingrediente.');

  for (const i of ingredienti) {
    if (!alimento(i.a)) errori.push(`Ingrediente sconosciuto: ${i.a}`);
    if (i.g > 3000) errori.push('Una quantità sopra i 3 kg per porzione è quasi certamente un errore.');
  }
  return errori;
}

/**
 * Avvertimenti che NON bloccano: si mostrano e si va avanti.
 * Un piatto strano puo' essere giusto — un brodo fa poche calorie e va bene.
 */
export function avvertimenti(piatto, valori) {
  const note = [];
  if (valori.kcal < 60) {
    note.push('Meno di 60 kcal a porzione: se non è un brodo o una tisana, controlla le quantità.');
  }
  if (valori.kcal > 1100) {
    note.push(`${Math.round(valori.kcal)} kcal a porzione sono molte: forse le dosi sono per più persone.`);
  }
  if (piatto.derivatoDa) {
    const originale = piattiDiSerie.find((p) => p.id === piatto.derivatoDa);
    if (originale) {
      note.push(`Questa versione prende il posto di «${originale.nome}» nel tuo ricettario. `
        + "L'originale resta e torna se cancelli la tua.");
    }
  }
  return note;
}

/** Cosa e' cambiato rispetto al piatto di partenza, in parole. */
export function differenze(variante) {
  const originale = piattiDiSerie.find((p) => p.id === variante.derivatoDa);
  if (!originale) return [];

  const prima = new Map((originale.ingredienti || []).map((i) => [i.a, i.g]));
  const dopo = new Map((variante.ingredienti || []).map((i) => [i.a, i.g]));
  const fuori = [];

  for (const [id, g] of dopo) {
    const nome = alimento(id)?.nome || id;
    if (!prima.has(id)) fuori.push(`aggiunto ${nome.toLowerCase()} (${g} g)`);
    else if (prima.get(id) !== g) fuori.push(`${nome.toLowerCase()} da ${prima.get(id)} a ${g} g`);
  }
  for (const [id] of prima) {
    if (!dopo.has(id)) fuori.push(`tolto ${(alimento(id)?.nome || id).toLowerCase()}`);
  }
  return fuori;
}
