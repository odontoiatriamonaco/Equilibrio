/* Equilibrio — prodotti confezionati da Open Food Facts.
   Serve per quello che il nucleo curato non copre: lo yogurt di marca, i
   biscotti, il pane in cassetta. La risposta resta in cache su IndexedDB,
   cosi' un prodotto gia' scansionato funziona anche in modalita' aereo.

   Dati Open Food Facts, licenza ODbL. L'attribuzione va tenuta in vista. */

import { leggi, scrivi } from './store.js';

const BASE = 'https://world.openfoodfacts.org/api/v2/product';
const CAMPI = [
  'code', 'product_name', 'product_name_it', 'brands', 'quantity',
  'serving_size', 'nutriments', 'nutriscore_grade', 'nova_group',
  'allergens_tags', 'ingredients_text_it', 'ingredients_text',
].join(',');

export const ATTRIBUZIONE = 'Dati dei prodotti confezionati da Open Food Facts, licenza ODbL.';

/**
 * Cerca un prodotto per codice a barre.
 * @returns {Promise<{trovato:boolean, prodotto?:object, daCache?:boolean, messaggio?:string}>}
 */
export async function cercaBarcode(barcode) {
  const codice = String(barcode).replace(/\D/g, '');
  if (codice.length < 8) return { trovato: false, messaggio: 'Codice a barre non valido.' };

  const inCache = await leggi('cacheOff', codice);

  try {
    const risposta = await fetch(`${BASE}/${codice}.json?fields=${CAMPI}`, {
      headers: { Accept: 'application/json' },
    });

    if (risposta.status === 404) {
      return {
        trovato: false,
        messaggio: 'Questo prodotto non è nel database. Puoi inserire i valori a mano '
          + "leggendoli dall'etichetta.",
      };
    }
    if (!risposta.ok) throw new Error(String(risposta.status));

    const dati = await risposta.json();
    if (dati.status === 0 || !dati.product) {
      return { trovato: false, messaggio: 'Prodotto non trovato.' };
    }

    const prodotto = normalizza(codice, dati.product);
    await scrivi('cacheOff', { barcode: codice, prodotto });
    return { trovato: true, prodotto };
  } catch {
    // Senza rete vale quello che era stato scansionato prima: e' il motivo per
    // cui la cache esiste.
    if (inCache?.prodotto) {
      return { trovato: true, prodotto: inCache.prodotto, daCache: true };
    }
    return {
      trovato: false,
      messaggio: 'Niente rete, e questo prodotto non è mai stato letto prima.',
    };
  }
}

/** Riduce la risposta di Open Food Facts alla forma usata dall'app. */
function normalizza(codice, p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g']
    ?? (n.energy_100g ? n.energy_100g / 4.184 : null);

  return {
    barcode: codice,
    nome: p.product_name_it || p.product_name || 'Prodotto senza nome',
    marca: (p.brands || '').split(',')[0].trim() || null,
    formato: p.quantity || null,
    porzioneDichiarata: p.serving_size || null,
    per100g: {
      kcal: arrotonda(kcal),
      pro: arrotonda(n.proteins_100g, 1),
      car: arrotonda(n.carbohydrates_100g, 1),
      gra: arrotonda(n.fat_100g, 1),
      fib: arrotonda(n.fiber_100g, 1),
      sod: arrotonda(n.sodium_100g ? n.sodium_100g * 1000 : null),
    },
    nutriScore: p.nutriscore_grade || null,
    nova: p.nova_group || null,
    allergeni: (p.allergens_tags || []).map((a) => a.replace(/^..:/, '')),
    ingredienti: p.ingredients_text_it || p.ingredients_text || null,
    fonte: 'Open Food Facts',
    lettoIl: new Date().toISOString(),
  };
}

function arrotonda(v, decimali = 0) {
  if (v == null || Number.isNaN(Number(v))) return null;
  const p = 10 ** decimali;
  return Math.round(Number(v) * p) / p;
}

/** Un prodotto senza calorie non serve a niente: va detto invece di mostrare 0. */
export function valoriUtilizzabili(prodotto) {
  return typeof prodotto?.per100g?.kcal === 'number' && prodotto.per100g.kcal > 0;
}

/** Calorie di una quantita' in grammi. */
export function kcalPer(prodotto, grammi) {
  if (!valoriUtilizzabili(prodotto)) return null;
  return Math.round((prodotto.per100g.kcal * grammi) / 100);
}

/* --- Scansione con la fotocamera ------------------------------------------- */

export function scansioneDisponibile() {
  return 'BarcodeDetector' in window;
}

/**
 * Apre la fotocamera e risolve col primo codice a barre riconosciuto.
 * Dove BarcodeDetector non c'e' (iOS, Firefox) resta l'inserimento a mano:
 * meglio un campo di testo che un pulsante che non fa niente.
 */
export async function scansiona(video, { segnale } = {}) {
  if (!scansioneDisponibile()) throw new Error('scansione-non-supportata');

  const rilevatore = new window.BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
  });

  const flusso = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });

  video.srcObject = flusso;
  await video.play();

  try {
    for (;;) {
      if (segnale?.aborted) throw new Error('annullata');
      const codici = await rilevatore.detect(video);
      if (codici.length) return codici[0].rawValue;
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    flusso.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
