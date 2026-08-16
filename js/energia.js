/* Equilibrio — antropometria e fabbisogno energetico.
   Modulo puro: nessun DOM, nessuno store. Qui vivono i VINCOLI DI SICUREZZA,
   e nessun'altra parte dell'app ha il permesso di aggirarli.

   Equilibrio non e' un dispositivo medico e non sostituisce un nutrizionista.
   Queste formule sono strumenti di stima, non diagnosi. */

/* --- Costanti ------------------------------------------------------------- */

/** Energia liberata da 1 kg di tessuto adiposo. Convenzione classica. */
export const KCAL_PER_KG = 7700;

/** Pavimenti calorici sotto i quali l'app non scende mai, per nessun motivo. */
export const FLOOR_DONNA = 1200;
export const FLOOR_UOMO = 1500;

/** Deficit massimo consentito, in frazione del TDEE. */
export const DEFICIT_MAX = 0.25;

/** Calo massimo consentito, in frazione del peso corporeo a settimana. */
export const CALO_MAX_SETTIMANA = 0.01;

/** Proteine minime, g per kg di peso desiderabile. */
export const PROTEINE_G_PER_KG = 1.2;

/**
 * Il ritmo e' una FRAZIONE del margine che i vincoli lasciano, non un numero
 * fisso di kcal.
 *
 * Un deficit chiesto in kcal fisse viene tosato dai vincoli fino a collassare:
 * su una donna sedentaria il margine massimo e' TDEE-basale, cioe' un quinto
 * del basale, e «regolare» e «deciso» finiscono tutti e due li'. La scelta
 * diventava una decorazione. Espressa in frazione, resta una scelta vera per
 * ogni profilo, e senza allentare nessun vincolo.
 */
export const RITMI = {
  calmo: { quota: 0.5, testo: 'Con calma' },
  regolare: { quota: 0.75, testo: 'Regolare' },
  deciso: { quota: 1, testo: 'Deciso' },
};

/** I vecchi profili portano un deficit in kcal: si traduce senza perdere nulla. */
const RITMO_DA_KCAL = { 300: 'calmo', 500: 'regolare', 700: 'deciso' };

/** Il ritmo di un profilo, comunque sia stato salvato. */
export function ritmoDi(profilo) {
  if (profilo?.ritmo && RITMI[profilo.ritmo]) return profilo.ritmo;
  return RITMO_DA_KCAL[profilo?.deficitRichiesto] || 'regolare';
}

/** Livelli di attività fisica (moltiplicatori del metabolismo basale). */
export const LAF = {
  sedentaria: { valore: 1.2, testo: 'Sedentaria — lavoro da seduta, niente sport' },
  leggera: { valore: 1.375, testo: 'Leggera — qualche camminata, 1-2 allenamenti' },
  moderata: { valore: 1.55, testo: 'Moderata — attività 3-5 volte a settimana' },
  intensa: { valore: 1.725, testo: 'Intensa — attività quasi tutti i giorni' },
  moltoIntensa: { valore: 1.9, testo: 'Molto intensa — lavoro fisico o due allenamenti al giorno' },
};

/* --- Antropometria -------------------------------------------------------- */

/** Età in anni compiuti. `oggi` è iniettabile per rendere i test deterministici. */
export function eta(dataNascita, oggi = new Date()) {
  const n = new Date(dataNascita);
  let a = oggi.getFullYear() - n.getFullYear();
  const m = oggi.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < n.getDate())) a--;
  return a;
}

export function bmi(pesoKg, altezzaCm) {
  const m = altezzaCm / 100;
  return pesoKg / (m * m);
}

export function classificaBmi(valore) {
  if (valore < 18.5) return { codice: 'sottopeso', testo: 'Sottopeso' };
  if (valore < 25) return { codice: 'normopeso', testo: 'Normopeso' };
  if (valore < 30) return { codice: 'sovrappeso', testo: 'Sovrappeso' };
  if (valore < 35) return { codice: 'obesita1', testo: 'Obesità di primo grado' };
  if (valore < 40) return { codice: 'obesita2', testo: 'Obesità di secondo grado' };
  return { codice: 'obesita3', testo: 'Obesità di terzo grado' };
}

/** Rapporto vita/altezza: predice il rischio cardiometabolico meglio del BMI. */
export function whtr(vitaCm, altezzaCm) {
  return vitaCm / altezzaCm;
}

export function classificaWhtr(valore) {
  if (valore < 0.4) return { codice: 'basso', testo: 'Sotto la norma' };
  if (valore < 0.5) return { codice: 'ok', testo: 'Nella norma' };
  if (valore < 0.6) return { codice: 'aumentato', testo: 'Rischio aumentato' };
  return { codice: 'alto', testo: 'Rischio alto' };
}

/** Soglie OMS della circonferenza vita. */
export function classificaVita(vitaCm, sesso) {
  const [s1, s2] = sesso === 'uomo' ? [94, 102] : [80, 88];
  if (vitaCm < s1) return { codice: 'ok', testo: 'Nella norma' };
  if (vitaCm < s2) return { codice: 'aumentato', testo: 'Rischio aumentato' };
  return { codice: 'alto', testo: 'Rischio alto' };
}

/** Massa grassa stimata da BMI, età e sesso (Deurenberg). Stima, non misura. */
export function massaGrassaDaBmi(valoreBmi, anni, sesso) {
  return 1.2 * valoreBmi + 0.23 * anni - 10.8 * (sesso === 'uomo' ? 1 : 0) - 5.4;
}

/**
 * Massa grassa dalle circonferenze (metodo US Navy): più affidabile del BMI
 * perché distingue il grasso addominale dalla corporatura.
 */
export function massaGrassaDaCirconferenze({ sesso, altezzaCm, vitaCm, colloCm, fianchiCm }) {
  if (!vitaCm || !colloCm || !altezzaCm) return null;
  if (sesso === 'uomo') {
    if (vitaCm - colloCm <= 0) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(vitaCm - colloCm)
      + 0.15456 * Math.log10(altezzaCm)) - 450;
  }
  if (!fianchiCm) return null;
  const somma = vitaCm + fianchiCm - colloCm;
  if (somma <= 0) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(somma)
    + 0.22100 * Math.log10(altezzaCm)) - 450;
}

/** Intervallo di peso corrispondente a un BMI fra 18,5 e 24,9. */
export function pesoDesiderabile(altezzaCm) {
  const m = altezzaCm / 100;
  return { min: 18.5 * m * m, max: 24.9 * m * m };
}

/* --- Fabbisogno ----------------------------------------------------------- */

/** Metabolismo basale, Mifflin-St Jeor: la formula predittiva più accurata. */
export function bmrMifflin({ sesso, pesoKg, altezzaCm, anni }) {
  return 10 * pesoKg + 6.25 * altezzaCm - 5 * anni + (sesso === 'uomo' ? 5 : -161);
}

export function tdee(bmr, livelloAttivita) {
  const laf = LAF[livelloAttivita]?.valore ?? LAF.leggera.valore;
  return bmr * laf;
}

/** Il pavimento calorico assoluto: il più alto fra il basale e il minimo di sesso. */
export function floorCalorico({ bmr, sesso }) {
  return Math.max(bmr, sesso === 'uomo' ? FLOOR_UOMO : FLOOR_DONNA);
}

/**
 * Quanto deficit i vincoli di sicurezza lasciano davvero disponibile, e quale
 * dei tre ha vinto.
 *
 * E' il numero che l'app non ha mai detto e che spiega tutto il resto: sotto
 * quella soglia non si va, e sapere quale vincolo morde dice anche come
 * alzarla — quasi sempre muovendosi di piu'.
 *
 * @returns {{kcal:number, motivo:string, perFloor:number, perPercentuale:number, perCalo:number}}
 */
export function margineDisponibile({ tdee: td, bmr, sesso, pesoKg }) {
  const floor = floorCalorico({ bmr, sesso });
  const perFloor = Math.max(0, td - floor);
  const perPercentuale = td * DEFICIT_MAX;
  const perCalo = (CALO_MAX_SETTIMANA * pesoKg * KCAL_PER_KG) / 7;

  const candidati = [
    { kcal: perFloor, motivo: `sotto ci sarebbe il metabolismo basale (${Math.round(floor)} kcal)` },
    { kcal: perPercentuale, motivo: `il deficit non supera il ${Math.round(DEFICIT_MAX * 100)}% del fabbisogno` },
    { kcal: perCalo, motivo: `il calo non supera l'${Math.round(CALO_MAX_SETTIMANA * 100)}% del peso a settimana` },
  ];
  const vincolo = candidati.reduce((a, b) => (b.kcal < a.kcal ? b : a));

  return {
    kcal: Math.round(Math.max(0, vincolo.kcal)),
    motivo: vincolo.motivo,
    perFloor: Math.round(perFloor),
    perPercentuale: Math.round(perPercentuale),
    perCalo: Math.round(perCalo),
  };
}

/**
 * Calcola il target giornaliero applicando tutti i vincoli di sicurezza.
 * Restituisce sempre anche il perché di un'eventuale limitazione: l'app
 * deve poter dire la verità all'utente, non limitarsi ad arrotondare.
 *
 * `ritmo` ha la precedenza su `deficitRichiesto`: il primo e' una frazione del
 * margine, il secondo un numero fisso tenuto per i profili gia' salvati.
 *
 * @param {{tdee:number, bmr:number, sesso:string, pesoKg:number,
 *          deficitRichiesto?:number, ritmo?:string}} p  deficitRichiesto in kcal/die
 */
export function targetGiornaliero({ tdee: td, bmr, sesso, pesoKg, deficitRichiesto = 500, ritmo }) {
  const limiti = [];
  let deficit = RITMI[ritmo]
    ? margineDisponibile({ tdee: td, bmr, sesso, pesoKg }).kcal * RITMI[ritmo].quota
    : Math.max(0, deficitRichiesto);

  // 1. Deficit massimo in percentuale del fabbisogno.
  const tettoPercentuale = td * DEFICIT_MAX;
  if (deficit > tettoPercentuale) {
    deficit = tettoPercentuale;
    limiti.push(`deficit limitato al ${Math.round(DEFICIT_MAX * 100)}% del fabbisogno`);
  }

  // 2. Calo massimo settimanale (1% del peso corporeo).
  const tettoCalo = (CALO_MAX_SETTIMANA * pesoKg * KCAL_PER_KG) / 7;
  if (deficit > tettoCalo) {
    deficit = tettoCalo;
    limiti.push(`calo limitato all'${Math.round(CALO_MAX_SETTIMANA * 100)}% del peso a settimana`);
  }

  // 3. Pavimento calorico: mai sotto il basale né sotto il minimo assoluto.
  const floor = floorCalorico({ bmr, sesso });
  let target = td - deficit;
  if (target < floor) {
    target = floor;
    deficit = Math.max(0, td - floor);
    limiti.push(`non si scende sotto ${Math.round(floor)} kcal`);
  }

  return {
    target: Math.round(target),
    deficit: Math.round(deficit),
    floor: Math.round(floor),
    limitato: limiti.length > 0,
    limiti,
  };
}

/** Proteine minime giornaliere, in grammi, sul peso desiderabile. */
export function proteineMinime(pesoRiferimentoKg) {
  return Math.round(PROTEINE_G_PER_KG * pesoRiferimentoKg);
}

/**
 * Giorni stimati per arrivare all'obiettivo con un certo deficit giornaliero.
 * Restituisce null se il deficit è nullo: meglio nessuna previsione che una falsa.
 */
export function previsioneTraguardo({
  pesoAttualeKg, pesoObiettivoKg, deficitGiornaliero, giorniAvvio = 0, da = new Date(),
}) {
  const daPerdere = pesoAttualeKg - pesoObiettivoKg;
  if (daPerdere <= 0 || deficitGiornaliero <= 0) return null;
  // L'avvio graduale costa giorni veri: contarli e' l'unico modo di non mentire
  // sulla data. Meglio un traguardo piu' lontano che uno che non arriva.
  const giorni = Math.ceil((daPerdere * KCAL_PER_KG) / deficitGiornaliero) + giorniAvvio;
  const data = new Date(da);
  data.setDate(data.getDate() + giorni);
  return { giorni, data };
}

/* --- Avvio graduale --------------------------------------------------------
   Si parte a un quarto del deficit e si sale di settimana in settimana fino al
   pieno. Non e' un trucco metabolico e non va raccontato come tale: le prove
   sul grasso perso sono modeste e non significative. Serve all'aderenza — le
   prime settimane sono quelle in cui si molla, e arrivarci piano aiuta.
   -------------------------------------------------------------------------- */

export const AVVIO_SETTIMANE = 4;

/** Le quote settimanali: con quattro settimane sono 25, 50, 75 e 100%. */
export function quoteAvvio(settimane = AVVIO_SETTIMANE) {
  return Array.from({ length: settimane }, (_, i) => (i + 1) / settimane);
}

export const AVVIO_QUOTE = quoteAvvio();

/**
 * Quanti giorni in piu' costa la rampa: la somma di cio' che non si e' tolto
 * durante la salita, riportata in giorni di deficit pieno.
 *
 * `daSettimana` serve al traguardo, che guarda avanti: a meta' rampa il costo
 * gia' pagato non va contato una seconda volta.
 */
export function giorniAggiuntiDallAvvio(settimane = AVVIO_SETTIMANE, daSettimana = 1) {
  return Math.round(quoteAvvio(settimane)
    .slice(Math.max(0, daSettimana - 1))
    .reduce((s, q) => s + (1 - q) * 7, 0));
}

/**
 * A che punto della rampa siamo oggi.
 * @param {{attivo?:boolean, dal?:string, settimane?:number}} avvio
 * @returns {{attivo:boolean, quota:number, settimana:number|null, di:number}}
 */
export function fattoreAvvio(avvio, oggi = new Date()) {
  const settimane = avvio?.settimane ?? AVVIO_SETTIMANE;
  const spento = { attivo: false, quota: 1, settimana: null, di: settimane };
  if (!avvio?.attivo || !avvio.dal || settimane < 1) return spento;

  const dal = new Date(avvio.dal);
  dal.setHours(0, 0, 0, 0);
  const g = new Date(oggi);
  g.setHours(0, 0, 0, 0);

  const giorni = Math.floor((g - dal) / 86400000);
  // Data di partenza nel futuro: si sta ancora alla prima settimana, non fuori.
  const indice = Math.max(0, Math.floor(giorni / 7));
  if (indice >= settimane) return spento;

  return {
    attivo: true,
    quota: quoteAvvio(settimane)[indice],
    settimana: indice + 1,
    di: settimane,
  };
}

/* --- Peso di tendenza e TDEE adattivo -------------------------------------- */

/**
 * Media mobile esponenziale del peso (metodo Hacker's Diet).
 * Serve a togliere il rumore della ritenzione idrica: 700 g in più al mattino
 * non sono grasso, e mostrarli come tali fa smettere le persone.
 *
 * @param {Array<{data:string|Date, peso:number}>} misure  in ordine cronologico
 */
export function pesoDiTendenza(misure, alfa = 0.1) {
  if (!misure.length) return [];
  let tendenza = misure[0].peso;
  return misure.map((m, i) => {
    if (i > 0) tendenza = tendenza + alfa * (m.peso - tendenza);
    return { data: m.data, peso: m.peso, tendenza };
  });
}

/** Requisiti minimi perché la stima adattiva sia onesta. */
export const ADATTIVO_GIORNI_MIN = 14;
export const ADATTIVO_ADERENZA_MIN = 0.7;

/**
 * Fabbisogno reale ricavato dai dati veri anziché dalla formula:
 * kcal medie effettivamente assunte + energia persa dal tessuto.
 * È ciò che rende una stima superiore a una previsione.
 *
 * @returns {{tdee:number, affidabile:boolean, motivo?:string}}
 */
export function tdeeAdattivo({ kcalMedie, deltaPesoTendenzaKg, giorni, aderenza }) {
  if (giorni < ADATTIVO_GIORNI_MIN) {
    return { tdee: null, affidabile: false, motivo: `servono almeno ${ADATTIVO_GIORNI_MIN} giorni di diario` };
  }
  if (aderenza < ADATTIVO_ADERENZA_MIN) {
    return {
      tdee: null,
      affidabile: false,
      motivo: `il diario è compilato al ${Math.round(aderenza * 100)}%: troppo poco per fidarsi`,
    };
  }
  const stima = kcalMedie - (deltaPesoTendenzaKg * KCAL_PER_KG) / giorni;
  return { tdee: Math.round(stima), affidabile: true };
}

/* --- Bandiere rosse -------------------------------------------------------- */

/**
 * Condizioni in cui l'app NON deve generare un piano da sola.
 * Non è burocrazia difensiva: sono i casi in cui un deficit calorico
 * deciso da un algoritmo può fare danno.
 */
export const BANDIERE = [
  { id: 'gravidanza', testo: 'Sei in gravidanza', bloccante: true },
  { id: 'allattamento', testo: 'Stai allattando', bloccante: true },
  { id: 'disturbiAlimentari', testo: 'Hai avuto disturbi del comportamento alimentare', bloccante: true },
  { id: 'minore', testo: 'Hai meno di 18 anni', bloccante: true },
  { id: 'diabete', testo: 'Hai il diabete', bloccante: false },
  { id: 'tiroide', testo: 'Hai una patologia della tiroide', bloccante: false },
  { id: 'renaliEpatiche', testo: 'Hai una patologia renale o epatica', bloccante: false },
  { id: 'farmaci', testo: 'Assumi farmaci che influenzano peso o appetito', bloccante: false },
];

/**
 * @param {Record<string, boolean>} risposte
 * @returns {{bloccante:boolean, daSegnalare:string[], messaggio:string|null}}
 */
export function valutaBandiere(risposte = {}) {
  const attive = BANDIERE.filter((b) => risposte[b.id]);
  const bloccanti = attive.filter((b) => b.bloccante);

  if (bloccanti.length) {
    return {
      bloccante: true,
      daSegnalare: attive.map((b) => b.id),
      messaggio:
        'In questa condizione un piano ipocalorico va impostato da un medico o da un nutrizionista. ' +
        'Equilibrio può comunque servirti per organizzare i pasti e la spesa, ma non calcola un deficit.',
    };
  }

  if (attive.length) {
    return {
      bloccante: false,
      daSegnalare: attive.map((b) => b.id),
      messaggio:
        'Puoi usare il piano, ma parlane con il medico curante: la tua condizione può cambiare ' +
        'il fabbisogno e va tenuta d\'occhio.',
    };
  }

  return { bloccante: false, daSegnalare: [], messaggio: null };
}

/* --- Riepilogo ------------------------------------------------------------- */

/**
 * Calcola tutto in un colpo solo, a partire dal profilo salvato.
 * È la funzione che le pagine chiamano: le altre restano esposte per i test.
 */
export function riepilogo(profilo, oggi = new Date()) {
  const anni = eta(profilo.dataNascita, oggi);
  const valoreBmi = bmi(profilo.pesoKg, profilo.altezzaCm);
  const bmr = bmrMifflin({ sesso: profilo.sesso, pesoKg: profilo.pesoKg, altezzaCm: profilo.altezzaCm, anni });
  const stimato = tdee(bmr, profilo.attivita);
  // Il fabbisogno ricavato dal diario batte la formula, quando c'e' ed e' stato
  // accettato dall'utente: e' una misura, non una previsione.
  const td = profilo.tdeeMisurato > 0 ? profilo.tdeeMisurato : stimato;
  const desiderabile = pesoDesiderabile(profilo.altezzaCm);
  const bandiere = valutaBandiere(profilo.bandiere);
  const ritmo = ritmoDi(profilo);

  const obiettivoKg = profilo.pesoObiettivoKg ?? Math.min(profilo.pesoKg, desiderabile.max);
  const margine = margineDisponibile({ tdee: td, bmr, sesso: profilo.sesso, pesoKg: profilo.pesoKg });

  const pieno = bandiere.bloccante
    ? { target: Math.round(td), deficit: 0, floor: Math.round(floorCalorico({ bmr, sesso: profilo.sesso })), limitato: true, limiti: ['piano ipocalorico non calcolato'] }
    : targetGiornaliero({ tdee: td, bmr, sesso: profilo.sesso, pesoKg: profilo.pesoKg, ritmo });

  // La rampa si applica DOPO i vincoli, e puo' solo alleggerire il deficit:
  // non c'e' modo che scavalchi il pavimento calorico.
  const avvio = fattoreAvvio(bandiere.bloccante ? null : profilo.avvioGraduale, oggi);
  const fabbisogno = avvio.attivo
    ? {
        ...pieno,
        deficit: Math.round(pieno.deficit * avvio.quota),
        target: Math.round(td - pieno.deficit * avvio.quota),
        deficitPieno: pieno.deficit,
        targetPieno: pieno.target,
      }
    : pieno;

  return {
    anni,
    ritmo,
    margine,
    avvio,
    tdeeStimato: Math.round(stimato),
    tdeeDaDiario: profilo.tdeeMisurato > 0,
    bmi: valoreBmi,
    classeBmi: classificaBmi(valoreBmi),
    whtr: profilo.vitaCm ? whtr(profilo.vitaCm, profilo.altezzaCm) : null,
    classeWhtr: profilo.vitaCm ? classificaWhtr(whtr(profilo.vitaCm, profilo.altezzaCm)) : null,
    classeVita: profilo.vitaCm ? classificaVita(profilo.vitaCm, profilo.sesso) : null,
    massaGrassa:
      massaGrassaDaCirconferenze({
        sesso: profilo.sesso, altezzaCm: profilo.altezzaCm,
        vitaCm: profilo.vitaCm, colloCm: profilo.colloCm, fianchiCm: profilo.fianchiCm,
      }) ?? massaGrassaDaBmi(valoreBmi, anni, profilo.sesso),
    bmr: Math.round(bmr),
    tdee: Math.round(td),
    pesoDesiderabile: desiderabile,
    proteineMinime: proteineMinime(Math.min(profilo.pesoKg, desiderabile.max)),
    fabbisogno,
    bandiere,
    // Il traguardo si calcola sul deficit a regime, non su quello ridotto di
    // oggi: la rampa e' temporanea, e il suo costo si conta a parte.
    traguardo: previsioneTraguardo({
      pesoAttualeKg: profilo.pesoKg,
      pesoObiettivoKg: obiettivoKg,
      deficitGiornaliero: pieno.deficit,
      giorniAvvio: avvio.attivo ? giorniAggiuntiDallAvvio(avvio.di, avvio.settimana) : 0,
      da: oggi,
    }),
  };
}
