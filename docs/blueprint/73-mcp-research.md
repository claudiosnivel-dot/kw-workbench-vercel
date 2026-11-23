# 73-mcp-research — Macrotask `mcp-research`

> Claude Code crea il progetto, lancia la ricerca, aspetta i lavori, legge e sistema le keyword, con un tetto
> giornaliero alla spesa DataForSEO dei suoi lavori (D-64).

## Obiettivo del macrotask
Scelte dell'utente del 2026-11-17: Claude Code «deve fare tutto lui», dalla creazione del progetto in poi, e «può
lanciare tutto in autonomia» anche quello che spende, dentro protezioni contro una spesa che scappa (anti-obiettivo 1
del disegno) e contro le attese lunghe (anti-obiettivo 6). Disegno in
`docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`.

## Task atomici

```yaml
- id: T-7301
  title: "create_project, run_search e wait_for_job"
  macrotask: "mcp-research"
  depends_on: [T-7202, T-2301, T-3701, T-1204, T-1203]

  objective: >
    Far creare a Claude Code progetto, primo argomento e parole di partenza con lingua e paese scelti da lui, far
    partire la ricerca e aspettarla senza tempestare il server.

  definition_of_done:
    - "Migrazione additiva: jobs.origin (APP o AGENT, default APP); i lavori avviati dal server MCP hanno AGENT."
    - "create_project({ name, languageCode, countryCode, seeds (da 1 a 10), workspaceId? }): crea progetto, primo argomento e parole di partenza con la logica dell'avvio rapido (T-2301, T-3701) ma con lingua e paese dati, validati con LANGUAGE_CODES e COUNTRY_CODES, nel workspace personale del root admin o in quello indicato fra i suoi (permesso project.create); avvia la ricerca e risponde con projectId, topicId, jobId (o null con il code che ha impedito l'avvio, come l'avvio rapido)."
    - "run_search({ projectId, topicId?, seeds? }): aggiunge le parole di partenza nuove all'argomento (o al primo) e rilancia la ricerca con la logica di /api/projects/[id]/run (un solo lavoro attivo per sezione: JOB_ALREADY_ACTIVE con il jobId attivo)."
    - "wait_for_job({ jobId }): rilegge lo stato del lavoro ogni 3 s per al massimo 50 s e risponde appena il lavoro è finito (completed, failed, cancelled) o allo scadere con status, fase, avanzamento (keyword trovate, volumi chiesti) e, se finito, il numero di keyword tenute; un lavoro di un progetto non accessibile è JOB_NOT_FOUND. Il modulo 75 lo estende ai lavori di piano."

  acceptance_criteria:
    - id: AC-7301-1
      given: "una chiave valida del root admin e i fornitori simulati dei test"
      when: "Claude Code chiama create_project con name «Noleggio magnetoterapia», languageCode it, countryCode IT e seeds [«noleggio magnetoterapia»]"
      then: "esistono il progetto con lingua it e paese IT nel workspace personale, l'argomento con la parola di partenza e un lavoro di ricerca con origin AGENT, e la risposta contiene projectId, topicId e jobId"
    - id: AC-7301-2
      given: "la stessa chiave"
      when: "Claude Code chiama create_project con languageCode «xx» o con 11 parole di partenza"
      then: "ogni risposta è isError con code VALIDATION_ERROR e non esiste nessun progetto nuovo"
    - id: AC-7301-3
      given: "un lavoro di ricerca di Claude Code ancora in corso che finisce dopo pochi passi"
      when: "Claude Code chiama wait_for_job con il suo id"
      then: "la risposta arriva entro 50 s con status completed e il numero di keyword tenute; con un lavoro che non finisce la risposta arriva dopo circa 50 s con status running e la fase"
    - id: AC-7301-4
      given: "un argomento con un lavoro di ricerca già attivo"
      when: "Claude Code chiama run_search sullo stesso argomento"
      then: "la risposta è isError con code JOB_ALREADY_ACTIVE e il jobId del lavoro attivo, e non nasce un secondo lavoro"

  target_tests:
    - file: "tests/integration/mcp-research.test.ts"
      covers: [AC-7301-1, AC-7301-2, AC-7301-3, AC-7301-4]

  security_notes:
    - "A01 / CWE-639: workspace solo fra quelli del root admin, permessi project.create ed extraction.run di oggi."
    - "A04 / CWE-400: wait_for_job ha un tempo massimo di 50 s, sotto la maxDuration della rotta."

  out_of_scope:
    - "Modificare o eliminare progetti e argomenti esistenti."
    - "Più argomenti in create_project: si aggiungono con run_search. (Emendato da D-71: run_search non crea argomenti; un argomento nuovo nasce con create_topic, T-8301.)"

- id: T-7302
  title: "list_keywords, set_keywords e tetto di spesa di Claude Code"
  macrotask: "mcp-research"
  depends_on: [T-7301, T-2401, T-903, T-7102]

  objective: >
    Dare a Claude Code tutte le keyword con i loro dati e la possibilità di tenerle o scartarle, e fermare i suoi lavori
    che spendono quando la spesa del giorno supera il tetto scelto dall'utente.

  definition_of_done:
    - "list_keywords({ projectId, topicId?, status: kept | discarded | all, minVolume?, searchIntent?, keywordType?, search?, page }): 200 keyword per pagina nell'ordine «promettenti» di oggi, con id, keyword, volume, punteggio, intento, tipo, domanda, locale, tenuta o scartata, argomento; totale e numero di pagine. Filtri con parseResultsFilters (valori in whitelist)."
    - "set_keywords({ projectId, action: keep | discard, ids (al massimo MAX_BULK_IDS) }): applyBulkAction di oggi (T-2401); risponde con il numero di righe aggiornate."
    - "Migrazione additiva: metrics_provider_requests.agent (boolean, default false), vero per le richieste dei lavori con origin AGENT; impostazione agent_daily_cap_usd (default 2, D-65) dove stanno le impostazioni dell'amministrazione."
    - "agentSpendToday(): somma di estimated_cost_usd delle richieste agent del giorno UTC. create_project e run_search controllano il tetto prima di avviare: oltre il tetto isError AGENT_SPEND_CAP con spesa e tetto e nessun lavoro avviato; le risposte di create_project, run_search e wait_for_job riportano spesa di oggi e tetto."
    - "Card «Claude Code» (T-7102): campo «Tetto giornaliero di spesa» in dollari (da 0 a 100, due decimali) e la spesa di oggi; PATCH /api/admin/agent-key/settings solo per il root admin."
    - "Code AGENT_SPEND_CAP in API_ERROR_CODES e nei cataloghi it, en, es-ES."

  acceptance_criteria:
    - id: AC-7302-1
      given: "un progetto con 450 keyword, 30 delle quali scartate"
      when: "Claude Code chiama list_keywords con status kept, pagina 1 e poi pagina 3"
      then: "la pagina 1 ha 200 keyword tenute con volume, punteggio, intento e tipo, totale 420 e 3 pagine; la pagina 3 ha 20 keyword"
    - id: AC-7302-2
      given: "tre keyword tenute del progetto"
      when: "Claude Code chiama set_keywords con action discard e i loro tre id"
      then: "la risposta dice 3 righe aggiornate e le tre keyword hanno review_status rejected"
    - id: AC-7302-3
      given: "un tetto di 5 $ e richieste agent di oggi stimate 5,20 $"
      when: "Claude Code chiama run_search"
      then: "la risposta è isError con code AGENT_SPEND_CAP, spesa 5,20 e tetto 5, e non nasce nessun lavoro"
    - id: AC-7302-4
      given: "richieste stimate 4 $ di un lavoro con origin APP e 1 $ di un lavoro con origin AGENT, oggi"
      when: "si legge agentSpendToday() e Claude Code chiama run_search con tetto 5 $"
      then: "agentSpendToday() vale 1 e il lavoro parte con origin AGENT"

  target_tests:
    - file: "tests/integration/mcp-keywords.test.ts"
      covers: [AC-7302-1, AC-7302-2, AC-7302-3, AC-7302-4]

  security_notes:
    - "A04 / CWE-770: tetto giornaliero sui soli lavori di Claude Code; restano i tetti di spesa della piattaforma (T-903)."
    - "A01 / CWE-639: set_keywords con il perimetro del progetto e del workspace di applyBulkAction."
    - "A03 / CWE-89: filtri solo da valori in whitelist (parseResultsFilters)."

  out_of_scope:
    - "Tetto per i lavori di piano (modulo 75 li segna agent e li fa contare)."
    - "Registro delle chiamate nella card (modulo 76)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): Claude Code fa tutto e lancia in autonomia anche quello che spende, con il tetto giornaliero dei suoi lavori.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): tetto di 2 $ al giorno UTC (scelta dell'utente, D-65) modificabile da 0 a 100 $, attesa fino a 50 s con letture ogni 3 s, 200 keyword per pagina, da 1 a 10 parole di partenza, progetti nel workspace personale salvo un altro indicato.
- Ordine: dopo il 72; T-7302 dopo T-7301.
- Note di costruzione (2026-11-20, scelte dell'agente confermate dall'utente il 2026-11-21, D-69). Una sola migrazione additiva `0061_agent_origin` per i due task: enum `JobOrigin` (APP, AGENT) con `jobs.origin` default APP e `metrics_provider_requests.agent` default false. `startExtractionJob` ed `enqueueExtractionJob` hanno `origin` (APP di default), `startQuickStartExtraction` lo passa; `reserveProviderRequest` segna la riga agent leggendo l'origin del lavoro dal `jobId`, così volumi e risultati di Google delle ricerche di Claude Code contano senza toccare i fornitori; gli id dei lavori di piano non sono in `jobs` e restano fuori (modulo 75). T-7301: strumenti in `lib/modules/agent/tools/research.ts`, registrati nell'ordine del lavoro dopo `get_project`; `create_project` usa `createQuickStartProject` con `name` facoltativo (il nome dell'argomento resta quello della prima parola di partenza, come l'avvio rapido) e lingua e paese obbligatori, validati con `isSupportedLanguageCode` e `isSupportedCountryCode` (un errore ha `field`); parole di partenza ripulite con `uniqueSeeds` (estratta da `splitQuickStartTopics`: spazi, vuote, doppioni senza maiuscole), dopo la pulizia nessuna è VALIDATION_ERROR su `seeds`; workspace indicato con `requireWorkspaceRole` (non membro WORKSPACE_NOT_FOUND) o quello personale; il controllo del tetto viene prima della creazione, quindi oltre il tetto non nasce nemmeno il progetto. `run_search` vuole extraction.run e l'email verificata come la rotta run, senza `topicId` usa il primo argomento nell'ordine della barra laterale (lo stesso di `get_project`), controlla il lavoro attivo dell'argomento prima di aggiungere le parole di partenza (JOB_ALREADY_ACTIVE con `jobId` e nessuna parola aggiunta), aggiunge solo quelle nuove con il limite `maxSeedsPerSection` e risponde con `jobId`, `topicId` e `addedSeeds`; da 1 a 10 parole di partenza per chiamata anche qui. `wait_for_job` (permesso project.read, altrimenti JOB_NOT_FOUND) a ogni lettura passa da `reapStaleJobs` come il polling dell'app, così una ricerca bloccata riparte anche se Claude Code non apre l'app; attesa in `lib/modules/agent/wait.ts` (`pollUntilFinished`, `waitClock` sostituibile nei test, ultima lettura allo scadere dei 50 s); risposta con `status` (canceled come nel DB), `phase`, `finished`, `progress` (`done`, `total`, `keywordsFound`: suggerimenti raccolti in autocomplete, poi le keyword uniche; `volumesRequested`: le keyword passate dalla fase metrics), `keptKeywords` dell'argomento solo a lavoro finito ed `error` per un failed. `maxDuration` 60 s sulla rotta `/api/mcp`. T-7302: `list_keywords` e `set_keywords` in `lib/modules/agent/tools/keywords.ts`; `status` kept di default, `page` 1 di default, `searchIntent` e `keywordType` come enum di Prisma nello schema, `search` fino a 200 caratteri, filtri passati da `parseResultsFilters`; righe con `id`, `keyword`, `volume`, `score`, `intent`, `type`, `question`, `local`, `kept`, `topicId`, `topic` e risposta con `total`, `page`, `pages`, `pageSize` (una pagina oltre l'ultima dà l'ultima, come `loadResultsPage`); `set_keywords` con project.update come la PATCH dei risultati. Spesa: `agentSpendToday()` in `metrics-ledger.ts` (costi stimati delle righe agent dal giorno UTC, anche quelle in corso); tetto in `app_settings` con la chiave `AGENT_DAILY_CAP_USD` (cifrata come le altre impostazioni), default 2 se manca o è illeggibile; `lib/modules/agent/spend.ts` con `assertAgentSpendAllowed`: si ferma con la spesa uguale o sopra il tetto (un tetto di 0 ferma ogni avvio), 429 AGENT_SPEND_CAP con `spentTodayUsd` e `capUsd`; le risposte di `create_project`, `run_search` e `wait_for_job` hanno `spend` con gli stessi due campi. PATCH `/api/admin/agent-key/settings` con `{ dailyCapUsd }` (da 0 a 100, al massimo due decimali, altrimenti 400) e la riga `agent_key.settings` del registro con il tetto prima e dopo; nella card «Claude Code» il campo «Tetto giornaliero di spesa (dollari)» con «Salva il tetto» e la riga «Speso oggi dai lavori di Claude Code: … su …», in `components/admin-agent-spend-cap.tsx`. AC-7301-1…4 e AC-7302-1…4 rossi senza la registrazione degli strumenti (14 test rossi), verdi con. In più: workspace indicato e altrui, parole di partenza nuove e doppie, ricerca e progetto altrui, filtri e intento sconosciuto, keyword altrui, tetto di 0, validazione del tetto e registro, test di componente del tetto.
