# 26-ux-settings — Macrotask `ux-settings`

> Ultimo dei quattro moduli della nuova esperienza d'uso (D-39, brainstorming del 2026-10-13 con mockup approvati per sezioni). Mette in ordine impostazioni e argomenti, aggiunge la lista dei marchi dei concorrenti, toglie le pagine che il percorso nuovo ha sostituito e completa il passaggio a parole semplici e alle regole visive.

## Obiettivo del macrotask
Dopo i moduli 23-25 restano le pagine di oggi per le sezioni e le impostazioni, con tutti i parametri tecnici aperti e il gergo interno (seed, job, override, provider). La lista dei marchi esiste nel database e la ricerca la usa, ma nessuna schermata permette di modificarla. Dopo questo modulo:

- **Impostazioni del progetto** in una pagina con tre blocchi: il progetto (nome, lingua e paese), i marchi dei concorrenti come etichette, «Avanzate» chiuse con tutti i parametri tecnici in italiano normale. In fondo, Elimina il progetto.
- **Marchi dei concorrenti**: si aggiungono e si tolgono dalla pagina delle impostazioni, e la regola vale subito anche per le keyword già trovate.
- **Argomenti**: ognuno può avere impostazioni diverse dal progetto, ma solo se lo si chiede dal suo menu ⋯. L'ordine si cambia trascinandoli nella barra laterale. Spariscono la pagina «Sezioni», la pagina delle impostazioni della sezione e il pulsante della sezione predefinita.
- **Parole semplici** in tutta l'interfaccia del cliente e nessun valore tecnico grezzo a schermo.
- **Regole visive** (stile «A», D-39): colori di stato coerenti, un solo pulsante primario per schermata, rosso solo dentro menu e dialoghi, niente riquadri dentro riquadri.

## Task atomici

```yaml
- id: T-2601
  title: "Marchi dei concorrenti modificabili, con effetto sulle keyword già trovate"
  macrotask: "ux-settings"
  depends_on: [T-703, T-1502, T-2401]

  objective: >
    Permettere di gestire la lista dei marchi del progetto dall'interfaccia e applicarla subito alle keyword già
    trovate, così che le keyword con il marchio di un concorrente partano scartate.

  definition_of_done:
    - "GET, POST e DELETE /api/projects/[id]/brands (DELETE con l'id nel percorso /brands/[brandId]): solo le righe di brand_blacklist del progetto (le righe globali con project_id null non si elencano né si modificano); brand da 1 a 100 caratteri dopo il trim, al massimo 200 marchi per progetto, marchio già presente nel progetto → 409 BRAND_EXISTS (nuovo codice in API_ERROR_CODES e nei cataloghi errors.* it ed en). Lettura con project.read, scrittura con project.update."
    - "Aggiungendo un marchio, nella stessa transazione, le keyword del progetto che lo contengono a parola intera (evaluateBrandStatus di T-703, con la lingua effettiva della loro sezione) prendono brand_status excluded se exclude_brands effettivo della sezione è true, altrimenti review, con brand_reason; quelle excluded con review_status pending passano a rejected. Togliendo un marchio, le keyword con brand_reason di quel marchio tornano allowed senza brand_reason e il loro review_status non cambia."
    - "Blocco «Marchi dei concorrenti» nella pagina delle impostazioni (T-2602): riga «Le keyword con questi nomi partono già scartate», un'etichetta con ✕ per marchio e il campo «+ aggiungi»; errori sotto il campo."

  acceptance_criteria:
    - id: AC-2601-1
      given: "un progetto con exclude_brands true e le keyword 'nike pegasus' pending, 'scarpe nike' approved e 'scarpe running' pending"
      when: "si invia POST /api/projects/[id]/brands con brand 'nike'"
      then: "la risposta è 201; 'nike pegasus' è rejected con brand_status excluded; 'scarpe nike' resta approved con brand_status excluded; 'scarpe running' resta pending con brand_status allowed"
    - id: AC-2601-2
      given: "lo stesso progetto dopo l'aggiunta di 'nike'"
      when: "si invia DELETE del marchio, poi POST con brand 'nike' due volte"
      then: "dopo la DELETE 'nike pegasus' ha brand_status allowed e resta rejected; il primo POST risponde 201 e il secondo 409 BRAND_EXISTS"
    - id: AC-2601-3
      given: "un utente di un altro workspace e un corpo con brand di 101 caratteri"
      when: "l'utente esterno chiama GET e POST sui marchi del progetto, poi un membro invia il brand lungo"
      then: "l'utente esterno riceve 404 su entrambe; il membro riceve 400 VALIDATION_ERROR e la lista non cambia"

  target_tests:
    - file: "tests/integration/project-brands.test.ts"
      covers: [AC-2601-1, AC-2601-2, AC-2601-3]

  security_notes:
    - "A01 / CWE-639: marchi e keyword aggiornati solo nel progetto verificato nel workspace; le righe globali restano fuori dall'API."
    - "A06 / CWE-770: tetto di 200 marchi per progetto; l'aggiornamento delle keyword è una sola query per marchio."

  out_of_scope:
    - "Gestione della lista globale dei marchi: resta com'è, fuori dall'interfaccia."
    - "Suggerimento automatico dei marchi dalle keyword trovate."

- id: T-2602
  title: "Pagina Impostazioni a tre blocchi e impostazioni dell'argomento su richiesta"
  macrotask: "ux-settings"
  depends_on: [T-2601, T-809, T-2403]

  objective: >
    Riscrivere le impostazioni del progetto in una pagina con tre blocchi chiari e i parametri tecnici chiusi, e
    spostare le impostazioni diverse per argomento in un dialogo aperto solo su richiesta.

  definition_of_done:
    - "app/projects/[id]/settings/page.tsx: blocco «Il progetto» (nome, lingua e paese delle ricerche); blocco «Marchi dei concorrenti» (T-2601); blocco «Avanzate» chiuso di default (details e summary) con fonte dei suggerimenti (solo per il root admin), volumi di ricerca, volume minimo, profilo del punteggio, esclusione dei marchi, profondità della ricerca (lettere, numeri, modelli) e classificazione automatica, ciascuno con un'etichetta in parole semplici e una riga di spiegazione; un pulsante Salva per il progetto (PATCH di T-809); in fondo «Elimina il progetto» solo con il permesso project.delete, con conferma."
    - "Voce «Impostazioni diverse dal progetto…» nel menu ⋯ dell'argomento (T-2403): dialogo con gli stessi campi tecnici, ognuno con la scelta predefinita «Come il progetto», che salva gli override della sezione con la PATCH esistente (T-809)."
    - "La pagina app/projects/[id]/subprojects/[subprojectId] è rimossa e reindirizza con 308 alla pagina dell'argomento; i suoi campi vivono in Rinomina, Parole di partenza (T-2404) e Impostazioni diverse dal progetto. components/subproject-form.tsx e project-advanced-fields.tsx si riducono a ciò che i nuovi dialoghi usano (knip senza export inutilizzati)."

  acceptance_criteria:
    - id: AC-2602-1
      given: "un MEMBER e un ADMIN che aprono le impostazioni dello stesso progetto"
      when: "si legge la pagina appena aperta"
      then: "per entrambi il blocco Avanzate è chiuso e i campi del volume minimo e del profilo del punteggio non sono visibili; la pagina del MEMBER non contiene Elimina il progetto, quella dell'ADMIN sì"
    - id: AC-2602-2
      given: "il dialogo delle impostazioni diverse di un argomento senza override, con risposta simulata 200 della PATCH"
      when: "l'utente imposta il volume minimo a 50, lascia gli altri campi su Come il progetto e salva"
      then: "il corpo della PATCH contiene min_volume_override 50 e nessun altro campo di override con un valore diverso da null"
    - id: AC-2602-3
      given: "la richiesta /projects/<id>/subprojects/<A>"
      when: "si segue la risposta"
      then: "la risposta è 308 verso /projects/<id>/keywords/<A>"

  target_tests:
    - file: "tests/e2e/settings.spec.ts"
      covers: [AC-2602-1]
    - file: "tests/component/topic-overrides-dialog.test.tsx"
      covers: [AC-2602-2]
    - file: "tests/integration/settings-redirect.test.ts"
      covers: [AC-2602-3]

  security_notes:
    - "A01 / CWE-285: Elimina e la fonte dei suggerimenti si nascondono senza permesso, ma restano protetti lato server (T-809, D-24)."

  out_of_scope:
    - "Nuovi parametri di estrazione: si riorganizzano solo quelli esistenti."

- id: T-2603
  title: "Argomenti riordinabili nella barra laterale e fine delle pagine delle sezioni"
  macrotask: "ux-settings"
  depends_on: [T-2303, T-808, T-2602]

  objective: >
    Cambiare l'ordine degli argomenti direttamente nella barra laterale e togliere la pagina Sezioni e la sezione
    predefinita, ormai sostituite dalla barra e dall'ultimo argomento aperto.

  definition_of_done:
    - "Barra laterale (T-2303): gli argomenti si riordinano con il drag and drop nativo e con le voci «Sposta su» e «Sposta giù» del loro menu ⋯ (alternativa da tastiera e touch), entrambi con la rotta di riordino esistente (T-808)."
    - "Rimossi la pagina app/projects/[id]/sections (308 verso /projects/[id]/keywords), components/set-default-section-button.tsx, components/section-order-buttons.tsx, la rotta /api/projects/[id]/default-subproject e setDefaultSection in lib/modules/sections.ts. D-21 emendata: default_subproject_id resta come ripiego, impostato alla creazione del primo argomento e aggiornato al primo argomento rimasto quando quello predefinito si elimina; il progetto si apre sull'ultimo argomento aperto (T-2403)."

  acceptance_criteria:
    - id: AC-2603-1
      given: "un utente E2E con un progetto di 3 argomenti A, B e C"
      when: "apre il menu ⋯ di C nella barra laterale con la tastiera, sceglie Sposta su due volte e ricarica"
      then: "la barra laterale mostra gli argomenti nell'ordine C, A, B"
    - id: AC-2603-2
      given: "un utente autenticato membro del progetto"
      when: "apre /projects/<id>/sections e invia POST /api/projects/<id>/default-subproject"
      then: "la pagina risponde 308 verso /projects/<id>/keywords; la rotta risponde 404"
    - id: AC-2603-3
      given: "un progetto con gli argomenti A (predefinito) e B"
      when: "si elimina A"
      then: "default_subproject_id del progetto è uguale all'id di B"

  target_tests:
    - file: "tests/e2e/project-shell.spec.ts"
      covers: [AC-2603-1]
    - file: "tests/integration/sections-removed.test.ts"
      covers: [AC-2603-2, AC-2603-3]

  security_notes:
    - "A01 / CWE-639: il riordino passa dalla rotta esistente, che verifica progetto e sezioni nel workspace (T-808)."

  out_of_scope:
    - "Argomenti annidati o raggruppati."

- id: T-2604
  title: "Parole semplici in tutta l'interfaccia del cliente"
  macrotask: "ux-settings"
  depends_on: [T-2603, T-1302, T-1303]

  objective: >
    Togliere il gergo interno e i valori tecnici grezzi dall'interfaccia che vede il cliente, con un test che ne
    impedisce il ritorno.

  definition_of_done:
    - "Cataloghi messages/it.json e messages/en.json: «sezione/section» diventa «argomento/topic», «seed» diventa «parola di partenza/starting keyword», «job» diventa «ricerca/search», «override» diventa «impostazione diversa/custom setting», «provider» diventa «fornitore/source», «scoring» diventa «punteggio/score», in tutti i namespace tranne admin, legal, marketing ed emails; i namespace sections e onboarding non esistono più."
    - "Nessun valore di enum reso a schermo così com'è: fonti, intenti, tipi, stati del marchio, stati di revisione e del job passano sempre dalle etichette dei cataloghi."
    - "tests/unit/plain-language.test.ts: nei namespace del cliente le espressioni regolari \\b(seed|job|override|sezion[ei]|provider|scoring)\\b per l'italiano e \\b(seeds?|jobs?|overrides?|sections?|providers?|scoring)\\b per l'inglese, senza distinzione di maiuscole, non trovano valori."

  acceptance_criteria:
    - id: AC-2604-1
      given: "i cataloghi messages/it.json e messages/en.json"
      when: "si esegue tests/unit/plain-language.test.ts"
      then: "le due espressioni regolari non trovano valori fuori dai namespace admin, legal, marketing ed emails e i due cataloghi hanno lo stesso insieme di chiavi"
    - id: AC-2604-2
      given: "la pagina dell'argomento resa con una keyword per ciascun valore di source, search_intent, keyword_type e brand_status e con tutte le colonne visibili"
      when: "si legge il testo reso"
      then: "il testo non contiene GOOGLE_AUTOCOMPLETE, commercial, transactional, navigational, informational, mixed, allowed, excluded, pending, approved né rejected"

  target_tests:
    - file: "tests/unit/plain-language.test.ts"
      covers: [AC-2604-1]
    - file: "tests/component/keyword-list-labels.test.tsx"
      covers: [AC-2604-2]

  security_notes:
    - "Nessuna superficie nuova: solo testi dei cataloghi, resi come testo."

  out_of_scope:
    - "Testi del pannello di amministrazione, delle pagine pubbliche, delle pagine legali e delle email."

- id: T-2605
  title: "Regole visive del percorso"
  macrotask: "ux-settings"
  depends_on: [T-2604, T-2506]

  objective: >
    Applicare a tutte le schermate del percorso le regole d'ordine scelte con lo stile «A»: colori di stato
    coerenti, un solo pulsante primario per schermata, rosso solo dentro menu e dialoghi, niente riquadri annidati.

  definition_of_done:
    - "app/globals.css: variabili --status-done (verde), --status-progress (giallo) e --status-danger (rosso) per il tema scuro e per quello chiaro, usate da tappe della barra laterale, etichette di stato del piano, etichetta «marchio? controlla», barre di avanzamento e azioni di eliminazione."
    - "Home, pagina dell'argomento, piano e impostazioni: un solo pulsante primario visibile fuori da dialoghi e menu; nessun pulsante di eliminazione rosso visibile fuori da dialoghi e menu; nessun .card dentro un altro .card."
    - "Contrasto delle nuove variabili di stato almeno 4,5:1 sul fondo nei due temi."

  acceptance_criteria:
    - id: AC-2605-1
      given: "un utente E2E con un progetto che ha keyword e piano, nel tema scuro e poi nel tema chiaro"
      when: "apre la home, la pagina di un argomento, il piano e le impostazioni del progetto"
      then: "su ogni pagina il numero di .btn-primary visibili fuori da [role=dialog] e [role=menu] è 1, il numero di .btn-danger visibili fuori da [role=dialog] e [role=menu] è 0 e il numero di elementi .card .card è 0"
    - id: AC-2605-2
      given: "le variabili --status-done, --status-progress e --status-danger dei due temi e il colore di fondo di ciascun tema"
      when: "si calcola il rapporto di contrasto WCAG di ogni variabile sul fondo"
      then: "ogni rapporto è almeno 4,5"

  target_tests:
    - file: "tests/e2e/visual-rules.spec.ts"
      covers: [AC-2605-1]
    - file: "tests/unit/status-colors.test.ts"
      covers: [AC-2605-2]

  security_notes:
    - "Nessuna superficie nuova: solo stili."

  out_of_scope:
    - "Nuova palette, nuovi caratteri o illustrazioni: lo stile si rifà in un lavoro separato, se l'utente lo vorrà (D-39, scelta A)."
    - "Pagine Personalizza, Account, Workspace, Fatturazione e Amministrazione: seconda parte del lavoro sull'esperienza d'uso, non pianificata."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo 26 approvato dall'utente il 2026-10-13 («approvo», insieme ai moduli 23, 24 e 25), con le differenze dai mockup e le scelte dell'agente elencate in questo Self-check.
- Design approvato dall'utente il 2026-10-13: pagina Impostazioni a tre blocchi con Avanzate chiuse, lista dei marchi dei concorrenti (piccola funzione nuova sopra la tabella esistente brand_blacklist), impostazioni diverse per argomento solo dal suo menu, riordino degli argomenti nella barra laterale, fine della pagina Sezioni e della sezione predefinita, stile «A» (identità di oggi più regole d'ordine).
- Emendamenti dichiarati: D-21 (la sezione predefinita non si sceglie più dall'interfaccia; default_subproject_id resta come ripiego).
- Gate umani: nessuno previsto; se l'E2E riscrive le baseline visive di dashboard o risultati, la rigenerazione va approvata prima del merge.
- Scelte dell'agente da confermare (rilievi): limite di 200 marchi per progetto e di 100 caratteri per marchio; togliere un marchio non ripristina da solo le keyword scartate; termini inglesi scelti per i cataloghi (topic, starting keyword, search, custom setting, source, score).
- Emendamenti dichiarati in costruzione (2026-10-14): AC-808-4 (riordino da tastiera nel menu ⋯ della barra laterale), AC-1102-2 (jobStatusTone rimossa con il suo ultimo uso), AC-1302-2 (accento su projects.brands.intro), AC-1502-3 (senza la rotta default-subproject), con le note nei Self-check dei moduli 08, 11, 12, 13 e 15.
- Note di costruzione (2026-10-14), scelte dell'agente da confermare dall'utente. T-2601: un marchio è già presente se ha le stesse parole nella forma canonica (Nike, NIKE e nike; coca-cola e coca cola) e un marchio senza lettere né cifre è 400; oltre i 200 marchi la risposta è 400 VALIDATION_ERROR, senza un codice nuovo; il marchio nuovo tocca solo le keyword ancora allowed, così brand_reason resta quello del primo marchio trovato, e la scrittura è una sola query; togliere un marchio riporta allowed le keyword con il suo brand_reason anche se una riga globale ha lo stesso nome (caso limite). T-2602: Salva è un pulsante secondario perché il primario della schermata è quello della barra del prossimo passo (T-2605); il dialogo dell'argomento ha anche lingua e paese delle ricerche, che stavano nella pagina rimossa; la descrizione della sezione non si modifica più dall'interfaccia (resta nel DB e nell'export dei dati dell'account); la fonte dei suggerimenti si invia solo dal root admin e DataForSEO resta tra le opzioni del root admin o di chi lo ha già. T-2603: il menu ⋯ di un argomento compare al passaggio o al focus sui dispositivi con puntatore ed è sempre visibile sul touch; il trascinamento chiama la rotta di riordino un posto alla volta; /projects/[id]/sections porta alla vista del progetto. T-2604: le espressioni del gergo si applicano al testo visibile dei messaggi e non ai nomi degli argomenti ICU (per esempio {seed} nei motivi delle pagine del piano, legato ai parametri salvati); etichette in parole semplici per intenti, tipi e stati del marchio, anche negli export; una fonte senza etichetta compare come «Altra fonte». T-2605: le variabili di stato rimandano ai colori di stato già usati (stessi valori, seguono le varianti per la visione dei colori) e il contrasto si misura su --bg-0 e --bg-1; la barra di avanzamento della ricerca usa il verde di «fatto».
- Rimozioni (DoD di T-2602 e T-2603) e loro orfani diretti: pagine Sezioni e delle impostazioni della sezione (ora rotte 308), set-default-section-button.tsx, section-order-buttons.tsx, la rotta default-subproject e setDefaultSection, delete-entity-button.tsx e lib/view/delete-targets.ts, page-header-card.tsx, SECTIONS_WITH_STATS, activeJobIdOf, jobStatusTone e il namespace sections dei cataloghi, con i test dei componenti rimossi. RunExtractionButton e JobProgress non sono più montati da nessuna pagina ma restano, con i loro test (AC-305-3, AC-305-4, AC-1205-1…3): la loro rimozione è una decisione dell'utente (L-COL-021).
