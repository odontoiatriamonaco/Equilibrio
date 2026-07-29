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

Aperto il server, le pagine che funzionano davvero oggi sono:

- `/` — la home
- `/profilo.html` — misure, obiettivo e riepilogo che si ricalcola mentre scrivi
- `/impostazioni.html` — profili, export cifrato, tema
- `/stile.html` — la **style guide vivente**: tutti i componenti in una pagina,
  con la fascia del budget interattiva. È la pagina che spiega meglio l'idea.

`piano`, `spesa`, `ricette` e `progressi` sono segnaposto dichiarati.

---

## Com'è fatto

MPA in JavaScript senza framework, costruita con Vite, PWA installabile,
**tutto lato client**. Nessun account, nessun backend, nessuna telemetria.

```
index.html … stile.html   una pagina per schermata
css/tokens.css            colori nei due temi, tipografia, spazi, movimento
css/base.css              reset, guscio responsivo, stampa
css/componenti.css        schede, bottoni, fascia del budget, lista della spesa
js/guscio.js              tema, navigazione, icone, service worker
js/energia.js             BMI, WHtR, massa grassa, BMR, TDEE, vincoli di sicurezza
js/store.js               IndexedDB partizionato per profilo
js/profilo-file.js        export/import del profilo in file cifrato
js/ui-budget.js           la fascia del budget settimanale
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

1. **Nucleo curato** in `data/alimenti.json`: ~200 materie prime italiane, con
   `fonte`/`fonteId` su ogni record (codice CREA o id FoodData Central) per
   tracciabilità e correzioni in blocco. Funziona offline, è il cuore.
2. **Open Food Facts** a runtime per i prodotti confezionati, via barcode, con
   risposta in cache. Licenza ODbL, attribuzione in pagina crediti.
3. **USDA FoodData Central** (CC0) solo a tavolino, per verificare i valori del
   nucleo. Non a runtime: così nessuna chiave API finisce nel client.

Ricettario di tradizione **campana**, su due binari: i piatti che in casa si
cucinano davvero (priorità assoluta: nessuna dieta regge se impone piatti
sconosciuti) e circa ottanta della tradizione per coprire i buchi. Ogni piatto
porta un campo `alleggerimento` che spiega in una riga come è stata modificata la
versione tradizionale — parmigiana al forno anziché fritta, e così via.

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
| ⏳ | Generatore della settimana e lista della spesa |
| ⏳ | Motore dello sgarro, retroattivo e preventivo |
| ⏳ | Antispreco e dispensa, modalità famiglia, peso di tendenza, TDEE adattivo |
| ⏳ | Condivisione della lista della spesa |
