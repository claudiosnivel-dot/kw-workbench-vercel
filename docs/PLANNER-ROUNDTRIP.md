# Round-trip dei volumi con Keyword Planner

Strada principale e gratuita per i volumi di ricerca (D-09): il cliente esporta le keyword di un progetto,
le carica nel proprio Keyword Planner di Google Ads e reimporta il file dei risultati. L'API Google Ads non
si usa per le metriche.

## 1. Export delle keyword (T-904)

- **Dall'interfaccia**: pagina dei risultati del progetto, riquadro «Volumi da Keyword Planner», pulsante
  «Esporta per Keyword Planner». L'export usa la sezione mostrata (o tutto il progetto) e offre un link per
  ogni file.
- **Da CLI (operatore)**:

  ```bash
  npm run planner:export -- --project <id> [--section <id>] [--chunk <n>] [--out <cartella>]
  ```

  `--chunk` è un intero da 1 a 10000 (default 1000, D-26); `--out` vale `./planner-exports/` (ignorata da
  git: contiene keyword dei clienti). Serve `DATABASE_URL` nell'ambiente o in `.env`. Una sezione di un
  altro progetto o un `--chunk` non valido terminano con exit code 1 senza scrivere file.

Ogni file è UTF-8 con la sola colonna `Keyword` (modello di caricamento a una colonna della guida Google
Ads, https://support.google.com/google-ads/answer/7337243), una keyword per canonical: la prima candidata in
ordine alfabetico. Nome: `<projectId>-<sectionId o all>-partNN.csv`. Restano fuori, con il motivo nel
riepilogo, le keyword oltre 80 caratteri o 10 parole (limiti della stessa guida) e quelle che iniziano con
`=`, `+`, `-` o `@` (un foglio di calcolo le leggerebbe come formule).

## 2. Keyword Planner

In Google Ads: Strumenti > Keyword Planner > «Ottieni volume di ricerca e previsioni» > carica un file alla
volta, imposta lingua e paese del progetto, poi scarica le idee di keyword o le metriche storiche.

**Da verificare con un caricamento reale** (azione dell'utente, con il suo account Google Ads): il numero
massimo di keyword per caricamento non è documentato da Google; il default di 1000 è prudente (D-26).
Annotare qui il limite osservato.

## 3. Import dei volumi (T-910)

- **Dall'interfaccia**: stesso riquadro, «Importa volumi» con il file scaricato da Keyword Planner (`.csv` o
  `.tsv`, al massimo 5 MB). Vale per la sezione mostrata o per tutto il progetto; il file resta in memoria e
  non viene salvato.
- **Da CLI (operatore)**:

  ```bash
  npm run planner:import -- --project <id> [--section <id>] <file>
  ```

Il parser (T-905) rileva l'encoding dal BOM (UTF-16LE, UTF-16BE, UTF-8), il separatore (tab, punto e virgola,
virgola) e la riga dei nomi colonna dopo le eventuali righe di titolo; riconosce le colonne in inglese
(«Keyword», «Avg. monthly searches», «Competition», «Competition (indexed value)», «Top of page bid (low
range)», «Top of page bid (high range)») e in italiano. Un volume a intervallo («1K – 10K») vale il punto
medio con precisione `range` (D-17); «--» o vuoto non porta metriche. Ogni riga si abbina alle candidate con
lo stesso canonical nella lingua effettiva della sezione; le candidate ricevono volumi, concorrenza, offerte,
provider `PLANNER_CSV`, stato `imported` e punteggio ricalcolato, tutto in una transazione.

**Verificato sul primo file reale** (2026-10-06, interfaccia di Google Ads in inglese): UTF-16LE con BOM,
tabulazioni, fine riga LF, due righe di titolo (nome del file e periodo), 26 colonne con i nomi in inglese
(anche «Currency», «Segmentation», variazioni, quota impressioni e 12 colonne «Searches: <mese>»), due righe di
riepilogo per segmento senza keyword («Tutti», «Italia», scartate), volumi come decimali con parte frazionaria
nulla («50000.0», 0 o 1 decimale), offerte tra virgolette con la virgola decimale («"1,35"»), concorrenza in
italiano («Bassa», «Alta») con il valore indicizzato, «∞» nelle variazioni. La fixture
`tests/fixtures/planner/keyword-stats-real-2026-10-utf16le.csv` riproduce questa struttura con keyword
anonimizzate. Restano da verificare i nomi delle colonne di un file scaricato con l'interfaccia in italiano.

**Re-run** (D-19 emendata il 2026-10-06): con il provider di metriche della sezione «Nessuna metrica» (NONE)
le keyword ancora prodotte conservano i volumi importati, con la data dell'import, e il punteggio si ricalcola
su quei volumi; con un altro provider (Mock, DataForSEO) valgono le metriche del provider.
