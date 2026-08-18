/* Equilibrio — impostazioni: profili, export/import cifrato, tema. */

import { $, avvia, applicaTema, temaSalvato, num, condividiTesto } from './guscio.js';
import {
  profili, profiloAttivo, impostaProfiloAttivo, eliminaProfilo,
  esportaFascicolo, importaFascicolo, leggi, scrivi, gemelloDi,
} from './store.js';
import {
  cifra, decifra, nomeFile, scarica, leggiDaFile,
  PassphraseErrata, FormatoNonValido, AVVISO_PASSPHRASE,
} from './profilo-file.js';
import { pietanzeDiCasa, ripristinaRicettario, eliminaPietanza } from './piatti-utente.js';
import { caricaPreferenze, azzeraPreferenze } from './preferenze.js';
import { settimanaPer } from './famiglia.js';
import {
  spazioLocale, dimenticaSpazio, creaSpazio, entraNelloSpazio, leggiSpazio,
  pubblicaMenu, porzioniDellaTavola,
} from './spazio-famiglia.js';
import { normalizzaCodice, codiceValido, codiceLeggibile } from './lista-condivisa.js';

let attivo = null;
let inAttesaDiConferma = null;

/* --- Ripristino ------------------------------------------------------------
   Due azioni distruttive e irreversibili: entrambe chiedono conferma con la
   seconda pressione, e dicono prima quanto stanno per portare via.
   -------------------------------------------------------------------------- */

async function rendiRipristino() {
  const p = attivo;
  const sezione = $('#conta-pietanze').closest('.sezione');

  if (!p) {
    sezione.hidden = true;
    return;
  }
  sezione.hidden = false;

  const mie = await pietanzeDiCasa(p.id);
  const pref = await caricaPreferenze(p.id);
  const quantiGusti = Object.keys(pref.piatti).length + Object.keys(pref.alimenti).length;
  const quanteAllergie = pref.allergie.length;

  $('#conta-pietanze').textContent = mie.length
    ? `${mie.length} ${mie.length === 1 ? 'pietanza tua' : 'pietanze tue'}. `
      + 'Cancellandole tornano le 153 originali.'
    : 'Nessuna modifica: il ricettario è già quello di serie.';
  $('#ripristina-ricettario').disabled = !mie.length;

  const pezzi = [];
  if (quantiGusti) pezzi.push(`${quantiGusti} fra amati ed esclusi`);
  if (quanteAllergie) pezzi.push(`${quanteAllergie} ${quanteAllergie === 1 ? 'allergia' : 'allergie'}`);
  $('#conta-preferenze').textContent = pezzi.length
    ? `${pezzi.join(', ')}. Tornano i tetti mediterranei di partenza.`
    : 'Nessuna preferenza impostata.';
  $('#azzera-preferenze').disabled = !pezzi.length;

  $('#elenco-mie').hidden = !mie.length;
  $('#mie-pietanze').innerHTML = mie.map((x) => `
    <div class="riga-tra" style="padding-block:var(--sp-2); border-bottom:1px solid var(--bordo)">
      <span>${x.nome}
        ${x.derivatoDa ? '<br><span class="piccolo tenue">variante di una pietanza di serie</span>'
    : '<br><span class="piccolo tenue">pietanza nuova</span>'}
      </span>
      <button class="bottone-icona" data-togli-pietanza="${x.id}" aria-label="Elimina ${x.nome}">
        <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#cestino"/></svg>
      </button>
    </div>`).join('');
}

/** Conferma in due passaggi sullo stesso pulsante, con annullamento automatico. */
function chiediConferma(bottone, chiave, testo, azione) {
  if (inAttesaDiConferma !== chiave) {
    inAttesaDiConferma = chiave;
    const etichetta = bottone.textContent;
    bottone.classList.add('bottone-pericolo');
    bottone.textContent = testo;
    setTimeout(() => {
      if (inAttesaDiConferma !== chiave) return;
      inAttesaDiConferma = null;
      bottone.classList.remove('bottone-pericolo');
      bottone.textContent = etichetta;
    }, 6000);
    return;
  }
  inAttesaDiConferma = null;
  azione();
}

function collegaRipristino() {
  $('#ripristina-ricettario').addEventListener('click', (e) => {
    chiediConferma(e.target, 'ricettario', 'Confermi? Non si torna indietro', async () => {
      const quante = await ripristinaRicettario(attivo.id);
      await rendiRipristino();
      annuncia(`${quante} ${quante === 1 ? 'pietanza cancellata' : 'pietanze cancellate'}. `
        + 'Il ricettario è tornato quello di serie.');
    });
  });

  $('#azzera-preferenze').addEventListener('click', (e) => {
    chiediConferma(e.target, 'preferenze', 'Confermi? Non si torna indietro', async () => {
      await azzeraPreferenze(attivo.id);
      await rendiRipristino();
      annuncia('Gusti e allergie azzerati. Tutte le pietanze sono di nuovo proponibili.');
    });
  });

  $('#mie-pietanze').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-togli-pietanza]');
    if (!b) return;
    await eliminaPietanza(attivo.id, b.dataset.togliPietanza);
    await rendiRipristino();
    annuncia('Pietanza cancellata: se era una variante, è tornata quella di serie.');
  });
}

function annuncia(testo) {
  const n = $('#esito-ripristino');
  n.hidden = false;
  n.textContent = testo;
}

/* --- Profili --------------------------------------------------------------- */

/**
 * Il selettore «segue il menù di…» su ogni carta.
 * Sta qui e non in una sezione a parte perché è una proprietà del profilo, e
 * si va a cercarla dov'è il profilo.
 */
function selettoreRiferimento(p, elenco) {
  // Niente catene: chi fa già da riferimento a qualcuno non può mettersi a
  // seguire, e chi segue non può fare da riferimento.
  const haSeguaci = elenco.some((x) => x.seguo === p.id);
  if (haSeguaci) {
    const quanti = elenco.filter((x) => x.seguo === p.id).length;
    return `<span class="piccolo tenue">decide il menù per ${quanti}
      ${quanti === 1 ? 'altra persona' : 'altre persone'}</span>`;
  }

  const candidati = elenco.filter((x) => x.id !== p.id && !x.seguo);
  if (!candidati.length) return '';

  return `<label class="piccolo tenue" style="display:flex; gap:var(--sp-2); align-items:center">
      segue
      <select data-seguo="${p.id}" style="max-width:11rem">
        <option value="">il proprio menù</option>
        ${candidati.map((x) => `<option value="${x.id}"${x.id === p.seguo ? ' selected' : ''}>
          ${x.nome || 'Profilo'}</option>`).join('')}
      </select>
    </label>`;
}

async function rendiProfili() {
  const elenco = await profili();
  attivo = await profiloAttivo();

  if (!elenco.length) {
    $('#profili').innerHTML = `<div class="vuoto">
        <svg class="icona icona-lg" aria-hidden="true"><use href="/assets/icons.svg#utente"/></svg>
        <p>Nessun profilo su questo dispositivo.</p>
        <a class="bottone" href="/profilo.html?nuovo=1">Crea il primo profilo</a>
      </div>`;
    return;
  }

  $('#profili').innerHTML = elenco.map((p) => {
    const corrente = p.id === attivo?.id;
    const misure = p.pesoKg ? `${num(p.pesoKg, 1)} kg · ${num(p.altezzaCm)} cm` : 'dati incompleti';
    return `<div class="carta-piatto" data-profilo="${p.id}">
      <span class="sigillo"><svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#${
  p.seguo ? 'famiglia' : 'utente'
}"/></svg></span>
      <span class="corpo">
        <span class="titolo">${p.nome || 'Profilo'}</span>
        <span class="meta"><span>${misure}</span>${corrente ? '<span>in uso</span>' : ''}</span>
        ${selettoreRiferimento(p, elenco)}
      </span>
      ${corrente
        ? '<span class="pillola pillola-accento">attivo</span>'
        : '<button class="bottone bottone-2" data-usa="' + p.id + '">Usa</button>'}
      <a class="bottone-icona" href="/profilo.html?id=${p.id}" aria-label="Modifica ${p.nome || 'profilo'}">
        <svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#matita"/></svg>
      </a>
      <button class="bottone-icona" data-elimina="${p.id}" aria-label="Elimina ${p.nome || 'profilo'}">
        <svg class="icona" aria-hidden="true"><use href="/assets/icons.svg#cestino"/></svg>
      </button>
    </div>`;
  }).join('');
}

async function cambiaRiferimento(e) {
  const sel = e.target.closest('[data-seguo]');
  if (!sel) return;

  const id = sel.dataset.seguo;
  const p = await leggi('profili', id);
  await scrivi('profili', { ...p, seguo: sel.value || null });
  await rendiProfili();

  const capo = sel.value ? await leggi('profili', sel.value) : null;
  annuncia(capo
    ? `${p.nome || 'Il profilo'} segue il menù di ${capo.nome}: stessi piatti, `
      + 'porzioni calcolate sul suo fabbisogno. Si cucina una volta sola.'
    : `${p.nome || 'Il profilo'} è tornato a un menù suo.`);
}

async function gestisciProfili(e) {
  const usa = e.target.closest('[data-usa]');
  if (usa) {
    await impostaProfiloAttivo(usa.dataset.usa);
    await rendiProfili();
    await rendiRipristino();
    return;
  }

  const elimina = e.target.closest('[data-elimina]');
  if (!elimina) return;

  const id = elimina.dataset.elimina;
  // Due passaggi invece di una finestra di sistema: la seconda pressione
  // e' una conferma esplicita, e si annulla da sola dopo qualche secondo.
  if (inAttesaDiConferma !== id) {
    inAttesaDiConferma = id;
    elimina.classList.add('bottone', 'bottone-pericolo');
    elimina.innerHTML = 'Confermi?';
    setTimeout(() => { if (inAttesaDiConferma === id) rendiProfili().then(() => { inAttesaDiConferma = null; }); }, 5000);
    return;
  }
  inAttesaDiConferma = null;
  const esito = await eliminaProfilo(id);
  await rendiProfili();
  await rendiRipristino();

  // Cancellare un riferimento stacca chi lo seguiva: va detto, non scoperto
  // aprendo il piano e trovandolo cambiato.
  if (esito?.staccati?.length) {
    annuncia(`${esito.staccati.join(' e ')} ${esito.staccati.length === 1 ? 'seguiva' : 'seguivano'} `
      + 'quel profilo: ora ha un menù suo.');
  }
}

/* --- Export ---------------------------------------------------------------- */

async function esporta() {
  const p1 = $('#pass1').value;
  const p2 = $('#pass2').value;
  const esito = $('#esito-export');
  esito.hidden = false;
  esito.className = 'avviso avviso-pericolo';

  if (!attivo) { esito.textContent = 'Non c\'è nessun profilo da esportare.'; return; }
  if (p1.length < 8) { esito.textContent = 'La passphrase deve avere almeno 8 caratteri.'; return; }
  if (p1 !== p2) { esito.textContent = 'Le due passphrase non coincidono.'; return; }

  try {
    const fascicolo = await esportaFascicolo(attivo.id);
    const byte = await cifra(fascicolo, p1);
    scarica(byte, nomeFile(attivo));
    esito.className = 'avviso avviso-ok';
    esito.textContent = `Fascicolo di ${attivo.nome} esportato e cifrato. ${AVVISO_PASSPHRASE}`;
    $('#pass1').value = $('#pass2').value = '';
  } catch (err) {
    esito.textContent = `Export non riuscito: ${err.message}`;
  }
}

/**
 * Esporta e passa il file al foglio di condivisione del telefono.
 *
 * Ha senso perche' il file e' gia' cifrato: quello che viaggia e' illeggibile
 * senza la passphrase. Ed e' esattamente per questo che la passphrase non deve
 * viaggiare con lui — mandarle insieme e' come lasciare la chiave nella
 * serratura, e l'interfaccia lo dice.
 */
function puoCondividereFile() {
  try {
    return Boolean(navigator.canShare
      && navigator.canShare({ files: [new File(['x'], 'p.equilibrio')] }));
  } catch {
    return false;
  }
}

async function condividi() {
  const p1 = $('#pass1').value;
  const p2 = $('#pass2').value;
  const esito = $('#esito-export');
  esito.hidden = false;
  esito.className = 'avviso avviso-pericolo';

  if (!attivo) { esito.textContent = 'Non c\'è nessun profilo da condividere.'; return; }
  if (p1.length < 8) { esito.textContent = 'La passphrase deve avere almeno 8 caratteri.'; return; }
  if (p1 !== p2) { esito.textContent = 'Le due passphrase non coincidono.'; return; }

  try {
    const byte = await cifra(await esportaFascicolo(attivo.id), p1);
    const file = new File([byte], nomeFile(attivo), { type: 'application/octet-stream' });

    await navigator.share({
      files: [file],
      title: `Equilibrio — ${attivo.nome}`,
      text: 'Fascicolo cifrato di Equilibrio. La passphrase te la dico a parte.',
    });

    esito.className = 'avviso avviso-ok';
    esito.textContent = `Fascicolo di ${attivo.nome} condiviso, cifrato. `
      + 'Ricordati: la passphrase va detta su un altro canale, non insieme al file.';
    $('#pass1').value = $('#pass2').value = '';
  } catch (err) {
    // L'utente che chiude il foglio di condivisione non e' un errore.
    if (err?.name === 'AbortError') { esito.hidden = true; return; }
    esito.textContent = `Condivisione non riuscita: ${err.message}. Puoi sempre esportare il file e mandarlo a mano.`;
  }
}

/* --- Import ---------------------------------------------------------------- */

/**
 * Chiede prima di prendere il posto di un profilo che c'e' gia'.
 *
 * Non e' una formalita': sovrascrivere porta via il diario e le misure di
 * questo dispositivo, che possono essere piu' recenti di quelli nel file.
 */
function confermaSovrascrittura(gemello) {
  return window.confirm(
    `«${gemello.nome}» è già su questo dispositivo.\n\n`
    + 'Sostituirlo con il file aggiorna piano, preferenze e diario, e chi lo segue '
    + 'continua a seguirlo.\n\n'
    + 'Quello che c’è adesso su questo dispositivo — diario, misure, pesate — '
    + 'viene sostituito da quello che c’è nel file. Procedo?',
  );
}

async function importa() {
  const file = $('#file-import').files[0];
  const pass = $('#pass-import').value;
  const esito = $('#esito-import');
  esito.hidden = false;
  esito.className = 'avviso avviso-pericolo';

  if (!file) { esito.textContent = 'Scegli prima un file .equilibrio.'; return; }
  if (!pass) { esito.textContent = 'Serve la passphrase con cui è stato cifrato.'; return; }

  try {
    const fascicolo = await decifra(await leggiDaFile(file), pass);

    // Lo stesso profilo, di ritorno da un altro dispositivo: sovrascriverlo lo
    // tiene uno solo e — cosa che conta di piu' — conserva il suo id, quindi
    // chi lo segue continua a seguirlo. Duplicarlo spezzerebbe quel legame.
    const gemello = await gemelloDi(fascicolo);
    if (gemello && !confermaSovrascrittura(gemello)) return;

    const p = await importaFascicolo(fascicolo, gemello ? { sovrascrivi: gemello.id } : {});
    esito.className = 'avviso avviso-ok';
    // Il legame di famiglia non si porta dietro: puntava a un id che qui non
    // esiste. Ma dire CHI seguiva risparmia di doverselo ricordare.
    esito.innerHTML = (gemello
      ? `«${p.nome}» è stato <strong>aggiornato</strong> col contenuto del file: piano,
         preferenze e diario sono quelli nuovi. Chi lo seguiva continua a seguirlo.`
      : `Importato come «${p.nome}», con preferenze, piano e diario.
         Gli altri profili non sono stati toccati.`)
      + (!gemello && p.seguoNome
        ? ` <strong>Seguiva il menù di ${p.seguoNome}</strong>: se anche ${p.seguoNome}
            è su questo dispositivo, ricollegali dall'elenco qui sopra.`
        : '');
    $('#pass-import').value = '';
    $('#file-import').value = '';
    await rendiProfili();
  } catch (err) {
    if (err instanceof PassphraseErrata) {
      esito.textContent = 'Passphrase errata, oppure il file è stato modificato: non si apre.';
    } else if (err instanceof FormatoNonValido) {
      esito.textContent = err.message;
    } else {
      esito.textContent = `Import non riuscito: ${err.message}`;
    }
  }
}

/* --- Tema ------------------------------------------------------------------ */

function montaTema() {
  const corrente = temaSalvato() || 'auto';
  $('#tema').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tema === corrente)));

  $('#tema').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    applicaTema(b.dataset.tema);
    $('#tema').querySelectorAll('button').forEach((x) =>
      x.setAttribute('aria-selected', String(x === b)));
  });
}

/* --- Avvio ----------------------------------------------------------------- */

/* --- Lo spazio della famiglia ----------------------------------------------- */

function diciSpazio(testo, pericolo = false) {
  const n = $('#esito-spazio');
  n.hidden = !testo;
  n.className = pericolo ? 'avviso avviso-pericolo' : 'avviso';
  n.textContent = testo;
}

/** Da quanto non si fa vedere una persona: chi cucina deve poterlo capire. */
function daQuando(iso) {
  if (!iso) return 'non ha ancora pubblicato le sue porzioni';
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return 'aggiornata oggi';
  if (giorni === 1) return 'aggiornata ieri';
  return `aggiornata ${giorni} giorni fa`;
}

async function rendiSpazio() {
  const loc = await spazioLocale();
  const seguito = Boolean(attivo?.seguo);

  // Lo spazio lo apre chi decide il menù. Chi segue qualcuno entra con il
  // codice: aprirne un secondo vorrebbe dire due menù per una cucina sola.
  $('#apri-spazio').hidden = Boolean(loc) || seguito || !attivo;
  $('#entra-spazio').hidden = Boolean(loc) || !attivo;
  $('#pubblica-menu').hidden = !loc?.chiave;
  $('#esci-spazio').hidden = !loc;

  if (!loc) {
    $('#spazio-stato').innerHTML = attivo
      ? ''
      : '<p class="piccolo tenue">Serve prima un profilo su questo dispositivo.</p>';
    return;
  }

  // Il codice sta su questo dispositivo: si mostra SEMPRE, anche senza rete.
  // Prima si andava a leggere lo spazio e, se non si raggiungeva, restava solo
  // un messaggio d'errore — e chi voleva ridettare il proprio codice non
  // riusciva più nemmeno a vederlo.
  const esito = await leggiSpazio(loc.codice);
  const elenco = await profili();
  const tavola = esito.ok
    ? porzioniDellaTavola(esito, elenco.map((p) => ({ profilo: p })))
    : [];

  const menu = esito.ok
    ? (esito.menu
      ? `Menù della settimana del ${esito.menu.inizio}${esito.menu.da ? `, da ${esito.menu.da}` : ''}.`
      : 'Nessun menù pubblicato per ora.')
    : esito.messaggio;

  $('#spazio-stato').innerHTML = `
    <div class="scheda scheda-piatta">
      <p class="occhiello">Codice della famiglia</p>
      <p class="dato-grande num" style="letter-spacing:.12em">${codiceLeggibile(loc.codice)}</p>
      <button class="bottone bottone-2" id="manda-spazio" style="margin-bottom:var(--sp-3)">
        <svg class="icona icona-sm" aria-hidden="true"><use href="/assets/icons.svg#condividi"/></svg>
        Manda il codice
      </button>
      <p class="piccolo tenue">${loc.chiave
    ? 'Oppure dettalo a chi è in famiglia: da lì in poi il menù gli arriva da solo. '
      + 'La chiave che ti fa cambiare il menù resta qui e non si manda a nessuno.'
    : 'Sei entrato con questo codice. Il menù lo decide chi ha aperto lo spazio.'}</p>
    </div>
    <p class="${esito.ok ? 'piccolo morbido' : 'avviso avviso-pericolo'}"
       style="margin-top:var(--sp-3)">${menu}</p>
    <div class="pila" style="margin-top:var(--sp-3)">
      ${tavola.map((m) => `
        <div class="riga-tra" style="padding-block:var(--sp-2); border-bottom:1px solid var(--bordo)">
          <span>${m.nome}${m.senzaProfilo
    ? '<br><span class="piccolo tenue">non ha un profilo su questo dispositivo</span>' : ''}</span>
          <span class="piccolo tenue">${daQuando(m.aggiornatoIl)}</span>
        </div>`).join('')}
    </div>`;
}

/**
 * Il messaggio che parte in chat.
 *
 * Dice il codice E cosa farne: chi lo riceve deve poter agire senza richiamare
 * indietro per chiedere. La chiave non compare — quella non si manda a nessuno,
 * ed e' l'unica cosa che distingue chi decide il menu' da chi lo segue.
 */
function messaggioSpazio(codice) {
  return [
    `${attivo?.nome || 'Io'} ti ha aggiunto allo spazio famiglia di Equilibrio.`,
    '',
    `Codice: ${codiceLeggibile(codice)}`,
    '',
    `Apri ${location.origin}, poi Altro → Impostazioni → «Entra con un codice».`,
    'Da lì in poi il menù della settimana ti arriva da solo.',
  ].join('\n');
}

async function mandaSpazio() {
  const loc = await spazioLocale();
  if (!loc?.codice) return;
  const esito = await condividiTesto(messaggioSpazio(loc.codice), 'Spazio famiglia');

  if (esito === 'copiato') diciSpazio('Messaggio copiato: incollalo dove vuoi.');
  if (esito === 'niente') {
    diciSpazio(`Non riesco a copiare da qui: detta il codice ${codiceLeggibile(loc.codice)}.`, true);
  }
}

async function apriSpazio() {
  diciSpazio('');
  const { settimana } = await settimanaPer(attivo);
  if (!settimana) return diciSpazio('Genera prima il piano di questa settimana.', true);

  const esito = await creaSpazio(attivo, settimana);
  if (!esito.ok) return diciSpazio(esito.messaggio, true);

  await rendiSpazio();
  return diciSpazio(`Spazio aperto. Detta il codice ${codiceLeggibile(esito.codice)} a chi è `
    + 'in famiglia: da lì in poi il menù gli arriva da solo, ogni settimana.');
}

async function confermaEntra() {
  const codice = normalizzaCodice($('#codice-spazio').value);
  const nota = $('#esito-dialogo-spazio');
  nota.className = 'avviso avviso-pericolo';

  if (!codiceValido(codice)) {
    nota.hidden = false;
    nota.textContent = 'Il codice è di dieci caratteri, come ABCDE-FGHJK.';
    return;
  }

  const { settimana } = await settimanaPer(attivo);
  const esito = await entraNelloSpazio(codice, attivo, settimana);
  if (!esito.ok) {
    nota.hidden = false;
    nota.textContent = esito.messaggio;
    return;
  }

  $('#dialogo-spazio').close();
  await rendiSpazio();
  diciSpazio('Ci sei. Il menù arriva da solo quando apri Oggi o il Piano.');
}

async function mandaMenu() {
  diciSpazio('');
  const { settimana } = await settimanaPer(attivo);
  if (!settimana) return diciSpazio('Genera prima il piano di questa settimana.', true);

  const esito = await pubblicaMenu(attivo, settimana);
  if (!esito.ok) return diciSpazio(esito.messaggio, true);

  await rendiSpazio();
  return diciSpazio('Menù pubblicato: lo trovano gli altri alla prossima apertura.');
}

function collegaSpazio() {
  $('#apri-spazio').addEventListener('click', apriSpazio);
  // Il riquadro si ridisegna, quindi il pulsante e' nuovo ogni volta: si
  // ascolta il contenitore, che invece resta.
  $('#spazio-stato').addEventListener('click', (e) => {
    if (e.target.closest('#manda-spazio')) mandaSpazio();
  });
  $('#pubblica-menu').addEventListener('click', mandaMenu);
  $('#entra-spazio').addEventListener('click', () => {
    $('#esito-dialogo-spazio').hidden = true;
    $('#dialogo-spazio').showModal();
  });
  $('#chiudi-spazio').addEventListener('click', () => $('#dialogo-spazio').close());
  $('#conferma-spazio').addEventListener('click', confermaEntra);

  // Uscire non porta via nessun dato: piano, gusti e pietanze restano qui.
  // Ma per chi ha aperto lo spazio porta via la CHIAVE, che sta solo su questo
  // dispositivo: senza, quel menù non si può più aggiornare per nessuno. Va
  // detto prima, non scoperto dopo.
  $('#esci-spazio').addEventListener('click', async (e) => {
    const comanda = Boolean((await spazioLocale())?.chiave);
    chiediConferma(
      e.target, 'esci-spazio',
      comanda ? 'Perdi la chiave: confermi?' : 'Esci davvero?',
      async () => {
        await dimenticaSpazio();
        await rendiSpazio();
        diciSpazio(comanda
          ? 'Uscito. La chiave era solo qui: per rimettere in comune un menù '
            + 'bisogna aprire un altro spazio e ridettare il codice.'
          : 'Uscito dallo spazio. Il piano e i gusti restano dove sono: '
            + 'smette solo di arrivare il menù nuovo.');
      },
    );
  });
}

export async function inizializza() {
  avvia({ nav: 'altro' });
  montaTema();
  await rendiProfili();
  await rendiRipristino();
  await rendiSpazio();

  $('#profili').addEventListener('click', gestisciProfili);
  $('#profili').addEventListener('change', cambiaRiferimento);
  $('#esporta').addEventListener('click', esporta);
  $('#importa').addEventListener('click', importa);

  // Il foglio di condivisione con i file non c'e' su tutti i browser: dove
  // manca, resta l'esportazione, che fa la stessa cosa in due passi.
  if (puoCondividereFile()) {
    $('#condividi-profilo').hidden = false;
    $('#nota-condivisione').hidden = false;
    $('#condividi-profilo').addEventListener('click', condividi);
  }
  collegaRipristino();
  collegaSpazio();
}
