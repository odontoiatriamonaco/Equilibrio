/* Equilibrio — le poche regole di italiano scritto che ricorrono ovunque.

   Sembrano dettagli e non lo sono: «lunedì, martedì, giovedì» si riconosce
   come una lista fatta da una macchina, «lunedì, martedì e giovedì» no. Chi
   legge non sa dire perché, ma la prima gli suona sbagliata.

   Stanno qui e non nel guscio dell'interfaccia perché non toccano il DOM: i
   moduli di testo — `spiegazioni.js` in testa — dichiarano di potersi provare
   senza aprire una pagina, e farli dipendere dal guscio sarebbe smentirli. */

/**
 * «pane», «pane e pasta», «pane, pasta e riso».
 *
 * Era scritta due volte in due moduli, identica: due copie di una regola di
 * lingua sono due posti dove sbagliarla, e uno dei due lo si corregge sempre
 * dopo l'altro.
 *
 * @param {Array<string|false|null|undefined>} voci  i falsi si scartano da soli
 */
export function elenca(voci = []) {
  const puliti = voci.filter(Boolean);
  if (puliti.length <= 1) return puliti[0] || '';
  return `${puliti.slice(0, -1).join(', ')} e ${puliti[puliti.length - 1]}`;
}
