# Equilibrio

Piano alimentare settimanale a porzioni, lista della spesa per reparto e
gestione dello sgarro con recupero distribuito sulla settimana.

**In produzione:** https://equilibrio-theta.vercel.app

> Equilibrio è uno strumento di organizzazione familiare. **Non è un dispositivo
> medico** e non sostituisce il parere di un nutrizionista o del medico curante.
> I vincoli di sicurezza descritti più sotto non sono decorativi: sono scritti nel
> motore e non si possono aggirare dall'interfaccia.

---

## In breve

L'app ruota attorno a un **budget energetico settimanale**, non giornaliero. Da lì
discende tutto il resto: lo sgarro non è un fallimento da rimediare, è una voce di
bilancio — e si può **prenotare prima** dell'evento, così ci si arriva con il
margine già messo da parte.

Tre cose che le altre app non fanno:

- **Sgarro preventivo.** Dichiari sabato la pizzeria e i giorni precedenti si
  alleggeriscono da soli. La lista della spesa **non cambia**: la redistribuzione
  scala le porzioni dei piatti già in programma, non li sostituisce.
- **Spesa antispreco.** Se la ricetta chiede 100 g di ricotta ma la confezione è da
  250, il generatore mette in settimana un secondo piatto che finisce il barattolo.
- **Un piatto per tutta la famiglia.** Stesso piatto per tutti, porzioni
  differenziate. Cucinare due volte è il motivo n.1 per cui le diete saltano.
  Un profilo decide il menù, gli altri lo seguono con le proprie porzioni; a chi
  non può mangiare qualcosa l'app propone un'alternativa **per quel pasto e per
  lui soltanto**. La spesa somma tutti.

---

## Far girare il progetto

Serve Node 18 o superiore.

```bash
npm install
```

```bash
npm run dev
```

Vite stampa l'indirizzo in console. Si ferma con `Ctrl+C`.

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo con ricarica automatica |
| `npm run build` | build di produzione in `dist/` |
| `npm run preview` | serve la build appena fatta, per controllarla |
| `npm test` | i test (Vitest) sui moduli di calcolo |

Da telefono in rete locale: `npx vite --host` e apri l'indirizzo `192.168.x.x`
che compare. Attenzione però — **il service worker funziona solo su https**,
quindi l'uso offline si prova dal sito su Vercel, non da `localhost`.

### Pagine

| Pagina | Cosa fa |
|---|---|
| `/` | Oggi: i pasti del giorno da spuntare, l'anello delle calorie, la fascia della settimana, l'acqua, i prodotti confezionati |
| `/piano.html` | la settimana, gli scambi, il dialogo dello sgarro con anteprima dal vivo |
| `/spesa.html` | lista per reparto, antispreco, dispensa, condivisione con un codice |
| `/ricette.html` | le 153 pietanze, con ricerca, filtri e l’editor degli ingredienti |
| `/preferenze.html` | gusti, allergie, tetti settimanali |
| `/progressi.html` | peso di tendenza e fabbisogno ricavato dai dati veri |
| `/profilo.html` | misure, obiettivo, questionario di sicurezza |
| `/impostazioni.html` | profili, export cifrato, tema |
| `/guida.html` | la guida in otto capitoli |
| `/stile.html` | style guide vivente: tutti i componenti in una pagina |

---

## Com'è fatto

MPA in JavaScript senza framework, costruita con Vite, PWA installabile,
**tutto lato client**. Nessun account, nessuna telemetria. Le due funzioni
serverless — la lista della spesa e lo spazio famiglia — sono **facoltative**:
senza archivio remoto l'app funziona per intero, dicendolo. Da entrambe escono
solo alimenti, pietanze, porzioni e nomi: peso, altezza, eta', patologie e
calorie non lasciano mai il dispositivo.

```
index.html … stile.html   una pagina per schermata
css/tokens.css            colori nei due temi, tipografia, spazi, movimento
css/base.css              reset, guscio responsivo, stampa
css/componenti.css        schede, bottoni, fascia del budget, lista della spesa
js/guscio.js              tema, navigazione, icone, service worker
js/energia.js             BMI, WHtR, massa grassa, BMR, TDEE, vincoli di sicurezza
js/store.js               IndexedDB partizionato per profilo
js/profilo-file.js        export/import del profilo in file cifrato
js/planner.js             generatore della settimana a vincoli, calibrazione porzioni
js/sgarro.js              redistribuzione dello sgarro, retroattiva e preventiva
js/spesa.js               aggregazione, dispensa, formati di vendita, condivisione
js/packaging.js           residui delle confezioni e proposte antispreco
js/scambi.js              alternative fra alimenti e fra piatti
js/famiglia.js            il legame fra profili, la settimana derivata, la tavola
js/preferenze.js          gusti, allergie, tetti, peso di un piatto nella scelta
js/alimenti.js            valori dei piatti calcolati dagli ingredienti
js/piatti-utente.js       le pietanze di casa: varianti e piatti nuovi
js/editor-pietanza.js     editor degli ingredienti
js/off-client.js          barcode via Open Food Facts, con cache
js/grafico-peso.js        grafico del peso di tendenza, SVG senza librerie
js/ui-budget.js           la fascia del budget settimanale
js/spazio-famiglia.js     il menu' comune in rete: porzioni di ciascuno, richieste
api/_lib.js               codici, freno ai tentativi, ripulitura di cio' che esce
api/_kv.js                l'unica porta verso l'archivio remoto (Upstash Redis)
api/_spazio.js            cosa puo' entrare nello spazio famiglia, e cosa no
api/lista-pubblica.js     condivisione della sola lista della spesa
api/famiglia.js           lo spazio famiglia: menu', porzioni, proposte
public/assets/icons.svg   sprite delle icone su misura
scripts/genera-icone.mjs  rigenera le icone PWA dal marchio
tests/                    Vitest sui moduli puri
```

### Il guscio

Una sola marcatura, due impaginazioni: sotto i 64rem la navigazione sta in basso
come in un'app da telefono, sopra diventa una colonna laterale fissa. Il
passaggio è tutto in CSS.

### Le regole di stile che non si negoziano

- **Il rosso non indica mai lo sgarro.** Lo sgarro è ocra: una voce di bilancio,
  non una colpa. Il rosso è riservato ai vincoli di sicurezza — sotto il pavimento
  calorico e nient'altro.
- **Cifre tabulari** (`class="num"`) ovunque compaiano grammature e kcal. Le cifre
  che ballano in colonna sono il dettaglio che fa sembrare amatoriale un'app di dati.
- **Contrasti ricalcolati per il tema scuro**, non invertiti.
- Nuovi componenti: prima in `stile.html`, poi nelle pagine.

### Gli alimenti che non si vogliono

Sono tre livelli di «no», e fanno cose diverse di proposito:

| Dove | Cosa fa |
|---|---|
| ics su un **piatto** | quel piatto sparisce dal menù |
| ics su un **alimento** | l'ingrediente viene **tolto da tutti i piatti**, che restano con i valori ricalcolati |
| lucchetto (**allergia**) | ogni piatto che lo contiene sparisce, ingrediente secondario compreso |

L'omissione è una **lente applicata in lettura** (`applicaOmissioni` in
`js/alimenti.js`), non una modifica dei dati: rimettere l'alimento fra i graditi lo
fa ricomparire dov'era, coi valori di prima. Un piatto viene però **scartato** invece
di mutilato quando l'ingrediente tolto vale più del 40% delle sue calorie **o** più
del 40% delle sue proteine. La seconda soglia serve: il polpo porta un terzo delle
calorie di «polpo e patate» — olio e patate pesano di più — ma l'ottanta per cento
delle proteine, ed è quello il piatto. I piatti scartati finiscono in
`piattiScartati`, col motivo, e l'interfaccia li elenca.

L'allergia resta un'esclusione dura per prudenza: un allergene sta anche nelle tracce
e nel procedimento, e «basta non metterlo» non è una cosa che un programma possa
promettere.

**Ma la durezza si applica a un elenco che compila l'utente.** Non esiste una
classe di allergene: `eAllergene()` confronta un id alla volta, e in
`alimenti.json` non c'è nessun campo `allergeni`. In pratica chi è celiaco deve
marcare **dieci** alimenti a mano (`pasta-semola`, `pasta-integrale`,
`orzo-perlato`, `farro-perlato`, `pane`, `pane-integrale`, `fette-biscottate`,
`cous-cous`, `polenta-farina`, `farina-00`); chi non tollera il lattosio dodici
latticini; chi ha problemi con le uova due, fra cui `tagliatelle-uovo`, che è
facile non associare. Se ne salta uno, il piatto passa e nessuno lo segnala. È
il limite più serio che resta in piedi, e si chiude solo dando agli alimenti una
classe di allergene invece di un id per volta.

### Le pietanze di casa

Il ricettario di serie in `data/piatti.json` **non si modifica mai**. Modificare una
pietanza crea una versione propria del profilo, salvata su IndexedDB: porta
`derivatoDa` e **copre** l'originale nel ricettario in uso, così non si vedono due
pasta e patate. Cancellandola, l'originale torna. Un aggiornamento dell'app non può
portare via le ricette di casa — e quelle ricette pesano il doppio nella scelta del
menù, perché è di cose che si sanno già cucinare che è fatta una dieta che regge.

L'innesto avviene con `registraPiattiUtente()` in `js/alimenti.js`, che riassegna il
legame esportato `piatti`. I moduli che lo importano vedono il legame vivo, quindi
generatore, scambi e spesa si aggiornano senza passarsi il ricettario di mano in
mano. Ogni pagina chiama `caricaRicettario(profiloId)` all'avvio, prima di leggerlo.

### I vincoli di sicurezza nel motore

In `js/energia.js`, verificati dai test:

- mai sotto **1200 kcal/die** né sotto il metabolismo basale;
- deficit massimo **25%** del fabbisogno;
- calo massimo **1% del peso corporeo a settimana**;
- proteine **≥ 1,2 g per kg** di peso desiderabile;
- un questionario iniziale (gravidanza, allattamento, diabete, tiroide, storia di
  disturbi alimentari, farmaci) **blocca la generazione del piano** e rimanda al
  professionista.

Se un ritmo scelto è troppo aggressivo il motore lo riduce **e lo dice**. Quando
un recupero non è ottenibile senza violare i vincoli, l'app non affama: recupera
il possibile e sposta la data dell'obiettivo, dichiarandolo.

### Il ritmo è una quota, non un numero di calorie

Il ritmo era un deficit fisso — 300, 500 o 700 kcal — e questo lo rendeva **inerte**.
I vincoli qui sopra tosano il deficit richiesto, e su un profilo con poco margine lo
tosano tutte e tre le volte allo stesso valore: «con calma», «regolare» e «deciso»
producevano lo stesso identico piano e la stessa identica data. Su una donna
sedentaria di 48 anni, 73 kg per 165 cm, tutti e tre davano 1360 kcal e 227 giorni.

La causa è aritmetica: col pavimento fissato al metabolismo basale il margine massimo
è `TDEE − BMR`, cioè `(LAF − 1) × BMR`. Con `sedentaria` (LAF 1,2) sono **0,2 × BMR**,
sempre meno del tetto del 25% — che quindi non entra mai in gioco.

`margineDisponibile()` in `js/energia.js` calcola quel margine e dice **quale dei tre
vincoli ha vinto**; `RITMI` ne prende una frazione — metà, tre quarti, tutto. Nessun
vincolo è stato allentato: `floorCalorico`, `DEFICIT_MAX` e `CALO_MAX_SETTIMANA` sono
esattamente quelli di prima, e i test che li difendono non sono stati toccati. Cambia
solo da dove arriva il numero in ingresso, e i tre ritmi tornano a dare tre piani
diversi (453, 302 e 227 giorni sullo stesso profilo).

La pagina Profilo scrive il margine in chiaro, col motivo e con la sola leva che
l'utente ha in mano: *«Il massimo che posso togliere è 272 kcal al giorno: sotto ci
sarebbe il metabolismo basale (1360 kcal). Con un'attività leggera salirebbe a 468
kcal.»*

### Avvio graduale

Le prime quattro settimane il taglio sale per quarti — 25, 50, 75, 100% — invece di
arrivare tutto insieme. È uno strumento di **aderenza**, non un trucco metabolico: le
prove sul grasso perso sono modeste e non significative, quello che regge è che nelle
prime settimane si molla meno. L'interfaccia lo dice così, senza promettere metabolismo.

La rampa si applica **dopo** i clamp di sicurezza (`riepilogo()` in `js/energia.js`),
quindi può solo alleggerire il deficit e non c'è modo che scavalchi il pavimento. Scatta
a settimane, che è la granularità su cui l'app è già costruita. Costa una decina di
giorni sul traguardo e `previsioneTraguardo()` li conta — contando solo quelli ancora
da pagare, non l'intera rampa quando si è già a metà.

### La dieta di famiglia

Un profilo decide il menù; gli altri portano `seguo: <id>` e lo seguono. Il piano
resta **uno solo** — rigenerarlo aggiorna tutti — e sopra ci vive uno strato
personale per ciascuno, nell'archivio `personalizzazioni`: le proprie porzioni
decise a mano e i propri sostituti.

Di chi decide si prendono i **piatti**, non le sue quantità: le porzioni ripartono
dalle dosi del ricettario e si ricalibrano sul fabbisogno di chi segue con
`ribilanciaGiorno`. I 600 g di pollo che si è pesato Tommaso restano nel piatto
di Tommaso.

L'ostacolo era il ricettario, tenuto in **stato globale di modulo**: caricare
quello di Nina sovrascriveva quello di Renata per tutta la pagina, in silenzio.
`lenteRicettario()` in `js/alimenti.js` è ora il nucleo puro che restituisce una
lente senza assegnare niente; `registraPiattiUtente` ne è solo il primo
consumatore, e `alternativePiatto` accetta un ricettario iniettato. Il primo test
di `tests/famiglia.test.js` difende esattamente questo.

Verificato sul caso peggiore: un uomo di 110 kg molto attivo (3310 kcal) e una
bambina di 35 kg sedentaria (1200 kcal) — le giornate di lei atterrano a
1204-1261, dentro il suo pavimento. Reggere quel divario ha richiesto di dare a
`ribilanciaGiorno` il **secondo passo** che `calibra` aveva già: quando i soli
carboidrati non bastano si alleggerisce tutto un poco, secondi compresi.

Cancellare il profilo di riferimento **stacca** chi lo seguiva invece di lasciarlo
puntato al vuoto, e l'import di un fascicolo azzera `seguo`, che punterebbe a un
id inesistente su quel dispositivo.

### Fabbisogno dal diario

`tdeeAdattivo()` esisteva già ma il suo risultato moriva nella pagina Progressi. Ora,
quando la stima è affidabile e si scosta di oltre il 5% da quella in uso, l'app
**propone** di tararci il piano — non lo fa da sola. Il numero adottato finisce in
`tdeeMisurato` sul profilo e `riepilogo()` lo preferisce alla formula; si torna
indietro con lo stesso pulsante.

---

## Privacy

Peso, misure, patologie e diario alimentare **restano sul dispositivo**, in
IndexedDB. Non esiste un account, non c'è una email, non parte nessuna statistica.

- **Export del profilo**: un file `.equilibrio` cifrato con AES-GCM 256, chiave
  derivata dalla passphrase con PBKDF2-SHA256. Passphrase persa = file
  irrecuperabile, e l'app lo dice prima di esportare.
- **PIN del profilo**: è una barriera contro lo sguardo casuale su un dispositivo
  condiviso, **non una cifratura del database**. L'interfaccia lo dichiara: quattro
  cifre non proteggono i dati a riposo.
- L'unica cosa che potrà uscire dal dispositivo è la **lista della spesa**, quando
  la si condivide: un codice temporaneo che porta con sé solo alimenti e quantità.
  Nessun nome, nessun peso, nessuna caloria.

`.gitignore` esclude i file `*.equilibrio`: i fascicoli di profilo sono dati
sanitari e non devono mai finire nel repository.

---

## Dati

Non esiste un CREA scaricabile in JSON — le tabelle si consultano ma non hanno né
API né dump, e in UE la tabella è protetta come banca dati. Quindi tre livelli:

1. **Nucleo curato** in `data/alimenti.json`: 142 materie prime italiane.
   Funziona offline, è il cuore. Ogni record porta `fonte: "CREA"`, che però è
   un'etichetta e non un riferimento: **`fonteId` non c'è su nessuno dei 142**, e
   `verificato` è `false` ovunque. Finché restano così, un valore sospetto non si
   può riagganciare alla riga di origine — e ce n'è già uno che lo meriterebbe:
   `fette-biscottate` ha i macro che sommano a 103,1 g su 100. Riempire
   `fonteId` è il lavoro che rende possibili le correzioni in blocco.
2. **Open Food Facts** a runtime per i prodotti confezionati, via barcode, con
   risposta in cache. Licenza ODbL, attribuzione in pagina crediti.
3. **USDA FoodData Central** (CC0) solo a tavolino, per verificare i valori del
   nucleo. Non a runtime: così nessuna chiave API finisce nel client.

Ricettario di tradizione **campana**, su due binari: i piatti che in casa si
cucinano davvero (priorità assoluta: nessuna dieta regge se impone piatti
sconosciuti) e quelli della tradizione per coprire i buchi: in tutto 153 pietanze. Ogni piatto
porta un campo `alleggerimento` che spiega in una riga come è stata modificata la
versione tradizionale — parmigiana al forno anziché fritta, e così via.

### Le pietanze di casa

Il ricettario di serie in  **non si modifica mai**: modificare una
pietanza crea una versione propria del profilo, salvata su IndexedDB. La variante
porta  e **copre** l'originale nel ricettario in uso, cosi' non si vedono
due pasta e patate; cancellandola, l'originale torna. Un aggiornamento dell'app non
puo' portare via le ricette di casa, e le ricette di casa pesano il doppio nella
scelta del menu'.

L'innesto avviene con  in , che riassegna
il legame esportato : i moduli che lo importano vedono il legame vivo, quindi
generatore, scambi e spesa si aggiornano senza passarsi il ricettario di mano in mano.
Ogni pagina chiama  all'avvio.

---

## Manutenzione

### Caratteri

Inter e Fraunces **non sono nel repository**: vanno scaricati e sottoinsiemati a
parte. Istruzioni in [`public/assets/fonts/README.md`](public/assets/fonts/README.md).
Senza, l'app ricade sui caratteri di sistema: leggibile, solo meno caratterizzata.

### Icone PWA

```bash
node scripts/genera-icone.mjs
```

Rigenera dal marchio le icone 192/512, la maskable con il margine giusto per il
ritaglio di Android, l'apple-touch-icon e la favicon. Le PNG prodotte vanno
versionate.

### Service worker

**La versione si bumpa da sola in build.** Il plugin `sw-cache-bump` in
`vite.config.js` riscrive `CACHE_NAME` a ogni build: non va mai toccato a mano.

Su Vercel, `vercel.json` serve `sw.js` **senza cache**. Senza quella regola il CDN
può congelare il service worker e una build nuova resta invisibile sui telefoni
già installati — un guasto che si manifesta giorni dopo.

---

## Pubblicare

Ogni push su `main` fa partire il deploy da solo.

```bash
git add -A
git commit -m "…"
git push
```

Il primo collegamento a Vercel si fa una volta sola: Add New → Project → Import
dal repository. Framework, comando di build e cartella di output li legge dal
`vercel.json`; la Root Directory resta `./`.

### L'archivio remoto

Le funzioni in `api/` parlano con **Upstash Redis**. Servono due variabili
d'ambiente, e servono **entrambe**, o la condivisione resta spenta:

| coppia | variabili |
|---|---|
| integrazione Vercel | `KV_REST_API_URL` + `KV_REST_API_TOKEN` |
| Upstash diretto | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |

Si collega da Vercel → Storage → Upstash Redis, che scrive le variabili da solo.
Senza, l'app **funziona lo stesso**: le pagine dicono «la condivisione non è
attiva» invece di mostrare un errore. Tutto il resto vive su IndexedDB e non
tocca la rete.

**Installare sul telefono:** apri l'indirizzo in Chrome o Safari e usa "Aggiungi a
schermata Home". Da lì funziona anche senza rete.

---

## Stato

| | |
|---|---|
| ✅ | Guscio, design system, tema chiaro/scuro, PWA |
| ✅ | Profilo, antropometria, fabbisogno, vincoli di sicurezza |
| ✅ | Archivio multi-profilo, export/import cifrato |
| ✅ | Guida |
| ✅ | Nucleo alimenti, gruppi di scambio, sezione Pietanze |
| ✅ | Generatore della settimana, scambi e lista della spesa |
| ✅ | Motore dello sgarro, retroattivo e preventivo |
| ✅ | Antispreco e dispensa, porzioni per commensali, peso di tendenza, TDEE adattivo |
| ✅ | Condivisione della lista con un codice (serve l’archivio remoto, vedi sopra) |
| ✅ | Spazio famiglia: il menù arriva da sé sugli altri telefoni, con le richieste di scambio |
| ✅ | Barcode dei prodotti confezionati via Open Food Facts |
