/* Equilibrio — scambi.
   Due tipi, entrambi «a parita' di valore»: scambiare un ALIMENTO con un altro
   dello stesso gruppo (pasta 80 g ↔ riso 80 g ↔ pane 100 g) e sostituire un
   PIATTO con un altro dello stesso ruolo nel pasto.

   Serve a una cosa sola: che «stasera non mi va» non faccia saltare il piano. */

import {
  alimento, alimenti, gruppi, piatti as tuttiPiatti,
  valoriPiatto, valoriVoce, diStagione,
} from './alimenti.js';
import { ammesso, peso as pesoPreferenza } from './preferenze.js';

/**
 * Alternative a un alimento, con i grammi che valgono la stessa porzione.
 * Le equivalenze dichiarate in data/gruppi.json hanno la precedenza; per il
 * resto si ricava dalle calorie, che e' un'approssimazione ma onesta.
 */
export function alternativeAlimento(id) {
  const a = alimento(id);
  if (!a) return [];

  const tabella = gruppi.scambi?.[a.gruppo];
  const baseGrammi = tabella?.[id] ?? a.porzione;
  const baseKcal = (a.per100g.kcal * baseGrammi) / 100;

  return alimenti
    .filter((x) => x.gruppo === a.gruppo && x.id !== id)
    .map((x) => {
      const dichiarato = tabella?.[x.id];
      const grammi = dichiarato ?? (x.per100g.kcal > 0
        ? Math.round((baseKcal / x.per100g.kcal) * 100)
        : null);
      if (!grammi) return null;
      return {
        id: x.id,
        nome: x.nome,
        grammi: arrotondaGrammi(grammi),
        kcal: Math.round((x.per100g.kcal * grammi) / 100),
        equivalenzaDichiarata: dichiarato !== undefined,
      };
    })
    .filter(Boolean)
    .sort((x, y) => Number(y.equivalenzaDichiarata) - Number(x.equivalenzaDichiarata)
      || x.nome.localeCompare(y.nome, 'it'));
}

/** Ai 5 g non ci crede nessuno: si arrotonda a 10, o a 5 sotto i 50 g. */
function arrotondaGrammi(g) {
  if (g < 50) return Math.round(g / 5) * 5;
  return Math.round(g / 10) * 10;
}

/**
 * Piatti che possono prendere il posto di quello dato: stesso tipo, ammessi
 * dalle preferenze, di stagione, ordinati per somiglianza calorica e gradimento.
 *
 * `piatti` e' iniettabile perche' a tavola c'e' piu' di una persona: cercare
 * un'alternativa per Nina vuol dire cercarla nel SUO ricettario, non in quello
 * in uso — che porta le pietanze di casa e le omissioni di qualcun altro.
 *
 * @param {object} voce  la voce del piano da sostituire
 * @param {{preferenze:object, mese:number, esclusiIds?:Set<string>,
 *          quanti?:number, piatti?:Array}} ctx
 */
export function alternativePiatto(voce, {
  preferenze, mese, esclusiIds = new Set(), quanti = 8, piatti: catalogo = tuttiPiatti,
}) {
  const attuale = catalogo.find((p) => p.id === voce.id);
  if (!attuale) return [];

  // Dal catalogo dato, non dall'indice globale: possono essere due ricettari
  // diversi, e lo stesso piatto valere kcal diverse per due persone.
  const kcalAttuali = valoriPiatto(attuale, 1).kcal;

  return catalogo
    .filter((p) => p.id !== attuale.id && p.tipo === attuale.tipo)
    .filter((p) => !esclusiIds.has(p.id))
    .filter((p) => ammesso(preferenze, p))
    .map((p) => {
      const kcal = valoriPiatto(p).kcal;
      const scartoKcal = Math.abs(kcal - kcalAttuali);
      const gradimento = pesoPreferenza(preferenze, p);
      const stagione = diStagione(p, mese);
      // Prima cio' che piace e che e' di stagione, poi cio' che somiglia:
      // scambiare per avere un piatto che non si vuole non serve a nulla.
      const punteggio = gradimento * (stagione ? 1 : 0.3) * (1 / (1 + scartoKcal / 150));
      return { id: p.id, nome: p.nome, tipo: p.tipo, kcal, scartoKcal, stagione, tempo: p.tempo, punteggio };
    })
    .sort((x, y) => y.punteggio - x.punteggio)
    .slice(0, quanti);
}

/**
 * Sostituisce una voce nel piano mantenendo l'apporto calorico:
 * le porzioni del piatto nuovo si adattano per non sbilanciare il giorno.
 */
export function scambiaPiatto(settimana, { giorno, pasto, indice, nuovoId }) {
  const copia = structuredClone(settimana);
  const voci = copia.giorni[giorno]?.pasti?.[pasto];
  if (!voci?.[indice]) return copia;

  const vecchia = voci[indice];
  const kcalVecchie = valoriVoce(vecchia).kcal;
  const kcalNuove = valoriPiatto(tuttiPiatti.find((p) => p.id === nuovoId) || {}).kcal;

  const porzioni = kcalNuove > 0
    ? Math.min(1.5, Math.max(0.6, Math.round((kcalVecchie / kcalNuove) * 20) / 20))
    : 1;

  voci[indice] = { tipo: 'piatto', id: nuovoId, porzioni, scambiato: true };
  return copia;
}

/** Il gruppo di scambio di un alimento, con la nota che lo spiega. */
export function gruppoScambio(id) {
  const a = alimento(id);
  if (!a) return null;
  return gruppi.gruppi.find((g) => g.id === a.gruppo) || null;
}
