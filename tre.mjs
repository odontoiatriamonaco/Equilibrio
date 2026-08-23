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
const NOTA = "  // Dopo il disegno, sempre: il tutor chiede i suoi bersagli alla pagina.\n";

/* Gli import */
for (const [file, quali] of [
  ['js/pagina-preferenze.js', 'PASSI_PREFERENZE'],
  ['js/pagina-progressi.js', 'PASSI_PROGRESSI'],
  ['js/pagina-profilo.js', 'PASSI_PROFILO'],
]) {
  let s = readFileSync(file, 'utf8');
  const nl = s.includes('\r\n') ? '\r\n' : '\n';
  const riga = s.split(/\r?\n/).find((r) => r.startsWith('import') && r.includes("'./guscio.js'"));
  if (!riga) throw new Error('guscio non importato in ' + file);
  const nuovo = riga + nl + "import { montaTutor } from './tutor.js';"
    + nl + `import { ${quali} } from './tutor-passi.js';`;
  writeFileSync(file, s.split(riga).join(nuovo));
}

/* Le chiamate */
sost('js/pagina-preferenze.js',
`  await montaBarraPercorso(profilo, 'gusti');

}`,
`  await montaBarraPercorso(profilo, 'gusti');

${NOTA}  montaTutor(PASSI_PREFERENZE);
}`);

sost('js/pagina-progressi.js',
`  await disegna();
}`,
`  await disegna();

${NOTA}  montaTutor(PASSI_PROGRESSI);
}`);

sost('js/pagina-profilo.js',
`  await montaBarraPercorso(profilo, 'profilo');

}`,
`  await montaBarraPercorso(profilo, 'profilo');

${NOTA}  montaTutor(PASSI_PROFILO);
}`);

console.log('tutor su Preferenze, Progressi e Profilo');
