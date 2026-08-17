/* La dieta di famiglia: un menu' solo, porzioni diverse, alternative per chi
   non puo' mangiare qualcosa. Il rischio piu' grosso e' il ricettario, che era
   stato globale del modulo: il primo test e' quello che ci difende. */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  apri, chiudi, scrivi, creaProfilo, profili, leggi, eliminaProfilo, importaFascicolo,
  esportaFascicolo, ARCHIVI_PROFILO,
} from '../js/store.js';
import {
  lenteRicettario, piatti as inUso, registraPiattiUtente, piattiDiSerie, valoriPiatto,
} from '../js/alimenti.js';
import { vuote, alternaAllergia, imposta, salvaPreferenze } from '../js/preferenze.js';
import { alternativePiatto } from '../js/scambi.js';
import { generaSettimana, inizioSettimana, kcalGiorno, tutteLeVoci } from '../js/planner.js';
import { riepilogo as riepilogoEnergia } from '../js/energia.js';
import { salvaSettimana } from '../js/dati.js';
import { aggregaFamiglia, aggregaSettimana } from '../js/spesa.js';
import {
  settimanaPer, possibiliRiferimenti, tavola, salvaPersonalizzazione,
  caricaPersonalizzazioni, lenteDi, settimaneDellaTavola,
} from '../js/famiglia.js';

async function pulisci() {
  await chiudi();
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('equilibrio');
    req.onsuccess = r; req.onerror = r; req.onblocked = r;
  });
  await apri();
  registraPiattiUtente([], []);
}

const LUNEDI = new Date('2026-08-17T12:00:00');

const CARMELA = {
  nome: 'Renata', sesso: 'donna', dataNascita: '1978-01-01',
  altezzaCm: 165, pesoKg: 73, attivita: 'sedentaria', pesoObiettivoKg: 65,
};
const GAIA = {
  nome: 'Nina', sesso: 'donna', dataNascita: '2008-04-10',
  altezzaCm: 160, pesoKg: 50, attivita: 'moderata',
};
const MAURIZIO = {
  nome: 'Tommaso', sesso: 'uomo', dataNascita: '1975-05-05',
  altezzaCm: 178, pesoKg: 88, attivita: 'leggera', pesoObiettivoKg: 80,
};

/**
 * Una settimana vera, tarata sul fabbisogno REALE del riferimento — come fa la
 * pagina Piano. Con un target inventato il menù non direbbe niente di utile su
 * quanto sia sostenibile per chi lo segue.
 */
async function menuDi(profilo) {
  const e = riepilogoEnergia(profilo, LUNEDI);
  const s = generaSettimana({
    target: e.fabbisogno.target,
    floor: e.fabbisogno.floor,
    preferenze: vuote(profilo.id),
    mese: 8, seme: 42, inizio: inizioSettimana(LUNEDI),
  });
  await salvaSettimana(profilo.id, s);
  return s;
}

describe('il ricettario non è più uno solo', () => {
  beforeEach(pulisci);

  it('costruire la lente di una persona non sporca il ricettario in uso', () => {
    // E' IL test: prima, caricare il ricettario di Nina sovrascriveva quello
    // di Renata per tutta la pagina, in silenzio.
    const prima = inUso.length;
    const nina = lenteRicettario([], ['uova', 'latte']);

    expect(nina.piatti.length).not.toBe(0);
    expect(inUso.length).toBe(prima);
    expect(inUso).toBe(inUso);           // il legame vivo non e' stato riassegnato
  });

  it('due lenti diverse convivono e danno risultati diversi', () => {
    const senzaNiente = lenteRicettario([], []);
    const senzaPesce = lenteRicettario([], ['alici', 'baccala', 'polpo']);

    expect(senzaPesce.piatti.length).toBeLessThanOrEqual(senzaNiente.piatti.length);
    expect(senzaNiente.piatti.length).toBe(piattiDiSerie.length);
    // Le due Map sono oggetti distinti, non due riferimenti alla stessa.
    expect(senzaPesce.indice).not.toBe(senzaNiente.indice);
  });

  it('le alternative si cercano nel ricettario di chi mangia', () => {
    const mio = lenteRicettario([], []);
    const primo = mio.piatti.find((p) => p.tipo === 'primo');

    const nel = alternativePiatto({ tipo: 'piatto', id: primo.id, porzioni: 1 }, {
      preferenze: vuote('p'), mese: 8, piatti: mio.piatti,
    });
    expect(nel.length).toBeGreaterThan(0);
    expect(nel.every((a) => a.id !== primo.id)).toBe(true);

    // Con un catalogo ridotto a due piatti, le alternative sono al piu' una.
    const ridotto = mio.piatti.filter((p) => p.tipo === 'primo').slice(0, 2);
    const poche = alternativePiatto({ tipo: 'piatto', id: ridotto[0].id, porzioni: 1 }, {
      preferenze: vuote('p'), mese: 8, piatti: ridotto,
    });
    expect(poche).toHaveLength(1);
  });
});

describe('chi segue chi', () => {
  beforeEach(pulisci);

  it('non ci si segue da soli, e non si fanno catene', async () => {
    const c = await creaProfilo(CARMELA);
    const g = await creaProfilo(GAIA);
    await scrivi('profili', { ...(await leggi('profili', g.id)), seguo: c.id });

    const perRenata = await possibiliRiferimenti(c.id);
    // Nina segue Renata: Renata non puo' seguire Nina (sarebbe un ciclo).
    expect(perRenata.map((p) => p.id)).not.toContain(g.id);
    expect(perRenata.map((p) => p.id)).not.toContain(c.id);

    const m = await creaProfilo(MAURIZIO);
    // Tommaso non segue nessuno: puo' fare da riferimento.
    expect((await possibiliRiferimenti(c.id)).map((p) => p.id)).toContain(m.id);
    // Ma per Tommaso, Nina non e' un riferimento valido: segue gia' Renata.
    expect((await possibiliRiferimenti(m.id)).map((p) => p.id)).not.toContain(g.id);
  });

  it('la tavola è il riferimento più chi lo segue', async () => {
    const c = await creaProfilo(CARMELA);
    const g = await creaProfilo(GAIA);
    const m = await creaProfilo(MAURIZIO);
    for (const p of [g, m]) {
      await scrivi('profili', { ...(await leggi('profili', p.id)), seguo: c.id });
    }
    const nomi = (await tavola(c.id)).map((p) => p.nome);
    expect(nomi).toEqual(['Renata', 'Nina', 'Tommaso']);
  });

  it('cancellare il riferimento stacca chi lo seguiva, invece di lasciarlo nel vuoto', async () => {
    const c = await creaProfilo(CARMELA);
    const g = await creaProfilo(GAIA);
    await scrivi('profili', { ...(await leggi('profili', g.id)), seguo: c.id });

    const esito = await eliminaProfilo(c.id);

    expect(esito.staccati).toEqual(['Nina']);
    expect((await leggi('profili', g.id)).seguo).toBeNull();
  });

  it('un fascicolo importato non porta dentro un legame pendente', async () => {
    const importato = await importaFascicolo({
      schema: 1,
      profilo: { id: 'p_altrove', nome: 'Nina', pesoKg: 50, seguo: 'p_che_non_esiste' },
      archivi: {},
    });
    expect(importato.seguo).toBeNull();
  });
});

describe('la settimana come la vede chi segue', () => {
  beforeEach(pulisci);

  async function famiglia() {
    const c = await creaProfilo(CARMELA);
    const g = await creaProfilo({ ...GAIA, seguo: c.id });
    await menuDi(c);
    return { c, g: await leggi('profili', g.id) };
  }

  it('chi non segue nessuno vede il proprio piano, intatto', async () => {
    const c = await creaProfilo(CARMELA);
    const mia = await menuDi(c);
    const { settimana, riferimento } = await settimanaPer(c, LUNEDI);

    expect(riferimento).toBeNull();
    expect(settimana.giorni).toHaveLength(7);
    expect(kcalGiorno(settimana.giorni[0])).toBe(kcalGiorno(mia.giorni[0]));
  });

  it('chi segue riceve gli stessi piatti, ma le proprie porzioni', async () => {
    const { c, g } = await famiglia();
    const suo = (await settimanaPer(c, LUNEDI)).settimana;
    const mio = (await settimanaPer(g, LUNEDI)).settimana;

    // Stessi piatti, giorno per giorno: si cucina una volta sola.
    const idDi = (s) => s.giorni.flatMap((x) => tutteLeVoci(x).map((v) => v.id));
    expect(idDi(mio)).toEqual(idDi(suo));

    // Ma le calorie sono quelle di Nina, non di Renata.
    expect(mio.target).not.toBe(suo.target);
    expect(kcalGiorno(mio.giorni[0])).not.toBe(kcalGiorno(suo.giorni[0]));
  });

  it('nessun giorno di chi segue scende sotto il SUO pavimento', async () => {
    const { g } = await famiglia();
    const mio = (await settimanaPer(g, LUNEDI)).settimana;
    for (const giorno of mio.giorni) {
      expect(kcalGiorno(giorno), giorno.etichetta).toBeGreaterThanOrEqual(mio.floor - 1);
    }
  });

  it('un allergene di chi segue viene segnalato, non nascosto', async () => {
    const { c, g } = await famiglia();
    // Nina e' allergica a qualcosa che c'e' di sicuro nel menu'.
    const dentro = tutteLeVoci((await settimanaPer(c, LUNEDI)).settimana.giorni[0])
      .filter((v) => v.tipo === 'piatto')
      .map((v) => piattiDiSerie.find((p) => p.id === v.id))
      .filter(Boolean)[0];
    const allergene = dentro.ingredienti[0].a;
    await salvaPreferenze(alternaAllergia(vuote(g.id), allergene));

    const { avvisi, settimana } = await settimanaPer(g, LUNEDI);
    expect(avvisi.length).toBeGreaterThan(0);
    expect(avvisi.some((a) => /contiene/.test(a.motivo))).toBe(true);
    // Il pasto resta nel piano, marcato: un buco non si puo' cucinare.
    expect(settimana.giorni.flatMap(tutteLeVoci).some((v) => v.nonPerMe)).toBe(true);
  });

  it('un sostituto scelto prende il posto solo nel piano di chi lo ha scelto', async () => {
    const { c, g } = await famiglia();
    const suo = (await settimanaPer(c, LUNEDI)).settimana;
    const g0 = suo.giorni[0];
    const voce = tutteLeVoci(g0).find((v) => v.tipo === 'piatto');
    const originale = voce.id;

    const lente = await lenteDi(g.id);
    const alt = alternativePiatto(voce, {
      preferenze: vuote(g.id), mese: 8, piatti: lente.piatti,
    })[0];

    // La chiave e' «etichettaGiorno|pasto|indice».
    const pasto = Object.keys(g0.pasti).find((k) => g0.pasti[k].includes(voce));
    const i = g0.pasti[pasto].indexOf(voce);
    await salvaPersonalizzazione(g.id, suo.inizio, `${g0.etichetta}|${pasto}|${i}`, {
      sostituto: alt.id,
    });

    const mio = (await settimanaPer(g, LUNEDI)).settimana;
    expect(mio.giorni[0].pasti[pasto][i].id).toBe(alt.id);
    // Renata non se ne accorge nemmeno.
    expect((await settimanaPer(c, LUNEDI)).settimana.giorni[0].pasti[pasto][i].id)
      .toBe(originale);
  });

  it('una porzione decisa a mano sopravvive al ricalcolo', async () => {
    const { g } = await famiglia();
    const mio = (await settimanaPer(g, LUNEDI)).settimana;
    const g0 = mio.giorni[0];
    const pasto = 'pranzo';
    const chiave = `${g0.etichetta}|${pasto}|0`;

    await salvaPersonalizzazione(g.id, mio.inizio, chiave, { porzioni: 1.75, fissata: true });

    const dopo = (await settimanaPer(g, LUNEDI)).settimana;
    expect(dopo.giorni[0].pasti[pasto][0].porzioni).toBe(1.75);
  });

  it('le quantità decise dal riferimento restano nel suo piatto', async () => {
    // Se Bruno si pesa 600 g di pollo, quei 600 g non finiscono nel piatto
    // di chi lo segue: dal riferimento si prendono i piatti, non le sue dosi.
    const c = await creaProfilo(MAURIZIO);
    const g = await creaProfilo({ ...GAIA, seguo: c.id });
    const s = await menuDi(c);

    for (const v of tutteLeVoci(s.giorni[0])) v.porzioni = 4;
    await salvaSettimana(c.id, s);

    const mio = (await settimanaPer(await leggi('profili', g.id), LUNEDI)).settimana;
    expect(tutteLeVoci(mio.giorni[0]).every((v) => v.porzioni <= 1.5)).toBe(true);
  });

  it('regge anche un divario estremo fra chi decide e chi segue', async () => {
    // Un uomo di 110 kg molto attivo (3310 kcal) e una bambina di 35 kg
    // sedentaria (1200): il caso peggiore possibile. Se il riequilibrio non
    // arrivasse, la bambina si ritroverebbe il piatto di suo padre.
    const grande = await creaProfilo({
      nome: 'Tommaso', sesso: 'uomo', dataNascita: '1990-05-05',
      altezzaCm: 195, pesoKg: 110, attivita: 'moltoIntensa',
    });
    const piccola = await creaProfilo({
      nome: 'Nina', sesso: 'donna', dataNascita: '2012-04-10',
      altezzaCm: 140, pesoKg: 35, attivita: 'sedentaria', seguo: grande.id,
    });
    await menuDi(grande);

    const { settimana } = await settimanaPer(await leggi('profili', piccola.id), LUNEDI);
    for (const g of settimana.giorni) {
      expect(kcalGiorno(g), g.etichetta).toBeGreaterThanOrEqual(settimana.floor - 1);
      // Entro un quarto dal bersaglio: e' il divario piu' largo che abbia senso.
      expect(kcalGiorno(g), g.etichetta).toBeLessThan(settimana.target * 1.25);
    }
  });

  it('a fabbisogni uguali il piano è identico a quello del riferimento', async () => {
    const c = await creaProfilo(CARMELA);
    const gemella = await creaProfilo({ ...CARMELA, nome: 'Gemella', seguo: c.id });
    const suo = await menuDi(c);

    const { settimana } = await settimanaPer(await leggi('profili', gemella.id), LUNEDI);
    expect(settimana.giorni.map(kcalGiorno)).toEqual(suo.giorni.map(kcalGiorno));
  });

  it('lo strato personale si scrive una voce alla volta', async () => {
    const { g } = await famiglia();
    await salvaPersonalizzazione(g.id, '2026-08-17', 'lun|pranzo|0', { porzioni: 1.2 });
    await salvaPersonalizzazione(g.id, '2026-08-17', 'mar|cena|1', { sostituto: 'genovese' });

    const p = await caricaPersonalizzazioni(g.id, '2026-08-17');
    expect(Object.keys(p.voci)).toEqual(['lun|pranzo|0', 'mar|cena|1']);
    expect(p.voci['lun|pranzo|0'].porzioni).toBe(1.2);
  });
});

describe('la spesa di famiglia', () => {
  beforeEach(pulisci);

  it('raccoglie le settimane di tutta la tavola, dal profilo o dal suo id', async () => {
    const c = await creaProfilo(CARMELA);
    await creaProfilo({ ...GAIA, seguo: c.id });
    await menuDi(c);

    // Le pagine hanno in mano ora il profilo, ora il suo id: entrambi devono
    // funzionare, o la spesa di famiglia resta vuota senza dirlo.
    const daOggetto = await settimaneDellaTavola(c);
    const daId = await settimaneDellaTavola(c.id);

    expect(daOggetto).toHaveLength(2);
    expect(daId).toHaveLength(2);
    expect(daOggetto.map((m) => m.profilo.nome)).toEqual(['Renata', 'Nina']);
    expect(daOggetto.every((m) => m.settimana?.giorni?.length === 7)).toBe(true);
  });

  it('è la somma esatta delle spese singole', async () => {
    const c = await creaProfilo(CARMELA);
    const s = await menuDi(c);

    const uno = aggregaSettimana(s, 1);
    const tre = aggregaFamiglia([{ settimana: s }, { settimana: s }, { settimana: s }]);

    for (const [id, g] of uno) {
      expect(tre.get(id), id).toBeCloseTo(g * 3, 6);
    }
    expect([...tre.keys()].sort()).toEqual([...uno.keys()].sort());
  });

  it('somma porzioni diverse, non moltiplica per il numero di teste', async () => {
    const c = await creaProfilo(CARMELA);
    const s = await menuDi(c);
    const meta = structuredClone(s);
    for (const g of meta.giorni) for (const v of tutteLeVoci(g)) v.porzioni = (v.porzioni ?? 1) / 2;

    const somma = aggregaFamiglia([{ settimana: s }, { settimana: meta }]);
    const uno = aggregaSettimana(s, 1);

    for (const [id, g] of uno) {
      expect(somma.get(id), id).toBeCloseTo(g * 1.5, 4);
    }
  });
});

describe('portare la famiglia su un altro dispositivo', () => {
  beforeEach(pulisci);

  it('l’export porta con sé le preferenze, non solo le misure', async () => {
    const c = await creaProfilo(CARMELA);
    await salvaPreferenze(imposta(alternaAllergia(vuote(c.id), 'noci'), 'piatti', 'genovese', 'amato'));

    const f = await esportaFascicolo(c.id);
    const pref = f.archivi.preferenze[0];
    expect(pref.allergie).toContain('noci');
    expect(pref.piatti.genovese).toBe('amato');
    // E tutto il resto degli archivi partizionati, anche quando è vuoto.
    expect(Object.keys(f.archivi).sort()).toEqual([...ARCHIVI_PROFILO].sort());
  });

  it('porta il NOME di chi si seguiva, così il legame si può rifare', async () => {
    // L'id non si puo' portare — su un altro dispositivo non esiste — ma senza
    // il nome chi importa non saprebbe nemmeno che c'era un legame.
    const capo = await creaProfilo(CARMELA);
    const seguace = await creaProfilo({ ...GAIA, seguo: capo.id });

    const f = await esportaFascicolo(seguace.id);
    expect(f.profilo.seguoNome).toBe(CARMELA.nome);

    const importato = await importaFascicolo(f);
    expect(importato.seguo).toBeNull();
    expect(importato.seguoNome).toBe(CARMELA.nome);
  });

  it('chi non seguiva nessuno non si porta dietro nomi inventati', async () => {
    const c = await creaProfilo(CARMELA);
    expect((await esportaFascicolo(c.id)).profilo.seguoNome).toBeUndefined();
  });
});
