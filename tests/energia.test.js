import { describe, it, expect } from 'vitest';
import {
  eta, bmi, classificaBmi, whtr, classificaWhtr, classificaVita,
  pesoDesiderabile, bmrMifflin, tdee, floorCalorico, targetGiornaliero,
  proteineMinime, previsioneTraguardo, pesoDiTendenza, tdeeAdattivo,
  valutaBandiere, riepilogo,
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
    expect(valutaBandiere({})).toEqual({ bloccante: false, daSegnalare: [], messaggio: null });
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
