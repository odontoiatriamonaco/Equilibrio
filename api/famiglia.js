// Equilibrio — lo spazio famiglia.
//
// Chi cucina decide il menu' della settimana; gli altri lo seguono con le
// PROPRIE porzioni. Prima serviva riesportare un file cifrato ogni lunedi':
// qui il menu' viaggia da solo, e ognuno pubblica quanto mangia perche' chi
// cucina sappia quanto mettere in pentola.
//
// Cosa esce dal dispositivo: pietanze, porzioni e nomi di battesimo. Cosa NON
// esce: peso, altezza, eta', patologie, calorie, fabbisogno. La ripulitura sta
// in `_spazio.js` e la fa il server, non solo il client.
//
// Due credenziali, e sono diverse apposta:
//   il CODICE     — si detta in famiglia. Legge, e pubblica le proprie porzioni.
//   la CHIAVE     — resta a chi ha creato lo spazio. Riscrive il menu' di tutti.
// Con una sola credenziale chiunque avesse il codice potrebbe cambiare la cena
// a tutta la famiglia, e nessuno saprebbe da dove e' arrivata.
//
//   POST  { menu, membro }            -> crea lo spazio: { codice, chiave }
//   GET   ?codice=X                   -> menu', membri e proposte
//   PATCH { codice, membro|proposta } -> le proprie porzioni, o una richiesta
//   PUT   { codice, chiave, menu|esiti } -> il menu', o l'esito delle richieste

const lib = require('./_lib.js');
const sp = require('./_spazio.js');
const { kv } = require('./_kv.js');

/** Spazi creati da uno stesso indirizzo in un'ora. */
const CREAZIONI_MAX = 10;

/**
 * @param archivioDiProva usato solo dalle prove: Vercel chiama sempre e solo
 *        con (req, res), quindi in produzione resta `undefined` e si passa da
 *        `kv()`. Serve a poter esercitare per davvero chi puo' fare cosa.
 */
module.exports = async function handler(req, res, archivioDiProva) {
    lib.setNoCacheHeaders(res);

    const archivio = archivioDiProva || await kv();
    if (!archivio) return lib.kvMancante(res);

    try {
        if (req.method === 'POST') return await crea(req, res, archivio);
        if (req.method === 'GET') return await leggi(req, res, archivio);
        if (req.method === 'PATCH') return await partecipa(req, res, archivio);
        if (req.method === 'PUT') return await comanda(req, res, archivio);
        res.setHeader('Allow', 'GET, POST, PATCH, PUT');
        return res.status(405).json({ ok: false, error: 'Metodo non consentito' });
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'Errore del servizio' });
    }
};

/**
 * Il codice arrivato e la riga che gli corrisponde.
 * Restituisce `null` avendo gia' risposto: 400 se e' scritto male, 429 se da
 * questo indirizzo si sta tirando a indovinare, 404 se non esiste.
 */
async function apri(grezzo, req, res, archivio) {
    const codice = lib.normalizzaCodice(grezzo);
    if (!lib.codiceValido(codice) || codice.length !== lib.LUNGHEZZA_CODICE) {
        res.status(400).json({ ok: false, error: 'Codice non valido' });
        return null;
    }
    if (await lib.troppiTentativi(archivio, 'famiglia', lib.ipDi(req))) {
        lib.frenoRisposta(res);
        return null;
    }

    const riga = await archivio.get(lib.chiaveSpazio(codice));
    if (!riga) {
        await lib.segnaTentativo(archivio, 'famiglia', lib.ipDi(req));
        res.status(404).json({ ok: false, error: 'Spazio inesistente' });
        return null;
    }
    return { codice, riga };
}

/**
 * Riscrive lo spazio rinnovandone la scadenza.
 * Sei mesi si contano dall'ultimo uso: finche' la famiglia lo apre non scade
 * mai, e se lo dimenticano sparisce da solo invece di restare li' per sempre.
 */
async function salva(archivio, codice, riga) {
    const aggiornato = { ...riga, aggiornatoIl: new Date().toISOString() };
    await archivio.set(lib.chiaveSpazio(codice), aggiornato, { ex: lib.TTL_SPAZIO });
    return aggiornato;
}

async function crea(req, res, archivio) {
    const body = await lib.parseBody(req);
    const menu = sp.sanificaMenu(body.menu);
    const membro = sp.sanificaMembro(body.membro);
    if (!menu || !membro) {
        return res.status(400).json({ ok: false, error: 'Serve un menù e chi lo pubblica' });
    }

    const ip = lib.ipDi(req);
    if (await lib.troppiTentativi(archivio, 'crea-famiglia', ip, CREAZIONI_MAX)) {
        return lib.frenoRisposta(res);
    }
    await lib.segnaTentativo(archivio, 'crea-famiglia', ip);

    let codice = lib.nuovoCodice();
    if (await archivio.get(lib.chiaveSpazio(codice))) codice = lib.nuovoCodice();

    const chiave = lib.nuovaChiave();
    await salva(archivio, codice, {
        creatoIl: new Date().toISOString(),
        // Della chiave si tiene l'impronta: qui dentro non c'e' niente con cui
        // riscrivere il menu' di una famiglia.
        chiaveImpronta: lib.improntaChiave(chiave),
        capo: membro.id,
        menu,
        membri: { [membro.id]: membro },
        proposte: [],
    });

    return res.status(200).json({ ok: true, codice, chiave, scadeIn: lib.TTL_SPAZIO });
}

async function leggi(req, res, archivio) {
    const aperto = await apri(req.query?.codice, req, res, archivio);
    if (!aperto) return;
    return res.status(200).json({ ok: true, ...sp.spazioPubblico(aperto.riga) });
}

/** Quello che puo' fare chi ha il solo codice: parlare per se'. */
async function partecipa(req, res, archivio) {
    const body = await lib.parseBody(req);
    const aperto = await apri(body.codice, req, res, archivio);
    if (!aperto) return;

    let { riga } = aperto;
    let toccato = false;

    if (body.membro) {
        const membro = sp.sanificaMembro(body.membro);
        if (!membro) return res.status(400).json({ ok: false, error: 'Membro non valido' });
        const membri = sp.fondiMembro(riga.membri, membro);
        if (!membri) {
            return res.status(409).json({
                ok: false,
                codice: 'troppi-membri',
                error: `Uno spazio famiglia tiene al massimo ${sp.MAX_MEMBRI} persone.`,
            });
        }
        riga = { ...riga, membri };
        toccato = true;
    }

    if (body.proposta) {
        const proposta = sp.sanificaProposta(body.proposta);
        if (!proposta) return res.status(400).json({ ok: false, error: 'Proposta non valida' });
        riga = { ...riga, proposte: sp.fondiProposte(riga.proposte, proposta) };
        toccato = true;
    }

    if (!toccato) return res.status(400).json({ ok: false, error: 'Niente da aggiornare' });

    riga = await salva(archivio, aperto.codice, riga);
    return res.status(200).json({ ok: true, ...sp.spazioPubblico(riga) });
}

/** Quello che puo' fare solo chi ha la chiave: decidere per tutti. */
async function comanda(req, res, archivio) {
    const body = await lib.parseBody(req);
    const aperto = await apri(body.codice, req, res, archivio);
    if (!aperto) return;

    let { riga } = aperto;
    if (!lib.segretiUguali(lib.improntaChiave(body.chiave), riga.chiaveImpronta)) {
        // Una chiave sbagliata e' un tentativo a tutti gli effetti: qui si
        // proverebbe a indovinare la credenziale che comanda, non il codice.
        await lib.segnaTentativo(archivio, 'famiglia', lib.ipDi(req));
        return res.status(403).json({
            ok: false,
            codice: 'non-sei-tu',
            error: 'Il menù lo pubblica chi ha creato lo spazio.',
        });
    }

    if (body.menu) {
        const menu = sp.sanificaMenu(body.menu);
        if (!menu) return res.status(400).json({ ok: false, error: 'Menù non valido' });
        // Il menu' e' cambiato: le richieste rimaste in sospeso parlavano di
        // pietanze che non ci sono piu', e trascinarsele dietro vorrebbe dire
        // accettare per la cena di martedi' un piatto che martedi' non c'e'.
        const stessaSettimana = riga.menu && riga.menu.inizio === menu.inizio;
        riga = { ...riga, menu, proposte: stessaSettimana ? riga.proposte : [] };
    }

    if (Array.isArray(body.esiti)) {
        const deciso = new Map(
            body.esiti.map((e) => [String(e?.id || ''), e?.stato === 'accettata' ? 'accettata' : 'rifiutata']),
        );
        riga = {
            ...riga,
            proposte: (riga.proposte || []).map(
                (p) => (deciso.has(p.id) ? { ...p, stato: deciso.get(p.id) } : p),
            ),
        };
    }

    riga = await salva(archivio, aperto.codice, riga);
    return res.status(200).json({ ok: true, ...sp.spazioPubblico(riga) });
}
