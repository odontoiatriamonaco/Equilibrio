/* Equilibrio — gli allergeni per classe, non uno alla volta.

   Fino a qui un'allergia si segnava alimento per alimento: un celiaco doveva
   spuntare a mano pasta, pane, farina, pangrattato, cous cous, orzo, farro,
   fette biscottate, tagliatelle e gnocchi — e se ne dimenticava uno se lo
   ritrovava nel piano. Dimenticarne uno è la cosa più facile del mondo, ed è
   anche la più pericolosa: per questo la classe esiste.

   ── Da dove vengono le classi ────────────────────────────────────────────────

   Sono i quattordici allergeni dell'etichettatura europea (Reg. UE 1169/2011,
   allegato II). Non è una lista che mi sono inventato: è quella che per legge
   sta scritta sulle confezioni e sui menù dei ristoranti, quindi è la stessa
   che questa persona già conosce e ritrova fuori di qui.

   Qui compaiono solo le classi che il ricettario può davvero incontrare: di
   arachidi, senape, sesamo e lupini nel catalogo non c'è traccia, e mostrarle
   vuote sarebbe far credere che siano state controllate.

   ── Che cosa questo elenco NON è ─────────────────────────────────────────────

   Dice cosa un alimento È, non cosa potrebbe averci toccato. L'app conosce gli
   ingredienti delle proprie ricette: non sa niente di tracce, di stabilimenti,
   di cosa ti hanno messo nel piatto al ristorante, e non sa cosa c'è dentro un
   prodotto confezionato che leggi col codice a barre. Il cioccolato fondente,
   per dire, molto spesso dichiara «può contenere latte»: qui non risulta fra i
   latticini perché il latte non è un suo ingrediente, e l'etichetta va letta
   lo stesso.

   Per questo l'app non dice mai che una cosa è sicura. Dice cosa toglie. */

/** Le classi che questo ricettario può incontrare, in ordine di frequenza. */
export const CLASSI = [
  { id: 'glutine', nome: 'Glutine', esempio: 'pasta, pane, farina, orzo, farro, avena' },
  { id: 'latte', nome: 'Latte e derivati', esempio: 'latte, yogurt, formaggi, ricotta' },
  { id: 'uova', nome: 'Uova', esempio: 'uova, pasta all’uovo' },
  { id: 'pesce', nome: 'Pesce', esempio: 'alici, merluzzo, tonno, salmone' },
  { id: 'crostacei', nome: 'Crostacei', esempio: 'gamberi' },
  { id: 'molluschi', nome: 'Molluschi', esempio: 'cozze, vongole, polpo, seppie' },
  { id: 'frutta-a-guscio', nome: 'Frutta a guscio', esempio: 'noci, mandorle, nocciole, pinoli' },
  { id: 'soia', nome: 'Soia', esempio: 'tofu' },
  { id: 'sedano', nome: 'Sedano', esempio: 'sedano' },
];

/**
 * Quali classi contiene ogni alimento del catalogo.
 *
 * Elencato per classe e non per alimento perché così si rilegge: per accorgersi
 * che manca il pangrattato bisogna poter leggere tutti i cereali di fila.
 *
 * Dove ho avuto un dubbio ho INCLUSO. Sbagliare per eccesso toglie un piatto
 * dal menù; sbagliare per difetto lo mette nel piatto di chi non può mangiarlo,
 * e le due cose non si equivalgono nemmeno lontanamente.
 */
export const PER_CLASSE = {
  // Cereali che contengono glutine secondo l'etichettatura europea. L'avena vi
  // rientra: botanicamente non ne ha, ma nella filiera si contamina, e la legge
  // la elenca fra i cereali glutinosi.
  glutine: [
    'pasta-semola', 'pasta-integrale', 'orzo-perlato', 'farro-perlato',
    'pane', 'pane-integrale', 'fette-biscottate', 'cous-cous', 'pangrattato',
    'farina-00', 'fiocchi-avena', 'tagliatelle-uovo',
    // Gli gnocchi di patate sono impastati con farina di frumento.
    'gnocchi-patate',
  ],

  latte: [
    'latte-ps', 'yogurt-greco-magro', 'yogurt-bianco', 'ricotta', 'mozzarella',
    'mozzarella-bufala', 'provola', 'parmigiano', 'pecorino', 'ricotta-salata',
    'burrata', 'formaggio-fresco',
  ],

  // Gli gnocchi confezionati portano quasi sempre uovo nell'impasto.
  uova: ['uova', 'tagliatelle-uovo', 'gnocchi-patate'],

  pesce: [
    'alici', 'merluzzo', 'orata', 'tonno-naturale', 'baccala', 'sgombro',
    'salmone', 'salmone-affumicato', 'platessa', 'spigola', 'pesce-spada',
  ],

  crostacei: ['gamberi'],

  molluschi: ['polpo', 'totani', 'cozze', 'vongole', 'seppie'],

  // Le castagne non stanno qui: nell'elenco europeo «frutta a guscio» sono
  // mandorle, nocciole, noci e simili, e l'allergia alla castagna è un'altra
  // cosa. Chi ce l'ha usa il lucchetto sul singolo alimento.
  'frutta-a-guscio': ['noci', 'mandorle', 'nocciole', 'pinoli'],

  soia: ['tofu'],

  sedano: ['sedano'],
};

/** Da alimento a classi, costruito una volta sola. */
const DI_ALIMENTO = new Map();
for (const [classe, alimenti] of Object.entries(PER_CLASSE)) {
  for (const id of alimenti) {
    if (!DI_ALIMENTO.has(id)) DI_ALIMENTO.set(id, []);
    DI_ALIMENTO.get(id).push(classe);
  }
}

/** Le classi di allergene che questo alimento contiene. */
export function classiDi(alimentoId) {
  return DI_ALIMENTO.get(alimentoId) || [];
}

/** Questo alimento ricade in una delle classi segnate? */
export function inClasse(alimentoId, classiAttive) {
  if (!classiAttive?.length) return false;
  const sue = DI_ALIMENTO.get(alimentoId);
  if (!sue) return false;
  return sue.some((c) => classiAttive.includes(c));
}

/** Quanti alimenti del catalogo toglie una classe. Serve a dirlo prima. */
export function quantiTocca(classe) {
  return (PER_CLASSE[classe] || []).length;
}

/** Aggiunge o toglie una classe, senza toccare il resto delle preferenze. */
export function alternaClasse(pref, classe) {
  const attive = new Set(pref?.classiAllergeni || []);
  if (attive.has(classe)) attive.delete(classe);
  else attive.add(classe);
  return { ...pref, classiAllergeni: [...attive] };
}
