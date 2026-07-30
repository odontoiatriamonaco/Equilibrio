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
**tutto lato client**. Nessun account, nessuna telemetria. L'unica funzione
serverless e' quella che condivide la lista della spesa, ed e' facoltativa.

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
js/preferenze.js          gusti, allergie, tetti, peso di un piatto nella scelta
js/alimenti.js            valori dei piatti calcolati dagli ingredienti
js/piatti-utente.js       le pietanze di casa: varianti e piatti nuovi
js/editor-pietanza.js     editor degli ingredienti
js/off-client.js          barcode via Open Food Facts, con cache
js/grafico-peso.js        grafico del peso di tendenza, SVG senza librerie
js/ui-budget.js           la fascia del budget settimanale
api/lista-pubblica.js     condivisione della sola lista della spesa (Vercel KV)
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

1. **Nucleo curato** in `data/alimenti.json`: 142 materie prime italiane, con
   `fonte`/`fonteId` su ogni record (codice CREA o id FoodData Central) per
   tracciabilità e correzioni in blocco. Funziona offline, è il cuore.
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
| ✅ | Condivisione della lista con un codice (serve l’integrazione KV su Vercel) |
| ✅ | Barcode dei prodotti confezionati via Open Food Facts |
