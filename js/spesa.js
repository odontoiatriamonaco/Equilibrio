/* Equilibrio — lista della spesa.
   Somma gli ingredienti della settimana, sottrae la dispensa, converte in
   formati di vendita e ordina per reparto — come gli scaffali, non come
   l'alfabeto: la lista si spunta camminando. */

import { alimento, gruppi, piatti as tuttiPiatti, reparto as trovaReparto } from './alimenti.js';
import { tutteLeVoci } from './planner.js';
import { confezioniNecessarie, residuoDaSegnalare, sprecoTotale } from './packaging.js';

/**
 * Grammi necessari per ogni alimento in tutta la settimana.
 * @returns {Map<string, number>}
 */
export function aggregaSettimana(settimana, commensali = 1) {
  const somma = new Map();

  const aggiungi = (id, g) => somma.set(id, (somma.get(id) || 0) + g);

  for (const giorno of settimana.giorni) {
    for (const voce of tutteLeVoci(giorno)) {
      const quante = (voce.porzioni ?? 1) * (voce.commensali ?? commensali);

      if (voce.tipo === 'alimento') {
        const a = alimento(voce.id);
        if (a) aggiungi(voce.id, a.porzione * quante);
        continue;
      }
      const p = tuttiPiatti.find((x) => x.id === voce.id);
      if (!p) continue;
      for (const ing of p.ingredienti || []) aggiungi(ing.a, ing.g * quante);
    }
  }

  return somma;
}

/**
 * Costruisce la lista completa.
 *
 * @param {object} settimana
 * @param {{commensali?:number, dispensa?:Array<{alimentoId:string, grammi:number}>}} opzioni
 */
export function costruisciLista(settimana, { commensali = 1, dispensa = [] } = {}) {
  const necessario = aggregaSettimana(settimana, commensali);
  const scorte = new Map(dispensa.map((d) => [d.alimentoId, d.grammi]));

  const voci = [];
  const residui = [];
  let costo = 0;
  let risparmiato = 0;

  for (const [id, grammiTotali] of necessario) {
    const a = alimento(id);
    if (!a) continue;

    const inCasa = Math.min(scorte.get(id) || 0, grammiTotali);
    const daComprare = Math.max(0, grammiTotali - inCasa);
    if (inCasa > 0) risparmiato += (inCasa / 1000) * (a.prezzo || 0);

    // Quello che c'e' in dispensa non si ricompra: sparisce dalla lista.
    if (daComprare <= 0) continue;

    const conf = confezioniNecessarie(id, daComprare);
    const spesa = (conf.acquistato / 1000) * (a.prezzo || 0);
    costo += spesa;

    if (conf.residuo > 0) residui.push({ alimentoId: id, residuo: conf.residuo });

    voci.push({
      alimentoId: id,
      nome: a.nome,
      reparto: a.reparto,
      serve: Math.round(grammiTotali),
      inCasa: Math.round(inCasa),
      grammi: Math.round(daComprare),
      confezioni: conf.confezioni,
      formato: conf.formato,
      acquistato: conf.acquistato,
      residuo: conf.residuo,
      residuoDaSegnalare: residuoDaSegnalare(id, conf.residuo),
      costo: Math.round(spesa * 100) / 100,
      spuntato: false,
    });
  }

  // Ordine dei reparti come nel supermercato, e dentro ciascuno per nome.
  const ordinati = [...gruppi.reparti]
    .sort((x, y) => x.ordine - y.ordine)
    .map((r) => ({
      ...r,
      voci: voci
        .filter((v) => v.reparto === r.id)
        .sort((x, y) => x.nome.localeCompare(y.nome, 'it')),
    }))
    .filter((r) => r.voci.length);

  return {
    inizio: settimana.inizio,
    commensali,
    reparti: ordinati,
    voci,
    residui,
    sprecoG: sprecoTotale(residui),
    costo: Math.round(costo * 100) / 100,
    risparmiato: Math.round(risparmiato * 100) / 100,
    articoli: voci.length,
  };
}

/** Quantita' come si legge su una lista: «2 vaschette», «600 g», «1,2 kg». */
export function quantitaLeggibile(voce) {
  const a = alimento(voce.alimentoId);
  const formato = voce.formato;

  if (formato && formato.tipo !== 'sfuso' && voce.confezioni >= 1) {
    const unita = voce.confezioni === 1 ? formato.tipo : plurale(formato.tipo);
    return `${voce.confezioni} ${unita} (${peso(voce.acquistato)})`;
  }
  return peso(voce.grammi) + (a?.confezione?.tipo === 'sfuso' ? '' : '');
}

function peso(grammi) {
  if (grammi >= 1000) {
    const kg = grammi / 1000;
    return `${kg.toFixed(kg % 1 === 0 ? 0 : 1).replace('.', ',')} kg`;
  }
  return `${Math.round(grammi)} g`;
}

const PLURALI = {
  pacco: 'pacchi', barattolo: 'barattoli', vaschetta: 'vaschette',
  bottiglia: 'bottiglie', confezione: 'confezioni', busta: 'buste',
  vasetto: 'vasetti', mazzo: 'mazzi', mazzetto: 'mazzetti', cespo: 'cespi',
  pezzo: 'pezzi', filone: 'filoni', testa: 'teste', retina: 'retine',
  sacchetto: 'sacchetti', scatoletta: 'scatolette', tavoletta: 'tavolette',
  casco: 'caschi', tranci: 'tranci', trancio: 'tranci',
};

function plurale(tipo) {
  return PLURALI[tipo] || `${tipo} ×`;
}

/* --- Spunta e dispensa ----------------------------------------------------- */

/**
 * Fonde le spunte per SINGOLA VOCE, non a documento.
 * Serve alla condivisione: chi spunta il latte al supermercato non deve
 * sovrascrivere la modifica appena fatta a casa.
 */
export function fondiSpunte(locale, remota) {
  const perId = new Map();
  for (const v of [...(locale || []), ...(remota || [])]) {
    const esistente = perId.get(v.alimentoId);
    if (!esistente || (v.spuntatoIl || '') > (esistente.spuntatoIl || '')) {
      perId.set(v.alimentoId, v);
    }
  }
  return [...perId.values()];
}

/**
 * Cio' che avanza dopo la spesa entra in dispensa e verra' sottratto
 * alla lista della settimana successiva.
 */
export function residuiInDispensa(lista, profiloId, minimoG = 25) {
  return lista.voci
    // Sotto una ventina di grammi tenerne conto e' rumore: la dispensa
    // diventerebbe un elenco di sessanta voci inutili.
    .filter((v) => v.residuo >= minimoG)
    .map((v) => ({
      id: `${profiloId}:${v.alimentoId}`,
      profiloId,
      alimentoId: v.alimentoId,
      grammi: v.residuo,
      dal: new Date().toISOString().slice(0, 10),
    }));
}

/** Testo da mandare su WhatsApp o da stampare. */
export function comeTesto(lista) {
  const righe = [`Spesa — settimana del ${formattaData(lista.inizio)}`, ''];
  for (const r of lista.reparti) {
    righe.push(r.nome.toUpperCase());
    for (const v of r.voci) righe.push(`  · ${v.nome} — ${quantitaLeggibile(v)}`);
    righe.push('');
  }
  righe.push(`${lista.articoli} articoli · circa ${lista.costo.toFixed(2).replace('.', ',')} €`);
  return righe.join('\n');
}

function formattaData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

export { trovaReparto };
