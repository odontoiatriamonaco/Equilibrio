/* Equilibrio — casualita' riproducibile.
   Il generatore della settimana deve poter essere rigenerato identico: senza
   un seme, «Rigenera» non si potrebbe annullare e nessun test sarebbe stabile. */

/** mulberry32: piccolo, veloce, sufficiente per scegliere un piatto. */
export function generatore(seme) {
  let s = seme >>> 0;
  return function successivo() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semi leggibili, cosi' l'utente puo' vederli e ritrovarli. */
export function semeDaTesto(testo) {
  let h = 2166136261;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Estrazione pesata: piu' alto il peso, piu' probabile la scelta.
 * Gli elementi di peso nullo non vengono mai estratti — e' cosi' che le
 * esclusioni delle preferenze diventano vincoli veri.
 */
export function pescaPesato(elementi, pesi, rnd) {
  const totale = pesi.reduce((s, p) => s + Math.max(0, p), 0);
  if (totale <= 0) return null;
  let soglia = rnd() * totale;
  for (let i = 0; i < elementi.length; i++) {
    soglia -= Math.max(0, pesi[i]);
    if (soglia <= 0) return elementi[i];
  }
  return elementi[elementi.length - 1];
}

/** Mescola una copia dell'array (Fisher-Yates). */
export function mescola(array, rnd) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
