# 21-refinements — Macrotask `refinements`

> Cambiamenti decisi dall'utente il 2026-10-11 rispondendo alle domande sulle scelte rimaste aperte dei macrotask 19 e 20 (D-37). Si costruisce dopo il macrotask 20.

## Obiettivo del macrotask
Applicare quattro cambiamenti chiesti dall'utente su funzioni già in produzione. Le estrazioni avviate dal root admin non hanno più limiti d'uso. L'export della strategia e quello dei risultati sono scritti nella lingua dell'utente. La pagina pilastro di una strategia può avere fino a 20 H2. Ogni task emenda in modo dichiarato i criteri dei task che modifica.

## Task atomici

```yaml
- id: T-2101
  title: "Estrazioni del root admin senza limiti d'uso"
  macrotask: "refinements"
  depends_on: [T-2003, T-1703, T-1701]

  objective: >
    Togliere alle estrazioni avviate dal root admin i limiti del piano e i limiti tecnici d'uso, anche con il lancio
    commerciale attivo, lasciando le due protezioni che non sono limiti d'uso.

  definition_of_done:
    - "extractionPlanLimits per il root admin: maxKeywordsPerRun, keywordsPerMonth, licensedMetricsKeywordsPerMonth e runsPerDay null, licensedMetrics true; per gli altri utenti decide il piano come oggi."
    - "startExtractionJob con il lancio attivo e il root admin come actor: nessun rate limit sugli avvii (regola runStart), nessuna riserva della quota (usage_counters invariati, niente quota nel payload), nessun controllo di un solo job attivo per workspace; il job nasce come con il lancio in pausa. Le estrazioni del root admin non consumano la quota del workspace: gli altri membri conservano la loro."
    - "Restano anche per il root admin (D-37): l'indice jobs_one_active_per_subproject (un solo job attivo per sezione, 409 JOB_ALREADY_ACTIVE), che impedisce a due estrazioni di sovrascriversi i risultati, e i tetti di spesa DataForSEO di T-903 (METRICS_MONTHLY_BUDGET_USD, METRICS_RUN_BUDGET_USD)."
    - "D-27 e D-30 emendate (D-37). I test esistenti su quote, rate limit degli avvii e job attivo per workspace usano un utente non root; se uno di loro usa il root admin passa a un utente normale, perché il comportamento del root admin cambia per decisione."

  acceptance_criteria:
    - id: AC-2101-1
      given: "lancio attivo, il workspace W del root admin su un piano con runsPerDay 1 e maxKeywordsPerRun 5, con due sezioni S1 e S2"
      when: "il root admin avvia S1 e poi S2 mentre il job di S1 è ancora pending"
      then: "entrambe le risposte sono 202; W ha 2 job attivi; nessuno dei due payload contiene una riserva di quota e il limite maxKeywordsPerRun del payload è null; il contatore runs_day di W per oggi non esiste o vale 0"
    - id: AC-2101-2
      given: "lancio attivo, RATE_LIMIT_RUN_START_MAX uguale a 1, un piano con runsPerDay 10, il root admin nel proprio workspace e un OWNER non root in un altro workspace, ciascuno con due sezioni"
      when: "ciascuno avvia le sue due sezioni una dopo l'altra"
      then: "il secondo avvio dell'OWNER non root riceve 429 RATE_LIMITED; il secondo avvio del root admin risponde 202"
    - id: AC-2101-3
      given: "lancio attivo e il root admin con un job attivo sulla sezione S1"
      when: "avvia di nuovo S1"
      then: "la risposta è 409 JOB_ALREADY_ACTIVE e S1 ha un solo job attivo"

  target_tests:
    - file: "tests/integration/usage-quotas.test.ts"
      covers: [AC-2101-1, AC-2101-2, AC-2101-3]

  security_notes:
    - "A01 Broken Access Control / CWE-269 (Improper Privilege Management): l'eccezione vale solo per il root admin riconosciuto dal server (ruolo ADMIN con isRootAdmin della sessione), mai per un valore della richiesta."
    - "A04 Insecure Design / CWE-770 (Allocation of Resources Without Limits or Throttling): per il root admin il freno sui costi restano i tetti di spesa DataForSEO; un solo job attivo per sezione resta garantito dall'indice (CWE-362)."

  out_of_scope:
    - "Limiti diversi da quelli delle estrazioni (progetti, seed, strategie, workspace creati)."
    - "Eccezioni per altri ruoli o per utenti scelti dal root admin."

- id: T-2102
  title: "Export della strategia nella lingua dell'utente"
  macrotask: "refinements"
  depends_on: [T-1906, T-1301]

  objective: >
    Scrivere intestazioni, valori codificati e nome del foglio dell'export della strategia nella lingua dell'utente,
    invece dei nomi tecnici in inglese.

  definition_of_done:
    - "CSV, XLSX e Google Sheets della strategia: intestazioni dalle chiavi dei cataloghi (per esempio strategy.export.columns.<colonna>) nell'ordine di STRATEGY_EXPORT_COLUMNS, che resta come identificatore interno; tipo di pagina (pilastro o spoke) e tipo di contenuto tradotti con le etichette già usate dalla pagina della strategia; foglio XLSX e Google Sheets con il nome dal catalogo (Strategia in italiano, Strategy in inglese)."
    - "Lingua: il parametro lang se è una lingua supportata, altrimenti la lingua risolta per la richiesta (T-1301), come il PDF. H1, H2, keyword, numeri e nome del file non cambiano."
    - "Emendati dal task: il DoD di T-1906 e AC-1906-4 (il foglio è la traduzione di strategy.export.sheet, non più 'strategia'); cataloghi it ed en con le stesse chiavi."

  acceptance_criteria:
    - id: AC-2102-1
      given: "una strategia con 1 hub e 2 spoke"
      when: "si scarica l'export CSV con lang it e poi con lang en"
      then: "la prima riga del file italiano è l'elenco delle traduzioni italiane delle 10 colonne nell'ordine di STRATEGY_EXPORT_COLUMNS e la prima riga dati ha come tipo di pagina la traduzione italiana di pilastro; il file inglese ha le traduzioni inglesi; nessuna intestazione è un nome tecnico come page_type o main_keyword"
    - id: AC-2102-2
      given: "la stessa strategia, un account Google Sheets collegato e l'API di Google simulata"
      when: "si scarica l'export XLSX con lang en e si esporta su Google Sheets con lang it"
      then: "l'XLSX ha un solo foglio con il nome inglese del catalogo e la riga 1 uguale all'intestazione del CSV inglese; il foglio Google ha il nome italiano del catalogo e le sue righe coincidono con quelle del CSV italiano"

  target_tests:
    - file: "tests/integration/strategy-export.test.ts"
      covers: [AC-2102-1, AC-2102-2]

  security_notes:
    - "A05 Injection / CWE-1236 (Improper Neutralization of Formula Elements in a CSV File): le celle tradotte passano dalla stessa neutralizzazione delle formule di oggi."

  out_of_scope:
    - "Traduzione del nome del file e delle colonne del PDF (il PDF è già nella lingua scelta)."

- id: T-2103
  title: "Export dei risultati nella lingua dell'utente"
  macrotask: "refinements"
  depends_on: [T-804, T-805, T-806, T-1301]

  objective: >
    Scrivere intestazioni, valori codificati e nome del foglio degli export CSV, XLSX e Google Sheets dei risultati
    nella lingua dell'utente, come l'export della strategia.

  definition_of_done:
    - "CSV, XLSX e Google Sheets dei risultati, nella lingua risolta per la richiesta (T-1301): intestazioni dalle chiavi dei cataloghi (per esempio export.columns.<colonna>) nell'ordine di EXPORT_COLUMNS, che resta come identificatore interno; valori codificati tradotti (source, brand_status, review_status, keyword_type, search_intent, metrics_status, metrics_provider, score_source), con le etichette della pagina dei risultati dove esistono; foglio XLSX con il nome dal catalogo (Keyword in italiano, Keywords in inglese)."
    - "Campi sì/no (D-37): in XLSX e Google Sheets restano booleani nativi, che il foglio mostra nella sua lingua; nel CSV diventano Sì/No (Yes/No in inglese). Nome della sezione, keyword, forme normalizzate, query di origine, numeri e nome del file non cambiano."
    - "Restano tecnici (D-37): l'export JSON (chiavi e valori di oggi, per programmi e script) e l'export per Keyword Planner (formato richiesto da Google Ads)."
    - "Emendati dal task: AC-107-2, AC-406-1 e AC-805-2 (il foglio è la traduzione di export.sheet, non più 'keywords', e le intestazioni sono le etichette tradotte). In tests/integration/characterization/export.char.test.ts si aggiornano con impacted-by: T-2103 solo le asserzioni sulle intestazioni e sul nome del foglio: conferma umana data in anticipo con D-37 (2026-10-11); se cambia qualsiasi altra asserzione della caratterizzazione la sessione si ferma e chiede all'utente (VISION-AND-CONSTRAINTS §6)."

  acceptance_criteria:
    - id: AC-2103-1
      given: "un progetto con una candidata approvata, intento commercial ed is_question true, e un utente con la lingua dell'interfaccia it"
      when: "scarica l'export CSV, poi lo stesso utente passa all'inglese e lo scarica di nuovo"
      then: "la prima riga del file italiano è l'elenco delle traduzioni italiane delle 23 colonne nell'ordine di EXPORT_COLUMNS, la cella dello stato di revisione è la traduzione italiana di approvata e quella di is_question è 'Sì'; il file inglese ha le traduzioni inglesi e 'Yes'"
    - id: AC-2103-2
      given: "lo stesso progetto e un utente con la lingua dell'interfaccia en"
      when: "scarica l'export XLSX e l'export JSON"
      then: "l'XLSX ha un solo foglio con il nome inglese del catalogo, la riga 1 uguale all'intestazione del CSV inglese e la cella di is_question booleana true; il JSON ha le chiavi tecniche di oggi (subproject_name, review_status, ...) e gli stessi valori di prima del task"
    - id: AC-2103-3
      given: "un account Google Sheets collegato, l'API di Google simulata e un utente con la lingua dell'interfaccia it"
      when: "esporta i risultati su Google Sheets"
      then: "la riga di intestazione scritta nel primo blocco è uguale all'intestazione del CSV italiano"

  target_tests:
    - file: "tests/integration/export-streaming.test.ts"
      covers: [AC-2103-1]
    - file: "tests/integration/export-xlsx.test.ts"
      covers: [AC-2103-2]
    - file: "tests/integration/sheets-export.test.ts"
      covers: [AC-2103-3]

  security_notes:
    - "A05 Injection / CWE-1236 (Improper Neutralization of Formula Elements in a CSV File): intestazioni e valori tradotti passano dalla stessa neutralizzazione delle formule; nell'XLSX ogni testo resta una cella di testo."

  out_of_scope:
    - "Cambi di dialetto CSV, di colonne o del loro ordine (D-23 invariata)."
    - "Export per Keyword Planner ed export JSON."

- id: T-2104
  title: "Pagina pilastro fino a 20 H2"
  macrotask: "refinements"
  depends_on: [T-1902]

  objective: >
    Alzare a 20 il numero massimo di H2 della pagina pilastro, lasciando a 12 quello degli spoke.

  definition_of_done:
    - "lib/modules/strategy/titles.ts: al massimo 20 H2 per le pagine HUB e 12 per gli SPOKE, chiusure comprese e sempre in fondo; emendato il DoD di T-1902 («al massimo 12 H2» vale per gli spoke). AC-1902-2 (spoke con 12 H2) resta invariato."
    - "Le strategie salvate non cambiano (sono fotografie, D-33): il nuovo limite vale per le strategie generate dopo il task e per i ricalcoli degli H2 dopo una modifica."

  acceptance_criteria:
    - id: AC-2104-1
      given: "una pagina pilastro con 25 spoke a priorità diversa e una domanda confluita nella FAQ"
      when: "si chiama buildPageTitles"
      then: "la lista contiene esattamente 20 H2: i primi 19 sono le keyword principali dei 19 spoke a priorità più alta in ordine di priorità e l'ultimo è il testo della chiave strategy.fixedH2.faq"

  target_tests:
    - file: "tests/unit/strategy-titles.test.ts"
      covers: [AC-2104-1]

  security_notes:
    - "Nessuna superficie nuova: H2 resi come testo da React e nel PDF, come oggi (CWE-79)."

  out_of_scope:
    - "Limiti diversi per gli spoke o configurabili dall'utente."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Decisioni dell'utente del 2026-10-11 (D-37): confermate tutte le altre scelte dei macrotask 19 e 20; i quattro task raccolgono i cambiamenti chiesti e i dettagli chiusi nella stessa sessione (protezioni che restano per il root admin, export JSON e per Keyword Planner tecnici, booleani nativi in XLSX e Google Sheets, conferma anticipata dell'aggiornamento della caratterizzazione dell'export). Emendano D-27 e D-30 (T-2101), il DoD di T-1906 e AC-1906-4 (T-2102), AC-107-2, AC-406-1 e AC-805-2 (T-2103), il DoD di T-1902 (T-2104).
- Nessuna baseline visiva cambia: i task non toccano dashboard e pagina dei risultati.
- Nessuna scelta dell'agente da confermare: i nomi delle chiavi dei cataloghi (export.columns, strategy.export.columns) sono dettagli di costruzione.
