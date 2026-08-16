import { describe, it, expect } from 'vitest';
import {
  generaSettimana, kcalGiorno, kcalSettimana, valoriGiorno, tutteLeVoci,
  conteggiSettimana, inizioSettimana, iso, categorieDi, GIORNI_VARIETA,
  PORZIONE_MIN, PORZIONE_MAX, PORZIONE_ASSOLUTA_MIN,
  ribilanciaGiorno, applicaRibilanciamento, vociConChiave, voceFlessibile,
} from '../js/planner.js';
import { piatti, valoriVoce, porzioniPerGrammi, dosePrincipale } from '../js/alimenti.js';
import { vuote, imposta, alternaAllergia } from '../js/preferenze.js';
import { generatore, pescaPesato, semeDaTesto } from '../js/casuale.js';

const PREF = vuote('p_test');
const BASE = { target: 1700, floor: 1300, preferenze: PREF, mese: 6, seme: 42 };
const INIZIO = new Date('2026-07-27T00:00:00'); // un lunedì

function genera(extra = {}) {
  return generaSettimana({ ...BASE, inizio: INIZIO, ...extra });
}

describe('casualità riproducibile', () => {
  it('lo stesso seme dà la stessa sequenza', () => {
    const a = generatore(7); const b = generatore(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('semi diversi divergono', () => {
    expect(generatore(1)()).not.toBe(generatore(2)());
  });

  it('un peso nullo non viene mai estratto', () => {
    const rnd = generatore(3);
    const estratti = new Set();
    for (let i = 0; i < 200; i++) estratti.add(pescaPesato(['a', 'b'], [0, 1], rnd));
    expect([...estratti]).toEqual(['b']);
  });

  it('un testo dà un seme stabile', () => {
    expect(semeDaTesto('carmela')).toBe(semeDaTesto('carmela'));
  });
});

describe('struttura della settimana', () => {
  const s = genera();

  it('sono sette giorni, dal lunedì', () => {
    expect(s.giorni).toHaveLength(7);
    expect(s.giorni[0].etichetta).toBe('lun');
    expect(s.giorni[0].data).toBe('2026-07-27');
    expect(s.giorni[6].data).toBe('2026-08-02');
  });

  it('ogni giorno ha i cinque momenti, e nessuno è vuoto', () => {
    for (const g of s.giorni) {
      expect(Object.keys(g.pasti)).toEqual([
        'colazione', 'spuntino-mattina', 'pranzo', 'spuntino-pomeriggio', 'cena',
      ]);
      for (const [pasto, voci] of Object.entries(g.pasti)) {
        expect(voci.length, `${g.etichetta} ${pasto} è vuoto`).toBeGreaterThan(0);
        expect(voci.every((v) => v && v.id)).toBe(true);
      }
    }
  });

  it('pranzo e cena hanno sempre un contorno', () => {
    for (const g of s.giorni) {
      for (const pasto of ['pranzo', 'cena']) {
        const tipi = g.pasti[pasto]
          .filter((v) => v.tipo === 'piatto')
          .map((v) => piatti.find((p) => p.id === v.id)?.tipo);
        expect(tipi, `${g.etichetta} ${pasto}`).toContain('contorno');
      }
    }
  });

  it('lo stesso seme rigenera la settimana identica', () => {
    const a = JSON.stringify(genera());
    const b = JSON.stringify(genera());
    expect(a).toBe(b);
  });

  it('un seme diverso cambia il piano', () => {
    expect(JSON.stringify(genera())).not.toBe(JSON.stringify(genera({ seme: 99 })));
  });
});

describe('vincoli di sicurezza sul piano', () => {
  it('nessun giorno scende sotto il pavimento calorico', () => {
    for (const seme of [1, 2, 3, 17, 256]) {
      const s = genera({ seme });
      for (const g of s.giorni) {
        expect(kcalGiorno(g), `seme ${seme}, ${g.etichetta}`).toBeGreaterThanOrEqual(s.floor - 1);
      }
    }
  });

  it('le porzioni restano dentro i limiti dichiarati', () => {
    for (const seme of [1, 42, 77]) {
      const s = genera({ seme });
      for (const g of s.giorni) {
        for (const v of tutteLeVoci(g)) {
          // Il secondo passo della calibrazione puo' scendere sotto il minimo
          // del primo, ma mai sotto il minimo assoluto.
          expect(v.porzioni).toBeGreaterThanOrEqual(PORZIONE_ASSOLUTA_MIN);
          expect(v.porzioni).toBeLessThanOrEqual(PORZIONE_MAX);
        }
      }
    }
  });

  it('la settimana sta vicina al bersaglio, non a caso', () => {
    const s = genera();
    const medio = kcalSettimana(s) / 7;
    expect(Math.abs(medio - 1700) / 1700).toBeLessThan(0.1);
  });

  it('la calibrazione tiene su molti semi e su target diversi', () => {
    // E' il test di qualita' del generatore: un giorno molto sopra il target
    // vanifica il senso del piano, e capita proprio ai target bassi, dove le
    // porzioni fisse da sole rischiano di sforare.
    for (const target of [1400, 1700, 2200]) {
      const scarti = [];
      for (let seme = 1; seme <= 30; seme++) {
        const s = generaSettimana({
          target, floor: Math.round(target * 0.95), preferenze: PREF,
          mese: 7, seme, inizio: INIZIO,
        });
        for (const g of s.giorni) scarti.push((kcalGiorno(g) - target) / target);
      }
      const peggiore = Math.max(...scarti.map(Math.abs));
      const fuori = scarti.filter((v) => Math.abs(v) > 0.12).length;
      expect(peggiore, `target ${target}: scarto massimo`).toBeLessThan(0.2);
      expect(fuori / scarti.length, `target ${target}: giorni fuori dal 12%`).toBeLessThan(0.1);
    }
  });

  it('ogni giorno arriva a un apporto proteico sensato', () => {
    const s = genera();
    for (const g of s.giorni) {
      expect(valoriGiorno(g).pro, g.etichetta).toBeGreaterThan(45);
    }
  });
});

describe('preferenze rispettate dal generatore', () => {
  it('un piatto escluso non compare mai', () => {
    const pref = imposta(vuote('p'), 'piatti', 'genovese', 'escluso');
    for (const seme of [1, 5, 9, 33]) {
      const s = generaSettimana({ ...BASE, preferenze: pref, seme, inizio: INIZIO });
      const usati = s.giorni.flatMap((g) => tutteLeVoci(g).map((v) => v.id));
      expect(usati).not.toContain('genovese');
    }
  });

  it('un allergene non compare in nessun piatto', () => {
    const pref = alternaAllergia(vuote('p'), 'uova');
    const s = generaSettimana({ ...BASE, preferenze: pref, seme: 11, inizio: INIZIO });
    for (const g of s.giorni) {
      for (const v of tutteLeVoci(g)) {
        if (v.tipo !== 'piatto') continue;
        const p = piatti.find((x) => x.id === v.id);
        expect(p.ingredienti.some((i) => i.a === 'uova'), p.nome).toBe(false);
      }
    }
  });

  it('rispetta i tetti settimanali impostati', () => {
    const pref = { ...vuote('p'), tetti: { ...vuote('p').tetti, 'carne-rossa': 1, pesce: 2 } };
    const s = generaSettimana({ ...BASE, preferenze: pref, seme: 21, inizio: INIZIO });
    const c = conteggiSettimana(s);
    expect(c['carne-rossa'] || 0).toBeLessThanOrEqual(1);
    expect(c.pesce || 0).toBeLessThanOrEqual(2);
  });
});

describe('varietà', () => {
  it('un piatto non si ripete a giorni ravvicinati', () => {
    const s = genera({ seme: 5 });
    const ultimo = new Map();
    let violazioni = 0;
    s.giorni.forEach((g, i) => {
      for (const v of tutteLeVoci(g)) {
        if (v.tipo !== 'piatto') continue;
        const prima = ultimo.get(v.id);
        if (prima !== undefined && i - prima < GIORNI_VARIETA) violazioni++;
        ultimo.set(v.id, i);
      }
    });
    // Zero e' impossibile da garantire quando i candidati finiscono, ma
    // devono restare casi isolati.
    expect(violazioni).toBeLessThan(4);
  });
});

describe('stagionalità', () => {
  it('a gennaio i piatti estivi sono rari', () => {
    const s = generaSettimana({ ...BASE, mese: 1, seme: 8, inizio: INIZIO });
    const fuoriStagione = s.giorni.flatMap((g) => tutteLeVoci(g))
      .filter((v) => v.tipo === 'piatto')
      .map((v) => piatti.find((p) => p.id === v.id))
      .filter((p) => Array.isArray(p?.stagione) && !p.stagione.includes(1));
    expect(fuoriStagione.length).toBeLessThan
      ? expect(fuoriStagione.length).toBeLessThan(6)
      : null;
  });
});

describe('date', () => {
  it('inizioSettimana torna sempre al lunedì', () => {
    for (const giorno of ['2026-07-27', '2026-07-29', '2026-08-02']) {
      const d = inizioSettimana(new Date(`${giorno}T12:00:00`));
      expect(iso(d)).toBe('2026-07-27');
    }
  });
});

describe('categorie a tetto', () => {
  it('riconosce il pesce e la carne rossa dagli ingredienti', () => {
    const alici = piatti.find((p) => p.id === 'alici-al-forno');
    expect([...categorieDi(alici)]).toContain('pesce');
    const genovese = piatti.find((p) => p.id === 'genovese');
    expect([...categorieDi(genovese)]).toContain('carne-rossa');
  });
});

describe('voci del piano', () => {
  it('un alimento singolo scala con le porzioni', () => {
    const uno = valoriVoce({ tipo: 'alimento', id: 'pane', porzioni: 1 });
    const due = valoriVoce({ tipo: 'alimento', id: 'pane', porzioni: 2 });
    // L'arrotondamento avviene dopo la moltiplicazione, come deve: 137,5 kcal
    // arrotondato una volta non e' esattamente la meta' di 275.
    expect(due.kcal).toBeCloseTo(uno.kcal * 2, -0.5);
    expect(Math.abs(due.kcal - uno.kcal * 2)).toBeLessThanOrEqual(1);
  });
});

/* --- Riequilibrio di una giornata sola --------------------------------------
   Serve quando una quantita' la decide una persona: «di pasta ne ho fatti
   100 g, non 40». Il resto della giornata si riassesta, ma senza toccare
   quello che e' gia' stato mangiato o gia' deciso.
   -------------------------------------------------------------------------- */

describe('riequilibrio di una giornata', () => {
  const giornoDi = (opzioni = {}) => genera(opzioni).giorni[0];

  it('non tocca mai una voce dichiarata ferma', () => {
    const g = giornoDi();
    const flessibili = vociConChiave(g).filter((x) => voceFlessibile(x.voce));
    const ferma = flessibili[0];
    const prima = ferma.voce.porzioni;

    const esito = ribilanciaGiorno(g, 1200, { ferme: new Set([ferma.chiave]) });

    expect(esito.porzioni.map((p) => p.chiave)).not.toContain(ferma.chiave);
    applicaRibilanciamento(g, esito);
    expect(ferma.voce.porzioni).toBe(prima);
  });

  it('non tocca le voci già mangiate', () => {
    const g = giornoDi();
    const chiavi = vociConChiave(g).filter((x) => voceFlessibile(x.voce)).map((x) => x.chiave);
    const mangiate = new Set(chiavi.slice(0, 2));

    const esito = ribilanciaGiorno(g, 1100, { ferme: mangiate });
    for (const c of mangiate) {
      expect(esito.porzioni.map((p) => p.chiave)).not.toContain(c);
    }
  });

  it('nessuna porzione esce mai dai limiti, per quanto assurdo sia il bersaglio', () => {
    for (const bersaglio of [200, 800, 1500, 2500, 9000]) {
      const esito = ribilanciaGiorno(giornoDi(), bersaglio);
      for (const p of esito.porzioni) {
        // Come in `calibra`: il secondo passo puo' scendere sotto il minimo del
        // primo, ma mai sotto il minimo assoluto.
        expect(p.a, `bersaglio ${bersaglio}`).toBeGreaterThanOrEqual(PORZIONE_ASSOLUTA_MIN);
        expect(p.a, `bersaglio ${bersaglio}`).toBeLessThanOrEqual(PORZIONE_MAX);
      }
    }
  });

  it('alleggerisce anche i secondi quando i soli carboidrati non bastano', () => {
    // E' il secondo passo di `calibra`, che qui mancava: senza, una giornata
    // molto sopra il bersaglio restava sopra e basta.
    const g = giornoDi();
    const esito = ribilanciaGiorno(g, 700);
    const tocca = esito.porzioni.filter((p) => {
      const x = vociConChiave(g).find((v) => v.chiave === p.chiave);
      return !voceFlessibile(x.voce);
    });
    expect(tocca.length).toBeGreaterThan(0);
    expect(tocca.every((p) => p.a < 1)).toBe(true);
  });

  it('il pavimento vince sul bersaglio', () => {
    const esito = ribilanciaGiorno(giornoDi(), 400, { floor: 1300 });
    // Il bersaglio effettivo e' il pavimento, non i 400 chiesti.
    expect(esito.kcalDopo).toBeGreaterThan(900);
  });

  it('avendo mangiato di più, il residuo è quello che la giornata non riassorbe', () => {
    const g = giornoDi();
    const grosso = vociConChiave(g).find((x) => voceFlessibile(x.voce));
    grosso.voce.porzioni = 6;           // una porzione fuori scala, decisa a mano
    grosso.voce.fissata = true;

    const esito = ribilanciaGiorno(g, 1700, { ferme: new Set([grosso.chiave]) });

    expect(esito.residuo).toBeGreaterThan(0);
    expect(esito.alLimite).toBe(true);
    // Il residuo e' davvero la distanza dal bersaglio, non un numero inventato.
    expect(esito.kcalDopo - 1700).toBe(esito.residuo);
  });

  it('avendo mangiato di meno, i pasti che restano salgono ma non oltre il massimo', () => {
    const g = giornoDi();
    const piccolo = vociConChiave(g).find((x) => voceFlessibile(x.voce));
    piccolo.voce.porzioni = 0.1;
    piccolo.voce.fissata = true;

    const esito = ribilanciaGiorno(g, 1700, { ferme: new Set([piccolo.chiave]) });

    for (const p of esito.porzioni) {
      expect(p.a).toBeGreaterThanOrEqual(p.da);   // salgono, non scendono
      expect(p.a).toBeLessThanOrEqual(PORZIONE_MAX);
    }
  });

  it('non inventa un riequilibrio quando non c’è niente da muovere', () => {
    const g = giornoDi();
    const tutte = new Set(vociConChiave(g).map((x) => x.chiave));
    const esito = ribilanciaGiorno(g, 900, { ferme: tutte });

    expect(esito.porzioni).toEqual([]);
    expect(esito.kcalDopo).toBe(esito.kcalPrima);
    expect(esito.alLimite).toBe(true);
  });

  it('anteprima e applicazione danno lo stesso identico risultato', () => {
    // E' il motivo per cui la funzione non applica: se anteprima e conferma
    // divergessero, l'utente confermerebbe una cosa e ne otterrebbe un'altra.
    const g = giornoDi();
    const esito = ribilanciaGiorno(g, 1400);
    applicaRibilanciamento(g, esito);
    expect(kcalGiorno(g)).toBe(esito.kcalDopo);
  });

  it('non cancella l’extra di un giorno di sgarro', () => {
    const g = giornoDi();
    g.stato = 'sgarro';
    g.quota = 2600;                     // kcal del giorno + lo sgarro registrato
    applicaRibilanciamento(g, ribilanciaGiorno(g, 1400));
    expect(g.quota).toBe(2600);
  });
});

describe('dai grammi alle porzioni', () => {
  it('scrivere il doppio dei grammi raddoppia le porzioni', () => {
    const voce = { tipo: 'piatto', id: 'pasta-puttanesca', porzioni: 0.5 };
    const previsti = dosePrincipale({ ...voce, porzioni: 1 }).grammi;

    expect(porzioniPerGrammi(voce, previsti)).toBeCloseTo(1, 5);
    expect(porzioniPerGrammi(voce, previsti * 2)).toBeCloseTo(2, 5);
    // Zero e' un caso vero: «non l'ho mangiato».
    expect(porzioniPerGrammi(voce, 0)).toBe(0);
  });

  it('non arrotonda: i grammi scritti tornano quelli', () => {
    const voce = { tipo: 'piatto', id: 'pasta-puttanesca', porzioni: 1 };
    for (const g of [37, 55, 93, 117]) {
      const p = porzioniPerGrammi(voce, g);
      expect(dosePrincipale({ ...voce, porzioni: p }).grammi).toBe(g);
    }
  });
});
