/* Equilibrio — cosa dice il tutor, pagina per pagina.

   Il testo sta qui e non sparso nelle pagine per una ragione pratica: le frasi
   di una guida vanno rilette tutte insieme, o si finisce per spiegare la stessa
   cosa in due modi diversi in due punti diversi.

   Come si scrive un passo: dire COSA SI VEDE e A COSA SERVE, non come si usa.
   «Premi qui per aprire» lo si capisce da solo guardando un pulsante; «questo
   numero è quello che ti resta oggi, e cala man mano che spunti i pasti» no.

   Se un bersaglio non c'è, il passo sparisce da solo — vedi `tutor.js`. Quindi
   qui si possono elencare anche riquadri che compaiono solo a volte. */

export const PASSI_OGGI = [
  {
    sel: '#anello-oggi',
    titolo: 'Quanto ti resta oggi',
    testo: 'L’anello è la giornata: si riempie man mano che spunti i pasti, e sotto '
      + 'trovi le calorie che restano. Non è un voto — è un promemoria di quello che '
      + 'hai ancora in programma.',
  },
  {
    sel: '#riquadro-settimana',
    titolo: 'La settimana in una striscia',
    testo: 'Sette barre, una per giorno. Servono a vedere in un colpo se un giorno '
      + 'pesa più degli altri: quando registri uno sgarro, qui si vede dove sono '
      + 'andate a finire le calorie.',
  },
  {
    sel: '#pasti-oggi',
    titolo: 'I pasti di oggi',
    testo: 'Ogni pasto ha il suo colore. Sotto ai piatti trovi le grammature già '
      + 'calcolate sul tuo fabbisogno, e le icone accanto servono a cambiare la '
      + 'quantità, scambiare il piatto o aprire la ricetta.',
  },
  {
    sel: '#acqua',
    titolo: 'L’acqua',
    testo: 'Un bicchiere per tocco. È l’unica cosa qui dentro che non entra nei '
      + 'conti delle calorie: serve solo a ricordartene.',
  },
  {
    sel: '#percorso',
    titolo: 'Da dove si comincia',
    testo: 'Finché manca un passo per essere operativo, questo riquadro te lo dice '
      + 'e ti ci porta. Quando hai finito sparisce da solo.',
  },
];

export const PASSI_PIANO = [
  {
    sel: '#riquadro-fascia',
    titolo: 'I sette giorni a colpo d’occhio',
    testo: 'Ogni barra è un giorno, l’altezza sono le calorie. La linea è il tuo '
      + 'bersaglio: i giorni sopra e sotto si compensano fra loro nell’arco della '
      + 'settimana, non devono essere tutti uguali.',
  },
  {
    sel: '#barra-azioni',
    titolo: 'Le tre cose che puoi fare qui',
    testo: 'Registrare uno sgarro — anche prenotandolo prima, per la pizza di sabato. '
      + 'Rigenerare la settimana, che rifà i piatti da capo. E passare alla lista '
      + 'della spesa, che nasce da questo piano.',
  },
  {
    sel: '#settimana',
    titolo: 'I giorni, uno per uno',
    testo: 'Ogni giorno si apre e mostra i pasti con le grammature. «Rendi rigido» '
      + 'protegge un giorno dai tagli: se sabato hai una cena fuori, il recupero di '
      + 'uno sgarro non andrà a prendere le calorie da lì.',
  },
  {
    sel: '#nota-dispensa',
    titolo: 'Cosa arriva dalla dispensa',
    testo: 'Quando genera il piano, l’app preferisce i piatti che consumano quello '
      + 'che hai già in casa — prima le cose che scadono. Qui c’è scritto cosa si è '
      + 'portata via, così puoi smentirlo se non è più vero.',
  },
  {
    sel: '#nota-recupero',
    titolo: 'Il recupero dello sgarro',
    testo: 'Quando le calorie di uno sgarro non entrano tutte nella settimana, qui '
      + 'trovi quante ne sono state recuperate e di quanto si sposta il traguardo. '
      + 'Meglio dirlo che scendere sotto il minimo di sicurezza.',
  },
  {
    sel: '#proposte',
    titolo: 'Le richieste di chi segue',
    testo: 'Chi mangia il tuo menù può chiedere di cambiare un piatto. Le richieste '
      + 'arrivano qui, e decidi tu: sei tu che devi comprarlo e cucinarlo.',
  },
];

export const PASSI_PIETANZE = [
  {
    sel: '#cerca',
    titolo: 'Cerca fra le pietanze',
    testo: 'Il catalogo con cui l’app costruisce i menù. Cercare per nome funziona '
      + 'anche sui sinonimi: «fuscella» trova la ricotta.',
  },
  {
    sel: '#tipi',
    titolo: 'Filtra per tipo e per stagione',
    testo: 'Primi, secondi, contorni, piatti unici. «Di stagione» tiene solo quello '
      + 'che ha senso questo mese — è lo stesso criterio che usa il generatore.',
  },
  {
    sel: '#tempo',
    titolo: 'Quanto tempo hai',
    testo: 'Il cursore filtra per tempo in cucina. Serve anche quando ti si accorcia '
      + 'la serata: lo stesso filtro è dentro lo scambio dei piatti su Oggi e sul Piano.',
  },
  {
    sel: '#nuova-pietanza',
    titolo: 'Le tue ricette',
    testo: 'Puoi aggiungere i piatti di casa, con i tuoi ingredienti e le tue '
      + 'grammature. Da lì in poi il generatore li usa come tutti gli altri, e anzi '
      + 'li preferisce.',
  },
  {
    sel: '#elenco',
    titolo: 'Le schede',
    testo: 'Ogni pietanza si apre con ingredienti, procedimento e valori. Le '
      + 'grammature si riscalano sul numero di commensali che scegli nella scheda.',
  },
];

export const PASSI_SPESA = [
  {
    sel: '.scelta-pagina',
    titolo: 'Spesa e dispensa',
    testo: 'Due facce della stessa cosa: qui cosa comprare, di là cosa hai già in '
      + 'casa. Quello che è in dispensa sparisce da questa lista.',
  },
  {
    sel: '#riepilogo',
    titolo: 'Quante cose e quante fatte',
    testo: 'Gli articoli da prendere e quelli già nel carrello. Non ci sono prezzi: '
      + 'sarebbero stime, e una stima sbagliata al banco confonde più di quanto aiuti.',
  },
  {
    sel: '#reparti',
    titolo: 'La lista, come gli scaffali',
    testo: 'Ordinata per reparto, così giri il supermercato una volta sola. Ogni riga '
      + 'dice quanto ne serve alla dieta e quanto se ne compra — un mazzo, una '
      + 'confezione — che non è la stessa cosa.',
  },
  {
    sel: '#reparti [data-presi]',
    titolo: 'Quanto ne hai preso davvero',
    testo: 'La retina era da 2 kg e ne hai prese 1000 g? Scrivilo qui: l’avanzo si '
      + 'aggiorna subito, e a fine settimana finisce in dispensa quello vero.',
  },
  {
    sel: '#antispreco',
    titolo: 'Quello che avanzerebbe',
    testo: 'Le confezioni non si comprano a grammo. Qui ci sono i piatti che '
      + 'userebbero quello che resta, prima che vada a male.',
  },
  {
    sel: '#pubblica',
    titolo: 'Manda la lista a chi fa la spesa',
    testo: 'Genera un codice breve da dettare o mandare su WhatsApp. Chi lo apre vede '
      + 'la lista e la spunta insieme a te.',
  },
  {
    sel: '#in-dispensa',
    titolo: 'Chiudere la settimana',
    testo: 'Quello che avanza passa in dispensa e la settimana prossima non lo '
      + 'ricompri. Si fa una volta sola: premendolo due volte i conti si '
      + 'sommerebbero a se stessi.',
  },
];

export const PASSI_DISPENSA = [
  {
    sel: '.scelta-pagina',
    titolo: 'Spesa e dispensa',
    testo: 'Qui c’è cosa hai già in casa, di là cosa manca. Ogni cosa che segni qui '
      + 'sparisce dalla lista della spesa.',
  },
  {
    sel: '#fretta',
    titolo: 'Cosa va usato prima',
    testo: 'La priorità è la scadenza: il riso aspetta, la mozzarella no. Rigenerando '
      + 'la settimana, il piano preferisce i piatti che si portano via queste cose.',
  },
  {
    sel: '#conto',
    titolo: 'Quanto scende la lista',
    testo: 'Le cose che resterebbero da comprare, con e senza quello che hai già. È '
      + 'il motivo per cui vale la pena guardare negli sportelli prima di uscire.',
  },
  {
    sel: '#ho-le-basi',
    titolo: 'Le scorciatoie',
    testo: '«Ho le cose di base» segna in blocco lo scaffale della dispensa — olio, '
      + 'sale, pasta, scatolame — che in una cucina avviata c’è quasi sempre. Poi '
      + 'correggi quello che non hai.',
  },
  {
    sel: '#elenco',
    titolo: 'Solo quello che serve a questo menù',
    testo: 'Non il catalogo intero: gli alimenti che i piatti di questa settimana '
      + 'useranno, in ordine di reparto. Un tocco su «Ce l’ho» basta, la casella '
      + 'serve se vuoi essere preciso.',
  },
  {
    sel: '#fuori-piano',
    titolo: 'In casa, ma non in questo menù',
    testo: 'Quello che hai e questa settimana non serve. Continua a togliersi dalla '
      + 'lista della spesa, quindi è giusto poterlo vedere e correggere.',
  },
];

export const PASSI_ALTRO = [
  {
    sel: '#profili',
    titolo: 'Chi mangia in questa casa',
    testo: 'Più profili sullo stesso dispositivo, ognuno col proprio fabbisogno e i '
      + 'propri gusti. Chi segue il menù di un altro riceve gli stessi piatti con le '
      + 'proprie grammature.',
  },
  {
    sel: '#sezione-spazio',
    titolo: 'Lo spazio di famiglia',
    testo: 'Serve ad avere lo stesso menù su più telefoni: chi cucina lo pubblica, '
      + 'gli altri lo ricevono con le proprie porzioni e possono chiedere uno scambio.',
  },
  {
    sel: '#esporta',
    titolo: 'Portare via i tuoi dati',
    testo: 'Un file cifrato con profilo, piano, preferenze e diario. È anche il modo '
      + 'di passare a un telefono nuovo: i dati stanno su questo dispositivo, non su '
      + 'un server.',
  },
  {
    sel: '#mie-pietanze',
    titolo: 'Le tue ricette',
    testo: 'Quelle che hai aggiunto tu, con la possibilità di rimetterle a posto se '
      + 'qualcosa è andato storto.',
  },
  {
    sel: '#tema',
    titolo: 'Chiaro o scuro',
    testo: 'La scelta resta su questo dispositivo. Lasciandola su «come il sistema», '
      + 'segue le impostazioni del telefono.',
  },
];
