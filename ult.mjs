import { readFileSync, writeFileSync } from 'fs';
function sost(file, v, n) {
  let t = readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  const a = crlf ? v.split('\n').join('\r\n') : v;
  const b = crlf ? n.split('\n').join('\r\n') : n;
  if (!t.includes(a)) throw new Error(file + ' — MANCA: ' + v.slice(0, 60));
  writeFileSync(file, t.split(a).join(b));
}

sost('js/percorso.js',
'  const saltati = new Set(profilo?.percorso?.saltati || []);',
`  const saltati = new Set(profilo?.percorso?.saltati || []);
  // Chi ha aperto la sezione e ha detto «ho finito». Non e' «saltato»: ci sei
  // stato. Serve all'ultimo passo, dove «vedi la lista» si esaurisce nel
  // vederla e non lascia niente scritto da cui accorgersene.
  const visti = new Set(profilo?.percorso?.visti || []);`);

sost('js/percorso.js',
`    fatto: verifiche[p.id] || saltati.has(p.id),
    saltato: !verifiche[p.id] && saltati.has(p.id),`,
`    fatto: verifiche[p.id] || saltati.has(p.id) || visti.has(p.id),
    saltato: !verifiche[p.id] && saltati.has(p.id),`);

sost('js/percorso.js',
`    completo: !prossimo,
    chiuso: Boolean(profilo?.percorso?.chiuso),
  };
}`,
`    completo: !prossimo,
    chiuso: Boolean(profilo?.percorso?.chiuso),
    iniziato: Boolean(profilo?.percorso?.iniziato),
    finito: Boolean(profilo?.percorso?.finito),
  };
}`);

sost('js/percorso.js',
`  if (!stato || stato.completo || stato.chiuso) return null;

  const indice = stato.passi.findIndex((x) => x.id === idPasso);
  if (indice < 0) return null;
  const passo = stato.passi[indice];

  // Quelli che restano da fare oltre a questo. Se non ne resta nessuno, questa
  // sezione e' l'ultima: il pulsante non dice «avanti» verso il nulla.
  const restano = stato.passi.filter((x) => !x.fatto && x.id !== idPasso).length;

  return {
    id: idPasso,
    numero: indice + 1,
    totale: stato.passi.length,
    titolo: passo.titolo,
    fatto: passo.fatto,
    ultimo: restano === 0,
    etichetta: restano === 0 ? 'Ho finito' : 'Avanti',
  };
}`,
`  if (!stato || stato.chiuso) return null;
  // A percorso finito il filo non serve piu'. Resta pero' finche' la fine non
  // e' stata annunciata, o l'ultima sezione perderebbe il pulsante proprio nel
  // momento in cui la si completa.
  if (stato.completo && (stato.finito || !stato.iniziato)) return null;

  const indice = stato.passi.findIndex((x) => x.id === idPasso);
  if (indice < 0) return null;
  const passo = stato.passi[indice];

  // Quelli che restano da fare oltre a questo. Se non ne resta nessuno, questa
  // sezione e' l'ultima: il pulsante non dice «avanti» verso il nulla.
  const restano = stato.passi.filter((x) => !x.fatto && x.id !== idPasso).length;
  const ultimo = restano === 0;

  // «Ho finito» chiude il passo dichiarandolo — ma solo dove dichiararlo e'
  // onesto. Aprire la lista della spesa si esaurisce nell'averla vista, e di
  // quello non resta traccia da nessuna parte; compilare il profilo o generare
  // il menu' no: quelli o li hai fatti o non li hai fatti, e un pulsante non
  // puo' farli al posto tuo.
  const conferma = ultimo && !passo.fatto && passo.saltabile;

  return {
    id: idPasso,
    numero: indice + 1,
    totale: stato.passi.length,
    titolo: passo.titolo,
    fatto: passo.fatto,
    ultimo,
    conferma,
    etichetta: ultimo && (passo.fatto || conferma) ? 'Ho finito' : 'Avanti',
  };
}

/** Questa sezione l'ho vista e ho detto che basta. Diverso da «saltato». */
export function conVisto(profilo, id) {
  const visti = new Set(profilo?.percorso?.visti || []);
  visti.add(id);
  return { ...profilo, percorso: { ...(profilo.percorso || {}), visti: [...visti] } };
}`);

console.log('percorso.js sistemato');
