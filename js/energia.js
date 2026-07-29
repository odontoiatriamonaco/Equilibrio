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
 * Calcola il target giornaliero applicando tutti i vincoli di sicurezza.
 * Restituisce sempre anche il perché di un'eventuale limitazione: l'app
 * deve poter dire la verità all'utente, non limitarsi ad arrotondare.
 *
 * @param {{tdee:number, bmr:number, sesso:string, pesoKg:number,
 *          deficitRichiesto?:number}} p  deficitRichiesto in kcal/die
 */
export function targetGiornaliero({ tdee: td, bmr, sesso, pesoKg, deficitRichiesto = 500 }) {
  const limiti = [];
  let deficit = Math.max(0, deficitRichiesto);

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
export function previsioneTraguardo({ pesoAttualeKg, pesoObiettivoKg, deficitGiornaliero, da = new Date() }) {
  const daPerdere = pesoAttualeKg - pesoObiettivoKg;
  if (daPerdere <= 0 || deficitGiornaliero <= 0) return null;
  const giorni = Math.ceil((daPerdere * KCAL_PER_KG) / deficitGiornaliero);
  const data = new Date(da);
  data.setDate(data.getDate() + giorni);
  return { giorni, data };
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
  const td = tdee(bmr, profilo.attivita);
  const desiderabile = pesoDesiderabile(profilo.altezzaCm);
  const bandiere = valutaBandiere(profilo.bandiere);

  const obiettivoKg = profilo.pesoObiettivoKg ?? Math.min(profilo.pesoKg, desiderabile.max);
  const fabbisogno = bandiere.bloccante
    ? { target: Math.round(td), deficit: 0, floor: Math.round(floorCalorico({ bmr, sesso: profilo.sesso })), limitato: true, limiti: ['piano ipocalorico non calcolato'] }
    : targetGiornaliero({
        tdee: td, bmr, sesso: profilo.sesso, pesoKg: profilo.pesoKg,
        deficitRichiesto: profilo.deficitRichiesto ?? 500,
      });

  return {
    anni,
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
    traguardo: previsioneTraguardo({
      pesoAttualeKg: profilo.pesoKg,
      pesoObiettivoKg: obiettivoKg,
      deficitGiornaliero: fabbisogno.deficit,
      da: oggi,
    }),
  };
}
