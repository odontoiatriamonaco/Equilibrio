/* Equilibrio — la dieta di famiglia.

   Si cucina una volta sola. Un profilo decide il menu' della settimana; gli
   altri lo seguono con le PROPRIE porzioni, ricavate dal proprio fabbisogno.
   Quando una pietanza per qualcuno non va — un'allergia, un gusto — l'app
   propone un'alternativa per quel pasto e per quella persona soltanto.

   Il piano resta uno: qui sopra ci vive solo lo strato personale di chi segue.
   Cosi' rigenerare la settimana aggiorna tutti, e nessuno resta indietro. */

import { leggi, scrivi, profili } from './store.js';
import { caricaSettimana } from './dati.js';
import { lenteRicettario, valoriPiatto } from './alimenti.js';
import { caricaPreferenze, omessi, motivoEsclusione, tettiSforati } from './preferenze.js';
import { pietanzeDiCasa } from './piatti-utente.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import {
  ribilanciaGiorno, applicaRibilanciamento, vociConChiave, inizioSettimana, iso,
  conteggiSettimana,
} from './planner.js';
import { applicaSgarri, elencoSgarri } from './sgarro.js';
import { settimanaACasa } from './presenze.js';

/* --- Il legame ------------------------------------------------------------- */

export function segue(profilo) {
  return Boolean(profilo?.seguo);
}

/**
 * Chi puo' fare da riferimento a questo profilo.
 * Niente catene: un riferimento non puo' a sua volta seguire qualcuno,
 * altrimenti «segui chi segue chi» diventa impossibile da spiegare e da
 * calcolare senza cicli.
 */
export async function possibiliRiferimenti(profiloId) {
  const elenco = await profili();
  const miSeguono = new Set(elenco.filter((p) => p.seguo === profiloId).map((p) => p.id));
  return elenco.filter((p) => p.id !== profiloId && !p.seguo && !miSeguono.has(p.id));
}

/**
 * Chi segue questo profilo, piu' il profilo stesso: la tavola.
 * In ordine alfabetico dopo il capotavola — `profili()` restituisce per chiave,
 * cioe' per UUID, e una famiglia che cambia ordine a ogni apertura e' fastidiosa.
 */
export async function tavola(profiloId) {
  const elenco = await profili();
  const capo = elenco.find((p) => p.id === profiloId);
  if (!capo) return [];
  const seguaci = elenco
    .filter((p) => p.seguo === profiloId)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  return [capo, ...seguaci];
}

/** Il riferimento di un profilo, o null. */
export async function riferimentoDi(profilo) {
  if (!segue(profilo)) return null;
  return (await leggi('profili', profilo.seguo)) || null;
}

/* --- Lo strato personale --------------------------------------------------- */

function chiavePers(profiloId, inizio) {
  return `${profiloId}:${inizio}`;
}

export async function caricaPersonalizzazioni(profiloId, inizio) {
  const riga = await leggi('personalizzazioni', chiavePers(profiloId, inizio));
  const vuota = { id: chiavePers(profiloId, inizio), profiloId, inizio, voci: {} };
  // `sgarri` e `rigidi` sono arrivati dopo: le righe scritte prima non li hanno.
  return { ...vuota, sgarri: [], rigidi: [], ...(riga || {}) };
}

/**
 * Gli sgarri di chi segue il menù di un altro.
 *
 * Non stanno nella settimana: quella è di chi cucina, e chi segue la rilegge
 * derivata a ogni apertura. Scrivendoli lì sparivano al primo ricaricamento —
 * salvati in un posto che per lui non viene mai riletto. La pizza di sabato è
 * sua, come lo sono gli scambi, quindi vive nello stesso strato personale.
 */
export async function salvaSgarriPersonali(profiloId, inizio, sgarri) {
  const p = await caricaPersonalizzazioni(profiloId, inizio);
  return scrivi('personalizzazioni', { ...p, sgarri });
}

/**
 * Ripesca gli sgarri finiti nell'archivio sbagliato, una volta sola.
 *
 * Finché la pagina salvava con `salvaSettimana(profilo.id)`, gli sgarri di chi
 * segue un menù venivano scritti sotto il PROPRIO id — dove nessuno andava mai
 * a rileggerli. Non sono andati persi: sono ancora lì. Invece di far riscrivere
 * a mano la pizza di sabato, la si va a riprendere.
 *
 * Il segno `recuperoFatto` serve a non farlo due volte: senza, uno sgarro
 * cancellato apposta risorgerebbe dall'archivio orfano alla riapertura dopo.
 * Niente viene cancellato — quella settimana resta dov'è, per sicurezza.
 */
export async function recuperaSgarriOrfani(profilo, data = new Date()) {
  const riferimento = await riferimentoDi(profilo);
  if (!riferimento) return { recuperati: 0 };

  const inizio = iso(inizioSettimana(data));
  const pers = await caricaPersonalizzazioni(profilo.id, inizio);
  if (pers.recuperoFatto) return { recuperati: 0 };

  const orfana = await caricaSettimana(profilo.id, data);
  const sgarri = orfana ? elencoSgarri(orfana) : [];
  const rigidi = orfana ? orfana.giorni.map((g) => Boolean(g.rigido)) : [];

  await scrivi('personalizzazioni', {
    ...pers,
    recuperoFatto: true,
    sgarri: pers.sgarri?.length ? pers.sgarri : sgarri,
    rigidi: pers.rigidi?.length ? pers.rigidi : (rigidi.some(Boolean) ? rigidi : []),
  });
  return { recuperati: pers.sgarri?.length ? 0 : sgarri.length };
}

/** I giorni che questa persona ha reso rigidi: anche quelli sono suoi. */
export async function salvaRigidiPersonali(profiloId, inizio, rigidi) {
  const p = await caricaPersonalizzazioni(profiloId, inizio);
  return scrivi('personalizzazioni', { ...p, rigidi });
}

/** Scrive una sola voce dello strato personale, senza toccare le altre. */
export async function salvaPersonalizzazione(profiloId, inizio, chiave, dati) {
  const p = await caricaPersonalizzazioni(profiloId, inizio);
  p.voci = { ...p.voci, [chiave]: { ...(p.voci[chiave] || {}), ...dati } };
  return scrivi('personalizzazioni', p);
}

export async function dimenticaPersonalizzazione(profiloId, inizio, chiave) {
  const p = await caricaPersonalizzazioni(profiloId, inizio);
  if (!p.voci[chiave]) return p;
  const voci = { ...p.voci };
  delete voci[chiave];
  return scrivi('personalizzazioni', { ...p, voci });
}

/* --- La lente di una persona ------------------------------------------------ */

/**
 * Il ricettario come lo vede questa persona, senza toccare quello in uso.
 * @returns {{piatti:Array, indice:Map, scartati:Array, preferenze:object}}
 */
export async function lenteDi(profiloId) {
  const mie = await pietanzeDiCasa(profiloId);
  const pref = await caricaPreferenze(profiloId);
  return { ...lenteRicettario(mie, omessi(pref)), preferenze: pref };
}

/* --- La settimana come la vede una persona ---------------------------------- */

/**
 * Marca le voci che per questa persona non vanno, e le elenca.
 *
 * Non le toglie: un buco nel piano non si puo' cucinare, e la scelta del
 * sostituto resta a chi mangia. `nonPerMe` vive solo sulla copia in memoria,
 * mai su disco.
 */
function segnalaNonGraditi(copia, lente) {
  const avvisi = [];
  for (const giorno of copia.giorni) {
    for (const x of vociConChiave(giorno)) {
      if (x.voce.tipo !== 'piatto') continue;
      const p = lente.indice.get(x.voce.id);
      const motivo = p
        ? motivoEsclusione(lente.preferenze, p)
        : { tipo: 'assente', testo: 'non è più nel tuo ricettario' };
      if (!motivo) continue;
      x.voce.nonPerMe = motivo.testo;
      // Il TIPO viaggia insieme al testo: un'allergia e un gusto si scrivono
      // uguale — «contiene ricotta vaccina» — ma non vanno letti uguale, e chi
      // disegna il piano deve poterli distinguere senza indovinare dal testo.
      x.voce.nonPerMeTipo = motivo.tipo;
      avvisi.push({
        tipo: motivo.tipo,
        chiave: `${giorno.etichetta}|${x.chiave}`,
        giorno: giorno.etichetta,
        nome: p?.nome || x.voce.id,
        motivo: motivo.testo,
      });
    }
  }
  return avvisi;
}

/**
 * @param {object} profilo
 * @param {Date} data
 * @returns {Promise<{settimana:object|null, riferimento:object|null,
 *          avvisi:Array<{chiave:string, nome:string, motivo:string}>,
 *          inizio:string}>}
 */
export async function settimanaPer(profilo, data = new Date()) {
  const inizio = iso(inizioSettimana(data));
  const riferimento = await riferimentoDi(profilo);
  const proprietario = riferimento?.id || profilo.id;

  const settimana = await caricaSettimana(proprietario, data);
  if (!settimana) return { settimana: null, riferimento, avvisi: [], tetti: [], inizio };

  // Chi non segue nessuno non ha niente da derivare — il piano e' gia' suo — ma
  // deve sapere lo stesso se dentro c'e' finita una pietanza che nel frattempo
  // ha escluso. La preferenza vale da quando la si esprime; il piano di adesso
  // era gia' scritto, e lasciarlo li' senza dire niente vuol dire mostrargli
  // qualcosa che l'app sa non andargli piu' bene.
  //
  // Questo avviso esisteva gia', ma solo per chi seguiva il menu' di un altro:
  // il caso piu' raro lo riceveva, quello piu' comune no.
  if (!riferimento) {
    const lenteSola = await lenteDi(profilo.id);
    const copia = structuredClone(settimana);
    const avvisi = segnalaNonGraditi(copia, lenteSola);
    return {
      settimana: copia,
      riferimento: null,
      avvisi,
      tetti: tettiSforati(conteggiSettimana(copia), lenteSola.preferenze),
      inizio,
    };
  }

  const lente = await lenteDi(profilo.id);
  const pers = await caricaPersonalizzazioni(profilo.id, inizio);
  const energia = riepilogoEnergia(profilo, data);

  const copia = structuredClone(settimana);
  const avvisi = [];

  for (const giorno of copia.giorni) {
    // Del riferimento si prendono i PIATTI, non le sue quantita': quelle sono
    // il suo pasto. Si riparte dalle dosi del ricettario e si ricalibra sul
    // fabbisogno di chi segue — altrimenti i 600 g di pollo che si e' pesato
    // Bruno finirebbero pari pari nel piatto di Nina, e i secondi non si
    // riequilibrano per progetto.
    for (const x of vociConChiave(giorno)) {
      x.voce.porzioni = 1;
      delete x.voce.fissata;
    }
    // Anche il recupero di uno sgarro appartiene a chi l'ha fatto: i suoi
    // arrivano dopo, dallo strato personale.
    delete giorno.stato;
    delete giorno.recuperoKcal;
    delete giorno.sgarro;
    delete giorno.sgarri;
    for (const voci of Object.values(giorno.pasti || {})) {
      for (const v of voci) if (v) delete v.saltato;
    }

    for (const x of vociConChiave(giorno)) {
      const chiave = `${giorno.etichetta}|${x.chiave}`;
      const scelto = pers.voci[chiave] || {};

      // 1. Il sostituto scelto in passato prende il posto dell'originale.
      if (scelto.sostituto && lente.indice.has(scelto.sostituto)) {
        x.voce.id = scelto.sostituto;
        x.voce.sostituito = true;
      }

      // 2. Le porzioni decise a mano da questa persona vincono sul ricalcolo.
      if (scelto.porzioni !== undefined) {
        x.voce.porzioni = scelto.porzioni;
        x.voce.fissata = true;
      }
    }

    // 4. Le porzioni si ricalibrano sul fabbisogno di CHI segue, tenendo ferme
    //    quelle che ha deciso lei. E' la stessa funzione che usa la bilancia.
    const ferme = new Set(
      vociConChiave(giorno).filter((x) => x.voce.fissata).map((x) => x.chiave),
    );
    const esito = ribilanciaGiorno(giorno, energia.fabbisogno.target, {
      ferme, floor: energia.fabbisogno.floor,
    });
    applicaRibilanciamento(giorno, esito);
  }

  // Quello che non va si segnala alla fine, con la stessa funzione usata da chi
  // non segue nessuno: un solo posto dove decidere cosa e' un problema.
  avvisi.push(...segnalaNonGraditi(copia, lente));

  copia.target = energia.fabbisogno.target;
  copia.floor = energia.fabbisogno.floor;
  copia.derivataDa = riferimento.id;

  // I giorni rigidi e gli sgarri sono miei, non del menù: si rimettono qui,
  // dopo la calibrazione e sul mio bersaglio. Il rigido prima, perché decide
  // dove il recupero può andare a prendere le calorie.
  copia.giorni.forEach((g, i) => { g.rigido = Boolean(pers.rigidi?.[i]); });
  const miei = (pers.sgarri || []).filter((s) => s.giorno >= 0 && s.giorno < copia.giorni.length);
  const finale = miei.length ? applicaSgarri(copia, miei) : copia;

  return {
    settimana: finale,
    riferimento,
    avvisi,
    tetti: tettiSforati(conteggiSettimana(finale), lente.preferenze),
    inizio,
  };
}

/**
 * Le settimane di tutta la tavola, gia' scalate su ciascuno.
 * E' l'ingresso della spesa di famiglia: si somma quello che mangiano tutti.
 */
export async function settimaneDellaTavola(profiloRiferimento, data = new Date()) {
  // Accetta il profilo o il suo id: chi chiama ha in mano l'uno o l'altro a
  // seconda della pagina, e sbagliarsi qui restituiva una tavola vuota.
  const id = typeof profiloRiferimento === 'string' ? profiloRiferimento : profiloRiferimento?.id;
  const membri = await tavola(id);
  const fuori = [];
  for (const m of membri) {
    const { settimana } = await settimanaPer(m, data);
    // Due viste dello stesso piano. `settimana` è la sua dieta, intera: il
    // pranzo lo mangia comunque, anche se lo mangia in mensa. `aCasa` è
    // quello che deve uscire da QUESTA cucina, ed è l'unica che va nella spesa
    // e nella divisione delle dosi.
    if (settimana) fuori.push({ profilo: m, settimana, aCasa: settimanaACasa(settimana, m) });
  }
  return fuori;
}

/** Quante kcal in piu' o in meno mangia questa persona rispetto al riferimento. */
export function scartoDalRiferimento(profilo, riferimento, data = new Date()) {
  if (!riferimento) return 0;
  const mio = riepilogoEnergia(profilo, data).fabbisogno.target;
  const suo = riepilogoEnergia(riferimento, data).fabbisogno.target;
  return mio - suo;
}

/** Il piatto che sostituisce, con i valori ricalcolati sulla lente di chi mangia. */
export function valoriConLente(lente, id, porzioni = 1) {
  const p = lente.indice.get(id);
  return p ? valoriPiatto(p, porzioni) : null;
}
