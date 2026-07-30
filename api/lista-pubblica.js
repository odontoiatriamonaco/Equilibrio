// Equilibrio — condivisione della SOLA lista della spesa.
//
// Fuori dal dispositivo viaggiano soltanto alimenti, quantita' e spunte.
// Niente nome, niente peso, niente calorie, niente identificativi di profilo:
// il server non e' in grado di sapere di chi sia una lista, ne' cosa mangi.
//
// Tre operazioni:
//   POST   { voci }                  -> crea e restituisce un codice a 6 cifre
//   GET    ?codice=123456           -> legge la lista
//   PATCH  { codice, voci }         -> fonde le spunte, voce per voce
//
// La lista scade da sola dopo 48 ore (TTL nativo di KV).

const lib = require('./_lib.js');

async function kv() {
    try {
        // Import pigro: se l'integrazione non c'e', si risponde 503 invece di
        // far cadere l'intera funzione.
        const mod = await import('@vercel/kv');
        if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) return null;
        return mod.kv;
    } catch (e) {
        return null;
    }
}

module.exports = async function handler(req, res) {
    lib.setNoCacheHeaders(res);

    const archivio = await kv();
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

    // Un solo tentativo di collisione: con un milione di codici e liste che
    // vivono due giorni, ripetere e' improbabile ma non impossibile.
    let codice = lib.nuovoCodice();
    if (await archivio.get(lib.chiaveLista(codice))) codice = lib.nuovoCodice();

    await archivio.set(
        lib.chiaveLista(codice),
        { voci, creataIl: new Date().toISOString() },
        { ex: lib.TTL_LISTA },
    );

    return res.status(200).json({ ok: true, codice, scadeIn: lib.TTL_LISTA });
}

async function leggi(req, res, archivio) {
    const codice = String(req.query?.codice || '').replace(/\D/g, '');
    if (codice.length !== 6) {
        return res.status(400).json({ ok: false, error: 'Codice non valido' });
    }

    const riga = await archivio.get(lib.chiaveLista(codice));
    if (!riga) {
        return res.status(404).json({ ok: false, error: 'Codice scaduto o inesistente' });
    }
    return res.status(200).json({ ok: true, voci: riga.voci, creataIl: riga.creataIl });
}

async function aggiorna(req, res, archivio) {
    const body = await lib.parseBody(req);
    const codice = String(body.codice || '').replace(/\D/g, '');
    if (codice.length !== 6) {
        return res.status(400).json({ ok: false, error: 'Codice non valido' });
    }

    const chiave = lib.chiaveLista(codice);
    const riga = await archivio.get(chiave);
    if (!riga) {
        return res.status(404).json({ ok: false, error: 'Codice scaduto o inesistente' });
    }

    const fuse = lib.fondi(riga.voci, lib.sanifica(body.voci));
    await archivio.set(chiave, { ...riga, voci: fuse }, { ex: lib.TTL_LISTA });

    return res.status(200).json({ ok: true, voci: fuse });
}
