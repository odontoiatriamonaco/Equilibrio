import { describe, it, expect } from 'vitest';
import {
  eta, bmi, classificaBmi, whtr, classificaWhtr, classificaVita,
  pesoDesiderabile, bmrMifflin, tdee, floorCalorico, targetGiornaliero,
  proteineMinime, previsioneTraguardo, pesoDiTendenza, tdeeAdattivo,
  valutaBandiere, riepilogo,
  margineDisponibile, ritmoDi, fattoreAvvio, quoteAvvio, giorniAggiuntiDallAvvio, vincoliDa,
  RITMI, AVVIO_SETTIMANE,
  FLOOR_DONNA, DEFICIT_MAX, CALO_MAX_SETTIMANA, KCAL_PER_KG,
} from '../js/energia.js';

const DONNA = {
  sesso: 'donna',
  dataNascita: '1984-03-15',
  altezzaCm: 165,
  pesoKg: 78,
  vitaCm: 92,
  fianchiCm: 108,
  colloCm: 34,
  attivita: 'leggera',
};

const OGGI = new Date('2026-07-29T12:00:00Z');

describe('antropometria', () => {
  it('calcola l\'età in anni compiuti', () => {
    expect(eta('1984-03-15', OGGI)).toBe(42);
    // Compleanno non ancora arrivato: un anno in meno.
    expect(eta('1984-12-31', OGGI)).toBe(41);
  });

  it('calcola e classifica il BMI', () => {
    expect(bmi(78, 165)).toBeCloseTo(28.65, 2);
    expect(classificaBmi(bmi(78, 165)).codice).toBe('sovrappeso');
    expect(classificaBmi(22).codice).toBe('normopeso');
    expect(classificaBmi(17).codice).toBe('sottopeso');
    expect(classificaBmi(36).codice).toBe('obesita2');
  });

  it('usa 0,5 come soglia del rapporto vita/altezza', () => {
    expect(whtr(92, 165)).toBeCloseTo(0.5576, 4);
    expect(classificaWhtr(0.49).codice).toBe('ok');
    expect(classificaWhtr(0.5).codice).toBe('aumentato');
    expect(classificaWhtr(0.62).codice).toBe('alto');
  });

  it('applica le soglie OMS della circonferenza vita per sesso', () => {
    expect(classificaVita(79, 'donna').codice).toBe('ok');
    expect(classificaVita(85, 'donna').codice).toBe('aumentato');
    expect(classificaVita(90, 'donna').codice).toBe('alto');
    expect(classificaVita(90, 'uomo').codice).toBe('ok');
    expect(classificaVita(105, 'uomo').codice).toBe('alto');
  });

  it('ricava il peso desiderabile da BMI 18,5-24,9', () => {
    const p = pesoDesiderabile(165);
    expect(p.min).toBeCloseTo(50.4, 1);
    expect(p.max).toBeCloseTo(67.8, 1);
  });
});

describe('fabbisogno', () => {
  it('calcola il metabolismo basale con Mifflin-St Jeor', () => {
    // 10*78 + 6.25*165 - 5*42 - 161
    expect(bmrMifflin({ sesso: 'donna', pesoKg: 78, altezzaCm: 165, anni: 42 })).toBeCloseTo(1440.25, 2);
    expect(bmrMifflin({ sesso: 'uomo', pesoKg: 78, altezzaCm: 165, anni: 42 })).toBeCloseTo(1606.25, 2);
  });

  it('moltiplica per il livello di attività', () => {
    expect(tdee(1440.25, 'leggera')).toBeCloseTo(1980.34, 2);
    expect(tdee(1440.25, 'sedentaria')).toBeCloseTo(1728.3, 2);
    // Livello sconosciuto: ricade su "leggera" invece di restituire NaN.
    expect(tdee(1440.25, 'inventata')).toBeCloseTo(1980.34, 2);
  });
});

describe('vincoli di sicurezza — non negoziabili', () => {
  const bmr = 1440.25;
  const td = tdee(bmr, 'leggera');

  it('non scende mai sotto il pavimento calorico, per quanto grande sia il deficit chiesto', () => {
    const r = targetGiornaliero({ tdee: td, bmr, sesso: 'donna', pesoKg: 78, deficitRichiesto: 5000 });
    expect(r.target).toBeGreaterThanOrEqual(Math.round(bmr));
    expect(r.target).toBeGreaterThanOrEqual(FLOOR_DONNA);
    expect(r.limitato).toBe(true);
  });

  it('il pavimento è il più alto fra basale e minimo assoluto', () => {
    // Basale alto: comanda il basale.
    expect(floorCalorico({ bmr: 1600, sesso: 'donna' })).toBe(1600);
    // Basale bassissimo: comanda il minimo di sesso.
    expect(floorCalorico({ bmr: 900, sesso: 'donna' })).toBe(FLOOR_DONNA);
  });

  it('non supera il 25% del fabbisogno come deficit', () => {
    const r = targetGiornaliero({ tdee: 3000, bmr: 1600, sesso: 'uomo', pesoKg: 110, deficitRichiesto: 2000 });
    expect(r.deficit).toBeLessThanOrEqual(Math.round(3000 * DEFICIT_MAX));
    expect(r.limiti.join(' ')).toMatch(/25%/);
  });

  it('non supera l\'1% del peso corporeo a settimana', () => {
    // Persona leggera: il tetto del calo morde prima di quello percentuale.
    const tettoCalo = (CALO_MAX_SETTIMANA * 55 * KCAL_PER_KG) / 7; // ~605 kcal/die
    const r = targetGiornaliero({ tdee: 2600, bmr: 1400, sesso: 'donna', pesoKg: 55, deficitRichiesto: 650 });
    expect(r.deficit).toBeLessThanOrEqual(Math.round(tettoCalo) + 1);
    expect(r.limiti.join(' ')).toMatch(/settimana/);
  });

  it('un deficit ragionevole passa senza limitazioni', () => {
    const r = targetGiornaliero({ tdee: td, bmr, sesso: 'donna', pesoKg: 78, deficitRichiesto: 400 });
    expect(r.deficit).toBe(400);
    expect(r.limitato).toBe(false);
    expect(r.target).toBe(Math.round(td - 400));
  });

  it('non inventa deficit negativi da un obiettivo di mantenimento', () => {
    const r = targetGiornaliero({ tdee: td, bmr, sesso: 'donna', pesoKg: 78, deficitRichiesto: -300 });
    expect(r.deficit).toBe(0);
    expect(r.target).toBe(Math.round(td));
  });

  it('tiene le proteine ad almeno 1,2 g per kg', () => {
    expect(proteineMinime(67.8)).toBe(81);
  });
});

/* Il profilo che ha fatto emergere il difetto: donna sedentaria, margine
   strettissimo. Prima della correzione i tre ritmi davano lo stesso numero. */
const SEDENTARIA = {
  sesso: 'donna', dataNascita: '1978-01-01', altezzaCm: 165, pesoKg: 73,
  attivita: 'sedentaria', pesoObiettivoKg: 65,
};
const AGOSTO = new Date('2026-08-16T12:00:00Z');

describe('margine disponibile', () => {
  it('dice quanto deficit resta davvero e quale vincolo lo decide', () => {
    // TDEE 1632, basale 1360: il pavimento lascia appena 272 kcal.
    const m = margineDisponibile({ tdee: 1632, bmr: 1360, sesso: 'donna', pesoKg: 73 });
    expect(m.kcal).toBe(272);
    expect(m.motivo).toMatch(/basale/);
    // Gli altri due limiti erano piu' larghi: e' il pavimento che comanda.
    expect(m.perPercentuale).toBeGreaterThan(m.perFloor);
    expect(m.perCalo).toBeGreaterThan(m.perFloor);
  });

  it('lascia comandare il tetto percentuale quando il basale non morde', () => {
    const m = margineDisponibile({ tdee: 3000, bmr: 1600, sesso: 'uomo', pesoKg: 110 });
    expect(m.kcal).toBe(Math.round(3000 * DEFICIT_MAX));
    expect(m.motivo).toMatch(/25%/);
  });

  it('non restituisce mai un margine negativo', () => {
    // Basale sopra il fabbisogno: caso limite, ma non deve produrre numeri assurdi.
    const m = margineDisponibile({ tdee: 1300, bmr: 1500, sesso: 'donna', pesoKg: 50 });
    expect(m.kcal).toBe(0);
  });
});

describe('il ritmo come frazione del margine', () => {
  it('i tre ritmi danno tre deficit DISTINTI anche su un margine stretto', () => {
    // E' il test che avrebbe colto il difetto: prima erano tutti e tre 272.
    const deficit = ['calmo', 'regolare', 'deciso'].map(
      (ritmo) => riepilogo({ ...SEDENTARIA, ritmo }, AGOSTO).fabbisogno.deficit,
    );
    expect(deficit).toEqual([136, 204, 272]);
    expect(new Set(deficit).size).toBe(3);
  });

  it('«deciso» prende tutto il margine e nemmeno un kcal di piu\'', () => {
    const r = riepilogo({ ...SEDENTARIA, ritmo: 'deciso' }, AGOSTO);
    expect(r.fabbisogno.deficit).toBe(r.margine.kcal);
    expect(r.fabbisogno.target).toBe(r.fabbisogno.floor);
  });

  it('nessun ritmo scende mai sotto il pavimento', () => {
    for (const ritmo of Object.keys(RITMI)) {
      const r = riepilogo({ ...SEDENTARIA, ritmo }, AGOSTO);
      expect(r.fabbisogno.target).toBeGreaterThanOrEqual(r.fabbisogno.floor);
      expect(r.fabbisogno.target).toBeGreaterThanOrEqual(FLOOR_DONNA);
    }
  });

  it('un ritmo piu\' deciso avvicina il traguardo', () => {
    const calmo = riepilogo({ ...SEDENTARIA, ritmo: 'calmo' }, AGOSTO).traguardo.giorni;
    const deciso = riepilogo({ ...SEDENTARIA, ritmo: 'deciso' }, AGOSTO).traguardo.giorni;
    expect(deciso).toBeLessThan(calmo);
  });

  it('muoversi di piu\' allarga il margine, e questo si vede', () => {
    const margini = ['sedentaria', 'leggera', 'moderata'].map(
      (attivita) => riepilogo({ ...SEDENTARIA, attivita }, AGOSTO).margine.kcal,
    );
    expect(margini[0]).toBeLessThan(margini[1]);
    expect(margini[1]).toBeLessThan(margini[2]);
  });

  it('traduce i profili vecchi salvati con un deficit in kcal', () => {
    expect(ritmoDi({ deficitRichiesto: 300 })).toBe('calmo');
    expect(ritmoDi({ deficitRichiesto: 500 })).toBe('regolare');
    expect(ritmoDi({ deficitRichiesto: 700 })).toBe('deciso');
    // Un profilo senza niente non deve rompersi: cade sul ritmo di mezzo.
    expect(ritmoDi({})).toBe('regolare');
    // Il campo nuovo ha la precedenza su quello vecchio.
    expect(ritmoDi({ ritmo: 'calmo', deficitRichiesto: 700 })).toBe('calmo');
  });
});

describe('avvio graduale', () => {
  const AVVIO = { attivo: true, dal: '2026-08-16', settimane: 4 };
  const piu = (giorni) => {
    const d = new Date('2026-08-16T12:00:00Z');
    d.setDate(d.getDate() + giorni);
    return d;
  };

  it('sale di un quarto a settimana e poi resta al pieno', () => {
    expect(quoteAvvio(4)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(fattoreAvvio(AVVIO, piu(0)).quota).toBe(0.25);
    expect(fattoreAvvio(AVVIO, piu(7)).quota).toBe(0.5);
    expect(fattoreAvvio(AVVIO, piu(14)).quota).toBe(0.75);
    expect(fattoreAvvio(AVVIO, piu(21)).quota).toBe(1);
    // Finita la rampa si esce: niente piu' avviso in interfaccia.
    expect(fattoreAvvio(AVVIO, piu(28)).attivo).toBe(false);
    expect(fattoreAvvio(AVVIO, piu(28)).quota).toBe(1);
  });

  it('numera le settimane per l\'interfaccia', () => {
    expect(fattoreAvvio(AVVIO, piu(8))).toMatchObject({ attivo: true, settimana: 2, di: 4 });
  });

  it('spento, o senza data, non tocca niente', () => {
    expect(fattoreAvvio(null).quota).toBe(1);
    expect(fattoreAvvio({ attivo: false, dal: '2026-08-16' }).quota).toBe(1);
    expect(fattoreAvvio({ attivo: true }).quota).toBe(1);
  });

  it('alleggerisce il deficit senza mai scavalcare il pavimento', () => {
    const conRampa = riepilogo({ ...SEDENTARIA, ritmo: 'deciso', avvioGraduale: AVVIO }, piu(0));
    const pieno = riepilogo({ ...SEDENTARIA, ritmo: 'deciso' }, piu(0));

    expect(conRampa.fabbisogno.deficit).toBeLessThan(pieno.fabbisogno.deficit);
    // Piu' cibo, non meno: e' il punto della rampa.
    expect(conRampa.fabbisogno.target).toBeGreaterThan(pieno.fabbisogno.target);
    expect(conRampa.fabbisogno.target).toBeGreaterThanOrEqual(conRampa.fabbisogno.floor);
    // Il target a regime resta consultabile: serve a spiegare dove si sta andando.
    expect(conRampa.fabbisogno.targetPieno).toBe(pieno.fabbisogno.target);
  });

  it('la rampa non puo\' mai aggravare il deficit', () => {
    for (let s = 0; s < 6; s++) {
      const r = riepilogo({ ...SEDENTARIA, ritmo: 'deciso', avvioGraduale: AVVIO }, piu(s * 7));
      expect(r.fabbisogno.deficit).toBeLessThanOrEqual(r.margine.kcal);
      expect(r.fabbisogno.target).toBeGreaterThanOrEqual(r.fabbisogno.floor);
    }
  });

  it('sposta il traguardo di quanto costa davvero, e lo riavvicina strada facendo', () => {
    expect(giorniAggiuntiDallAvvio(AVVIO_SETTIMANE)).toBe(11);
    // A meta' rampa il costo gia' pagato non si conta due volte.
    expect(giorniAggiuntiDallAvvio(4, 3)).toBe(2);

    const senza = riepilogo({ ...SEDENTARIA, ritmo: 'deciso' }, piu(0)).traguardo.giorni;
    const inizio = riepilogo({ ...SEDENTARIA, ritmo: 'deciso', avvioGraduale: AVVIO }, piu(0)).traguardo.giorni;
    const fine = riepilogo({ ...SEDENTARIA, ritmo: 'deciso', avvioGraduale: AVVIO }, piu(21)).traguardo.giorni;

    expect(inizio).toBe(senza + 11);
    expect(fine).toBeLessThan(inizio);
  });

  it('in gravidanza non si applica: non c\'e\' nessun deficit da smorzare', () => {
    const r = riepilogo({ ...SEDENTARIA, avvioGraduale: AVVIO, bandiere: { gravidanza: true } }, piu(0));
    expect(r.avvio.attivo).toBe(false);
    expect(r.fabbisogno.deficit).toBe(0);
  });
});

describe('fabbisogno misurato dal diario', () => {
  it('quando c\'e\', batte la formula', () => {
    const r = riepilogo({ ...SEDENTARIA, tdeeMisurato: 1500 }, AGOSTO);
    expect(r.tdee).toBe(1500);
    expect(r.tdeeStimato).toBe(1632);
    expect(r.tdeeDaDiario).toBe(true);
  });

  it('senza, resta la stima e l\'app lo dichiara', () => {
    const r = riepilogo(SEDENTARIA, AGOSTO);
    expect(r.tdee).toBe(r.tdeeStimato);
    expect(r.tdeeDaDiario).toBe(false);
  });

  it('un fabbisogno misurato piu\' basso stringe il margine, non lo sfonda', () => {
    const r = riepilogo({ ...SEDENTARIA, tdeeMisurato: 1450, ritmo: 'deciso' }, AGOSTO);
    expect(r.fabbisogno.target).toBeGreaterThanOrEqual(r.fabbisogno.floor);
    expect(r.margine.kcal).toBeLessThan(272);
  });
});

describe('previsione del traguardo', () => {
  it('stima i giorni dal deficit', () => {
    const p = previsioneTraguardo({
      pesoAttualeKg: 78, pesoObiettivoKg: 68, deficitGiornaliero: 500, da: OGGI,
    });
    expect(p.giorni).toBe(Math.ceil((10 * KCAL_PER_KG) / 500)); // 154
    expect(p.data.getFullYear()).toBe(2026);
  });

  it('non promette nulla se non c\'è deficit o non c\'è nulla da perdere', () => {
    expect(previsioneTraguardo({ pesoAttualeKg: 60, pesoObiettivoKg: 68, deficitGiornaliero: 500 })).toBeNull();
    expect(previsioneTraguardo({ pesoAttualeKg: 78, pesoObiettivoKg: 68, deficitGiornaliero: 0 })).toBeNull();
  });
});

describe('peso di tendenza', () => {
  it('smorza il rumore giornaliero', () => {
    const misure = [
      { data: '2026-07-01', peso: 78.0 },
      { data: '2026-07-02', peso: 78.7 },  // ritenzione
      { data: '2026-07-03', peso: 77.9 },
      { data: '2026-07-04', peso: 78.1 },
    ];
    const t = pesoDiTendenza(misure);
    expect(t[0].tendenza).toBe(78.0);
    // Il picco di 78,7 sposta la tendenza di appena il 10% dello scarto.
    expect(t[1].tendenza).toBeCloseTo(78.07, 2);
    expect(t[1].tendenza).toBeLessThan(78.7);
    expect(t).toHaveLength(4);
  });

  it('regge una serie vuota', () => {
    expect(pesoDiTendenza([])).toEqual([]);
  });
});

describe('TDEE adattivo', () => {
  it('rifiuta di stimare con troppi pochi giorni', () => {
    const r = tdeeAdattivo({ kcalMedie: 1600, deltaPesoTendenzaKg: -0.8, giorni: 7, aderenza: 1 });
    expect(r.affidabile).toBe(false);
    expect(r.motivo).toMatch(/14 giorni/);
  });

  it('rifiuta di stimare con un diario compilato a metà', () => {
    const r = tdeeAdattivo({ kcalMedie: 1600, deltaPesoTendenzaKg: -0.8, giorni: 21, aderenza: 0.5 });
    expect(r.affidabile).toBe(false);
    expect(r.motivo).toMatch(/50%/);
  });

  it('ricava il fabbisogno reale dai dati veri', () => {
    // 1600 kcal medie, -1 kg in 21 giorni => 1600 + 7700/21 ≈ 1967
    const r = tdeeAdattivo({ kcalMedie: 1600, deltaPesoTendenzaKg: -1, giorni: 21, aderenza: 0.9 });
    expect(r.affidabile).toBe(true);
    expect(r.tdee).toBe(1967);
  });
});

describe('bandiere rosse', () => {
  it('blocca il calcolo del deficit in gravidanza', () => {
    const r = valutaBandiere({ gravidanza: true });
    expect(r.bloccante).toBe(true);
    expect(r.messaggio).toMatch(/medico o da un nutrizionista/);
  });

  it('segnala senza bloccare le condizioni da tenere d\'occhio', () => {
    const r = valutaBandiere({ tiroide: true });
    expect(r.bloccante).toBe(false);
    expect(r.daSegnalare).toEqual(['tiroide']);
    expect(r.messaggio).toMatch(/medico curante/);
  });

  it('non dice nulla se non c\'è nulla da dire', () => {
    expect(valutaBandiere({})).toEqual({
      bloccante: false, daSegnalare: [], messaggio: null,
      vincoli: { tetti: {} }, note: [], limiti: [],
    });
  });
});

describe('riepilogo', () => {
  it('mette insieme tutto per una donna in sovrappeso', () => {
    const r = riepilogo({ ...DONNA, pesoObiettivoKg: 67 }, OGGI);
    expect(r.anni).toBe(42);
    expect(r.classeBmi.codice).toBe('sovrappeso');
    expect(r.classeVita.codice).toBe('alto');
    expect(r.bmr).toBe(1440);
    expect(r.tdee).toBe(1980);
    expect(r.fabbisogno.target).toBeGreaterThanOrEqual(r.fabbisogno.floor);
    expect(r.massaGrassa).toBeGreaterThan(20);
    expect(r.traguardo.giorni).toBeGreaterThan(0);
  });

  it('in gravidanza non calcola alcun deficit', () => {
    const r = riepilogo({ ...DONNA, bandiere: { gravidanza: true } }, OGGI);
    expect(r.bandiere.bloccante).toBe(true);
    expect(r.fabbisogno.deficit).toBe(0);
    expect(r.fabbisogno.target).toBe(r.tdee);
    expect(r.traguardo).toBeNull();
  });
});

/* --- Le condizioni di salute che toccano il piano ---------------------------
   La regola: l'app cambia il piano SOLO dove sa misurare. Il sodio e la fibra
   sono nei dati, i tetti settimanali esistono. Grassi saturi, zuccheri, glutine
   e purine no — e dove non sa, dichiara invece di fingere.
   -------------------------------------------------------------------------- */

describe('condizioni di salute e piano', () => {
  it('senza condizioni non impone niente di nuovo', () => {
    const v = vincoliDa({});
    expect(v.tetti).toEqual({});
    expect(v.sodioMax).toBeUndefined();
    expect(v.fibraMin).toBeUndefined();
  });

  it('la pressione alta mette un tetto al sodio', () => {
    expect(vincoliDa({ ipertensione: true }).sodioMax).toBe(2000);
  });

  it('il colesterolo stringe i tetti e alza la fibra', () => {
    const v = vincoliDa({ colesterolo: true });
    expect(v.tetti.salumi).toBe(0);
    expect(v.tetti.formaggi).toBe(2);
    expect(v.fibraMin).toBe(30);
  });

  it('due condizioni insieme prendono sempre la più prudente', () => {
    const v = vincoliDa({ colesterolo: true, diverticoli: true, ipertensione: true });
    expect(v.tetti.salumi).toBe(0);
    expect(v.sodioMax).toBe(2000);
    expect(v.fibraMin).toBe(30);
  });

  it('la patologia renale toglie il minimo proteico, e lo dice', () => {
    // 1,2 g/kg puo' essere controindicato nell'insufficienza renale: l'app
    // smette di imporlo invece di sostituirlo con un numero che non sa.
    const b = valutaBandiere({ renaliEpatiche: true });
    expect(b.vincoli.senzaMinimoProteico).toBe(true);
    expect(b.note.join(' ')).toMatch(/nefrologo/);

    const r = riepilogo({ ...SEDENTARIA, bandiere: { renaliEpatiche: true } }, AGOSTO);
    expect(r.proteineMinime).toBeNull();
    // Senza la condizione il minimo resta, per tutti gli altri.
    expect(riepilogo(SEDENTARIA, AGOSTO).proteineMinime).toBeGreaterThan(0);
  });

  it('dove non sa misurare lo dichiara invece di fingere', () => {
    // I grassi saturi e le purine non sono nei dati: se un giorno lo diventassero
    // questo test va aggiornato, ma finche' non lo sono l'app non deve tacere.
    const b = valutaBandiere({ colesterolo: true, diverticoli: true });
    expect(b.limiti.length).toBe(2);
    expect(b.limiti.join(' ')).toMatch(/grassi saturi/);
    expect(b.limiti.join(' ')).toMatch(/attacco/);
  });

  it('una condizione bloccante porta comunque con sé i suoi vincoli', () => {
    const b = valutaBandiere({ gravidanza: true, ipertensione: true });
    expect(b.bloccante).toBe(true);
    expect(b.vincoli.sodioMax).toBe(2000);
  });
});

describe('un minorenne non dipende dalla sua buona memoria', () => {
  const OGGI = new Date('2026-08-18T12:00:00');
  const RAGAZZA = {
    sesso: 'donna', pesoKg: 62, altezzaCm: 165,
    dataNascita: '2011-03-14', attivita: 'media', bandiere: {},
  };

  it('viene fermato anche senza spuntare la casella', () => {
    // Era il difetto: l'app calcolava correttamente 15 anni e le assegnava
    // comunque un piano ipocalorico da 1581 kcal, perché il blocco dipendeva
    // da una casella che nessuno l'aveva obbligata a spuntare.
    const r = riepilogo(RAGAZZA, OGGI);
    expect(r.anni).toBe(15);
    expect(r.bandiere.bloccante).toBe(true);
    expect(r.bandiere.daSegnalare).toContain('minore');
    expect(r.bandiere.messaggio).toMatch(/medico|nutrizionista/);
    expect(r.fabbisogno.deficit).toBe(0);
  });

  it('il giorno dei diciotto anni il blocco cade', () => {
    const vigilia = riepilogo({ ...RAGAZZA, dataNascita: '2008-08-19' }, OGGI);
    const compleanno = riepilogo({ ...RAGAZZA, dataNascita: '2008-08-18' }, OGGI);
    expect(vigilia.anni).toBe(17);
    expect(vigilia.bandiere.bloccante).toBe(true);
    expect(compleanno.anni).toBe(18);
    expect(compleanno.bandiere.bloccante).toBe(false);
    expect(compleanno.fabbisogno.deficit).toBeGreaterThan(0);
  });

  it('un adulto non viene fermato per sbaglio', () => {
    const r = riepilogo({ ...RAGAZZA, dataNascita: '1985-01-20' }, OGGI);
    expect(r.bandiere.bloccante).toBe(false);
    expect(r.bandiere.daSegnalare).not.toContain('minore');
  });

  it('una data di nascita nel futuro non produce un piano', () => {
    // Età negativa: è un dato sbagliato, e da un dato sbagliato non si ricava
    // un deficit calorico.
    const r = riepilogo({ ...RAGAZZA, dataNascita: '2030-01-01' }, OGGI);
    expect(r.anni).toBeLessThan(0);
    expect(r.bandiere.bloccante).toBe(true);
  });
});
