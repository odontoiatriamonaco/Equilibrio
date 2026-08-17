/* Equilibrio — lo spazio famiglia.

   Il legame fra profili (js/famiglia.js) fa gia' tutto il lavoro: un menu' solo,
   porzioni diverse per ciascuno. Gli mancava una cosa sola, e non era un
   calcolo: il menu' cambia ogni settimana, e per portarlo sugli altri telefoni
   bisognava riesportare un file cifrato ogni lunedi'. Alla quarta volta si
   smette.

   Qui il menu' viaggia da solo. Cosa esce dal dispositivo: quali pietanze, in
   che giorno, in che pasto, e quante porzioni ne mangia ciascuno. Cosa NON
   esce: peso, altezza, eta', patologie, calorie, fabbisogno. Quelli restano
   dove sono sempre stati, e le porzioni le ricalcola ogni telefono per conto
   suo, dal profilo di chi ci vive.

   In porzioni e non in grammi apposta: i grammi si ricavano dalla ricetta, e la
   ricetta ce l'ha gia' chi guarda. Chi cucina deve pesare secondo la SUA
   ricetta, non secondo quella che ha in casa un altro. */

import { leggi, scrivi, elimina, profili, origineDi } from './store.js';
import { caricaSettimana, salvaSettimana } from './dati.js';
import { settimanaPer, salvaPersonalizzazione } from './famiglia.js';
import { riepilogo as riepilogoEnergia } from './energia.js';
import { vociConChiave, kcalGiorno, inizioSettimana, iso } from './planner.js';

const API = '/api/famiglia';
const CHIAVE_LOCALE = 'spazioFamiglia';

/* --- Quello che questo dispositivo si ricorda -------------------------------- */

/**
 * Il codice, e la chiave se questo e' il dispositivo di chi decide.
 * Sta fra le impostazioni, che e' l'archivio senza dati sanitari: qui dentro
 * non c'e' niente del corpo di nessuno.
 */
export async function spazioLocale() {
  return (await leggi('impostazioni', CHIAVE_LOCALE))?.valore || null;
}

async function ricorda(dati) {
  const prima = (await spazioLocale()) || {};
  const valore = { ...prima, ...dati };
  await scrivi('impostazioni', { chiave: CHIAVE_LOCALE, valore });
  return valore;
}

/** Esce dallo spazio su QUESTO dispositivo. Non tocca quello degli altri. */
export async function dimenticaSpazio() {
  await elimina('impostazioni', CHIAVE_LOCALE);
}

export async function comando() {
  return Boolean((await spazioLocale())?.chiave);
}

/* --- Traduzione fra settimana e menu' --------------------------------------- */

/**
 * Lo scheletro di una settimana: quali pietanze, dove.
 *
 * E' l'unica parte che non parla del corpo di chi la mangia. Fabbisogno,
 * pavimento calorico, porzioni, quota del giorno e sgarro restano fuori: si
 * ricalcolano su ogni dispositivo, e mandarli in giro non servirebbe a nessuno.
 */
export function menuDaSettimana(settimana, nome = '') {
  return {
    inizio: settimana.inizio,
    seme: settimana.seme,
    da: nome,
    quando: new Date().toISOString(),
    giorni: settimana.giorni.map((g) => ({
      etichetta: g.etichetta,
      data: g.data,
      rigido: Boolean(g.rigido),
      pasti: Object.fromEntries(
        Object.entries(g.pasti || {}).map(([pasto, voci]) => [
          pasto,
          (voci || []).filter(Boolean).map((v) => ({ tipo: v.tipo, id: v.id })),
        ]),
      ),
    })),
  };
}

/** Le porzioni di una settimana, con le chiavi dello strato personale. */
export function porzioniDaSettimana(settimana) {
  const fuori = {};
  for (const g of settimana.giorni) {
    for (const x of vociConChiave(g)) {
      fuori[`${g.etichetta}|${x.chiave}`] = Math.round((x.voce.porzioni ?? 1) * 100) / 100;
    }
  }
  return fuori;
}

/**
 * Rimette insieme una settimana dallo scheletro.
 *
 * `porzioni` sono quelle pubblicate da chi quella settimana la mangia: senza,
 * si riparte da una porzione piena e ci pensa `settimanaPer` a ricalibrare.
 */
export function settimanaDaMenu(menu, porzioni = {}, { target = null, floor = null } = {}) {
  const giorni = menu.giorni.map((g) => {
    const giorno = {
      data: g.data,
      etichetta: g.etichetta,
      rigido: Boolean(g.rigido),
      pasti: Object.fromEntries(
        Object.entries(g.pasti || {}).map(([pasto, voci]) => [
          pasto,
          (voci || []).map((v, i) => ({
            tipo: v.tipo,
            id: v.id,
            porzioni: porzioni[`${g.etichetta}|${pasto}|${i}`] ?? 1,
          })),
        ]),
      ),
    };
    giorno.quota = kcalGiorno(giorno);
    return giorno;
  });

  return { inizio: menu.inizio, seme: menu.seme, target, floor, commensali: 1, giorni };
}

/* --- La rete ---------------------------------------------------------------- */

/**
 * Sei secondi e poi si lascia perdere.
 *
 * Questo giro sta sul percorso di apertura di Oggi e del Piano: senza un
 * limite, una rete che c'e' ma non risponde — il wi-fi del treno, il 3G in
 * cantina — terrebbe la pagina bianca finche' il browser non si stanca. Meglio
 * il piano di ieri subito che quello di oggi fra un minuto.
 */
const ATTESA_MAX = 6000;

function conScadenza() {
  if (typeof AbortSignal?.timeout === 'function') return { signal: AbortSignal.timeout(ATTESA_MAX) };
  return {};
}

async function chiedi(metodo, corpo, cerca) {
  try {
    const url = cerca ? `${API}?${cerca}` : API;
    const risposta = await fetch(url, {
      method: metodo,
      ...conScadenza(),
      ...(corpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
    });
    return interpreta(risposta);
  } catch {
    return { ok: false, rete: false, messaggio: 'Nessuna rete: riprovo alla prossima apertura.' };
  }
}

async function interpreta(risposta) {
  let dati = null;
  try { dati = await risposta.json(); } catch { /* corpo non JSON */ }

  // Un 200 senza JSON non e' un successo: e' la pagina di un portale wi-fi, o
  // l'app servita al posto della funzione. Dire «fatto» sarebbe una bugia.
  if (risposta.ok && !dati) {
    return { ok: false, messaggio: 'Il servizio ha risposto qualcosa che non capisco. Riprova.' };
  }
  if (risposta.ok) return { ok: true, ...dati };
  dati = dati || {};

  const spiegazioni = {
    'kv-assente': 'Lo spazio famiglia non è ancora attivo su questo indirizzo: '
      + "manca l'archivio sul server. Nel frattempo resta il file del profilo.",
    'troppi-tentativi': 'Troppi codici sbagliati da questo dispositivo. '
      + "Riprova fra un'ora, e controlla di averlo ricopiato bene.",
    'troppi-membri': dati.error,
    'non-sei-tu': 'Il menù lo pubblica chi ha creato lo spazio.',
  };
  if (spiegazioni[dati.codice]) return { ok: false, codice: dati.codice, messaggio: spiegazioni[dati.codice] };
  if (risposta.status === 404) {
    return { ok: false, codice: 'inesistente', messaggio: 'Quel codice non corrisponde a nessuno spazio.' };
  }
  return { ok: false, messaggio: dati.error || 'Non riesco a raggiungere il servizio.' };
}

/**
 * Come ci si presenta nello spazio.
 *
 * L'identita' e' `origine`, non l'id locale: l'id cambia a ogni import, e con
 * quello ci si ritroverebbe la stessa persona due volte. `segue` viaggia come
 * origine per lo stesso motivo — dall'altra parte l'id locale non vuol dire
 * niente.
 */
async function comeMiPresento(profilo, settimana) {
  const capo = profilo.seguo ? await leggi('profili', profilo.seguo) : null;
  return {
    id: origineDi(profilo),
    nome: profilo.nome || 'Senza nome',
    segue: capo ? origineDi(capo) : null,
    porzioni: settimana ? porzioniDaSettimana(settimana) : {},
  };
}

/** Apre lo spazio e ci mette dentro il menu' di questa settimana. */
export async function creaSpazio(profilo, settimana) {
  const esito = await chiedi('POST', {
    menu: menuDaSettimana(settimana, profilo.nome),
    membro: await comeMiPresento(profilo, settimana),
  });
  if (!esito.ok) return esito;
  await ricorda({
    codice: esito.codice,
    chiave: esito.chiave,
    menuVisto: null,
    capo: origineDi(profilo),
  });
  return esito;
}

export async function leggiSpazio(codice) {
  return chiedi('GET', null, `codice=${encodeURIComponent(codice)}`);
}

/** Entra in uno spazio gia' aperto da qualcun altro. */
export async function entraNelloSpazio(codice, profilo, settimana = null) {
  const esito = await chiedi('PATCH', {
    codice,
    membro: await comeMiPresento(profilo, settimana),
  });
  if (!esito.ok) return esito;
  await ricorda({ codice, chiave: null, menuVisto: null, capo: null });
  return esito;
}

/** Pubblica il menu' nuovo. Serve la chiave: non lo puo' fare chiunque. */
export async function pubblicaMenu(profilo, settimana) {
  const loc = await spazioLocale();
  if (!loc?.chiave) return { ok: false, messaggio: 'Il menù lo pubblica chi ha creato lo spazio.' };

  const esito = await chiedi('PUT', {
    codice: loc.codice,
    chiave: loc.chiave,
    menu: menuDaSettimana(settimana, profilo.nome),
  });
  if (esito.ok) await ricorda({ menuVisto: esito.menu?.quando || null });
  return esito;
}

/** Pubblica quanto mangio io. E' quello che serve a chi cucina. */
export async function pubblicaPorzioni(profilo, settimana) {
  const loc = await spazioLocale();
  if (!loc?.codice || !settimana) return { ok: false, messaggio: 'Nessuno spazio' };
  return chiedi('PATCH', {
    codice: loc.codice,
    membro: await comeMiPresento(profilo, settimana),
  });
}

/* --- Le proposte ------------------------------------------------------------ */

/**
 * «Al posto di questo, per me, si può fare quest'altro?»
 *
 * Chi segue non applica lo scambio da solo: chi cucina deve saperlo, o si
 * ritroverebbe in tavola un piatto che non ha comprato. Finché la richiesta è
 * in attesa, il piano di chi l'ha chiesta non cambia — mostrare subito un
 * piatto che nessuno sta cucinando sarebbe peggio che aspettare.
 */
export async function proponiScambio(profilo, { inizio, chiave, nuovoId, alPostoDi, motivo }) {
  const loc = await spazioLocale();
  if (!loc?.codice) return { ok: false, messaggio: 'Nessuno spazio famiglia' };

  return chiedi('PATCH', {
    codice: loc.codice,
    proposta: {
      da: origineDi(profilo),
      nome: profilo.nome || 'Senza nome',
      inizio,
      chiave,
      nuovoId,
      alPostoDi,
      motivo,
    },
  });
}

/** Accetta o rifiuta. Lo può fare solo chi ha la chiave: è lui che cucina. */
export async function decidiProposte(esiti) {
  const loc = await spazioLocale();
  if (!loc?.chiave) return { ok: false, messaggio: 'Le richieste le decide chi ha aperto lo spazio.' };
  return chiedi('PUT', { codice: loc.codice, chiave: loc.chiave, esiti });
}

/** Le richieste di questa persona, per stato. */
export function mieProposte(spazio, profilo) {
  const mio = origineDi(profilo);
  return (spazio?.proposte || []).filter((p) => p.da === mio);
}

/** Le richieste degli altri ancora da decidere. */
export function proposteInAttesa(spazio, profilo) {
  const mio = origineDi(profilo);
  return (spazio?.proposte || []).filter((p) => p.da !== mio && p.stato === 'attesa');
}

/**
 * Cosa è successo, detto in italiano.
 *
 * Sta qui e non nelle pagine perché Oggi e il Piano devono raccontarlo con le
 * stesse parole: due frasi diverse per lo stesso fatto si leggono come due
 * fatti diversi.
 *
 * @param {(id:string)=>string} nomeDi come si chiama un piatto su questo dispositivo
 * @returns {string} HTML, vuoto se non c'è niente da dire
 */
export function raccontaArrivo(arrivo, nomeDi = (id) => id) {
  if (!arrivo?.attivo) return '';

  if (arrivo.chiesto) {
    return `<strong>Richiesta mandata a ${arrivo.chiesto}.</strong> Il tuo piatto cambia
      quando l'accetta: è ${arrivo.chiesto} che deve comprarlo e cucinarlo.`;
  }
  if (arrivo.esiti?.length) {
    return arrivo.esiti.map((p) => (p.stato === 'accettata'
      ? `<strong>Accettata:</strong> al posto di quel piatto ora hai ${nomeDi(p.nuovoId)}.`
      : `<strong>Non accettata:</strong> ${nomeDi(p.nuovoId)} resta fuori, `
        + 'il piatto è quello di prima.')).join('<br>');
  }
  if (arrivo.mandato) {
    return '<strong>Menù pubblicato.</strong> Lo trovano gli altri alla prossima apertura, '
      + 'con le porzioni ricalcolate su ciascuno.';
  }
  if (arrivo.cambiato) {
    const quando = arrivo.quando
      ? ` ${new Date(arrivo.quando).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })}`
      : '';
    return `<strong>Menù nuovo.</strong> L'ha pubblicato ${arrivo.da}${quando}, e le tue
      porzioni sono già ricalcolate sul tuo fabbisogno.`;
  }
  if (arrivo.manca) {
    return `Dallo spazio arriva il menù di <strong>${arrivo.manca}</strong>, ma su questo
      dispositivo quel profilo non c'è. Importa il suo fascicolo una volta sola: da lì
      in poi il menù si aggiorna da sé.`;
  }
  if (arrivo.vecchio) {
    return `Nello spazio c'è ancora il menù della settimana del ${arrivo.vecchio}:
      chi lo decide non ha ancora pubblicato quello di adesso.`;
  }
  return arrivo.messaggio || '';
}

/* --- Il giro completo ------------------------------------------------------- */

/**
 * Allinea questo dispositivo allo spazio, e ci rimette dentro le proprie
 * porzioni.
 *
 * Automatico ma mai silenzioso: se il menu' e' cambiato lo dice, con chi l'ha
 * rigenerato e quando. Ritrovarsi una cena diversa senza spiegazione e' peggio
 * che doverla chiedere.
 *
 * @returns {Promise<{attivo:boolean, ok?:boolean, messaggio?:string,
 *          spazio?:object, cambiato?:boolean, da?:string, quando?:string,
 *          manca?:string}>}
 */
export async function allinea(profilo, data = new Date()) {
  const loc = await spazioLocale();
  if (!loc?.codice) return { attivo: false };

  const esito = await leggiSpazio(loc.codice);
  if (!esito.ok) return { attivo: true, ...esito };

  const applicato = await applicaMenu(esito, profilo, data);
  const esiti = await raccogliEsiti(esito, profilo);

  // Le mie porzioni ripartono DOPO il menu' e dopo le richieste decise: se il
  // menu' e' cambiato, quelle di prima parlavano di un'altra settimana.
  const mia = (await settimanaPer(profilo, data)).settimana;
  if (mia) await pubblicaPorzioni(profilo, mia);

  return { attivo: true, ok: true, spazio: esito, esiti, ...applicato };
}

/**
 * Le richieste decise da chi cucina arrivano nel piano di chi le ha fatte.
 *
 * Accettata: il sostituto entra nello strato personale — lo stesso posto dove
 * vive uno scambio fatto in casa, cosi' il menu' comune non cambia per gli
 * altri. Rifiutata: non cambia niente, ma va detto lo stesso.
 */
async function raccogliEsiti(spazio, profilo) {
  const loc = await spazioLocale();
  const gia = new Set(loc?.esitiVisti || []);

  // La marca porta lo stato: se chi cucina cambia idea, il nuovo esito arriva
  // invece di essere scambiato per uno gia' visto.
  const nuovi = mieProposte(spazio, profilo)
    .filter((p) => p.stato !== 'attesa' && !gia.has(`${p.id}|${p.stato}`));
  if (!nuovi.length) return null;

  for (const p of nuovi) {
    if (p.stato === 'accettata' && p.inizio) {
      await salvaPersonalizzazione(profilo.id, p.inizio, p.chiave, { sostituto: p.nuovoId });
    }
    gia.add(`${p.id}|${p.stato}`);
  }
  await ricorda({ esitiVisti: [...gia].slice(-40) });
  return nuovi;
}

/**
 * Scrive in casa il menu' arrivato, sotto il profilo di chi l'ha deciso.
 *
 * Non crea profili: il legame di famiglia — chi segue chi, con che gusti e che
 * ricettario — si imposta una volta sola importando il fascicolo, e da li' in
 * poi e' questo che tiene aggiornato il menu'. Se quel profilo qui non c'e', lo
 * si dice invece di inventarne uno vuoto.
 */
async function applicaMenu(spazio, profilo, data) {
  const menu = spazio.menu;
  if (!menu) return { cambiato: false };

  // Il menu' e' della settimana giusta? Uno vecchio non si applica: si dice.
  const inizio = iso(inizioSettimana(data));
  if (menu.inizio !== inizio) {
    return { cambiato: false, vecchio: menu.inizio, da: menu.da };
  }

  const capoOrigine = spazio.capo || trovaCapo(spazio);
  const elenco = await profili();
  const capo = elenco.find((p) => origineDi(p) === capoOrigine);

  // Sono io che l'ho pubblicato: la mia settimana e' gia' quella, e riscriverla
  // dallo scheletro vorrebbe dire perdere le mie porzioni calibrate.
  if (capo && capo.id === profilo.id) return { cambiato: false, mio: true };
  if (!capo) return { cambiato: false, manca: menu.da || 'chi decide il menù' };

  const loc = await spazioLocale();
  const gia = await caricaSettimana(capo.id, data);
  const cambiato = !gia || loc?.menuVisto !== menu.quando;
  if (!cambiato) return { cambiato: false };

  const energia = riepilogoEnergia(capo, data);
  const settimana = settimanaDaMenu(menu, spazio.membri?.[capoOrigine]?.porzioni || {}, {
    target: energia.fabbisogno.target,
    floor: energia.fabbisogno.floor,
  });

  await salvaSettimana(capo.id, settimana);
  await ricorda({ menuVisto: menu.quando, capo: capoOrigine });

  return { cambiato: true, da: menu.da || capo.nome, quando: menu.quando };
}

/** Chi ha creato lo spazio, riconosciuto da chi non segue nessuno. */
function trovaCapo(spazio) {
  const voci = Object.entries(spazio.membri || {});
  const solo = voci.find(([, m]) => !m.segue);
  return solo ? solo[0] : voci[0]?.[0] || null;
}

/**
 * Chi mangia cosa, per chi cucina.
 *
 * Le porzioni pubblicate da ciascuno vincono su quelle ricalcolate in casa:
 * sono quelle vere, comprese le correzioni fatte a mano con la bilancia.
 */
export function porzioniDellaTavola(spazio, membriLocali) {
  const pubblicati = new Map(Object.entries(spazio?.membri || {}));
  const fuori = [];
  const visti = new Set();

  for (const m of membriLocali || []) {
    const origine = origineDi(m.profilo);
    if (!origine || visti.has(origine)) continue;
    visti.add(origine);
    const dallaRete = pubblicati.get(origine);
    fuori.push({
      origine,
      nome: m.profilo?.nome || dallaRete?.nome || 'Senza nome',
      // Quelle pubblicate vincono su quelle ricalcolate qui: sono le vere,
      // comprese le correzioni fatte a mano sulla bilancia dell'altro telefono.
      porzioni: {
        ...(m.settimana ? porzioniDaSettimana(m.settimana) : {}),
        ...(dallaRete?.porzioni || {}),
      },
      aggiornatoIl: dallaRete?.aggiornatoIl || null,
      senzaProfilo: false,
    });
  }

  // C'e' nello spazio ma non su questo dispositivo: si mostra lo stesso — chi
  // cucina deve sapere quanto mettere in pentola comunque — dicendo pero' che
  // di quella persona qui non c'e' il profilo.
  for (const [origine, pubblicato] of pubblicati) {
    if (visti.has(origine)) continue;
    fuori.push({
      origine,
      nome: pubblicato.nome,
      porzioni: pubblicato.porzioni || {},
      aggiornatoIl: pubblicato.aggiornatoIl,
      senzaProfilo: true,
    });
  }
  return fuori;
}
