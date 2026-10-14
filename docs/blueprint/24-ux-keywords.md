# 24-ux-keywords — Macrotask `ux-keywords`

> Secondo dei quattro moduli della nuova esperienza d'uso (D-39, brainstorming del 2026-10-13 con mockup approvati per sezioni). Sostituisce la pagina del progetto e la pagina dei risultati con la pagina delle keyword di un argomento, unifica revisione e selezione in un solo gesto tieni/scarta e porta tutti gli export in una sola finestra.

## Obiettivo del macrotask
Oggi le keyword stanno sotto 12 filtri, 7 pulsanti di export e il blocco di Keyword Planner; da telefono servono due schermate prima di vederne una. La revisione ha due stati paralleli (review_status e selected_for_export) e i valori tecnici compaiono grezzi in tabella. Dopo questo modulo:

- **Ogni keyword parte già tenuta** e l'utente scarta solo quelle che non c'entrano; quelle con il marchio di un concorrente partono già scartate. Un solo stato: tenuta (review_status diverso da rejected) o scartata (rejected). selected_for_export sparisce. Il piano usa tutte le tenute (D-39).
- **La pagina di un argomento** mostra subito la lista con tre colonne (keyword, ricerche al mese, potenziale), un clic per scartare, le scartate raccolte in fondo, filtri rapidi a chip e i filtri completi chiusi in «Filtri». La stessa pagina senza argomento mostra tutto il progetto.
- **Mentre la ricerca gira** una frase sola dice cosa succede, con l'anteprima dei suggerimenti trovati; **«Trova altre keyword»** aggiunge parole di partenza e rilancia.
- **Il blocco di Keyword Planner** diventa l'azione «Aggiungi i volumi», visibile solo quando i volumi mancano.
- **Un solo pulsante «Esporta»** in alto apre una finestra con tre domande (cosa, quali, formato) e parte già impostata in base alla pagina. Gli ambiti tecnici di oggi si riducono a tenute, tutte e filtrate.

## Task atomici

```yaml
- id: T-2401
  title: "Un solo stato tieni/scarta al posto di revisione e selezione"
  macrotask: "ux-keywords"
  depends_on: [T-705, T-807, T-1903, T-2302]

  objective: >
    Ridurre la revisione delle keyword a un solo stato, tenuta o scartata, con le keyword che partono tenute e
    quelle dei marchi esclusi che partono scartate, e far usare quella regola a piano, prossimo passo e azioni massive.

  definition_of_done:
    - "Migrazione 0042_keep_discard: le keyword con brand_status excluded e review_status pending passano a rejected; la colonna keyword_candidates.selected_for_export e i suoi indici vengono eliminati."
    - "lib/modules/pipeline/candidates.ts: una keyword nuova con brand_status excluded entra con review_status rejected, le altre con pending; al re-run le keyword già presenti conservano review_status (D-19 emendata: selected_for_export non esiste più)."
    - "Regola unica in lib/modules/keep-rule.ts: KEPT_WHERE = review_status diverso da rejected; la usano il perimetro automatico delle strategie (che non filtra più su brand_status, così una keyword di marchio recuperata a mano entra nel piano), computeProjectProgress e loadProjectProgress (T-2302) e i conteggi della barra laterale e della home."
    - "PATCH /api/projects/[id]/results: azioni keep (review_status approved) e discard (review_status rejected), su id o su tutto il set filtrato come oggi (T-803); le azioni approve, reject, mark-review, select e unselect non esistono più (400 VALIDATION_ERROR). Filtro dei risultati status con valori kept e discarded al posto di reviewStatus e selectedOnly."
    - "tests/integration/characterization/export.char.test.ts aggiornato solo dove la caratterizzazione fissa selected_for_export, gli scope e i valori di revisione: modifica confermata in anticipo dall'utente con D-39."

  acceptance_criteria:
    - id: AC-2401-1
      given: "il DB di test con una keyword excluded e pending, una excluded e approved e una allowed e pending, migrato fino a 0042"
      when: "si leggono le tre keyword e le colonne di keyword_candidates"
      then: "la prima è rejected, la seconda resta approved, la terza resta pending e la colonna selected_for_export non esiste"
    - id: AC-2401-2
      given: "un'estrazione con un marchio in lista e exclude_brands true, che produce 'nike pegasus' e 'scarpe running', seguita da un re-run dopo che l'utente ha tenuto 'nike pegasus'"
      when: "si leggono le keyword dopo la prima estrazione e dopo il re-run"
      then: "dopo la prima 'nike pegasus' è rejected con brand_status excluded e 'scarpe running' è pending; dopo il re-run 'nike pegasus' è approved"
    - id: AC-2401-3
      given: "un progetto con una keyword pending, una approved, una rejected e una approved con brand_status excluded"
      when: "si genera una strategia in modalità automatica"
      then: "la strategia contiene le keyword pending, approved e approved con brand excluded, e non contiene la rejected"
    - id: AC-2401-4
      given: "una sezione con 10 keyword di cui 4 domande"
      when: "si invia PATCH con action discard su tutto il set filtrato dalle domande, poi PATCH con action select"
      then: "la prima risposta è 200 e le 4 domande sono rejected mentre le altre 6 non cambiano; la seconda è 400 VALIDATION_ERROR"

  target_tests:
    - file: "tests/integration/keep-discard.test.ts"
      covers: [AC-2401-1, AC-2401-2, AC-2401-3, AC-2401-4]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-2401-1]

  security_notes:
    - "A01 / CWE-639: le azioni massive restano limitate al progetto e alla sezione verificati nel workspace dell'utente (T-803, T-1502)."

  out_of_scope:
    - "Annulla dell'ultima azione oltre al ripristino dalle scartate."

- id: T-2402
  title: "Ambiti di export: tenute, tutte e filtrate"
  macrotask: "ux-keywords"
  depends_on: [T-2401, T-806, T-2102]

  objective: >
    Sostituire i cinque ambiti tecnici di export con tre ambiti comprensibili, uguali per file e Google Sheets, e
    allineare colonne e valori dell'export al nuovo stato unico.

  definition_of_done:
    - "EXPORT_SCOPES = kept, all, filtered (lib/modules/export-types.ts). kept = keyword tenute dell'argomento indicato da subprojectId oppure di tutto il progetto senza subprojectId, senza i filtri della vista; all = tutte le keyword dello stesso perimetro, scartate comprese; filtered = esattamente il set della vista corrente con tutti i suoi filtri (D-23 emendata: kept e all non si combinano più con i filtri della vista)."
    - "Stessi ambiti per GET /api/projects/[id]/export (csv, xlsx, json) e per l'export su Google Sheets; uno scope dei valori precedenti (approved, selected, review, non-excluded) → 400 VALIDATION_ERROR."
    - "Colonne dell'export: sparisce selected_for_export; la colonna della revisione mostra Tenuta o Scartata nella lingua dell'utente (catalogo export, T-2102); il resto delle colonne non cambia."

  acceptance_criteria:
    - id: AC-2402-1
      given: "un progetto con le sezioni A (5 keyword: 2 domande tenute, 2 altre tenute e 1 scartata che non è una domanda) e B (3 keyword tenute)"
      when: "si scarica il CSV con scope kept e subprojectId A, con scope kept senza subprojectId, con scope all e subprojectId A, con scope filtered e subprojectId A e il filtro delle domande"
      then: "i file hanno nell'ordine 4, 7, 5 e 2 righe di dati"
    - id: AC-2402-2
      given: "lo stesso progetto e un account Google Sheets collegato con l'API simulata"
      when: "si esporta su Google Sheets con scope kept e subprojectId A, poi si chiede il CSV con scope selected"
      then: "le righe scritte nel foglio coincidono con le righe del CSV con lo stesso scope; la seconda richiesta riceve 400 VALIDATION_ERROR"
    - id: AC-2402-3
      given: "un utente con interfaccia inglese e una keyword scartata"
      when: "scarica l'XLSX con scope all"
      then: "l'intestazione non contiene una colonna di selezione e la cella della revisione della keyword scartata contiene la traduzione inglese di Scartata"

  target_tests:
    - file: "tests/integration/export-scopes.test.ts"
      covers: [AC-2402-1, AC-2402-2, AC-2402-3]

  security_notes:
    - "A05 Injection / CWE-1236: invariata la neutralizzazione delle formule dei CSV e delle celle di testo dell'XLSX (T-804)."
    - "A01 / CWE-639: perimetro dell'export sempre dentro il progetto verificato nel workspace (T-1502)."

  out_of_scope:
    - "Export per Keyword Planner (T-904): resta invariato e passa da «Aggiungi i volumi» (T-2405)."

- id: T-2403
  title: "Pagina delle keyword di un argomento e del progetto"
  macrotask: "ux-keywords"
  depends_on: [T-2401, T-2303, T-801, T-803]

  objective: >
    Sostituire la pagina del progetto e la pagina dei risultati con una pagina che mostra subito le keyword di un
    argomento, con un clic per scartare, filtri rapidi e strumenti da esperto chiusi.

  definition_of_done:
    - "Pagine app/projects/[id]/keywords/[topicId]/page.tsx (un argomento) e app/projects/[id]/keywords/page.tsx (tutto il progetto, con la colonna Argomento). app/projects/[id]/page.tsx reindirizza all'ultimo argomento aperto (cookie titan_last_topic_<projectId> impostato dalla pagina dell'argomento e verificato sul progetto), altrimenti a default_subproject_id, altrimenti al primo argomento per position, altrimenti alla vista del progetto con il messaggio «Aggiungi il primo argomento». /projects/[id]/results reindirizza con 308 alla nuova pagina (subprojectId → /keywords/<id>, view=all → /keywords), conservando i filtri con lo stesso nome."
    - "Intestazione: nome dell'argomento come h1, «N trovate · M tenute», pulsante «+ Trova altre keyword» (T-2404) e menu ⋯ con Parole di partenza (T-2404), Rinomina (dialogo, PATCH del nome) ed Elimina (permesso section.write, dialogo di conferma)."
    - "Chip di filtro rapido con il conteggio, mostrati solo se il conteggio è maggiore di 0: Tutte, Domande (is_question), Per comprare (intento commercial o transactional), Locali (is_local), Marchi (brand_status diverso da allowed). Accanto: Cerca, «Filtri» (pannello chiuso con volume minimo e massimo, intento, tipo), «Ordina» (più promettenti = ordinamento attuale di D-18, ricerche, A-Z), «Colonne» (fonte, intento, tipo, concorrenza, punteggio; nascoste di default, scelta salvata nel localStorage)."
    - "Elenco: per riga un pulsante tieni/scarta con aria-pressed ed etichetta «Scarta <keyword>» o «Tieni <keyword>», la keyword con le etichette domanda, per comprare, locale e «marchio? controlla» (brand_status review), le ricerche al mese (formattate nella lingua dell'utente, «—» se assenti), la barra Potenziale dal punteggio (larghezza proporzionale, valore numerico solo nel testo accessibile). Il clic aggiorna subito la riga e la sposta tra le scartate, con ripristino della riga e messaggio se la PATCH fallisce."
    - "Le scartate non stanno nell'elenco principale: in fondo un pulsante «Scartate (N)» le mostra, con il pulsante Tieni su ogni riga. Con un chip, un filtro o una ricerca attivi compaiono «Tieni queste N» e «Scarta queste N», che agiscono su tutto il set filtrato (T-803). Paginazione di T-801 invariata."
    - "Dalla pagina spariscono il modulo dei 12 filtri, il blocco export, il blocco Keyword Planner e la tendina delle azioni massive. Il vecchio contenuto di app/projects/[id]/page.tsx (pulsanti per sezione, avvio dell'estrazione, link) è rimosso."
    - "Sotto i 640 px: chip scorrevoli in orizzontale, colonna Potenziale nascosta, prima riga dell'elenco visibile senza scorrere a 390x844."
    - "Baseline visiva dei risultati di tests/e2e/visual.spec.ts spostata sulla nuova pagina e rigenerata: gate umano, approvazione dell'utente prima del merge. tests/e2e/a11y.spec.ts aggiornato alla nuova pagina."

  acceptance_criteria:
    - id: AC-2403-1
      given: "un utente E2E con l'argomento A di 28 keyword tenute, di cui 6 domande, e la viewport 1280x900"
      when: "apre /projects/<id>, preme il pulsante tieni/scarta della prima riga e poi il pulsante Scartate"
      then: "l'URL diventa /projects/<id>/keywords/<A>; dopo il clic la riga non è più nell'elenco principale e l'intestazione mostra 27 tenute; dopo il secondo clic la keyword compare tra le scartate con il pulsante Tieni"
    - id: AC-2403-2
      given: "lo stesso argomento"
      when: "l'utente preme il chip Domande e poi Scarta queste 6"
      then: "l'elenco principale del chip è vuoto, il conteggio Scartate è aumentato di 6 e il chip Domande non è più mostrato nell'elenco delle tenute"
    - id: AC-2403-3
      given: "la viewport 390x844 e lo stesso argomento"
      when: "l'utente apre la pagina dell'argomento"
      then: "il bordo superiore della prima riga dell'elenco è sopra 844 px e la pagina non contiene un elemento con il testo Keyword Planner"
    - id: AC-2403-4
      given: "le richieste /projects/<id>/results?subprojectId=<A>&searchText=scarpe e /projects/<id>/results?view=all"
      when: "si seguono le risposte"
      then: "la prima risponde 308 verso /projects/<id>/keywords/<A>?searchText=scarpe e la seconda 308 verso /projects/<id>/keywords"
    - id: AC-2403-5
      given: "la pagina dell'argomento a 1280x900 con il pannello Filtri aperto"
      when: "si esegue axe"
      then: "axe riporta 0 violazioni serious o critical"

  target_tests:
    - file: "tests/e2e/keywords.spec.ts"
      covers: [AC-2403-1, AC-2403-2, AC-2403-3, AC-2403-5]
    - file: "tests/integration/results-redirect.test.ts"
      covers: [AC-2403-4]

  security_notes:
    - "A01 / CWE-639: argomento e progetto si risolvono nel workspace dell'utente; un topicId di un altro progetto → 404; il cookie dell'ultimo argomento è solo un suggerimento e si verifica sul progetto."
    - "A05 Injection / CWE-79: keyword resi come testo."

  out_of_scope:
    - "Scorciatoie da tastiera per scorrere e scartare."
    - "Modifica del testo di una keyword."

- id: T-2404
  title: "Ricerca in corso, parole di partenza e «Trova altre keyword»"
  macrotask: "ux-keywords"
  depends_on: [T-2403, T-1204, T-1205]

  objective: >
    Dire in una frase cosa sta facendo la ricerca, mostrare un'anteprima dei suggerimenti trovati e permettere di
    aggiungere parole di partenza e rilanciare dalla pagina dell'argomento.

  definition_of_done:
    - "Con un job attivo sull'argomento, sopra l'elenco un riquadro «Sto cercando le keyword…» con la fase in parole semplici (expand e autocomplete: Cerco i suggerimenti di Google; metrics: Recupero i volumi di ricerca; store: Salvo le keyword), il numero trovato finora dall'avanzamento del job, la frase «di solito ci vuole qualche minuto» e il pulsante Annulla (T-1204); niente parole come job, fase o seed."
    - "GET /api/jobs/[id] aggiunge recentSuggestions: le ultime 20 keyword di job_suggestions del job per id decrescente, solo mentre il job è attivo; il riquadro le mostra in sola lettura come anteprima («Potrai scartarle appena la ricerca finisce»). A fine job l'elenco si aggiorna senza ricaricare la pagina."
    - "components/topic-seeds-dialog.tsx: dialogo «Parole di partenza» con le parole attuali (rimovibili) e un campo per aggiungerne, una per riga; «Salva e cerca» invia la lista completa con PATCH dell'argomento (T-809) e avvia la ricerca con la rotta run; «Salva» salva soltanto. «+ Trova altre keyword» apre lo stesso dialogo con il focus sul campo di aggiunta."
    - "tests/e2e/background-run.spec.ts aggiornato al nuovo percorso: l'estrazione si avvia da «Trova altre keyword» e dalla barra del prossimo passo invece che dalla vecchia pagina del progetto."

  acceptance_criteria:
    - id: AC-2404-1
      given: "un job attivo in fase autocomplete con 25 righe in job_suggestions e un job completato con righe in job_suggestions"
      when: "si chiama GET /api/jobs/[id] per entrambi"
      then: "la prima risposta contiene recentSuggestions con 20 keyword, dalla più recente; la seconda non contiene recentSuggestions"
    - id: AC-2404-2
      given: "il riquadro della ricerca reso con un job in fase metrics e 57 keyword trovate"
      when: "si legge il testo del riquadro"
      then: "il testo contiene la traduzione di Recupero i volumi di ricerca e il numero 57 e non contiene le parole job, seed o fase"
    - id: AC-2404-3
      given: "il dialogo delle parole di partenza di un argomento con le parole 'scarpe running' e 'scarpe corsa', con risposte simulate 200 per la PATCH e 202 per la rotta run"
      when: "l'utente aggiunge 'scarpe running donna', rimuove 'scarpe corsa' e preme Salva e cerca"
      then: "il corpo della PATCH ha seeds uguale a ['scarpe running', 'scarpe running donna']; la rotta run viene chiamata dopo la PATCH per lo stesso argomento"

  target_tests:
    - file: "tests/integration/job-status-suggestions.test.ts"
      covers: [AC-2404-1]
    - file: "tests/component/search-progress.test.tsx"
      covers: [AC-2404-2]
    - file: "tests/component/topic-seeds-dialog.test.tsx"
      covers: [AC-2404-3]

  security_notes:
    - "A01 / CWE-639: recentSuggestions passa dallo stesso controllo di accesso al job (requireJobAccess, T-1204)."
    - "A06 / CWE-400: al massimo 20 righe per richiesta di stato, lette con l'indice su job_id."

  out_of_scope:
    - "Scartare durante la ricerca: le keyword si salvano a fine job (fase store), quindi l'anteprima è in sola lettura."

- id: T-2405
  title: "«Aggiungi i volumi» al posto del blocco Keyword Planner"
  macrotask: "ux-keywords"
  depends_on: [T-2403, T-902, T-910, T-2003]

  objective: >
    Mostrare l'azione per ottenere i volumi di ricerca solo quando mancano, con il recupero automatico quando il
    fornitore con licenza è disponibile e il percorso guidato di Keyword Planner in ogni caso.

  definition_of_done:
    - "Riquadro «Non sappiamo ancora quante persone cercano queste keyword» con il pulsante «Aggiungi i volumi», mostrato nella pagina dell'argomento quando ha almeno una keyword tenuta, nessuna keyword tenuta con avg_monthly_searches valorizzato e nessun job attivo."
    - "Dialogo «Aggiungi i volumi»: opzione automatica solo se assertLicensedMetricsChoice ammette DATAFORSEO per l'utente e il progetto (root admin, o diritto licensedMetrics con il lancio attivo, T-2003): imposta metrics_provider_override DATAFORSEO sull'argomento e rilancia la ricerca (le scelte tieni/scarta restano, D-19). Percorso guidato sempre disponibile in tre passi: scarica il file (planner-export, T-904), istruzioni per Keyword Planner di Google Ads, carica il file esportato (planner-import, T-910); a import riuscito l'elenco mostra i volumi."
    - "I componenti planner-export-download.tsx e planner-import-upload.tsx si usano solo dentro il dialogo."

  acceptance_criteria:
    - id: AC-2405-1
      given: "un argomento con keyword tenute senza volumi e un argomento con almeno una keyword tenuta con volume"
      when: "un utente E2E apre le due pagine"
      then: "solo la prima mostra il pulsante Aggiungi i volumi"
    - id: AC-2405-2
      given: "il dialogo reso per un utente senza diritto alle metriche con licenza e per il root admin"
      when: "si legge il contenuto del dialogo per ciascuno"
      then: "per il primo il dialogo contiene i tre passi del percorso guidato e non l'opzione automatica; per il root admin contiene anche l'opzione automatica"
    - id: AC-2405-3
      given: "il root admin e un argomento senza volumi"
      when: "sceglie l'opzione automatica"
      then: "l'argomento ha metrics_provider_override DATAFORSEO, un job nuovo è attivo sull'argomento e il review_status delle sue keyword non cambia"

  target_tests:
    - file: "tests/e2e/keywords.spec.ts"
      covers: [AC-2405-1]
    - file: "tests/component/add-volumes-dialog.test.tsx"
      covers: [AC-2405-2]
    - file: "tests/integration/add-volumes.test.ts"
      covers: [AC-2405-3]

  security_notes:
    - "A01 / CWE-285: la scelta del fornitore con licenza passa da assertLicensedMetricsChoice lato server anche se l'interfaccia nasconde l'opzione (D-30)."
    - "A06 / CWE-770: il rilancio automatico consuma quota e tetti di spesa come un avvio normale (T-903, T-1703)."

  out_of_scope:
    - "Recupero dei soli volumi senza rifare la ricerca dei suggerimenti."

- id: T-2406
  title: "Un solo pulsante Esporta con la finestra delle scelte"
  macrotask: "ux-keywords"
  depends_on: [T-2402, T-2403, T-1906, T-1907]

  objective: >
    Sostituire tutti i pulsanti di export sparsi con un solo pulsante nella barra in alto delle pagine del progetto,
    che apre una finestra con tre domande e parte impostata in base a dove si trova l'utente.

  definition_of_done:
    - "Pulsante «Esporta» nella barra in alto di ogni pagina del progetto (layout di T-2303) che apre components/export-dialog.tsx. Domande: Cosa (Il piano dei contenuti con il numero di pagine, disattivato con «Costruisci prima il piano» se il progetto non ha strategie; Le keyword con il numero delle tenute); Quali, solo per le keyword (tenute dell'argomento, tenute di tutto il progetto, solo quelle che vedi ora con il conteggio, mostrata solo con filtri attivi, tutte comprese le scartate); Formato (piano: PDF per il cliente, Google Sheets, Excel, CSV; keyword: Google Sheets, Excel, CSV)."
    - "Impostazioni iniziali: dalla pagina di un argomento keyword, tenute dell'argomento, Excel; dalla vista del progetto keyword, tenute del progetto, Excel; dalle pagine della strategia piano, PDF. Il pulsante finale dice cosa succede (Scarica il PDF, Scarica l'Excel, Scarica il CSV, Crea il foglio Google). Google non collegato: l'opzione Sheets lo dice e avvia il collegamento esistente (T-906) dalla finestra."
    - "Opzione del PDF «Con il tuo logo in copertina», mostrata solo se il branding ha un logo, attiva di default; spenta aggiunge logo=0 all'export PDF, che allora rende la copertina con il solo nome. «Avanzate» chiuse: JSON (solo keyword), separatore del CSV (Excel italiano o standard, T-804), nome del file Google Sheets."
    - "Spariscono i pulsanti di export della pagina dei risultati, il pulsante Google Sheets separato e il blocco export della pagina della strategia; la finestra tiene il focus e lo restituisce al pulsante Esporta (tests/e2e/a11y.spec.ts aggiornato)."

  acceptance_criteria:
    - id: AC-2406-1
      given: "un utente E2E sulla pagina dell'argomento A con 24 keyword tenute"
      when: "preme Esporta senza cambiare nulla e poi il pulsante finale"
      then: "la finestra mostra Le keyword, le tenute dell'argomento ed Excel selezionati e il pulsante 'Scarica l'Excel'; il file scaricato ha 24 righe di dati"
    - id: AC-2406-2
      given: "la finestra resa dalla pagina della strategia S, con branding senza logo, e resa per un progetto senza strategie"
      when: "si legge il contenuto nei due casi"
      then: "nel primo sono selezionati Il piano dei contenuti e PDF, il pulsante dice 'Scarica il PDF' e l'opzione del logo non c'è; nel secondo l'opzione del piano è disattivata con il testo 'Costruisci prima il piano'"
    - id: AC-2406-3
      given: "una strategia e un branding con un logo PNG valido"
      when: "si scarica il PDF con logo=0 e senza il parametro"
      then: "entrambe le risposte sono 200 application/pdf; solo il secondo PDF contiene un'immagine"
    - id: AC-2406-4
      given: "la pagina dell'argomento con il chip Domande attivo"
      when: "l'utente apre la finestra Esporta"
      then: "tra le scelte di Quali c'è 'Solo quelle che vedi ora' con il conteggio delle domande; senza chip attivo la scelta non c'è"

  target_tests:
    - file: "tests/e2e/export-dialog.spec.ts"
      covers: [AC-2406-1, AC-2406-4]
    - file: "tests/component/export-dialog.test.tsx"
      covers: [AC-2406-2]
    - file: "tests/integration/strategy-pdf.test.ts"
      covers: [AC-2406-3]

  security_notes:
    - "A01 / CWE-639: la finestra chiama solo le rotte di export esistenti, che verificano progetto e strategia nel workspace."
    - "A05 / CWE-79: nomi di file e testi resi come testo."

  out_of_scope:
    - "Scelta delle colonne dell'export: i file contengono tutte le colonne come oggi."
    - "Invio dell'export per email."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo 24 approvato dall'utente il 2026-10-13 («approvo», insieme ai moduli 23, 25 e 26), con le differenze dai mockup e le scelte dell'agente elencate in questo Self-check.
- Design approvato dall'utente il 2026-10-13: gesto unico tieni/scarta con tutto tenuto all'inizio e i marchi esclusi già scartati, tre colonne, chip, scartate in fondo, filtri da esperto chiusi, ricerca in corso in una frase, «Aggiungi i volumi», pagina da telefono, finestra Esporta con impostazioni iniziali per pagina.
- Emendamenti dichiarati: D-19 (selected_for_export sparisce, il re-run conserva review_status), D-23 (scope kept, all, filtered; kept e all senza filtri della vista). Caratterizzazione dell'export aggiornata solo su selezione, scope e valori della revisione: confermata in anticipo con D-39.
- Gate umani: baseline visiva dei risultati spostata sulla nuova pagina e rigenerata, da approvare prima del merge (T-2403).
- Differenze dai mockup, dichiarate all'utente: durante la ricerca le keyword compaiono come anteprima in sola lettura e si scartano a fine ricerca, perché si salvano solo nell'ultima fase del job; nella finestra Esporta non c'è la scelta delle colonne tecniche, perché i file le contengono già tutte.
- Emendamenti di altri moduli in costruzione (2026-10-13), dichiarati nei loro Self-check: AC-107-1…AC-107-4 (01, caratterizzazione dell'export, confermata in anticipo con D-39), AC-705-1 e AC-705-3 (07), AC-802-3, AC-802-4, AC-803-1…AC-803-4 e AC-807-1…AC-807-4 (08), AC-1104-1 e AC-1104-2 (11), AC-1205-4 (12), AC-1903-1 (19), AC-2103-1 e AC-2103-2 (21); nota sul modulo 23 per i nuovi indirizzi. Il golden master della pipeline perde solo la chiave selected_for_export (948 righe tolte, nessun valore cambiato).
- Note di costruzione (2026-10-13), scelte dell'agente da confermare dall'utente. T-2401: «Tieni» scrive approved, così una keyword tenuta a mano si distingue da una mai toccata (pending), entrambe tenute; anche il perimetro esperto delle strategie perde il filtro sul marchio («solo approvate» resta). Filtri della pagina: un solo chip alla volta nel parametro chip (questions, buy, local, brands), i nomi dei vecchi filtri restano validi; i conteggi dei chip contano le tenute con la ricerca e i Filtri ma senza il chip; l'elenco delle scartate segue la stessa vista, con la sua paginazione (discardedPage); «Scarta queste N» conta le tenute del set filtrato e «Tieni queste N» le scartate, ciascuno solo se N è maggiore di 0. Riga: pulsante rotondo ✕ (Scarta) o ↺ (Tieni) all'inizio della riga; Ordina è una select, Colonne un pannello a comparsa con le caselle salvate nel localStorage (titan_keyword_columns). Il cookie dell'ultimo argomento lo scrive il browser (1 anno, SameSite Lax) ed è nell'inventario dei cookie; /projects/<id>/results reindirizza dopo aver verificato il progetto (fuori dal workspace 404), senza parametri all'argomento predefinito. T-2402: uno scope precedente risponde 400 VALIDATION_ERROR anche su Google Sheets; il code EXPORT_SCOPE_INVALID esce dall'elenco chiuso. T-2404: il numero «trovate finora» compare nelle fasi metrics e store, dove l'avanzamento conta le keyword; in expand e autocomplete conta le query e il riquadro mostra solo la frase e l'anteprima; un «Salva e cerca» con una ricerca già in corso non è un errore. T-2405: l'opzione automatica fa due richieste (PATCH dell'argomento, poi run). T-2406: «Tutte, comprese le scartate» riguarda l'argomento nella sua pagina e il progetto altrove; JSON è una scelta di formato dentro Avanzate; nome predefinito del foglio Google = progetto più data; dalla pagina di una strategia si esporta quella strategia, altrove la più recente; senza Google collegato il pulsante finale diventa «Collega Google» (rotta di collegamento esistente, che torna a Personalizza); sotto i 640 px il pulsante Esporta è un'icona con il nome accessibile «Esporta».
- Note di costruzione (2026-10-13), dettagli senza decisioni aperte. I dialoghi si rendono nel body (un antenato con backdrop-filter faceva da contenitore alla posizione fissa); useModalFocus salta i campi delle sezioni chiuse. Componenti in comune estratti per non creare cloni: menu ⋯ (EntityMenu, anche per la scheda del progetto della home), dialoghi Rinomina ed Elimina, fondo dei dialoghi, select di intento e tipo (anche nelle impostazioni esperte della strategia), barra di avanzamento e polling dello stato del job (useJobStatus), avvio della ricerca di un argomento. Rimossi con i task, perché sostituiti: pagina dei risultati, ResultsTable, GoogleSheetsExportButton, contenuto della vecchia pagina del progetto e voci dei cataloghi usate solo da loro.
- Nota (2026-10-14, macrotask 25 ux-plan): «la pagina della strategia» di T-2406 e di AC-2406-2 è ora il piano del progetto in /plan, che registra la strategia aperta per la finestra Esporta come prima; nella finestra il PDF del piano ha in più l'opzione «Includi lo stato di scrittura», spenta di default (T-2501).
