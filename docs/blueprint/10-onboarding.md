# 10-onboarding — Macrotask `onboarding`

> Percorso guidato in 7 passi (`app/onboarding/**`, `lib/onboarding/progress.ts`, `components/onboarding-*`): creazione idempotente, «Ricomincia» e navigazione indietro coerenti, precondizioni reali dei passi e lettura leggera dello stato; nasce dai rilievi dell'audit 2026-10-02 sull'onboarding.

## Obiettivo del macrotask

Oggi ogni passo dell'onboarding fa due chiamate separate (creazione + `PATCH /api/onboarding/state`): se la
seconda fallisce, un nuovo tentativo crea un progetto orfano o va in errore 500 sulla sezione «Generale».
«Ricomincia» viene annullato perché `computeState` riadotta il progetto più recente, i link «indietro» e
«Vai alla dashboard» rimbalzano, i passi non controllano le precondizioni (zero seed, nessun job) e il
completamento si ottiene con qualunque export o con una PATCH. Infine la dashboard esegue scritture e 5-6
query per leggere il solo stato. Il macrotask rende il flusso transazionale, idempotente e verificabile lato
server, e la sua lettura economica.

## Task atomici

```yaml
- id: T-1001
  title: "Creazione progetto e sezione idempotente nell'onboarding"
  macrotask: "onboarding"
  depends_on: [T-503]

  objective: >
    Sostituire la coppia di chiamate creazione + PATCH di stato dei passi 2 e 4 con due rotte che, in una
    sola transazione, creano l'entità e avanzano l'onboarding, protette da una chiave di idempotenza: un
    retry, un doppio clic o il back del browser non creano più progetti orfani né errori 500.

  definition_of_done:
    - "Nuova rotta POST /api/onboarding/project {name, idempotencyKey}: in una sola prisma.$transaction crea il progetto (owner = utente di sessione, nessuna sezione iniziale come oggi con createInitialSection false) e aggiorna user_onboarding_progress (active_project_id, active_subproject_id null, current_step PROJECT_TARGETING, status IN_PROGRESS); risposta 201 {projectId, nextPath}"
    - "Nuova rotta POST /api/onboarding/section {projectId, name, idempotencyKey}: in transazione crea la sezione (position = numero di sezioni, default_subproject_id impostato se assente come in POST /api/projects/[id]/subprojects) e aggiorna il progress (active_subproject_id, current_step SEEDS); risposta 201 {subprojectId, nextPath}"
    - "Tabella onboarding_idempotency_keys (user_id, key, kind, project_id, subproject_id, created_at) con unique (user_id, key) creata da migrazione; la stessa chiave ripetuta restituisce 200 con gli stessi id senza nuove righe; la chiave deve essere un UUID v4 (altrimenti 400 con code)"
    - "Nome sezione già presente nel progetto (P2002 su subprojects_project_id_name_key) con chiave diversa -> 409 {code: SECTION_NAME_TAKEN} tramite l'helper errori di T-503, mai 500"
    - "components/onboarding-project-create-form.tsx e components/onboarding-section-create-form.tsx usano le nuove rotte con una chiave da crypto.randomUUID() conservata in sessionStorage per il passo corrente (stessa chiave dopo reload o back del browser, accesso a sessionStorage in try/catch) e non chiamano più PATCH /api/onboarding/state"
    - "app/onboarding/project-create/page.tsx: se il progress ha active_project_id e current_step successivo a PROJECT_CREATE (qualunque entry_mode, incluso RESTART), la pagina mostra il nome del progetto attivo e un pulsante 'Continua' verso il passo corrente invece del form di creazione vuoto (il back del browser non porta a una seconda creazione)"
    - "Le rotte filtrano progetto e sezione per owner_user_id della sessione; projectId di un altro utente -> 404"

  acceptance_criteria:
    - id: AC-1001-1
      given: "un utente con onboarding IN_PROGRESS al passo PROJECT_CREATE e nessun progetto"
      when: "invia due volte POST /api/onboarding/project con lo stesso name e la stessa idempotencyKey"
      then: "la prima risposta è 201 e la seconda 200 con lo stesso projectId; l'utente ha esattamente 1 progetto e current_step vale PROJECT_TARGETING"
    - id: AC-1001-2
      given: "un errore forzato nel test sull'aggiornamento di user_onboarding_progress durante POST /api/onboarding/project"
      when: "l'utente invia la richiesta"
      then: "la risposta ha status 500 con messaggio generico e il numero di progetti dell'utente resta 0"
    - id: AC-1001-3
      given: "un progetto dell'utente che ha già la sezione 'Generale' creata con la chiave K1"
      when: "l'utente invia POST /api/onboarding/section con name 'Generale' prima con una chiave nuova K2 e poi con K1"
      then: "con K2 la risposta è 409 con code SECTION_NAME_TAKEN, con K1 è 200 con lo stesso subprojectId, e il progetto ha 1 sola sezione"
    - id: AC-1001-4
      given: "un progress con entry_mode RESTART, current_step PROJECT_TARGETING e active_project_id di un progetto di nome 'Blog'"
      when: "si rende la pagina /onboarding/project-create"
      then: "il markup contiene 'Blog' e il pulsante 'Continua' e non contiene l'input con id onboarding-project-name"

  target_tests:
    - file: "tests/integration/onboarding-create.test.ts"
      covers: [AC-1001-1, AC-1001-2, AC-1001-3, AC-1001-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (IDOR): projectId del passo sezione verificato con owner_user_id della sessione dentro la transazione; nessun id accettato dal client senza controllo (poi membership di workspace con T-1502)"
    - "A08 Software or Data Integrity Failures / CWE-362 (race condition): unicità (user_id, key) e transazione unica impediscono doppie creazioni concorrenti"
    - "A10 Mishandling of Exceptional Conditions / CWE-755: P2002 tradotto in 409 con code, errori ignoti in 500 generico senza dettagli Prisma (T-503)"

  out_of_scope:
    - "Navigazione indietro e Ricomincia: T-1002"
    - "Precondizioni dei passi seed, run ed export: T-1003"

- id: T-1002
  title: "Ricomincia e navigazione indietro coerenti"
  macrotask: "onboarding"
  depends_on: [T-1001]

  objective: >
    Far sì che «Ricomincia» riparta davvero da zero, che i link «Torna allo step precedente» mostrino il
    passo richiesto senza rimbalzare e che «Vai alla dashboard» porti alla dashboard invece di tornare
    all'onboarding, con un'unica regola di accesso ai passi.

  definition_of_done:
    - "computeState in lib/onboarding/progress.ts non adotta il progetto di fallback (findFallbackProject) quando entry_mode è RESTART e active_project_id è null: dopo Ricomincia activeProjectId resta null e recommendedStep è PROJECT_CREATE finché l'utente non crea un progetto"
    - "Regola unica in lib/onboarding/navigation.ts resolveStepAccess(state, step) -> render oppure redirect(path): un passo con indice minore o uguale a current_step si rende; un passo oltre recommendedStep reindirizza a recommendedStep; usata da tutte le pagine app/onboarding/*/page.tsx"
    - "Rimosse le regole ad hoc 'activeProjectId e entryMode RESUME -> redirect' di app/onboarding/project-create/page.tsx e 'activeSubprojectId e entryMode RESUME -> redirect' di app/onboarding/section-create/page.tsx"
    - "/onboarding/section-create con sezione attiva già creata mostra il nome della sezione e il pulsante 'Continua' (stesso comportamento introdotto da T-1001 per project-create), senza creare nulla"
    - "'Vai alla dashboard' in components/onboarding-review-export-step.tsx diventa un'azione che chiama POST /api/onboarding/skip (status PAUSED) e poi naviga a /, dove app/page.tsx mostra il banner 'Onboarding in pausa' invece di reindirizzare"

  acceptance_criteria:
    - id: AC-1002-1
      given: "un utente con 1 progetto esistente e onboarding PAUSED"
      when: "invia POST /api/onboarding/choice con mode restart e poi GET /api/onboarding/state"
      then: "data.activeProjectId è null, data.recommendedStep è PROJECT_CREATE e user_onboarding_progress.active_project_id è null"
    - id: AC-1002-2
      given: "un progress con entry_mode RESUME, current_step SECTION_CREATE e un progetto attivo di nome 'Blog'"
      when: "si rende la pagina /onboarding/project-create"
      then: "la pagina non esegue redirect, il markup contiene 'Blog' e il pulsante 'Continua', e il numero di progetti dell'utente resta 1"
    - id: AC-1002-3
      given: "un utente con onboarding IN_PROGRESS al passo REVIEW_EXPORT"
      when: "esegue l'azione 'Vai alla dashboard' e poi si rende la pagina /"
      then: "lo status del progress è PAUSED e la dashboard si rende senza redirect a /onboarding mostrando il testo 'Onboarding in pausa'"

  target_tests:
    - file: "tests/integration/onboarding-navigation.test.ts"
      covers: [AC-1002-1, AC-1002-2, AC-1002-3]

  security_notes:
    - "A01 Broken Access Control / CWE-639: progetto e sezione attivi restano validati con owner_user_id (findOwnedProject, findOwnedSubproject) anche nei percorsi di ritorno ai passi precedenti"

  out_of_scope:
    - "Precondizioni che impediscono di saltare avanti: T-1003"
    - "Lettura dello stato senza scritture: T-1004"

- id: T-1003
  title: "Precondizioni dei passi e completamento reale"
  macrotask: "onboarding"
  depends_on: [T-1001, T-305]

  objective: >
    Verificare lato server le precondizioni di ogni passo (seed presenti, un job completato) e far
    coincidere il completamento dell'onboarding con un export reale e non vuoto del progetto attivo,
    togliendo al client la possibilità di dichiarare COMPLETED o di saltare passi.

  definition_of_done:
    - "lib/onboarding/preconditions.ts: passo RUN richiede almeno 1 seed sulla sezione attiva; passo REVIEW_EXPORT richiede almeno 1 job con status completed sulla sezione attiva (esito reale di T-305)"
    - "Le pagine /onboarding/run e /onboarding/review-export reindirizzano al passo della precondizione mancante (/onboarding/seeds, /onboarding/run)"
    - "PATCH /api/onboarding/state rifiuta status COMPLETED (400, code ONBOARDING_STATUS_FORBIDDEN) e currentStep con precondizioni non soddisfatte (409, code ONBOARDING_PRECONDITION, campo missing con valore seeds o job); stato invariato in entrambi i casi"
    - "markOnboardingExportCompleted(userId, {projectId, exportedRows}) imposta COMPLETED solo se projectId coincide con active_project_id del progress e exportedRows è maggiore di 0; chiamata da app/api/projects/[id]/export/route.ts e app/api/projects/[id]/export/google-sheets/route.ts con il numero di righe esportate, in modo best-effort (T-805)"
    - "components/onboarding-seeds-form.tsx disabilita il salvataggio con 0 seed e mostra il motivo; components/onboarding-run-step.tsx avanza solo se il job restituito ha status completed e altrimenti mostra il messaggio d'errore del job"
    - "components/onboarding-review-export-step.tsx riporta loading a null in un blocco finally su ogni ramo, anche quando l'export riesce ma lo stato non è COMPLETED"

  acceptance_criteria:
    - id: AC-1003-1
      given: "una sezione attiva con 0 seed, e separatamente una sezione con seed ma solo job con status failed"
      when: "si invia PATCH /api/onboarding/state con currentStep RUN per la prima e si rende /onboarding/review-export per la seconda"
      then: "la PATCH riceve 409 con code ONBOARDING_PRECONDITION e missing 'seeds' lasciando current_step invariato; la pagina esegue redirect a /onboarding/run"
    - id: AC-1003-2
      given: "un utente con onboarding IN_PROGRESS"
      when: "invia PATCH /api/onboarding/state con status COMPLETED"
      then: "la risposta è 400 con code ONBOARDING_STATUS_FORBIDDEN e il progress resta IN_PROGRESS con completed_at null"
    - id: AC-1003-3
      given: "un progetto attivo con keyword e un secondo progetto dell'utente diverso da quello attivo"
      when: "l'utente esporta in CSV prima il secondo progetto, poi uno scope vuoto del progetto attivo, poi almeno 1 riga del progetto attivo"
      then: "dopo i primi due export lo status non è COMPLETED; dopo il terzo lo status è COMPLETED e completed_at non è null"
    - id: AC-1003-4
      given: "OnboardingReviewExportStep con fetch mock: export 200 e stato onboarding IN_PROGRESS"
      when: "l'utente clicca 'Esporta CSV (non escluse)'"
      then: "dopo la risposta i pulsanti di export non hanno l'attributo disabled e il testo 'Export CSV...' non è presente"

  target_tests:
    - file: "tests/integration/onboarding-preconditions.test.ts"
      covers: [AC-1003-1, AC-1003-2, AC-1003-3]
    - file: "tests/component/onboarding-review-export-step.test.tsx"
      covers: [AC-1003-4]

  security_notes:
    - "A06 Insecure Design / CWE-602 (sicurezza affidata al client): stato COMPLETED e avanzamento dei passi decisi dal server in base ai dati, non al payload del client"
    - "A01 Broken Access Control / CWE-639: l'export conta per l'onboarding solo se il progetto è quello attivo dell'utente di sessione"

  out_of_scope:
    - "Avanzamento asincrono dell'estrazione con barra di progresso: T-1205"
    - "Rimozione di entryMode dal payload della PATCH: T-1101"

- id: T-1004
  title: "Stato onboarding leggero in lettura"
  macrotask: "onboarding"
  depends_on: [T-1001]

  objective: >
    Leggere lo stato dell'onboarding senza scritture e con il minimo di query: la dashboard legge il solo
    status con una query, e la lettura completa usata dalle pagine di onboarding e da GET
    /api/onboarding/state non crea né aggiorna righe.

  definition_of_done:
    - "Nuova funzione getOnboardingStatusForUser(userId) in lib/onboarding/progress.ts: una sola findUnique con select status e nessuna scrittura; riga assente -> NEEDS_CHOICE senza crearla"
    - "app/page.tsx usa getOnboardingStatusForUser al posto di getOnboardingStateForUser"
    - "getOnboardingStateForUser non scrive: niente upsert di ensureProgressRow sul percorso di lettura (la riga nasce solo nelle mutazioni: choice, skip, resume, PATCH, rotte di T-1001) e niente prisma.userOnboardingProgress.update in computeState (la riconciliazione di active_project_id e active_subproject_id avviene nelle mutazioni)"
    - "In computeState le query indipendenti (count progetti, count seed, count job) sono eseguite con Promise.all"
    - "Helper di test che conta le query per tabella e tipo tramite l'evento query di Prisma o un'estensione $extends, riusabile da T-1105"

  acceptance_criteria:
    - id: AC-1004-1
      given: "un utente con onboarding COMPLETED"
      when: "si rende DashboardPage"
      then: "sulla tabella user_onboarding_progress risulta 1 sola query SELECT e 0 INSERT o UPDATE"
    - id: AC-1004-2
      given: "un utente senza riga in user_onboarding_progress"
      when: "si rende DashboardPage"
      then: "la pagina esegue redirect a /onboarding e la tabella user_onboarding_progress ha 0 righe per l'utente"
    - id: AC-1004-3
      given: "un utente con onboarding IN_PROGRESS e progetto attivo"
      when: "chiama due volte GET /api/onboarding/state"
      then: "le due risposte sono 200 con lo stesso data.currentStep e updated_at della riga è identico prima e dopo le chiamate"

  target_tests:
    - file: "tests/integration/onboarding-state-read.test.ts"
      covers: [AC-1004-1, AC-1004-2, AC-1004-3]

  security_notes:
    - "A01 Broken Access Control / CWE-639: tutte le letture sono filtrate per user_id dell'utente di sessione, mai per un id ricevuto dal client"

  out_of_scope:
    - "Cache per richiesta dell'utente e del branding: T-1105"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0 (in isolamento i soli riferimenti non risolti sono T-503 e T-305, di altri moduli).
- Semantico: `self-check-checklist.md` punti 6-10 applicati a T-1001..T-1004.
