import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  piatti, piattiDiSerie, piatto, registraPiattiUtente, valoriPiatto,
} from '../js/alimenti.js';
import {
  comeVariante, nuovaPietanza, aggiungiIngrediente, cambiaQuantita,
  togliIngrediente, valida, avvertimenti, differenze,
  salvaPietanza, eliminaPietanza, pietanzeDiCasa, caricaRicettario,
  incoerenze, nomeSenza, cambiaProcedimento,
} from '../js/piatti-utente.js';

const P = 'p_test';
const originale = piattiDiSerie.find((p) => p.id === 'pasta-patate-provola');

beforeEach(() => {
  registraPiattiUtente([]);
});

describe('variante di un piatto di serie', () => {
  it('parte identica all’originale, ma con identità propria', () => {
    const v = comeVariante(originale);
    expect(v.nome).toBe(originale.nome);
    expect(v.id).not.toBe(originale.id);
    expect(v.derivatoDa).toBe(originale.id);
    expect(v.origine).toBe('casa');
    expect(valoriPiatto(v).kcal).toBe(valoriPiatto(originale).kcal);
  });

  it('non porta con sé la riga dell’alleggerimento', () => {
    // Quella riga parla della ricetta di serie: se la ricetta cambia non e'
    // piu' vera, e lasciarla sarebbe una bugia sul piatto di casa.
    expect(originale.alleggerimento).toBeTruthy();
    expect(comeVariante(originale).alleggerimento).toBeUndefined();
  });

  it('gli ingredienti sono copie, non riferimenti', () => {
    const v = comeVariante(originale);
    v.ingredienti[0].g = 999;
    expect(originale.ingredienti[0].g).not.toBe(999);
  });
});

describe('modifica degli ingredienti', () => {
  it('cambia una quantità e i valori seguono', () => {
    const prima = valoriPiatto(originale).kcal;
    const v = cambiaQuantita(comeVariante(originale), 'provola', 0);
    expect(valoriPiatto(v).kcal).toBeLessThan(prima);
  });

  it('toglie un ingrediente', () => {
    const v = togliIngrediente(comeVariante(originale), 'provola');
    expect(v.ingredienti.some((i) => i.a === 'provola')).toBe(false);
  });

  it('aggiunge un ingrediente con la sua porzione standard', () => {
    const v = aggiungiIngrediente(comeVariante(originale), 'pecorino');
    const aggiunto = v.ingredienti.find((i) => i.a === 'pecorino');
    expect(aggiunto.g).toBe(15); // porzione standard del pecorino
  });

  it('aggiungere due volte lo stesso alimento somma, non duplica la riga', () => {
    let v = aggiungiIngrediente(comeVariante(originale), 'pecorino', 10);
    v = aggiungiIngrediente(v, 'pecorino', 5);
    const righe = v.ingredienti.filter((i) => i.a === 'pecorino');
    expect(righe).toHaveLength(1);
    expect(righe[0].g).toBe(15);
  });
});

describe('controlli', () => {
  it('serve un nome, un tipo valido e almeno un ingrediente', () => {
    expect(valida({ nome: '', tipo: 'primo', ingredienti: [{ a: 'riso', g: 80 }] }))
      .toContain('Serve un nome.');
    expect(valida({ nome: 'x', tipo: 'inventato', ingredienti: [{ a: 'riso', g: 80 }] }).length)
      .toBeGreaterThan(0);
    expect(valida({ nome: 'x', tipo: 'primo', ingredienti: [] }))
      .toContain('Serve almeno un ingrediente.');
  });

  it('un ingrediente inesistente è un errore', () => {
    const errori = valida({ nome: 'x', tipo: 'primo', ingredienti: [{ a: 'unicorno', g: 50 }] });
    expect(errori.join(' ')).toContain('unicorno');
  });

  it('una pietanza sensata passa', () => {
    expect(valida(comeVariante(originale))).toEqual([]);
  });

  it('gli avvertimenti non bloccano ma si vedono', () => {
    const leggero = { nome: 'Brodo', tipo: 'primo', ingredienti: [{ a: 'sedano', g: 50 }] };
    expect(valida(leggero)).toEqual([]);
    expect(avvertimenti(leggero, valoriPiatto(leggero)).join(' ')).toMatch(/60 kcal/);
  });

  it('dice che la variante prende il posto dell’originale', () => {
    const v = comeVariante(originale);
    expect(avvertimenti(v, valoriPiatto(v)).join(' ')).toContain(originale.nome);
  });
});

describe('differenze rispetto all’originale', () => {
  it('elenca aggiunte, rimozioni e cambi di quantità', () => {
    let v = comeVariante(originale);
    v = togliIngrediente(v, 'provola');
    v = aggiungiIngrediente(v, 'pecorino', 10);
    v = cambiaQuantita(v, 'patate', 250);

    const d = differenze(v).join(' | ');
    expect(d).toMatch(/tolto provola/);
    expect(d).toMatch(/aggiunto pecorino \(10 g\)/);
    expect(d).toMatch(/patate da 200 a 250 g/);
  });

  it('una pietanza nuova non ha differenze da mostrare', () => {
    expect(differenze(nuovaPietanza())).toEqual([]);
  });
});

describe('il ricettario in uso', () => {
  it('la variante copre l’originale: non se ne vedono due', () => {
    const v = comeVariante(originale, { nome: 'Pasta e patate come la faccio io' });
    registraPiattiUtente([v]);

    expect(piatti.filter((p) => p.id === originale.id)).toHaveLength(0);
    expect(piatto(v.id).nome).toBe('Pasta e patate come la faccio io');
    expect(piatti.length).toBe(piattiDiSerie.length);
  });

  it('una pietanza nuova si aggiunge senza coprire niente', () => {
    const n = { ...nuovaPietanza(), nome: 'Zuppa della nonna', ingredienti: [{ a: 'riso', g: 60 }] };
    registraPiattiUtente([n]);
    expect(piatti.length).toBe(piattiDiSerie.length + 1);
    expect(piatto(originale.id)).not.toBeNull();
  });

  it('togliendo la variante l’originale torna', () => {
    registraPiattiUtente([comeVariante(originale)]);
    expect(piatto(originale.id)).toBeNull();
    registraPiattiUtente([]);
    expect(piatto(originale.id)?.nome).toBe(originale.nome);
  });
});

describe('salvataggio su archivio', () => {
  it('salva, rilegge e cancella', async () => {
    const v = comeVariante(originale, { nome: 'La mia pasta e patate' });
    await salvaPietanza(P, togliIngrediente(v, 'provola'));

    const mie = await pietanzeDiCasa(P);
    expect(mie).toHaveLength(1);
    expect(mie[0].nome).toBe('La mia pasta e patate');
    expect(mie[0].ingredienti.some((i) => i.a === 'provola')).toBe(false);
    expect(mie[0].origine).toBe('casa');

    // Registrata nel ricettario in uso, al posto dell'originale.
    await caricaRicettario(P);
    expect(piatto(originale.id)).toBeNull();

    await eliminaPietanza(P, mie[0].id);
    expect(await pietanzeDiCasa(P)).toHaveLength(0);
    expect(piatto(originale.id)).not.toBeNull();
  });

  it('rifiuta di salvare una pietanza non valida', async () => {
    await expect(salvaPietanza(P, { id: 'x', nome: '', tipo: 'primo', ingredienti: [] }))
      .rejects.toThrow();
  });

  it('scarta gli ingredienti a quantità zero', async () => {
    const v = cambiaQuantita(comeVariante(originale), 'provola', 0);
    const salvata = await salvaPietanza(P, v);
    expect(salvata.ingredienti.some((i) => i.a === 'provola')).toBe(false);
    await eliminaPietanza(P, salvata.id);
  });
});

describe('coerenza fra ingredienti, nome e procedimento', () => {
  const colazione = piattiDiSerie.find((p) => p.id === 'caffe-latte-fette');

  it('accorge che il nome cita un ingrediente tolto', () => {
    const v = togliIngrediente(comeVariante(colazione), 'miele');
    const fuori = incoerenze(v);
    const miele = fuori.find((x) => x.alimentoId === 'miele');
    expect(miele, 'il miele tolto dovrebbe essere segnalato').toBeTruthy();
    expect(miele.nelNome).toBe(true);
    expect(miele.parola).toBe('miele');
  });

  it('accorge che un passo cita un ingrediente tolto', () => {
    const originale = piattiDiSerie.find((p) => p.id === 'pasta-patate-provola');
    const v = togliIngrediente(comeVariante(originale), 'provola');
    const provola = incoerenze(v).find((x) => x.alimentoId === 'provola');
    expect(provola).toBeTruthy();
    // «Spegni, aggiungi la provola a dadini…» è il quarto passo.
    expect(provola.passi).toContain(3);
  });

  it('tace se un ingrediente rimasto condivide la parola', () => {
    // Sostituire la pasta di semola con quella integrale non rende falso il
    // nome «Pasta e fagioli»: la parola c'è ancora, sul piatto e nel piatto.
    let v = comeVariante(piattiDiSerie.find((p) => p.id === 'pasta-fagioli'));
    v = togliIngrediente(v, 'pasta-semola');
    v = aggiungiIngrediente(v, 'pasta-integrale', 60);
    expect(incoerenze(v).some((x) => x.parola === 'pasta')).toBe(false);
  });

  it('tace quando non c’è niente di incoerente', () => {
    expect(incoerenze(comeVariante(colazione))).toEqual([]);
  });

  it('vale anche per una pietanza nata da zero', () => {
    let n = {
      ...nuovaPietanza(),
      nome: 'Riso e piselli',
      ingredienti: [{ a: 'riso', g: 80 }, { a: 'piselli-surgelati', g: 150 }],
    };
    n = togliIngrediente(n, 'piselli-surgelati');
    expect(incoerenze(n).some((x) => x.alimentoId === 'piselli-surgelati')).toBe(true);
  });

  it('il nome suggerito toglie la parola e ripulisce i connettivi', () => {
    expect(nomeSenza('Latte, fette biscottate e miele', 'miele'))
      .toBe('Latte, fette biscottate');
    expect(nomeSenza('Pasta e patate con provola', 'provola'))
      .toBe('Pasta e patate');
    expect(nomeSenza('Miele e noci', 'miele')).toBe('Noci');
  });

  it('il nome suggerito non svuota mai il titolo', () => {
    expect(nomeSenza('Miele', 'miele')).toBe('Miele');
  });

  it('il procedimento si riscrive e i passi vuoti si scartano', () => {
    const v = cambiaProcedimento(comeVariante(colazione), ['  Scalda il latte.  ', '', '  ']);
    expect(v.procedimento).toEqual(['Scalda il latte.']);
    expect(cambiaProcedimento(v, ['', '']).procedimento).toBeUndefined();
  });
});
