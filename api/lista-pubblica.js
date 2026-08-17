// Equilibrio — condivisione della SOLA lista della spesa.
//
// Fuori dal dispositivo viaggiano soltanto alimenti, quantita' e spunte.
// Niente nome, niente peso, niente calorie, niente identificativi di profilo:
// il server non e' in grado di sapere di chi sia una lista, ne' cosa mangi.
//
// Tre operazioni:
//   POST   { voci }            -> crea e restituisce un codice
//   GET    ?codice=ABCDE-FGHJK -> legge la lista
//   PATCH  { codice, voci }    -> fonde le spunte, voce per voce
//
// La lista scade da sola dopo 48 ore (TTL nativo dell'archivio).

const lib = require('./_lib.js');
const { kv } = require('./_kv.js');

/** Liste create da uno stesso indirizzo in un'ora: e' un freno all'abuso. */
const CREAZIONI_MAX = 30;

/**
 * @param archivioDiProva usato solo dalle prove: Vercel chiama sempre e solo
 *        con (req, res), quindi in produzione resta `undefined`.
 */
module.exports = async function handler(req, res, archivioDiProva) {
    lib.setNoCacheHeaders(res);

    const archivio = archivioDiProva || await kv();
    if (!archivio) return lib.kvMancante(res);

    try {
        if (req.method === 'POST') return await crea(req, res, archivio);
        if (req.method === 'GET') return await leggi(req, res, archivio);
        if (req.method === 'PATCH') return await aggiorna(req, res, archivio);
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ ok: false, error: 'Metodo non consentito' });
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'Errore del servizio' });
    }
};

async function crea(req, res, archivio) {
    const body = await lib.parseBody(req);
    const voci = lib.sanifica(body.voci);
    if (!voci.length) {
        return res.status(400).json({ ok: false, error: 'Lista vuota' });
    }

    const ip = lib.ipDi(req);
    if (await lib.troppiTentativi(archivio, 'crea', ip, CREAZIONI_MAX)) {
        return lib.frenoRisposta(res);
    }
    await lib.segnaTentativo(archivio, 'crea', ip);

    // Con 32^10 codici la collisione e' teorica, ma costa una lettura
    // accorgersene e cancellerebbe la lista di qualcun altro.
    let codice = lib.nuovoCodice();
    if (await archivio.get(lib.chiaveLista(codice))) codice = lib.nuovoCodice();

    await archivio.set(
        lib.chiaveLista(codice),
        { voci, creataIl: new Date().toISOString() },
        { ex: lib.TTL_LISTA },
    );

    return res.status(200).json({ ok: true, codice, scadeIn: lib.TTL_LISTA });
}

/**
 * Il codice arrivato, se e' scritto bene e se da questo indirizzo si puo'
 * ancora provare. Restituisce `null` avendo gia' risposto.
 */
async function codiceDa(grezzo, req, res, archivio) {
    const codice = lib.normalizzaCodice(grezzo);
    if (!lib.codiceValido(codice)) {
        res.status(400).json({ ok: false, error: 'Codice non valido' });
        return null;
    }
    if (await lib.troppiTentativi(archivio, 'spesa', lib.ipDi(req))) {
        lib.frenoRisposta(res);
        return null;
    }
    return codice;
}

/** Codice inesistente: e' l'unico caso che alimenta il freno. */
async function nonTrovato(req, res, archivio) {
    await lib.segnaTentativo(archivio, 'spesa', lib.ipDi(req));
    return res.status(404).json({ ok: false, error: 'Codice scaduto o inesistente' });
}

async function leggi(req, res, archivio) {
    const codice = await codiceDa(req.query?.codice, req, res, archivio);
    if (!codice) return;

    const riga = await archivio.get(lib.chiaveLista(codice));
    if (!riga) return nonTrovato(req, res, archivio);

    return res.status(200).json({ ok: true, voci: riga.voci, creataIl: riga.creataIl });
}

async function aggiorna(req, res, archivio) {
    const body = await lib.parseBody(req);
    const codice = await codiceDa(body.codice, req, res, archivio);
    if (!codice) return;

    const chiave = lib.chiaveLista(codice);
    const riga = await archivio.get(chiave);
    if (!riga) return nonTrovato(req, res, archivio);

    const fuse = lib.fondi(riga.voci, lib.sanifica(body.voci));
    await archivio.set(chiave, { ...riga, voci: fuse }, { ex: lib.TTL_LISTA });

    return res.status(200).json({ ok: true, voci: fuse });
}
