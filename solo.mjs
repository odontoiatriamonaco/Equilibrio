import { readFileSync, writeFileSync } from 'fs';
function sost(file, v, n) {
  let t = readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  const a = crlf ? v.split('\n').join('\r\n') : v;
  const b = crlf ? n.split('\n').join('\r\n') : n;
  const q = t.split(a).length - 1;
  if (q !== 1) throw new Error(file + ' — trovata ' + q + ' volte');
  writeFileSync(file, t.split(a).join(b).normalize('NFC'));
}
const T = String.fromCharCode(96);

/* 1. «spuntino e spuntino» non si può leggere: servono nomi per esteso. */
sost('js/presenze.js',
`export const PASTI = [
  { id: 'colazione', nome: 'Colazione' },
  { id: 'spuntino-mattina', nome: 'Spuntino' },
  { id: 'pranzo', nome: 'Pranzo' },
  { id: 'spuntino-pomeriggio', nome: 'Spuntino' },
  { id: 'cena', nome: 'Cena' },
];`,
`export const PASTI = [
  // ` + T + `nome` + T + ` sta nella griglia, dove la posizione della riga basta a capire di
  // quale spuntino si parla. ` + T + `lungo` + T + ` serve nelle frasi, dove non basta:
  // «fuori casa per pranzo, spuntino e spuntino» non si può leggere.
  { id: 'colazione', nome: 'Colazione', lungo: 'colazione' },
  { id: 'spuntino-mattina', nome: 'Spuntino', lungo: 'spuntino del mattino' },
  { id: 'pranzo', nome: 'Pranzo', lungo: 'pranzo' },
  { id: 'spuntino-pomeriggio', nome: 'Spuntino', lungo: 'spuntino del pomeriggio' },
  { id: 'cena', nome: 'Cena', lungo: 'cena' },
];`);

sost('js/presenze.js',
`    .map(([p]) => PASTI.find((x) => x.id === p)?.nome.toLowerCase() || p);`,
`    .map(([p]) => PASTI.find((x) => x.id === p)?.lungo || p);`);

/* 2. Chi vive da solo: la lista deve saltare i pasti che fa fuori. */
sost('js/pagina-spesa.js',
`  const aTavola = membri.filter((m) => !esclusi.has(m.profilo.id));
  if (aTavola.length > 1) {
    lista = costruisciLista(settimana, { membri: aTavola, dispensa });
  } else {
    const commensali = Number($('#commensali').value) || 1;
    lista = costruisciLista(settimana, { commensali, dispensa });
  }`,
`  const aTavola = membri.filter((m) => !esclusi.has(m.profilo.id));
  if (aTavola.length > 1) {
    lista = costruisciLista(settimana, { membri: aTavola, dispensa });
  } else {
    // Anche da solo si può pranzare fuori tutti i giorni, e allora quei pranzi
    // non vanno comprati. Qui la lista non passa dai membri — passa dal
    // moltiplicatore — quindi la settimana va sfrondata prima di entrarci,
    // altrimenti le assenze varrebbero solo in famiglia.
    const commensali = Number($('#commensali').value) || 1;
    lista = costruisciLista(settimanaACasa(settimana, profilo), { commensali, dispensa });
  }`);

let s = readFileSync('js/pagina-spesa.js', 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const riga = s.split(/\r?\n/).find((r) => r.startsWith('import') && r.includes("'./spesa.js'"));
if (!riga) throw new Error('import spesa non trovato');
sost('js/pagina-spesa.js', riga, riga + nl + "import { settimanaACasa } from './presenze.js';");

console.log('nomi lunghi e caso di chi vive da solo');
