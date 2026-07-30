// Helper condivisi per le serverless function.
// Adattato da B1One-calcolatore, senza la parte di ruoli: qui non c'e' un admin.

const crypto = require('crypto');

/** La lista condivisa si autodistrugge: 48 ore bastano per una spesa. */
const TTL_LISTA = 60 * 60 * 48;

/** Body parser tollerante: req.body puo' gia' essere parsato da Vercel. */
async function parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.length > 0) {
        try { return JSON.parse(req.body); } catch (e) { return {}; }
    }
    return new Promise(function (resolve) {
        var chunks = [];
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', function () {
            var raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
        });
        req.on('error', function () { resolve({}); });
    });
}

function setNoCacheHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
}

/** Codice a 6 cifre, casuale crittografico: non deve essere indovinabile. */
function nuovoCodice() {
    var n = crypto.randomInt(0, 1000000);
    return String(n).padStart(6, '0');
}

function chiaveLista(codice) {
    return 'spesa:' + codice;
}

/**
 * Ripulisce la lista prima che esca dal dispositivo.
 * Passano SOLO alimento, quantita', reparto e spunta: nessun nome, nessun peso,
 * nessuna caloria, nessun identificativo di profilo. E' il punto di tutta la
 * scelta di architettura, e va fatto rispettare qui, non solo nel client.
 */
function sanifica(voci) {
    if (!Array.isArray(voci)) return [];
    return voci.slice(0, 300).map(function (v) {
        return {
            alimentoId: String(v.alimentoId || '').slice(0, 60),
            nome: String(v.nome || '').slice(0, 80),
            quantita: String(v.quantita || '').slice(0, 40),
            reparto: String(v.reparto || '').slice(0, 40),
            spuntato: Boolean(v.spuntato),
            spuntatoIl: typeof v.spuntatoIl === 'string' ? v.spuntatoIl.slice(0, 30) : null,
        };
    });
}

/**
 * Fonde le spunte per singola voce, con vittoria della piu' recente.
 * Deve stare anche lato server: due telefoni possono scrivere insieme, e
 * l'ultimo a parlare non deve cancellare il lavoro dell'altro.
 */
function fondi(esistenti, arrivate) {
    var perId = {};
    (esistenti || []).forEach(function (v) { perId[v.alimentoId] = v; });
    (arrivate || []).forEach(function (v) {
        var vecchia = perId[v.alimentoId];
        if (!vecchia || String(v.spuntatoIl || '') > String(vecchia.spuntatoIl || '')) {
            perId[v.alimentoId] = v;
        }
    });
    return Object.keys(perId).map(function (k) { return perId[k]; });
}

/** Il client deve poter distinguere «non configurato» da «errore vero». */
function kvMancante(res) {
    setNoCacheHeaders(res);
    res.status(503).json({
        ok: false,
        codice: 'kv-assente',
        error: 'La condivisione non e\' configurata su questo deploy: manca l\'integrazione KV.',
    });
}

module.exports = {
    TTL_LISTA: TTL_LISTA,
    parseBody: parseBody,
    setNoCacheHeaders: setNoCacheHeaders,
    nuovoCodice: nuovoCodice,
    chiaveLista: chiaveLista,
    sanifica: sanifica,
    fondi: fondi,
    kvMancante: kvMancante,
};
