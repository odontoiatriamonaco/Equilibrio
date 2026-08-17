// Cosa puo' entrare nello spazio famiglia, e cosa no.
//
// Il client manda gia' solo quello che serve, ma la ripulitura vera si fa qui:
// il server e' l'unico punto che nessuno puo' saltare. Se un giorno una pagina
// dimenticasse di togliere il fabbisogno prima di pubblicare, deve fermarsi
// contro questo file, non finire in un archivio di terze parti.
//
// Regola: passano PIETANZE, PORZIONI ed ETICHETTE. Non passano ne' calorie, ne'
// peso, ne' target, ne' pavimento calorico, ne' patologie.

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const PASTI = ['colazione', 'spuntino-mattina', 'pranzo', 'spuntino-pomeriggio', 'cena'];

const MAX_MEMBRI = 8;
const MAX_VOCI_PASTO = 6;
const MAX_PORZIONI = 250;
const MAX_PROPOSTE = 60;

function testo(v, quanto) {
    return String(v == null ? '' : v).slice(0, quanto);
}

/** Un numero vero e dentro un intervallo, o `null`. Mai NaN, mai Infinity. */
function numero(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
}

/* --- Il menu' -------------------------------------------------------------- */

function sanificaVoce(v) {
    if (!v || typeof v !== 'object') return null;
    const tipo = v.tipo === 'alimento' ? 'alimento' : 'piatto';
    const id = testo(v.id, 60);
    if (!id) return null;
    // Solo tipo e id: le porzioni del menu' sono di chi l'ha generato, e ognuno
    // ricalcola le proprie. Portarle qui vorrebbe dire imporle a tutti.
    return { tipo, id };
}

function sanificaGiorno(g) {
    if (!g || typeof g !== 'object') return null;
    const etichetta = GIORNI.includes(g.etichetta) ? g.etichetta : null;
    if (!etichetta) return null;

    const pasti = {};
    for (const nome of PASTI) {
        const voci = Array.isArray(g.pasti?.[nome]) ? g.pasti[nome] : [];
        pasti[nome] = voci.slice(0, MAX_VOCI_PASTO).map(sanificaVoce).filter(Boolean);
    }
    return {
        etichetta,
        data: testo(g.data, 10),
        rigido: Boolean(g.rigido),
        pasti,
    };
}

/**
 * Il menu' della settimana ridotto al suo scheletro.
 *
 * Quello che resta e' l'unica parte di una settimana che NON parla del corpo di
 * chi la mangia: quali pietanze, in che giorno, in che pasto. Il resto —
 * `target`, `floor`, `quota`, le porzioni, lo sgarro — si ricalcola su ogni
 * dispositivo dal profilo di chi ci vive, e non ha motivo di viaggiare.
 */
function sanificaMenu(menu) {
    if (!menu || typeof menu !== 'object') return null;
    const inizio = testo(menu.inizio, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inizio)) return null;

    const giorni = (Array.isArray(menu.giorni) ? menu.giorni : [])
        .slice(0, 7).map(sanificaGiorno).filter(Boolean);
    if (!giorni.length) return null;

    return {
        inizio,
        seme: numero(menu.seme, 0, Number.MAX_SAFE_INTEGER) ?? 0,
        da: testo(menu.da, 40),
        quando: testo(menu.quando, 30),
        giorni,
    };
}

/* --- I membri -------------------------------------------------------------- */

/**
 * Quello che una persona pubblica di se': come si chiama e quanto mangia di
 * ogni voce, in porzioni.
 *
 * In porzioni e non in grammi apposta. I grammi si ricavano dalla ricetta, e la
 * ricetta ce l'ha gia' chi guarda: chi cucina deve pesare secondo la SUA
 * ricetta, non secondo quella che ha in casa un altro. «1,35 porzioni» resta
 * vero anche se le due ricette non coincidono; «56 g di pasta» no.
 */
function sanificaMembro(m) {
    if (!m || typeof m !== 'object') return null;
    const id = testo(m.id, 80);
    if (!id) return null;

    const porzioni = {};
    const voci = (m.porzioni && typeof m.porzioni === 'object') ? m.porzioni : {};
    for (const chiave of Object.keys(voci).slice(0, MAX_PORZIONI)) {
        const n = numero(voci[chiave], 0, 20);
        if (n !== null) porzioni[testo(chiave, 40)] = Math.round(n * 100) / 100;
    }

    return {
        id,
        nome: testo(m.nome, 40) || 'Senza nome',
        segue: m.segue ? testo(m.segue, 80) : null,
        aggiornatoIl: new Date().toISOString(),
        porzioni,
    };
}

/* --- Le proposte ----------------------------------------------------------- */

function sanificaProposta(p) {
    if (!p || typeof p !== 'object') return null;
    const da = testo(p.da, 80);
    const chiave = testo(p.chiave, 40);
    const nuovoId = testo(p.nuovoId, 60);
    if (!da || !chiave || !nuovoId) return null;

    return {
        id: testo(p.id, 60) || `${da}:${chiave}`,
        da,
        nome: testo(p.nome, 40),
        // La settimana a cui si riferisce: senza, una richiesta accettata
        // potrebbe atterrare sul lunedi' sbagliato.
        inizio: testo(p.inizio, 10),
        chiave,
        nuovoId,
        // Cosa sostituisce, per chi decide: senza, la richiesta e' incomprensibile.
        alPostoDi: testo(p.alPostoDi, 60),
        motivo: testo(p.motivo, 120),
        stato: 'attesa',
        quando: new Date().toISOString(),
    };
}

/**
 * Una proposta sostituisce la precedente della stessa persona sullo stesso
 * pasto: chi cambia idea non deve lasciare due richieste che si contraddicono
 * sul telefono di chi cucina.
 */
function fondiProposte(esistenti, arrivata) {
    const tenute = (esistenti || []).filter(
        (p) => !(p.da === arrivata.da && p.chiave === arrivata.chiave),
    );
    return [...tenute, arrivata].slice(-MAX_PROPOSTE);
}

/* --- Il documento ---------------------------------------------------------- */

/** Aggiunge o rimpiazza un membro, senza toccare gli altri. */
function fondiMembro(membri, membro) {
    const fuori = { ...(membri || {}) };
    // Uno spazio famiglia e' una famiglia: senza un tetto, chi trovasse il
    // codice potrebbe riempirlo di membri finti finche' non diventa illeggibile.
    if (!fuori[membro.id] && Object.keys(fuori).length >= MAX_MEMBRI) return null;
    fuori[membro.id] = membro;
    return fuori;
}

/**
 * Lo spazio come lo vede chi lo legge.
 * L'impronta della chiave non esce mai: chi ha il codice puo' leggere e
 * pubblicare le proprie porzioni, non decidere il menu' per tutti.
 */
function spazioPubblico(riga) {
    if (!riga) return null;
    return {
        // Chi ha aperto lo spazio non e' un segreto: serve a ogni dispositivo
        // per sapere sotto quale profilo scrivere il menu' che arriva.
        capo: riga.capo || null,
        menu: riga.menu || null,
        membri: riga.membri || {},
        proposte: riga.proposte || [],
        creatoIl: riga.creatoIl,
        aggiornatoIl: riga.aggiornatoIl,
    };
}

module.exports = {
    GIORNI: GIORNI,
    PASTI: PASTI,
    MAX_MEMBRI: MAX_MEMBRI,
    sanificaMenu: sanificaMenu,
    sanificaMembro: sanificaMembro,
    sanificaProposta: sanificaProposta,
    fondiProposte: fondiProposte,
    fondiMembro: fondiMembro,
    spazioPubblico: spazioPubblico,
};
