/* Le regole di italiano scritto che ricorrono ovunque.
 *
 * Sembrano dettagli. «lunedì, martedì, giovedì» però si riconosce come una
 * lista fatta da una macchina, e chi legge non sa dire perché ma gli suona
 * sbagliata. Era scritta due volte in due moduli: qui è una sola, e provata. */
import { describe, it, expect } from 'vitest';
import { elenca } from '../js/lingua.js';

describe('elenca', () => {
  it('una voce sola è già un elenco', () => {
    expect(elenca(['pane'])).toBe('pane');
  });

  it('due voci si legano con la e, senza virgola', () => {
    expect(elenca(['pane', 'pasta'])).toBe('pane e pasta');
  });

  it('tre o più: virgole, e la e prima dell’ultima', () => {
    expect(elenca(['pane', 'pasta', 'riso'])).toBe('pane, pasta e riso');
    expect(elenca(['lunedì', 'martedì', 'giovedì', 'venerdì']))
      .toBe('lunedì, martedì, giovedì e venerdì');
  });

  it('niente da elencare è stringa vuota, non «undefined» in pagina', () => {
    expect(elenca([])).toBe('');
    expect(elenca()).toBe('');
  });

  it('scarta i falsi da sé: i chiamanti li passano apposta', () => {
    // Serve a scrivere `elenca([a && 'x', b && 'y'])` senza filtrare prima.
    expect(elenca(['pane', null, undefined, false, '', 'riso'])).toBe('pane e riso');
    expect(elenca([false, null])).toBe('');
  });
});
