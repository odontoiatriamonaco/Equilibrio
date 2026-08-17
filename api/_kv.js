// L'unica porta verso l'archivio remoto.
//
// Sta in un file suo perche' le funzioni che lo usano sono due, e perche' e' il
// punto in cui l'app decide se la condivisione esiste o no: sbagliarlo qui vuol
// dire mostrare «errore del servizio» a chi semplicemente non l'ha configurata.

let clientePromessa = null;

/**
 * Le due coppie con cui l'archivio puo' arrivare, a seconda di come e' stato
 * collegato: l'integrazione di Vercel scrive KV_*, quella diretta di Upstash
 * scrive UPSTASH_*.
 *
 * Servono ENTRAMBE le variabili di una coppia. Il controllo di prima si
 * accontentava dell'indirizzo e lasciava passare il caso senza token: la
 * connessione partiva e cadeva dopo, e l'utente leggeva «errore del servizio»
 * al posto di «non e' configurata».
 */
function credenziali() {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
    }
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        return {
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        };
    }
    return null;
}

/**
 * Il client, o `null` se l'archivio non c'e'.
 *
 * Import pigro: senza l'integrazione la funzione deve rispondere 503 e restare
 * in piedi, non cadere al caricamento del modulo.
 */
async function kv() {
    const conf = credenziali();
    if (!conf) return null;
    if (!clientePromessa) {
        clientePromessa = (async () => {
            const { Redis } = await import('@upstash/redis');
            return new Redis(conf);
        })().catch(() => {
            // Un fallimento non deve restare incollato alla cache: la prossima
            // invocazione riprova invece di ereditare l'errore per sempre.
            clientePromessa = null;
            return null;
        });
    }
    return clientePromessa;
}

module.exports = { kv: kv, credenziali: credenziali };
