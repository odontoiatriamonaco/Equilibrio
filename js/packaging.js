/* Equilibrio — formati di vendita e antispreco.
   La ricetta chiede 100 g di ricotta, il negozio la vende da 250. Quei 150 g
   che restano sono il vero spreco della spesa settimanale: qui si calcolano,
   e si cerca un altro piatto della settimana che li consumi. */

import { alimento, piatti as tuttiPiatti, diStagione } from './alimenti.js';
import { ammesso } from './preferenze.js';

/** Sotto questa soglia il residuo non vale una segnalazione. */
export const RESIDUO_MINIMO_G = 40;

/** Alimenti che si conservano a lungo: un residuo di pasta non e' uno spreco. */
const A_LUNGA_CONSERVAZIONE = new Set([
  'dispensa', 'surgelati', 'bevande',
]);

/**
 * Quante confezioni servono, quanto si porta a casa e quanto resta.
 * @returns {{confezioni:number, acquistato:number, residuo:number, formato:object|null}}
 */
export function confezioniNecessarie(alimentoId, grammi) {
  const a = alimento(alimentoId);
  if (!a?.confezione?.qta) {
    return { confezioni: 1, acquistato: Math.ceil(grammi), residuo: 0, formato: null };
  }
  const qta = a.confezione.qta;
  // Gli sfusi si comprano al peso: non generano residuo di confezione.
  if (a.confezione.tipo === 'sfuso') {
    return { confezioni: 1, acquistato: Math.ceil(grammi), residuo: 0, formato: a.confezione };
  }
  const confezioni = Math.max(1, Math.ceil(grammi / qta));
  const acquistato = confezioni * qta;
  return { confezioni, acquistato, residuo: Math.round(acquistato - grammi), formato: a.confezione };
}

/** Il residuo e' un problema solo se il prodotto e' deperibile. */
export function residuoDaSegnalare(alimentoId, residuo) {
  if (residuo < RESIDUO_MINIMO_G) return false;
  const a = alimento(alimentoId);
  if (!a) return false;
  return !A_LUNGA_CONSERVAZIONE.has(a.reparto);
}

/**
 * Per ogni residuo deperibile, i piatti che potrebbero consumarlo.
 * Non tocca il piano: propone, e la scelta resta a chi cucina.
 *
 * @param {Array<{alimentoId:string, residuo:number}>} residui
 * @param {{preferenze:object, mese:number, giaInSettimana?:Set<string>}} ctx
 */
export function suggerimentiAntispreco(residui, { preferenze, mese, giaInSettimana = new Set() }) {
  const fuori = [];

  for (const r of residui) {
    if (!residuoDaSegnalare(r.alimentoId, r.residuo)) continue;

    const candidati = tuttiPiatti
      .filter((p) => !giaInSettimana.has(p.id))
      .filter((p) => ammesso(preferenze, p))
      .filter((p) => diStagione(p, mese))
      .map((p) => {
        const ing = (p.ingredienti || []).find((i) => i.a === r.alimentoId);
        return ing ? { piatto: p, usa: ing.g } : null;
      })
      .filter(Boolean)
      // Meglio il piatto che consuma piu' residuo: e' quello che lo esaurisce.
      .sort((x, y) => y.usa - x.usa)
      .slice(0, 3);

    if (!candidati.length) continue;

    fuori.push({
      alimentoId: r.alimentoId,
      nome: alimento(r.alimentoId)?.nome || r.alimentoId,
      residuo: r.residuo,
      proposte: candidati.map((c) => ({
        id: c.piatto.id,
        nome: c.piatto.nome,
        usa: c.usa,
        copre: Math.min(100, Math.round((c.usa / r.residuo) * 100)),
      })),
    });
  }

  return fuori;
}

/** Quanti grammi in tutto la settimana lascerebbe indietro. */
export function sprecoTotale(residui) {
  return residui
    .filter((r) => residuoDaSegnalare(r.alimentoId, r.residuo))
    .reduce((s, r) => s + r.residuo, 0);
}
