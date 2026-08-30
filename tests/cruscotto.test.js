/* Il quadro d'insieme.
 *
 * Quasi tutto qui è un raduno di numeri che esistevano già, e proprio per
 * questo il rischio non è sbagliare un calcolo: è dire in questa schermata una
 * cosa diversa da quella che dice il profilo. I test guardano soprattutto
 * quello — che il cruscotto non inventi e non contraddica. */
import { describe, it, expect } from 'vitest';
import { cruscotto, andamentoPeso } from '../js/cruscotto.js';
import { riepilogo, pesoDiTendenza, LAF, RITMI } from '../js/energia.js';

const OGGI = new Date('2026-08-29T12:00:00');
const PROFILO = {
  id: 'p1',
  nome: 'Prova',
  sesso: 'donna',
  dataNascita: '1978-01-01',
  altezzaCm: 165,
  pesoKg: 73,
  pesoObiettivoKg: 65,
  attivita: 'sedentaria',
  ritmo: 'regolare',
};

/* Pesate quasi quotidiane, come l'app chiede di farle: la tendenza è una media
   esponenziale, e con quattro punti in due mesi resta indietro di suo — non è
   un difetto, è che quattro punti non bastano. Il caso rado ha il suo test. */
const PESATE = Array.from({ length: 60 }, (_, i) => {
  const d = new Date('2026-07-01T12:00:00');
  d.setDate(d.getDate() + i);
  // Due chili in due mesi, con mezzo chilo di rumore che si alterna.
  return {
    data: d.toISOString().slice(0, 10),
    peso: Math.round((75 - i * (2 / 59) + (i % 3 === 0 ? 0.4 : -0.2)) * 10) / 10,
  };
});

describe('andamento del peso', () => {
  it('dice quanto si è mosso e a che ritmo', () => {
    const a = andamentoPeso(pesoDiTendenza(PESATE));
    expect(a.delta).toBeLessThan(0);
    expect(a.perSettimana).toBeLessThan(0);
    expect(a.abbastanza).toBe(true);
  });

  it('poche pesate sparse non bastano, e la risposta è «non ancora»', () => {
    // Quattro punti in due mesi: la media esponenziale è ancora quasi ferma sul
    // primo valore, e una velocità ricavata da lì sarebbe inventata.
    const a = andamentoPeso(pesoDiTendenza([
      { data: '2026-07-01', peso: 75.0 },
      { data: '2026-07-15', peso: 74.2 },
      { data: '2026-08-01', peso: 73.6 },
      { data: '2026-08-29', peso: 73.0 },
    ]));
    expect(a.abbastanza).toBe(false);
  });

  it('con una pesata sola non inventa una velocità', () => {
    const a = andamentoPeso(pesoDiTendenza([{ data: '2026-08-29', peso: 73 }]));
    expect(a.perSettimana).toBe(0);
    expect(a.abbastanza).toBe(false);
    expect(a.ultimo).not.toBeNull();
  });

  it('senza nessuna pesata non esplode', () => {
    const a = andamentoPeso([]);
    expect(a.abbastanza).toBe(false);
    expect(a.ultimo).toBeNull();
  });

  it('un movimento sotto i cinquanta grammi a settimana è rumore, non andamento', () => {
    // Due mesi per venti grammi: dirlo come velocità sarebbe vendere la
    // bilancia per un risultato.
    const a = andamentoPeso(pesoDiTendenza([
      { data: '2026-06-29', peso: 73.0 },
      { data: '2026-08-29', peso: 72.98 },
    ]));
    expect(a.abbastanza).toBe(false);
  });
});

describe('il quadro non contraddice il profilo', () => {
  const energia = riepilogo(PROFILO, OGGI, { kcalSgarri: 900 });
  const conto = { totale: 900, quante: 3, giorni: 99 };
  const q = cruscotto({
    profilo: PROFILO, energia, tendenza: pesoDiTendenza(PESATE), arretrati: conto,
  });

  it('i giorni all’obiettivo sono quelli del riepilogo, non un secondo conto', () => {
    expect(q.traguardo.giorni).toBe(energia.traguardo.giorni);
    expect(q.traguardo.data).toBe(energia.traguardo.data);
  });

  it('le tre parti sommano al totale: è la scomposizione, non tre numeri sciolti', () => {
    const { base, avvio, sgarri } = q.traguardo;
    expect(base + avvio + sgarri).toBe(q.traguardo.giorni);
  });

  it('i giorni degli sgarri vengono dal traguardo, non ricontati a parte', () => {
    // `conto.giorni` è volutamente assurdo: se il cruscotto lo usasse, si
    // vedrebbe. Il numero giusto lo sa solo chi conosce il deficit.
    expect(q.sgarri.giorni).toBe(energia.traguardo.parti.sgarri);
    expect(q.sgarri.giorni).not.toBe(99);
    expect(q.sgarri.kcal).toBe(900);
  });

  it('basale, consumo e bersaglio sono quelli del riepilogo', () => {
    expect(q.motore.bmr).toBe(energia.bmr);
    expect(q.motore.tdee).toBe(energia.tdee);
    expect(q.motore.target).toBe(energia.fabbisogno.target);
    expect(q.motore.floor).toBe(energia.fabbisogno.floor);
  });

  it('attività e ritmo si dicono con le parole del catalogo, non con gli id', () => {
    expect(q.motore.attivita).toBe(LAF.sedentaria.testo);
    expect(q.motore.ritmo).toBe(RITMI.regolare.testo);
  });
});

describe('quello che non c’è non si dice', () => {
  const energia = riepilogo(PROFILO, OGGI);

  it('senza sgarri arretrati il riquadro degli sgarri non esiste', () => {
    const q = cruscotto({ profilo: PROFILO, energia, arretrati: { totale: 0, quante: 0, giorni: 0 } });
    expect(q.sgarri).toBeNull();
  });

  it('senza avvio graduale il traguardo non porta giorni di rampa', () => {
    const q = cruscotto({ profilo: PROFILO, energia });
    expect(q.traguardo.avvio).toBe(0);
    expect(q.motore.avvio).toBeNull();
  });

  it('con l’avvio acceso li porta, e dice a che settimana sei', () => {
    const conAvvio = riepilogo(
      { ...PROFILO, avvioGraduale: { attivo: true, dal: '2026-08-17', settimane: 4 } }, OGGI,
    );
    const q = cruscotto({ profilo: PROFILO, energia: conAvvio });
    expect(q.traguardo.avvio).toBeGreaterThan(0);
    expect(q.motore.avvio.di).toBe(4);
  });

  it('senza allergie e senza famiglia gli elenchi sono vuoti, non finti', () => {
    const q = cruscotto({ profilo: PROFILO, energia });
    expect(q.vincoli.classi).toEqual([]);
    expect(q.vincoli.singoli).toEqual([]);
    expect(q.famiglia.seguo).toBeNull();
    expect(q.famiglia.seguaci).toEqual([]);
  });

  it('senza niente in mano non esplode: è la prima apertura dell’app', () => {
    expect(() => cruscotto()).not.toThrow();
    expect(cruscotto().traguardo).toBeNull();
  });
});

describe('i vincoli si vedono, perché sono la parte che conta', () => {
  it('le classi di allergeni si dicono col loro nome', () => {
    const q = cruscotto({
      profilo: PROFILO,
      energia: riepilogo(PROFILO, OGGI),
      preferenze: { classiAllergeni: ['glutine', 'latte'], allergie: [] },
    });
    expect(q.vincoli.classi).toEqual(['Glutine', 'Latte e derivati']);
  });

  it('una bandiera bloccante arriva fin qui, invece di restare nel profilo', () => {
    const conBandiera = riepilogo({ ...PROFILO, bandiere: { gravidanza: true } }, OGGI);
    const q = cruscotto({ profilo: PROFILO, energia: conBandiera });
    expect(q.vincoli.bloccante).toBe(true);
    expect(q.vincoli.messaggio).toBeTruthy();
  });
});

describe('la famiglia', () => {
  it('dice chi segui e chi ti segue, per nome', () => {
    const q = cruscotto({
      profilo: PROFILO,
      energia: riepilogo(PROFILO, OGGI),
      riferimento: { nome: 'Carmela' },
      seguaci: [{ nome: 'Nina' }, { nome: 'Tommaso' }],
    });
    expect(q.famiglia.seguo).toBe('Carmela');
    expect(q.famiglia.seguaci).toEqual(['Nina', 'Tommaso']);
  });
});
