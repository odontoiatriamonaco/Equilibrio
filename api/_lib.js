// Helper condivisi per le serverless function.
// Adattato da B1One-calcolatore, senza la parte di ruoli: qui non c'e' un admin.

const crypto = require('crypto');

/** La lista condivisa si autodistrugge: 48 ore bastano per una spesa. */
const TTL_LISTA = 60 * 60 * 48;

/**
 * Lo spazio famiglia invece dura, perche' il menu' cambia ogni settimana e
 * nessuno ha voglia di riscambiarsi un codice ogni lunedi'. Sei mesi si contano
 * dall'ULTIMO uso, non dalla creazione: uno spazio vivo non scade mai, uno
 * dimenticato sparisce da solo. I dati non devono sopravvivere a chi li usa.
 */
const TTL_SPAZIO = 60 * 60 * 24 * 182;

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

/* --- Codici ---------------------------------------------------------------- */

/**
 * Alfabeto base32 di Crockford: niente I, L, O, U.
 * Le prime tre si confondono leggendo (1/l/I, 0/O); la U e' fuori perche' senza
 * di lei un codice casuale non forma parolacce per sbaglio.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Dieci caratteri: 32^10, circa mille miliardi di volte le vecchie 6 cifre. */
const LUNGHEZZA_CODICE = 10;

/** La chiave di chi comanda lo spazio e' piu' lunga: non si detta a voce. */
const LUNGHEZZA_CHIAVE = 20;

function sorteggia(lunghezza) {
    // 256 e' multiplo esatto di 32, quindi il resto non favorisce nessuna
    // lettera: prendere il modulo qui non introduce distorsioni.
    var byte = crypto.randomBytes(lunghezza);
    var out = '';
    for (var i = 0; i < lunghezza; i++) out += ALFABETO[byte[i] % 32];
    return out;
}

function nuovoCodice() {
    return sorteggia(LUNGHEZZA_CODICE);
}

function nuovaChiave() {
    return sorteggia(LUNGHEZZA_CHIAVE);
}

/**
 * Riporta alla forma canonica un codice ricopiato a mano.
 * Chi legge da un foglio scrive O per lo zero e l per l'uno: e' un codice
 * giusto scritto male, non un codice sbagliato, e va accettato.
 */
function normalizzaCodice(grezzo) {
    return String(grezzo || '')
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
}

function soloAlfabeto(codice) {
    for (var i = 0; i < codice.length; i++) {
        if (ALFABETO.indexOf(codice[i]) < 0) return false;
    }
    return true;
}

/**
 * I codici a 6 cifre sono quelli generati prima di questo cambiamento.
 * Vivono al massimo 48 ore, ma in quelle 48 ore c'e' chi sta facendo la spesa:
 * si continuano ad accettare in lettura, non si generano piu'.
 */
function codiceValido(codice) {
    if (codice.length === 6 && /^\d{6}$/.test(codice)) return true;
    return codice.length === LUNGHEZZA_CODICE && soloAlfabeto(codice);
}

/** Come si mostra a chi lo deve ricopiare: due gruppi da cinque. */
function codiceLeggibile(codice) {
    if (codice.length !== LUNGHEZZA_CODICE) return codice;
    return codice.slice(0, 5) + '-' + codice.slice(5);
}

/**
 * Confronto a tempo costante fra segreti.
 * Un `===` su una stringa esce al primo carattere diverso, e da quanto ci mette
 * si impara il segreto un carattere alla volta.
 */
function segretiUguali(a, b) {
    var x = Buffer.from(String(a || ''), 'utf8');
    var y = Buffer.from(String(b || ''), 'utf8');
    if (x.length !== y.length || x.length === 0) return false;
    return crypto.timingSafeEqual(x, y);
}

/**
 * L'impronta della chiave, ed e' l'unica cosa che si archivia.
 * La chiave in chiaro resta sul dispositivo di chi comanda lo spazio: chi
 * riuscisse a leggere l'archivio remoto troverebbe un'impronta, non un
 * lasciapassare per riscrivere il menu' di una famiglia.
 */
function improntaChiave(chiave) {
    return crypto.createHash('sha256').update(String(chiave || ''), 'utf8').digest('hex');
}

function chiaveLista(codice) {
    return 'spesa:' + codice;
}

function chiaveSpazio(codice) {
    return 'famiglia:' + codice;
}

/* --- Freno ai tentativi ---------------------------------------------------- */

/** Codici sbagliati tollerati da uno stesso indirizzo, e in quanto tempo. */
const TENTATIVI_MAX = 12;
const FINESTRA_TENTATIVI = 60 * 60;

/** Dietro Vercel l'indirizzo vero e' il primo della catena. */
function ipDi(req) {
    var testa = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
    if (!testa) return 'ignoto';
    return String(testa).split(',')[0].trim() || 'ignoto';
}

function chiaveTentativi(gruppo, ip) {
    return 'freno:' + gruppo + ':' + ip;
}

/**
 * Un codice a 10 caratteri non si indovina, ma senza un freno lo si puo'
 * provare all'infinito, ed e' cosi' che il vecchio codice a 6 cifre cadeva.
 *
 * Si contano solo i tentativi ANDATI A VUOTO: chi ha il codice giusto non
 * incontra mai questo limite, per quante volte apra l'app.
 */
async function troppiTentativi(archivio, gruppo, ip, max) {
    var quanti = await archivio.get(chiaveTentativi(gruppo, ip));
    return Number(quanti || 0) >= (max || TENTATIVI_MAX);
}

async function segnaTentativo(archivio, gruppo, ip, finestra) {
    var chiave = chiaveTentativi(gruppo, ip);
    var quanti = await archivio.incr(chiave);
    // La finestra parte dal primo errore e non si allunga a ogni tentativo
    // successivo: chi sbaglia non resta segnato per sempre.
    if (Number(quanti) === 1) await archivio.expire(chiave, finestra || FINESTRA_TENTATIVI);
    return Number(quanti);
}

function frenoRisposta(res) {
    setNoCacheHeaders(res);
    return res.status(429).json({
        ok: false,
        codice: 'troppi-tentativi',
        error: 'Troppi codici sbagliati da questo dispositivo. Riprova fra un\'ora.',
    });
}

/* --- Lista della spesa ----------------------------------------------------- */

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
    return res.status(503).json({
        ok: false,
        codice: 'kv-assente',
        error: 'La condivisione non e\' configurata su questo deploy: manca l\'integrazione KV.',
    });
}

module.exports = {
    TTL_LISTA: TTL_LISTA,
    TTL_SPAZIO: TTL_SPAZIO,
    ALFABETO: ALFABETO,
    LUNGHEZZA_CODICE: LUNGHEZZA_CODICE,
    LUNGHEZZA_CHIAVE: LUNGHEZZA_CHIAVE,
    TENTATIVI_MAX: TENTATIVI_MAX,
    FINESTRA_TENTATIVI: FINESTRA_TENTATIVI,
    parseBody: parseBody,
    setNoCacheHeaders: setNoCacheHeaders,
    nuovoCodice: nuovoCodice,
    nuovaChiave: nuovaChiave,
    normalizzaCodice: normalizzaCodice,
    codiceValido: codiceValido,
    codiceLeggibile: codiceLeggibile,
    segretiUguali: segretiUguali,
    improntaChiave: improntaChiave,
    chiaveLista: chiaveLista,
    chiaveSpazio: chiaveSpazio,
    ipDi: ipDi,
    troppiTentativi: troppiTentativi,
    segnaTentativo: segnaTentativo,
    frenoRisposta: frenoRisposta,
    sanifica: sanifica,
    fondi: fondi,
    kvMancante: kvMancante,
};
