# 62-plan-runs — Macrotask `plan-runs`

> Piano per intento di ricerca (D-57), 2 di 3: il piano diventa un lavoro in background. «Crea il piano» e «Rigenera» avviano un lavoro che chiede i volumi e i risultati di Google (modulo 61), raggruppa e salva il piano; la pagina mostra l'avanzamento e, alla fine, il piano con l'avviso se qualcosa è mancato.

## Obiettivo del macrotask
Oggi POST /strategies genera e salva il piano nella stessa richiesta (T-1903). Con i volumi e i risultati di Google la generazione dura circa un minuto e dipende da un fornitore esterno. Dopo questo modulo:

- **Lavoro di piano**: «Crea il piano» e «Rigenera» avviano un lavoro in background con le fasi volumi, risultati di Google, raggruppamento e salvataggio, con la ripresa dei lavori fermi come le ricerche e gli articoli.
- **Avanzamento**: la pagina del piano mostra la fase e l'avanzamento; a lavoro finito si apre il piano.
- **Il piano esce sempre**: se DataForSEO manca, rifiuta o supera un tetto, o il workspace non ha i dati con licenza, il lavoro continua e salva il piano con il motore di oggi; il piano dice da dove viene il raggruppamento e perché.
- In questo modulo il raggruppamento è ancora quello di oggi (buildStrategyPlan): il modulo 63 lo sostituisce con quello per risultati di Google.

## Task atomici

```yaml
- id: T-6201
  title: "Lavoro di piano in background con volumi e risultati di Google"
  macrotask: "plan-runs"
  depends_on: [T-6102, T-1203, T-2502, T-4101]

  objective: >
    Generare il piano fuori dalla richiesta dell'utente, così può chiedere volumi e risultati di Google senza scadere e
    riprende da solo se una funzione si interrompe.

  definition_of_done:
    - "Migrazione additiva: tabella plan_runs (id, project_id, workspace_id, requested_by, request json con mode, name, settings e regenerate di GenerateRequest, status JobStatus, phase testo, cursor json, progress_done, progress_total, attempts, locked_until, heartbeat_at, strategy_id nullable, notice testo nullable, error_code nullable, timestamp) con indice parziale di un solo lavoro attivo (pending o running) per progetto; colonne additive di strategies: grouping_source ('SERP' o 'ENGINE', default 'ENGINE') e grouping_notice testo nullable."
    - "POST /api/projects/{id}/strategies: stessi permessi, parse e limiti di oggi (STRATEGY_LIMIT_PER_PROJECT, perimetro vuoto 409 STRATEGY_NO_KEYWORDS controllato all'avvio), poi crea il lavoro e risponde 202 { data: { runId } }; un secondo avvio con un lavoro attivo nello stesso progetto risponde 409 JOB_ALREADY_ACTIVE. Emendamento dichiarato di T-1903 (oggi 201 { data: { id } }) e dei suoi AC; next-step-action.tsx e strategy-settings.tsx seguono il lavoro."
    - "lib/modules/plan-runs/run.ts: fasi volumes (fillPerimeterVolumes, T-6102), serps_post e serps_collect (T-6101, prime 1000 keyword del perimetro per priorità, raccolta ripetuta finché i task sono pronti o passano 10 minuti), cluster e save; il raggruppamento usa buildStrategyPlan come oggi e il salvataggio è quello di generateStrategy, con le pagine iniziate come ancore (T-2502). Continuazione firmata con il prefisso «plan-run:» verso /api/internal/plan-runs/{id}/advance (come T-4101), ripresa dal cron reap-jobs con gli stessi JOB_STALE_AFTER_MS e JOB_MAX_ATTEMPTS, conteggi del cron sommati."
    - "Riserva: senza diritto ai dati con licenza, senza credenziali, oltre un tetto o con un errore del fornitore le fasi volumes e serps si chiudono senza dati, il lavoro continua e la strategia salvata ha grouping_notice con il motivo (PLAN_NO_LICENSED_METRICS, PROVIDER_NOT_CONFIGURED, METRICS_BUDGET_EXCEEDED, RUN_BUDGET_EXCEEDED, LICENSED_METRICS_QUOTA_EXCEEDED, PROVIDER_ERROR, SERP_TIMEOUT). Un errore non gestito conta un tentativo; al tetto il lavoro è failed con INTERNAL_ERROR e nessuna strategia nuova."

  acceptance_criteria:
    - id: AC-6201-1
      given: "un progetto del root admin con 6 keyword tenute senza volume e DataForSEO simulato per volumi e risultati"
      when: "invia POST /api/projects/{id}/strategies con mode AUTO e il lavoro arriva in fondo"
      then: "la risposta è 202 con runId; il lavoro è completed con strategy_id della strategia nuova; le 6 keyword hanno il volume e 6 righe in keyword_serps; la strategia ha grouping_notice null"
    - id: AC-6201-2
      given: "un MEMBER non root admin con il lancio commerciale spento e un progetto con keyword tenute"
      when: "invia POST /api/projects/{id}/strategies e il lavoro arriva in fondo"
      then: "fetch verso DataForSEO non è chiamato; il lavoro è completed e la strategia ha grouping_source ENGINE e grouping_notice PLAN_NO_LICENSED_METRICS"
    - id: AC-6201-3
      given: "un lavoro di piano attivo nel progetto"
      when: "lo stesso utente invia di nuovo POST /api/projects/{id}/strategies"
      then: "la risposta è 409 JOB_ALREADY_ACTIVE e plan_runs ha ancora un solo lavoro attivo nel progetto"
    - id: AC-6201-4
      given: "un lavoro di piano running con locked_until scaduto da più di JOB_STALE_AFTER_MS"
      when: "gira il cron reap-jobs"
      then: "il lavoro riparte dalla sua fase e arriva a completed con la strategia salvata"
    - id: AC-6201-5
      given: "una chiamata a /api/internal/plan-runs/{id}/advance con la firma di un job delle ricerche o di un lavoro di articolo con lo stesso id"
      when: "arriva la richiesta"
      then: "la risposta è 401 e il lavoro non cambia"

  target_tests:
    - file: "tests/integration/plan-run.test.ts"
      covers: [AC-6201-1, AC-6201-2, AC-6201-3, AC-6201-4]
    - file: "tests/integration/plan-run-signature.test.ts"
      covers: [AC-6201-5]

  security_notes:
    - "A01 / CWE-639: il lavoro legge e scrive solo il progetto da cui è partito; la rotta interna è protetta dalla firma HMAC con prefisso proprio e scadenza (come T-4101)."
    - "A06 / CWE-770: un solo lavoro attivo per progetto, spesa limitata dai tetti del modulo 61."

  out_of_scope:
    - "Raggruppamento per risultati di Google (modulo 63)."
    - "Annullare un lavoro di piano dall'interfaccia."

- id: T-6202
  title: "Avanzamento del piano a schermo e avviso sulla fonte del raggruppamento"
  macrotask: "plan-runs"
  depends_on: [T-6201]

  objective: >
    Far vedere all'utente che il piano si sta preparando e, alla fine, se il raggruppamento ha usato i risultati di
    Google o il motore di riserva, e perché.

  definition_of_done:
    - "GET /api/projects/{id}/plan-runs/{runId} con project.read: stato, fase, avanzamento, strategyId a lavoro finito, codice d'errore; 404 per un lavoro di un altro progetto. GET /api/projects/{id}/plan-runs/active restituisce il lavoro attivo del progetto o null."
    - "components/plan/plan-run-progress.tsx: dopo «Crea il piano» o «Rigenera» (e all'apertura della pagina del piano con un lavoro attivo) mostra la fase («Cerco i volumi», «Leggo i risultati di Google», «Raggruppo le keyword», «Salvo il piano») con l'avanzamento, interroga lo stato come la ricerca delle keyword (T-1205) e a lavoro completed ricarica la pagina del piano; a lavoro failed mostra l'errore con «Riprova»."
    - "Pagina del piano: con grouping_notice un avviso sopra il piano dice in parole semplici che il raggruppamento è quello di riserva e perché (stessi testi di «Aggiungi i volumi» per i motivi del fornitore); con grouping_source SERP e nessun avviso, nulla."
    - "Testi nei cataloghi it, en, es-ES ed es-419, con le regole di tests/unit/plain-language.test.ts."

  acceptance_criteria:
    - id: AC-6202-1
      given: "la pagina del piano resa con un fetch simulato che risponde al lavoro prima running in fase serps_collect e poi completed"
      when: "l'utente preme «Crea il piano»"
      then: "compare il testo della fase «Leggo i risultati di Google» con l'avanzamento, poi la pagina si ricarica"
    - id: AC-6202-2
      given: "il piano di un progetto con grouping_source ENGINE e grouping_notice PLAN_NO_LICENSED_METRICS"
      when: "l'utente apre la pagina del piano in italiano"
      then: "sopra il piano c'è l'avviso del raggruppamento di riserva con il motivo; con grouping_source SERP e grouping_notice null l'avviso non c'è"
    - id: AC-6202-3
      given: "un utente con project.read su un altro progetto"
      when: "chiede GET /api/projects/{id}/plan-runs/{runId} con il runId di un lavoro del primo progetto"
      then: "la risposta è 404"

  target_tests:
    - file: "tests/component/plan-run-progress.test.tsx"
      covers: [AC-6202-1, AC-6202-2]
    - file: "tests/integration/plan-run.test.ts"
      covers: [AC-6202-3]

  security_notes:
    - "A01 / CWE-639: stato del lavoro letto con project_id nel where."
    - "A03 / CWE-79: testi da catalogo, nessun messaggio del fornitore mostrato."

  out_of_scope:
    - "Notifiche o email a lavoro finito."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-11-12 (D-57): «Il piano diventa un lavoro in background con l'avanzamento a schermo» e «il piano esce lo stesso con il motore di oggi e un avviso» (proposte dell'agente approvate dall'utente: «mi torna tutto»).
- Emendamento dichiarato: T-1903 (POST /strategies 202 con runId invece di 201 con id).
- Scelte dell'agente: un solo lavoro di piano attivo per progetto; prime 1000 keyword per i risultati di Google; 10 minuti al massimo per la raccolta dei task; nessun annullamento dall'interfaccia.
- Ordine: dipende dal 61; il 63 cambia solo la fase cluster.
- Note di costruzione (2026-11-13, scelte dell'agente da confermare):
  - «Crea il piano» del modulo è il pulsante di oggi «Costruisci il piano» (e «Rigenera il piano» nel dialogo): i testi
    dei pulsanti non cambiano, così le baseline visive restano quelle approvate;
  - tabella propria `plan_runs` (migrazione additiva `0054_plan_runs`, RLS abilitata senza policy) con l'indice unico
    parziale `plan_runs_one_active_per_project` per il lavoro attivo; colonne additive `strategies.grouping_source`
    (enum `StrategyGroupingSource`, default ENGINE) e `strategies.grouping_notice`; in `plan_runs.request` la richiesta
    con il nome già scelto all'avvio (il nome predefinito si traduce nella POST, dove c'è la lingua dell'utente);
  - `generateStrategy` diviso in `resolveStrategyTarget` (permesso, limite, sezione), `checkStrategyStart` (più il
    perimetro non vuoto), `draftStrategy` (perimetro, motore, titoli, righe) e `saveStrategyDraft` (la transazione di
    oggi con `grouping_source` e `grouping_notice`); il lavoro si chiude a completed nella stessa transazione del
    salvataggio, così un passo che ha perso la lease non salva una strategia doppia;
  - all'avvio il perimetro vuoto si conta senza il volume minimo (i volumi mancanti arrivano nel lavoro); con il volume
    minimo il perimetro si ricontrolla al salvataggio, dove un perimetro vuoto porta il lavoro a failed con
    STRATEGY_NO_KEYWORDS;
  - fasi `volumes`, `serps_post`, `serps_collect`, `cluster` (prepara la strategia con il motore di oggi) e `save`;
    la strategia preparata passa da cluster a save nello stesso passo, e se il passo si interrompe save la prepara di
    nuovo; un AppError di una fase (accesso perso, limite di 20, perimetro vuoto) porta il lavoro a failed con il suo
    codice, ogni altra eccezione conta un tentativo; il lavoro usa i permessi di chi l'ha avviato (requested_by);
  - risultati di Google con lingua e paese del piano (quelli della sezione del perimetro, se li cambia); raccolta ogni
    10 s, con un passo che rilascia la lease se non restano 60 s; l'avanzamento conta le keyword da leggere (fino a
    1000) e quelle già lette, cioè con i risultati recenti, raccolte o rimaste senza task; un task non riuscito dà PROVIDER_ERROR, oltre i 10 minuti
    SERP_TIMEOUT; nel registro della spesa le richieste del lavoro hanno `job_id` uguale all'id del lavoro, così
    `METRICS_RUN_BUDGET_USD` vale per lavoro di piano;
  - il primo motivo resta (`notice` del lavoro, poi `grouping_notice`); con volumi e risultati arrivati la fonte resta
    ENGINE senza avviso fino al modulo 63;
  - la lettura dello stato (GET .../plan-runs/{runId}) e la pagina del piano con un lavoro attivo riprendono un lavoro
    fermo, come il polling dei job (T-1203): il cron reap-jobs gira una volta al giorno; 404 con il codice nuovo
    PLAN_RUN_NOT_FOUND (it, en, es-ES, es-419);
  - 409 JOB_ALREADY_ACTIVE con il runId del lavoro attivo: il browser segue quel lavoro invece di mostrare un errore;
  - pagina del piano: con un lavoro attivo l'avanzamento sta al posto di «Costruisci il piano» o sopra la bacheca; a
    lavoro non riuscito, nella pagina «Riprova» la ricarica (si torna al pulsante), nel modulo delle impostazioni avvia
    di nuovo il lavoro con le stesse scelte; il pulsante «Annulla» del dialogo «Rigenera il piano» c'è solo prima
    dell'invio;
  - testi: fasi «Cerco i volumi», «Leggo i risultati di Google», «Raggruppo le keyword», «Salvo il piano», l'avviso
    «Raggruppamento di riserva» con i motivi di «Aggiungi i volumi» e i due nuovi (DataForSEO che non risponde,
    risultati non arrivati in tempo), es-419 con il pretérito indefinido nelle sole differenze.
- Copertura non verificata (dichiarata): nessuna chiamata reale a DataForSEO né alle rotte interne su Vercel; E2E e
  baseline visive li esegue la CI.
