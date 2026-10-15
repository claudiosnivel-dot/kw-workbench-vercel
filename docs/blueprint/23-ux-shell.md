# 23-ux-shell — Macrotask `ux-shell`

> Primo dei quattro moduli della nuova esperienza d'uso (23-26), decisa dall'utente il 2026-10-13 in un brainstorming con mockup approvati per sezioni (D-39). Questo modulo costruisce la struttura: la barra laterale a tappe dentro il progetto, la barra del prossimo passo, la barra in alto ridotta, la nuova home con l'avvio in un campo e la rimozione dell'onboarding a 7 passi.

## Obiettivo del macrotask
Oggi l'app «non si capisce»: troppi pulsanti uguali e duplicati, gergo interno, nessun filo che dica cosa fare dopo. La nuova esperienza ha un percorso unico, idea → keyword → piano → scrittura, guidato di default e con gli strumenti da esperto a portata ma chiusi (D-39). In questo modulo:

- **Dentro un progetto** (progetto = sito o cliente) c'è una barra laterale che fa da navigazione e da guida (struttura «M1» approvata): tappe numerate con il loro stato (✓ fatta, numero = da fare), gli argomenti (le attuali sezioni, rinominate) sotto «Keyword», il piano, le impostazioni in fondo. Da telefono la barra diventa un menu ☰.
- **In fondo a ogni pagina del progetto** una barra fissa indica il prossimo passo con un solo pulsante, calcolato dallo stato del progetto.
- **La barra in alto** si riduce al marchio, al selettore del progetto e al menu dell'utente (Personalizza, Account, Workspace, Fatturazione, Amministrazione, Supporto, Esci).
- **La home** al primo accesso chiede solo «Di cosa parla il tuo sito?»: un campo crea progetto, primo argomento e parola di partenza e avvia la ricerca. Chi ha già progetti li vede come schede con il loro avanzamento e un solo pulsante, il prossimo passo.
- **L'onboarding a 7 passi sparisce** (pagine, API, logica e tabelle): la guida ora è il percorso stesso. Rimozione approvata dall'utente il 2026-10-13.

Le pagine interne del progetto (risultati, strategia, impostazioni) restano quelle di oggi dentro la nuova struttura: i moduli 24, 25 e 26 le sostituiscono una alla volta, così ogni modulo va in produzione con l'app completa.

## Task atomici

```yaml
- id: T-2301
  title: "Avvio rapido: progetto, primo argomento e ricerca da un solo campo"
  macrotask: "ux-shell"
  depends_on: [T-1204, T-1502, T-809, T-2004]

  objective: >
    Creare con una sola richiesta progetto, primo argomento e parola di partenza e avviare la ricerca, con lingua e
    paese scelti per l'utente, perché l'ingresso nell'app sia un campo e un clic.

  definition_of_done:
    - "POST /api/projects/quick-start con { topic, languageCode?, countryCode? }: topic da 1 a 200 caratteri dopo il trim (limite delle seed, D-24); in una transazione crea il progetto nel workspace attivo (nome = topic con l'iniziale maiuscola, troncato a 120 caratteri), il primo argomento (subproject con lo stesso nome, position 0, default_subproject_id del progetto) e la seed uguale al topic; poi avvia la ricerca con startExtractionJob come la rotta run della sezione (T-1204). Risposta 201 con { projectId, topicId, jobId, extraction } dove extraction vale started oppure il codice d'errore che ha impedito l'avvio (EMAIL_NOT_VERIFIED, PLAN_LIMIT, RATE_LIMITED o QUOTA_EXCEEDED) e jobId è null se la ricerca non è partita: progetto e argomento restano creati."
    - "lib/modules/targeting.ts: resolveDefaultTargeting(workspaceId, uiLocale) restituisce lingua e paese del progetto del workspace con last_activity_at più recente; senza progetti it/IT con interfaccia italiana o senza lingua scelta, en/US con interfaccia inglese. languageCode e countryCode del corpo, se presenti, vincono e si validano come nel form del progetto (T-809)."
    - "Limite dei progetti del piano (assertWithinLimit) come la creazione normale; il progetto creato quando il workspace non ha ancora nessun progetto ha created_via_onboarding true e resta fuori da maxProjects (T-2004, un solo progetto per workspace come D-37)."
    - "Permessi project.create ed extraction.run di livello MEMBER (lib/authz/permissions.ts); workspace attivo dalla sessione (T-1502); scritture con il perimetro del workspace nel where."

  acceptance_criteria:
    - id: AC-2301-1
      given: "un MEMBER con email verificata e interfaccia italiana, in un workspace senza progetti"
      when: "invia POST /api/projects/quick-start con topic 'scarpe running'"
      then: "la risposta è 201 con extraction started e jobId non nullo; il progetto si chiama 'Scarpe running', ha language_code it, country_code IT, created_via_onboarding true e default_subproject_id uguale a topicId; l'argomento ha una sola seed 'scarpe running'; il job della risposta esiste con subproject_id uguale a topicId"
    - id: AC-2301-2
      given: "un workspace il cui progetto più recente ha language_code es e country_code ES, e un utente con interfaccia inglese"
      when: "l'utente invia POST /api/projects/quick-start con topic 'zapatillas', poi con topic 'shoes' e languageCode en e countryCode GB"
      then: "il primo progetto ha es/ES e created_via_onboarding false; il secondo ha en/GB"
    - id: AC-2301-3
      given: "un utente con email non verificata e un corpo con topic di 201 caratteri"
      when: "invia POST /api/projects/quick-start con topic 'pizzeria milano', poi con il topic lungo"
      then: "la prima risposta è 201 con extraction EMAIL_NOT_VERIFIED e jobId null e il progetto esiste; la seconda è 400 VALIDATION_ERROR e non crea alcun progetto"
    - id: AC-2301-4
      given: "un utente anonimo e un MEMBER di un workspace che ha raggiunto maxProjects con il lancio attivo e almeno un progetto"
      when: "entrambi inviano POST /api/projects/quick-start con topic 'yoga'"
      then: "l'anonimo riceve 401 AUTH_REQUIRED, il MEMBER riceve 402 PLAN_LIMIT e il numero di progetti non cambia"

  target_tests:
    - file: "tests/integration/quick-start.test.ts"
      covers: [AC-2301-1, AC-2301-2, AC-2301-3, AC-2301-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639: il progetto nasce sempre nel workspace attivo della sessione; nessun workspaceId accettato dal corpo."
    - "A06 Insecure Design / CWE-770: limiti del piano, quota e rate limit sugli avvii identici a quelli della creazione e dell'avvio normali (T-1701, T-1703)."
    - "A05 Injection / CWE-79: il topic è testo, reso da React e mai come HTML."

  out_of_scope:
    - "Suggerimenti automatici di argomenti a partire dall'URL del sito."
    - "Creazione di più argomenti in una volta."

- id: T-2302
  title: "Prossimo passo calcolato dallo stato del progetto"
  macrotask: "ux-shell"
  depends_on: [T-1201, T-1903]

  objective: >
    Calcolare in un solo punto, con una funzione pura, il passo successivo del percorso e lo stato delle tappe di un
    progetto, e mostrarlo in una barra fissa in fondo alle pagine del progetto con un solo pulsante.

  definition_of_done:
    - "lib/modules/next-step.ts: computeProjectProgress(state) funzione pura; state = { topics: [{ id, keptCount, totalCount, seedCount, activeJobId }], latestStrategyId }. Restituisce { steps, next } dove steps = { keywords: 'done' | 'current' | 'todo', plan: 'done' | 'current' | 'todo' } e next è uno di: add_topic (nessun argomento), searching (almeno un job attivo, con il topicId), run_topic (argomenti senza keyword tenute e senza job attivo: il primo per position con almeno una seed), build_plan (almeno una keyword tenuta e nessuna strategia), open_plan (strategia presente). Keyword tenuta = review_status diverso da rejected e brand_status diverso da excluded (la regola diventa review_status diverso da rejected con T-2401). Emendato da T-2506 il 2026-10-14: state ha anche la scrittura del piano, steps anche writing e next anche write_next, writing e plan_done; open_plan resta per un piano senza pagine."
    - "lib/modules/project-progress.ts: loadProjectProgress(projectId) legge lo stato con query aggregate (conteggi per argomento con groupBy, job attivi, ultima strategia per created_at) e chiama computeProjectProgress; nessuna query per singola keyword."
    - "components/next-step-bar.tsx: barra fissa in fondo all'area del progetto, testo in una riga e un solo pulsante primario: add_topic apre il dialogo Nuovo argomento di T-2303; run_topic avvia la ricerca dell'argomento (POST della rotta run) e mostra l'avanzamento; searching mostra «Sto cercando le keyword…» senza pulsante; pulsanti «Aggiungi un argomento» (add_topic), «Avvia la ricerca» (run_topic), «Costruisci il piano» (build_plan) e «Apri il piano» (open_plan); build_plan genera la strategia in modalità automatica (POST strategies) e porta alla sua pagina; open_plan porta alla pagina della strategia più recente. Testi nei cataloghi it ed en (namespace nextStep). Emendato da T-2502 e T-2506 il 2026-10-14: build_plan e open_plan portano al piano del progetto (/projects/<id>/plan), che è la strategia più recente; i nuovi passi della scrittura hanno «Inizia a scriverla», «Apri il piano» e «Aggiungi un argomento»."

  acceptance_criteria:
    - id: AC-2302-1
      given: "cinque stati: nessun argomento; un argomento con un job attivo; un argomento con 2 seed, 0 keyword e nessun job; un argomento con 34 keyword tenute e nessuna strategia; lo stesso con una strategia"
      when: "si chiama computeProjectProgress su ciascuno"
      then: "next vale nell'ordine add_topic, searching, run_topic, build_plan e open_plan; steps.keywords vale done solo negli ultimi due e steps.plan vale done solo nell'ultimo"
    - id: AC-2302-2
      given: "un progetto con due argomenti, il primo con keyword tenute e il secondo con una seed e un job attivo"
      when: "si chiama loadProjectProgress"
      then: "next vale searching con il topicId del secondo argomento e steps.keywords vale current"
    - id: AC-2302-3
      given: "la barra resa con next build_plan e una risposta simulata 201 di POST strategies con id S"
      when: "l'utente preme il pulsante della barra"
      then: "la richiesta inviata ha mode AUTO; il router naviga al piano del progetto /projects/<id>/plan, di cui S è la strategia più recente (emendato da T-2502 il 2026-10-14: prima la pagina della strategia S); la barra contiene esattamente un pulsante"

  target_tests:
    - file: "tests/unit/next-step.test.ts"
      covers: [AC-2302-1]
    - file: "tests/integration/project-progress.test.ts"
      covers: [AC-2302-2]
    - file: "tests/component/next-step-bar.test.tsx"
      covers: [AC-2302-3]

  security_notes:
    - "A01 / CWE-639: loadProjectProgress si chiama solo con un progetto già risolto nel workspace dell'utente (requireProjectPage)."

  out_of_scope:
    - "Passi della scrittura (prossima pagina da scrivere): li aggiunge T-2506."
    - "Avviso di piano non aggiornato rispetto a nuove keyword."

- id: T-2303
  title: "Struttura del progetto: barra laterale a tappe, menu da telefono e nuovo argomento"
  macrotask: "ux-shell"
  depends_on: [T-2302, T-808, T-1302]

  objective: >
    Mettere tutte le pagine del progetto dentro una struttura comune con la barra laterale che fa da navigazione e da
    guida, il menu ☰ da telefono e il dialogo per aggiungere un argomento con una sola domanda.

  definition_of_done:
    - "app/projects/[id]/layout.tsx: risolve il progetto con requireProjectPage e loadProjectProgress, rende la barra laterale a sinistra (da 1024 px) e la barra del prossimo passo (T-2302) in fondo all'area del contenuto; le pagine esistenti del progetto (pagina del progetto, risultati, sezioni, impostazioni della sezione, impostazioni del progetto, strategia) si rendono dentro il layout senza cambiare contenuto, tranne il proprio link «Torna al progetto», che sparisce."
    - "components/project-sidebar.tsx: tappa 1 «Keyword» con lo stato di steps.keywords e il conteggio delle tenute, link alla vista dei risultati di tutto il progetto; sotto, un elemento per argomento in ordine di position con il conteggio delle keyword, link ai risultati dell'argomento, e «+ Nuovo argomento»; tappa 2 «Piano dei contenuti» con lo stato di steps.plan e il testo «da creare» oppure il numero di pagine, link alla strategia più recente o alla pagina Strategia (emendato da T-2502 il 2026-10-14: link al piano del progetto; T-2506 aggiunge la tappa 3 «Scrittura»); separatore e «Impostazioni» (impostazioni del progetto). Stato con icona e testo (✓ con testo nascosto «fatto», numero con «da fare»), elemento corrente con aria-current=page."
    - "Sotto i 1024 px la barra laterale si apre da un pulsante ☰ nella barra in alto come pannello a scomparsa con focus intrappolato, chiusura con Esc o con il clic fuori e focus restituito al pulsante."
    - "components/new-topic-dialog.tsx: dialogo «Nuovo argomento» con un campo (esempio «scarpe da trail»), link «Aggiungi altre parole di partenza» che apre un'area con una parola per riga, pulsante «Trova le keyword»: crea l'argomento con nome = prima parola di partenza (POST subprojects con le seed, T-808) e avvia la ricerca (POST della rotta run); poi naviga ai risultati del nuovo argomento. Nome già usato nel progetto → messaggio sotto il campo e nessuna creazione."
    - "Testi nuovi nei cataloghi it ed en con «argomento» e «topic» al posto di «sezione» e «section» (namespace project.shell); il resto dell'interfaccia si rinomina in T-2604."

  acceptance_criteria:
    - id: AC-2303-1
      given: "un utente E2E con un progetto di 2 argomenti, keyword tenute nel primo e nessuna strategia, e una viewport di 1280x900"
      when: "apre i risultati del primo argomento"
      then: "la barra laterale mostra la tappa Keyword con lo stato fatto, i 2 argomenti con il loro conteggio, il primo con aria-current page, la tappa Piano con il testo 'da creare'; la barra in fondo mostra il pulsante 'Costruisci il piano'"
    - id: AC-2303-2
      given: "lo stesso utente con una viewport di 390x844"
      when: "apre i risultati del primo argomento, preme il pulsante del menu ☰, poi preme Esc"
      then: "la barra laterale non è visibile prima del clic; dopo il clic il pannello è visibile e contiene i 2 argomenti; dopo Esc il pannello è nascosto e il focus è sul pulsante ☰"
    - id: AC-2303-3
      given: "il dialogo Nuovo argomento reso per un progetto P con risposte simulate 201 di POST subprojects (id T) e 202 della rotta run"
      when: "l'utente scrive 'scarpe da trail', apre le parole aggiuntive, scrive 'scarpe trail uomo' e preme Trova le keyword"
      then: "il corpo di POST subprojects ha nome 'scarpe da trail' e le seed 'scarpe da trail' e 'scarpe trail uomo'; la rotta run chiamata è quella dell'argomento T; il router naviga ai risultati dell'argomento T"
    - id: AC-2303-4
      given: "la pagina dei risultati di un argomento dentro la nuova struttura"
      when: "si esegue axe sulla pagina a 1280x900 e a 390x844 con il menu aperto"
      then: "axe riporta 0 violazioni serious o critical in entrambi i casi"

  target_tests:
    - file: "tests/e2e/project-shell.spec.ts"
      covers: [AC-2303-1, AC-2303-2, AC-2303-4]
    - file: "tests/component/new-topic-dialog.test.tsx"
      covers: [AC-2303-3]

  security_notes:
    - "A01 / CWE-639: il layout risolve il progetto nel workspace dell'utente; progetto altrui → 404 come oggi (T-1502)."
    - "A05 Injection / CWE-79: nomi degli argomenti resi come testo."

  out_of_scope:
    - "Riordino degli argomenti trascinandoli nella barra laterale (T-2603)."
    - "Nuove pagine delle keyword e del piano (moduli 24 e 25)."

- id: T-2304
  title: "Barra in alto ridotta e menu dell'utente"
  macrotask: "ux-shell"
  depends_on: [T-1504, T-2005]

  objective: >
    Ridurre la barra in alto dell'app autenticata al marchio, al selettore del progetto e al menu dell'utente, così
    che le funzioni secondarie non competano con il percorso.

  definition_of_done:
    - "components/top-nav.tsx per l'utente autenticato: marchio con link alla home; dentro un progetto il nome del progetto con un menu dei progetti del workspace (i 10 con last_activity_at più recente e «Tutti i progetti» verso la home); a destra il menu dell'utente con il nome mostrato. Spariscono dalla barra i link Panoramica, Personalizza, Nuovo progetto, Fatturazione, Amministrazione e Supporto e il selettore di workspace come elemento separato."
    - "components/user-menu.tsx: menu a comparsa con Personalizza, Account (emendato da T-2803 il 2026-10-15: una sola voce «Il tuo account» verso /account), Workspace (con l'elenco dei workspace dell'utente per cambiare quello attivo, come workspace-switcher.tsx), Fatturazione solo per chi può gestirla (regola di T-2005; tolta da T-3103 il 2026-10-15), Amministrazione solo per il root admin, Supporto, cambio della lingua, Esci. Pulsante con aria-haspopup e aria-expanded, navigazione con le frecce, chiusura con Esc e focus restituito al pulsante."
    - "La barra delle pagine pubbliche e di accesso (anonimi) non cambia."

  acceptance_criteria:
    - id: AC-2304-1
      given: "un MEMBER senza gestione della fatturazione, un OWNER e il root admin"
      when: "si rende la barra in alto per ciascuno e si apre il menu dell'utente"
      then: "nessuna delle tre barre contiene link diretti a /personalizza, /projects/new, /billing o /admin; il menu del MEMBER non contiene Fatturazione né Amministrazione; quello dell'OWNER non contiene Fatturazione (emendato da T-3103 il 2026-10-15); quello del root admin contiene Amministrazione; il menu di MEMBER, OWNER e root admin contiene «Il tuo account» con href /account e nessuna voce verso /personalizza (emendato da T-2803 il 2026-10-15)"
    - id: AC-2304-2
      given: "il menu dell'utente reso e aperto con il pulsante"
      when: "si preme freccia giù due volte e poi Esc"
      then: "il focus passa alla seconda voce; dopo Esc il menu è chiuso, aria-expanded del pulsante vale false e il focus è sul pulsante"
    - id: AC-2304-3
      given: "un utente con due workspace che apre il menu"
      when: "sceglie il secondo workspace dal menu"
      then: "parte la stessa richiesta di cambio del workspace attivo di workspace-switcher.tsx con l'id del secondo workspace"

  target_tests:
    - file: "tests/component/user-menu.test.tsx"
      covers: [AC-2304-1, AC-2304-2, AC-2304-3]

  security_notes:
    - "A01 / CWE-285: le voci Fatturazione e Amministrazione si nascondono per comodità; le pagine restano protette lato server come oggi (T-2005, T-507)."

  out_of_scope:
    - "Ridisegno delle pagine Personalizza, Account, Workspace, Fatturazione e Amministrazione: seconda parte del lavoro sull'esperienza d'uso, non pianificata."

- id: T-2305
  title: "Nuova home: primo accesso con un campo e progetti con il loro prossimo passo"
  macrotask: "ux-shell"
  depends_on: [T-2301, T-2302, T-2304, T-810]

  objective: >
    Sostituire la dashboard con una home che al primo accesso chiede solo di cosa parla il sito e, a chi ha già
    progetti, mostra a che punto è ciascuno con un solo pulsante.

  definition_of_done:
    - "app/page.tsx per l'utente autenticato senza progetti nel workspace attivo: titolo «Di cosa parla il tuo sito?», una riga di spiegazione, campo con esempio «scarpe running», pulsante «Trova le keyword», lingua e paese da resolveDefaultTargeting con il link «cambia» che apre la scelta di lingua e paese, tre esempi cliccabili (b&b in puglia, dentista a roma, corsi di yoga in italiano; esempi equivalenti in inglese) che riempiono il campo. L'invio chiama POST /api/projects/quick-start e naviga ai risultati dell'argomento creato; con extraction diverso da started la pagina di destinazione mostra il messaggio del codice."
    - "Con almeno un progetto: lo stesso campo in forma compatta («Nuovo progetto: di cosa parla il sito?»), poi l'elenco dei progetti in ordine di last_activity_at (paginazione di T-810) come schede con nome, stato delle tappe (dati di loadProjectProgress, conteggi aggregati per pagina dell'elenco senza una query per progetto), data relativa dell'ultima attività, un solo pulsante con il prossimo passo del progetto (primario pieno per il primo progetto, secondario per gli altri) e un menu ⋯ con Rinomina (dialogo, PATCH del nome), Impostazioni ed Elimina (solo con il permesso project.delete, dialogo di conferma, DELETE come oggi)."
    - "Spariscono dalla home lo slogan, i contatori e la tabella degli ultimi job; la pagina /projects/new reindirizza alla home."
    - "Baseline visiva della dashboard di tests/e2e/visual.spec.ts rigenerata: gate umano, approvazione dell'utente prima del merge."

  acceptance_criteria:
    - id: AC-2305-1
      given: "un utente E2E con email verificata in un workspace senza progetti"
      when: "apre la home, preme l'esempio 'b&b in puglia' e poi Trova le keyword"
      then: "prima del clic la pagina mostra il titolo 'Di cosa parla il tuo sito?' e un solo campo di testo; dopo il clic sull'esempio il campo contiene 'b&b in puglia'; dopo l'invio l'URL è quello dei risultati di un argomento e la pagina mostra l'avanzamento della ricerca"
    - id: AC-2305-2
      given: "un utente con 3 progetti: uno con keyword e senza strategia, uno con una seed e nessuna keyword, uno senza argomenti"
      when: "apre la home"
      then: "le 3 schede mostrano i pulsanti 'Costruisci il piano', 'Avvia la ricerca' e 'Aggiungi un argomento'; la pagina contiene esattamente un pulsante primario pieno; la pagina non contiene la tabella degli ultimi job"
    - id: AC-2305-3
      given: "un MEMBER e un ADMIN dello stesso workspace con un progetto"
      when: "ciascuno apre il menu ⋯ della scheda del progetto"
      then: "il menu del MEMBER contiene Rinomina e Impostazioni e non contiene Elimina; quello dell'ADMIN contiene anche Elimina"
    - id: AC-2305-4
      given: "la home con progetti e la home al primo accesso"
      when: "si esegue axe su entrambe e si apre /projects/new"
      then: "axe riporta 0 violazioni serious o critical; /projects/new porta alla home"

  target_tests:
    - file: "tests/e2e/home.spec.ts"
      covers: [AC-2305-1, AC-2305-2, AC-2305-4]
    - file: "tests/component/project-card-menu.test.tsx"
      covers: [AC-2305-3]

  security_notes:
    - "A01 / CWE-285: Elimina si nasconde senza permesso, ma la rotta DELETE resta protetta lato server (T-1502)."

  out_of_scope:
    - "Ricerca e filtri nell'elenco dei progetti."

- id: T-2306
  title: "Rimozione dell'onboarding a 7 passi"
  macrotask: "ux-shell"
  depends_on: [T-2305, T-1004]

  objective: >
    Togliere l'onboarding a passi, sostituito dal primo accesso della home e dalla guida dentro il progetto, con il
    suo codice, le sue API e le sue tabelle (rimozione approvata dall'utente il 2026-10-13).

  definition_of_done:
    - "Rimossi app/onboarding/**, app/api/onboarding/**, lib/onboarding/**, i componenti onboarding-*.tsx e resume-onboarding-button.tsx, il reindirizzamento all'onboarding di app/page.tsx, le chiamate di completamento all'export (lib/onboarding/export-completion.ts) dalle rotte di export, il namespace onboarding dei cataloghi it ed en e i test tests/integration/onboarding-*.test.ts e tests/component/onboarding-review-export-step.test.tsx; i riferimenti negli altri test (bootstrap, autorizzazioni, caratterizzazione dell'export, utenti sospesi) aggiornati."
    - "Migrazione 0041_remove_onboarding: elimina le tabelle user_onboarding_progress e onboarding_idempotency_keys e gli enum OnboardingStatus, OnboardingStep, OnboardingEntryMode e OnboardingIdempotencyKind; projects.created_via_onboarding resta (la usa l'avvio rapido, T-2301)."
    - "/onboarding e ogni /onboarding/<passo> reindirizzano alla home con 307."
    - "knip senza file o export inutilizzati; il contratto di altitudine (§1bis) resta rispettato."

  acceptance_criteria:
    - id: AC-2306-1
      given: "il DB di test migrato fino a 0041"
      when: "si leggono le tabelle e i tipi dello schema public"
      then: "le tabelle user_onboarding_progress e onboarding_idempotency_keys non esistono, i tipi OnboardingStatus, OnboardingStep, OnboardingEntryMode e OnboardingIdempotencyKind non esistono e la colonna projects.created_via_onboarding esiste"
    - id: AC-2306-2
      given: "un utente autenticato nuovo, senza progetti"
      when: "apre /, /onboarding e /onboarding/seeds e chiama GET /api/onboarding/state"
      then: "/ risponde con la home del primo accesso senza reindirizzare; /onboarding e /onboarding/seeds portano alla home; l'API risponde 404"
    - id: AC-2306-3
      given: "il repository dopo la rimozione"
      when: "si cercano con git grep i nomi onboarding_progress, OnboardingStep e ResumeOnboardingButton nei file tracciati fuori da prisma/migrations, docs e .trueline"
      then: "la ricerca non trova righe"

  target_tests:
    - file: "tests/integration/onboarding-removed.test.ts"
      covers: [AC-2306-1, AC-2306-3]
    - file: "tests/e2e/home.spec.ts"
      covers: [AC-2306-2]

  security_notes:
    - "Superficie ridotta: sei rotte API in meno (choice, project, resume, section, skip, state)."

  out_of_scope:
    - "Visita guidata con fumetti sopra l'interfaccia: la guida è la barra del prossimo passo."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo 23 approvato dall'utente il 2026-10-13 («approvo», insieme ai moduli 24, 25 e 26), con le differenze dai mockup e le scelte dell'agente elencate in questo Self-check.
- Design approvato dall'utente per sezioni il 2026-10-13 con mockup nel browser: profilo d'uso a strati (D1, guidato di default ed esperto a portata), traguardo = piano dei contenuti (D2), progetto = sito con argomenti e ingresso in un campo (D3), struttura «M1» (barra laterale numerata più barra del prossimo passo, scelta dall'utente come mix tra percorso a tappe e area di lavoro), home in due stati, rimozione dell'onboarding.
- Gate umani: baseline visiva della dashboard da rigenerare e approvare prima del merge (T-2305).
- Scelte dell'agente da confermare (rilievi): lingua e paese predefiniti dal progetto più recente del workspace e poi dalla lingua dell'interfaccia (it/IT, en/US); nome del progetto = topic con l'iniziale maiuscola; il progetto dell'avvio rapido in un workspace vuoto resta fuori dal limite dei progetti come quello dell'onboarding (T-2004, D-37); /onboarding reindirizza alla home invece di rispondere 404.
- Emendamento (2026-10-13, costruzione): AC-2306-3 esclude anche `.trueline/`: la baseline d'igiene tracciata cita il percorso di una migrazione dell'onboarding (`0011_user_onboarding_progress`) e si rinfresca solo per decisione dell'utente. Le pagine dei risultati, dentro la nuova struttura con la barra laterale e la barra del prossimo passo, cambiano anche la baseline visiva dei risultati (il modulo prevedeva solo quella della dashboard): anche questa è un gate umano prima del merge.
- Note di costruzione (2026-10-13), scelte dell'agente da confermare dall'utente. T-2301: oltre ai code del DoD, extraction vale `JOB_ALREADY_ACTIVE` quando con il lancio attivo un'altra ricerca è già in corso nel workspace e `FORBIDDEN` se il ruolo non avesse `extraction.run`; il topic ha gli spazi ripetuti e gli a capo ridotti a uno spazio ed entra come una sola seed (non si divide su virgole e punti e virgola come il campo delle seed); la lingua dell'interfaccia per lingua e paese predefiniti è quella risolta per la richiesta (preferenza salvata, cookie, Accept-Language). T-2302: `run_topic` solo quando nessun argomento ha keyword tenute, altrimenti `build_plan` (un argomento nuovo ancora vuoto non blocca il piano); senza argomenti con seed il passo è `add_topic`; la tappa Keyword è fatta con keyword tenute e nessuna ricerca in corso, la tappa Piano quando esiste una strategia; durante la ricerca la barra mostra l'avanzamento senza l'etichetta «Prossimo passo» e a ricerca completata aggiorna la pagina; la barra è adesiva in fondo all'area del contenuto. T-2303: il menu dei progetti e il pulsante ☰ arrivano nella barra in alto con un portale, dopo l'idratazione; il conteggio accanto a ogni argomento è quello delle keyword tenute; «Keyword» porta ai risultati di tutto il progetto; dopo il nuovo argomento, se la ricerca non parte, i risultati mostrano il motivo (parametro `extraction`, come l'avvio rapido); la pagina del progetto e la gestione delle sezioni restano raggiungibili dagli indirizzi di oggi. T-2304: ordine del menu Personalizza, Account, Workspace, elenco dei workspace (solo con almeno due, come il selettore di prima), Fatturazione, Amministrazione, Supporto, lingua, Esci; la voce «Admin» diventa «Amministrazione»; sotto i 640 px il nome del marchio lascia posto al progetto e al menu, che mostra l'iniziale dell'utente. T-2305: nella home con progetti il pulsante dell'avvio rapido è secondario e il primario pieno è il prossimo passo del primo progetto di ogni pagina; la data relativa si calcola sul server; la paginazione compare solo con più di una pagina; il nome del progetto porta alla pagina del progetto; una scheda con una ricerca in corso ha il link «Segui la ricerca»; lingua e paese si mostrano con il nome e il codice, senza bandiere; esempi inglesi «b&b in cornwall», «dentist in london», «online yoga classes». T-2306: i vecchi indirizzi `/onboarding/**` reindirizzano con una regola `redirects` di `next.config.ts` (307); con l'onboarding sono andati via anche gli orfani che lasciava (`NotFoundError`, `countExportRows`, le varianti dei passi di `CardIntro`, i code d'errore e il namespace `onboarding` dei cataloghi, `/onboarding` in robots.txt). Negli E2E un finto autocomplete nel processo di Playwright risponde dopo 3 secondi: le ricerche non escono verso Google e quella dell'avvio rapido è ancora in corso quando si aprono i risultati.
- Nota (2026-10-13, macrotask 24 ux-keywords): i «risultati di un argomento» di AC-2303-3 e AC-2305-1 sono ora la pagina /projects/<id>/keywords/<argomento> (T-2403); i test seguono il nuovo indirizzo senza cambiare i criteri. Il conteggio delle tenute di T-2302 usa la regola unica di T-2401.
- Emendamento dichiarato (2026-10-14, macrotask 25 ux-plan): il piano del progetto sta in /plan e la strategia più recente è il piano (T-2502), quindi AC-2302-3 e i DoD di T-2302 e T-2303 puntano al piano; la barra laterale ha la tappa 3 «Scrittura» e il prossimo passo segue la scrittura delle pagine (T-2506). In tests/unit/next-step.test.ts l'uguaglianza del terzo test include steps.writing; in tests/integration/project-progress.test.ts latestStrategy include le pagine pubblicate e in scrittura (impacted-by T-2506).
- Scelte dell'agente e note di costruzione confermate dall'utente il 2026-10-14 (D-40).
- Emendamento dichiarato (2026-10-15, costruzione del macrotask 28, T-2803, D-41): nel menu dell'utente «Il tuo account» (/account) sostituisce Personalizza e Account; AC-2304-1 lo verifica per MEMBER, OWNER e root admin. In AC-2304-2 la seconda voce raggiunta con le frecce è ora Workspace.
- Emendamento dichiarato (2026-10-15, costruzione del macrotask 31, T-3103, D-41): la voce Fatturazione esce dal menu dell'utente (la fatturazione è la sezione Piano del workspace, T-3102), quindi in AC-2304-1 nessun menu contiene Fatturazione, nemmeno quello dell'OWNER; il resto del criterio è invariato.
