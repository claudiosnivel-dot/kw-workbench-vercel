# 12-background-jobs — Macrotask `background-jobs`

> Estrazione in background senza vendor (D-10): nasce dai rilievi dell'audit 2026-10-02 sull'estrazione eseguita per intero dentro la richiesta HTTP di avvio (run route con `maxDuration = 300`, risposta 200 anche a job fallito, nessun avanzamento visibile, nessun recupero dei job interrotti).

## Obiettivo del macrotask

Oggi `POST /api/projects/[id]/run` (e la variante per sezione) crea il job con `enqueueExtractionJob` e chiama subito `runJobById` (lib/modules/jobs/job-runner.ts), che esegue `runExtractionPipeline` (lib/modules/pipeline/extraction.ts) in un colpo solo: fino a 250 query di autocomplete, arricchimento metriche e scrittura transazionale devono stare in un'unica invocazione da 300 s, che su Vercel Hobby è anche il massimo consentito. Se l'invocazione viene terminata il job resta `running` per sempre; due clic avviano due job concorrenti sulla stessa sezione.
Il macrotask trasforma l'estrazione in un job ripartibile a passi brevi con budget di tempo, la fa avanzare con `after()` e una chiamata interna firmata, recupera i job bloccati (al polling e con un cron di sicurezza), espone un'API 202/stato/annullamento e una UI di avanzamento che sopravvive al ricaricamento. Nessun servizio esterno di code (D-10).

## Vincoli di piattaforma verificati (2026-10-02)

- `after()` di `next/server` è stabile dalla 15.1.0, utilizzabile nei Route Handler, esegue anche se la risposta è un errore e "will run for the platform's default or configured max duration of your route" (https://nextjs.org/docs/app/api-reference/functions/after, versione documentata 16.3.8). Su Vercel si appoggia a `waitUntil`, le cui promise "have the same timeout as the function itself" (https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).
- Durata massima delle funzioni con Fluid compute (attivo di default per i nuovi progetti dal 23/04/2025): Hobby 300 s default e massimo; Pro/Enterprise 300 s default, 800 s massimo, 1800 s in beta; oltre il limite risposta 504 `FUNCTION_INVOCATION_TIMEOUT` (https://vercel.com/docs/functions/limitations, https://vercel.com/docs/fluid-compute). Quindi `maxDuration = 300` è valido su ogni piano e ogni passo deve stare ben sotto.
- Cron Vercel: 100 cron per progetto su ogni piano; Hobby solo una volta al giorno con precisione oraria (±59 min, le espressioni più frequenti falliscono il deploy); Pro ed Enterprise fino a una volta al minuto (https://vercel.com/docs/cron-jobs/usage-and-pricing). Invocazione con GET sull'URL di produzione, user agent `vercel-cron/1.0`, fuso UTC (https://vercel.com/docs/cron-jobs); `CRON_SECRET` inviato come `Authorization: Bearer <valore>`, nessun retry in caso di errore, consegna best effort e talvolta duplicata, quindi il lavoro del cron deve essere idempotente (https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Le chiamate interne verso deployment protetti richiedono l'header `x-vercel-protection-bypass` con `VERCEL_AUTOMATION_BYPASS_SECRET`; `VERCEL_URL` è il dominio della deployment corrente senza schema (https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation, https://vercel.com/docs/environment-variables/system-environment-variables).

## Task atomici

```yaml
- id: T-1201
  title: "Modello di job ripartibile e un solo job attivo per sezione"
  macrotask: "background-jobs"
  depends_on: [T-706, T-403]

  objective: >
    Estendere il modello Job (prisma/schema.prisma, tabella jobs) con lo stato
    necessario a un'esecuzione a passi ripartibile (fase, cursore, avanzamento,
    heartbeat, lease, tentativi, richiesta di annullamento), aggiungere le tabelle
    di staging per job e garantire a livello di database che per ogni sezione
    esista al massimo un job attivo (pending o running).

  definition_of_done:
    - "Nuova migrazione in prisma/migrations che aggiunge a jobs: phase (enum JobPhase con valori expand, autocomplete, metrics, store, done; default expand), cursor (jsonb, default oggetto vuoto), progress_done e progress_total (integer, default 0), heartbeat_at (timestamp nullable), locked_until (timestamp nullable, lease del passo in corso), attempts (integer, default 0), cancel_requested (boolean, default false); schema.prisma allineato e client Prisma rigenerato."
    - "Enum JobStatus esteso con il valore canceled (usato da T-1202 e T-1204); le funzioni jobStatusTone di app/page.tsx, app/projects/[id]/page.tsx e app/projects/[id]/sections/page.tsx assegnano a canceled un tono dedicato."
    - "Tabelle di staging create dalla stessa migrazione: job_suggestions (id, job_id FK on delete cascade, query_index, keyword, source, source_query; unique (job_id, query_index, keyword)) e job_metrics (id, job_id FK on delete cascade, canonical_keyword, metrics_status, metrics_provider, avg_monthly_searches, competition, low_top_of_page_bid_micros, high_top_of_page_bid_micros; unique (job_id, canonical_keyword))."
    - "La migrazione abilita RLS senza policy anche su job_suggestions e job_metrics, coerente con il blocco della Data API di T-205 (D-20)."
    - "Prima di creare l'indice, la migrazione porta a failed con error_message 'Interrotto dalla migrazione dei job' i job pending o running preesistenti (D-05), così l'indice non fallisce su duplicati storici."
    - "Indice unico parziale creato in SQL nella migrazione: CREATE UNIQUE INDEX jobs_one_active_per_subproject ON jobs (subproject_id) WHERE status IN ('pending','running'); poiché schema.prisma non lo rappresenta, un commento sul model Job ne riporta nome e predicato (stessa gestione del drift prevista da T-1103)."
    - "enqueueExtractionJob in lib/modules/jobs/job-runner.ts restituisce { job, created }: inserisce il job e, se Postgres segnala la violazione dell'indice parziale (P2002 di Prisma o SQLSTATE 23505), rilegge e restituisce il job attivo esistente con created=false senza propagare eccezioni."
    - "Nessuna route cambia contratto in questo task: il 409 verso il client arriva con T-1204."

  acceptance_criteria:
    - id: AC-1201-1
      given: "il database di test con tutte le migrazioni applicate"
      when: "il test interroga pg_indexes per indexname = 'jobs_one_active_per_subproject'"
      then: "esiste esattamente 1 riga e la sua indexdef contiene 'UNIQUE' e un predicato su status con i valori 'pending' e 'running'"
    - id: AC-1201-2
      given: "una sezione senza job attivi"
      when: "due chiamate a enqueueExtractionJob per la stessa sezione vengono eseguite in parallelo con Promise.all"
      then: "la tabella jobs contiene 1 sola riga con status in (pending, running) per quella sezione; una chiamata restituisce created=true, l'altra created=false con lo stesso job.id"
    - id: AC-1201-3
      given: "una sezione con un job in stato completed"
      when: "viene chiamato enqueueExtractionJob per la stessa sezione"
      then: "il risultato ha created=true, la sezione ha 2 righe in jobs e il nuovo job ha phase='expand', attempts=0, cancel_requested=false, progress_done=0"
    - id: AC-1201-4
      given: "un job con 3 righe in job_suggestions e 2 righe in job_metrics"
      when: "il job viene eliminato"
      then: "il conteggio di job_suggestions e di job_metrics con quel job_id è 0"

  target_tests:
    - file: "tests/integration/job-model.test.ts"
      covers: [AC-1201-1, AC-1201-2, AC-1201-3, AC-1201-4]

  security_notes:
    - "A06 Insecure Design / CWE-362 (race condition): l'unicità del job attivo per sezione è imposta dall'indice parziale nel database, non da un controllo applicativo check-then-insert."
    - "A01 Broken Access Control / CWE-639: job_suggestions e job_metrics sono lette e scritte solo tramite il job_id di un job già autorizzato a monte; nessuna route le espone; RLS deny-all estesa alle nuove tabelle (D-20)."
    - "A06 Insecure Design / CWE-770: un solo job attivo per sezione limita il consumo di quota Google e di risorse per singolo utente; le quote per workspace sono di T-1703."

  out_of_scope:
    - "Esecuzione a passi con budget di tempo (T-1202)."
    - "Continuazione automatica e reaper (T-1203)."
    - "Risposte 202/409 delle API e annullamento (T-1204)."

- id: T-1202
  title: "Pipeline a passi con budget di tempo"
  macrotask: "background-jobs"
  depends_on: [T-1201, T-701, T-705, T-306]

  objective: >
    Rifattorizzare runExtractionPipeline (lib/modules/pipeline/extraction.ts) in
    advanceJob(jobId, deadlineMs), che esegue la fase corrente a batch fino alla
    scadenza, persiste cursore e staging a ogni batch e può essere richiamata un
    numero arbitrario di volte, anche dopo un crash, producendo lo stesso
    risultato dell'esecuzione in un colpo solo (snapshot vigente del golden
    master di T-106, come aggiornato dai task di 07-extraction-fixes).

  definition_of_done:
    - "Nuovo modulo lib/modules/jobs/advance-job.ts con advanceJob(jobId: string, deadlineMs: number), dove deadlineMs è un istante assoluto in millisecondi epoch; restituisce { status, phase, progressDone, progressTotal, more, skipped } con skipped='lease_busy' quando il lease è di un altro passo."
    - "Lease: updateMany su jobs con where id, status in (pending, running) e locked_until nullo o passato, che imposta status running, started_at se nullo, locked_until = deadlineMs + 30 s e heartbeat_at = adesso; count 0 significa lease occupato e la funzione ritorna senza lavoro. Il lease viene rilasciato (locked_until null) a fine passo."
    - "Fase expand: calcola le query con buildExpansionQueries (round-robin per priorità di T-701) e salva nel cursore queries, truncated e skippedQueries; progress_total = numero di query."
    - "Fase autocomplete: batch di JOB_AUTOCOMPLETE_BATCH query (default 24, letta dallo schema di lib/env.ts) con la concorrenza AUTOCOMPLETE_CONCURRENCY; i suggerimenti vanno in job_suggestions con createMany skipDuplicates e query_index della query di origine."
    - "Fase metrics: deduplica seed + staging con dedupeCandidates, arricchisce a batch le canonical con il metrics provider della sezione e salva in job_metrics (upsert per job_id e canonical_keyword); progress_total = numero di canonical."
    - "Fase store: costruisce le righe come oggi (evaluateBrandStatus, classifyKeyword, filtro min_volume, scoreKeyword) e le scrive con la logica di conservazione di revisione e selezione di T-705, nella transazione con timeout esplicito di T-706; poi status completed, phase done, completed_at, result con il riepilogo (queries, rawSuggestions, dedupedCandidates, storedCandidates, truncated, skippedQueries) ed eliminazione dello staging del job."
    - "Ogni batch scrive staging, cursore, progress_done, progress_total e heartbeat_at in un'unica transazione: un'eccezione a metà batch non lascia righe di staging senza avanzamento del cursore, né il contrario."
    - "Prima di ogni batch successivo al primo: se Date.now() ha superato deadlineMs la funzione rilascia il lease e ritorna more=true; ogni chiamata esegue sempre almeno un batch, così il job avanza anche con deadline già scaduta."
    - "Prima di ogni batch: se cancel_requested è true il job passa a canceled con completed_at, lo staging del job viene eliminato e i keyword_candidates della sezione restano invariati."
    - "runExtractionPipeline(subprojectId) resta come wrapper che ottiene il job con enqueueExtractionJob e chiama advanceJob in ciclo fino a more=false: lo usano il golden master di T-106 e le route di avvio finché T-1204 non introduce il 202."
    - "Timestamp di lease e heartbeat generati dall'applicazione (new Date()) e non con now() del database, così i test possono usare vi.setSystemTime."

  acceptance_criteria:
    - id: AC-1202-1
      given: "la sezione e le seed fisse del golden master di T-106 con provider di autocomplete e metriche MOCK"
      when: "advanceJob viene chiamata in ciclo con deadlineMs = Date.now() (un batch per chiamata) fino a more=false"
      then: "il numero di chiamate è maggiore di 3, il job ha status completed e phase done, e lo snapshot ordinato dei keyword_candidates (keyword, canonical_keyword, score, search_intent, keyword_type, brand_status, review_status) è identico a quello del golden master"
    - id: AC-1202-2
      given: "un job su cui viene iniettata un'eccezione dentro la transazione di un batch, a turno nelle fasi autocomplete, metrics e store"
      when: "il tempo viene portato oltre locked_until con vi.setSystemTime e advanceJob viene richiamata fino a more=false"
      then: "per ognuna delle tre fasi il job termina completed, lo snapshot dei keyword_candidates è identico al golden master e prima della pulizia job_suggestions non contiene coppie (query_index, keyword) duplicate"
    - id: AC-1202-3
      given: "un job running con locked_until 60 s nel futuro"
      when: "advanceJob viene chiamata sullo stesso job"
      then: "il risultato ha skipped='lease_busy' e more=false, e cursor, progress_done, phase e locked_until della riga sono uguali a prima della chiamata"
    - id: AC-1202-4
      given: "un job in fase autocomplete con cancel_requested=true e una sezione con 5 keyword_candidates preesistenti"
      when: "advanceJob viene chiamata"
      then: "il job ha status canceled e completed_at valorizzato, job_suggestions e job_metrics del job contano 0 righe e la sezione ha ancora 5 keyword_candidates"

  target_tests:
    - file: "tests/integration/job-steps.test.ts"
      covers: [AC-1202-1, AC-1202-2, AC-1202-3, AC-1202-4]
    - file: "tests/integration/characterization/pipeline.golden.test.ts"
      covers: [AC-1202-1]

  security_notes:
    - "A10 Mishandling of Exceptional Conditions / CWE-460 (Improper Cleanup on Thrown Exception): ogni batch è una transazione unica; un'eccezione produce rollback e lease rilasciato o in scadenza, mai keyword_candidates parziali."
    - "A06 Insecure Design / CWE-362: il lease è acquisito con updateMany condizionale (compare-and-set), quindi due passi concorrenti sullo stesso job non possono lavorare insieme."
    - "A01 Broken Access Control / CWE-639: advanceJob opera solo su project_id e subproject_id salvati nel job, mai su identificativi forniti dal chiamante."

  out_of_scope:
    - "Continuazione automatica, firma HMAC e reaper (T-1203)."
    - "Contratto 202/stato/annullamento delle API (T-1204)."
    - "La politica di fallimento parziale dell'autocomplete di T-306 non è ridefinita qui: advanceJob conserva nel cursore e nel riepilogo i contatori prodotti dal provider (es. failedQueries) senza cambiarne la semantica."

- id: T-1203
  title: "Continuazione automatica e recupero dei job bloccati"
  macrotask: "background-jobs"
  depends_on: [T-1202, T-201, T-404, T-203]

  objective: >
    Far avanzare i job senza un utente in attesa: dopo ogni passo pianificare il
    successivo con after() e una chiamata interna firmata HMAC verso la stessa
    deployment; recuperare i job con heartbeat fermo tramite un reaper idempotente
    invocato al polling di stato e da un cron di sicurezza; portare a failed con
    un messaggio generico i job che superano il tetto di tentativi.

  definition_of_done:
    - "Schema di lib/env.ts (T-201) esteso con: JOB_SIGNING_SECRET (almeno 32 caratteri, obbligatoria in produzione, diversa da APP_SESSION_SECRET), CRON_SECRET (almeno 16 caratteri, come raccomandato da Vercel), JOB_STEP_BUDGET_MS (default 60000, intervallo 5000-240000), JOB_STALE_AFTER_MS (default 180000, rifiutata se non supera JOB_STEP_BUDGET_MS di almeno 30000), JOB_MAX_ATTEMPTS (default 5, intervallo 1-20), APP_PUBLIC_URL (URL https pubblico dell'app, usato per le chiamate interne fuori da Vercel e, da T-1402, per i link nelle email)."
    - "lib/modules/jobs/job-signature.ts: signJobStep(jobId, expiresAt) calcola HMAC-SHA256 con JOB_SIGNING_SECRET della stringa jobId.expiresAt in base64url; verifyJobStep confronta con timingSafeEqual e rifiuta firme scadute; TTL 60 s."
    - "lib/modules/jobs/continuation.ts espone scheduleJobContinuation(jobId) dietro l'interfaccia JobContinuation; l'implementazione di produzione registra con after() una fetch POST a base + /api/internal/jobs/{id}/advance con header x-job-expires e x-job-signature, più x-vercel-protection-bypass quando VERCEL_AUTOMATION_BYPASS_SECRET è presente; base = https:// + VERCEL_URL su Vercel (stessa deployment, stessa versione del codice), APP_PUBLIC_URL altrove, mai derivata dall'header Host. Nei test l'implementazione è sostituita da una che registra le chiamate e after() è intercettato con un mock che accoda le callback ed esegue un flush esplicito."
    - "app/api/internal/jobs/[id]/advance/route.ts (POST, runtime nodejs, maxDuration 300): firma assente, scaduta o calcolata per un altro jobId -> 401 senza letture o scritture sul job; firma valida -> 202 immediato e, in after(), advanceJob(id, Date.now() + JOB_STEP_BUDGET_MS) seguito da scheduleJobContinuation se more=true. Il prefisso /api/internal/jobs/ è escluso dal controllo di sessione del proxy di autenticazione (proxy.ts dopo T-404, middleware.ts prima) ed è protetto solo dalla firma."
    - "Eccezione non gestita in un passo: console.error con jobId e fase (senza payload dei provider né segreti), attempts incrementato, lease rilasciato e nuova continuazione pianificata; con attempts uguale a JOB_MAX_ATTEMPTS il job passa a failed con error_message 'Estrazione interrotta dopo N tentativi' (N numerico, nessun dettaglio interno)."
    - "lib/modules/jobs/reaper.ts: reapStaleJobs({ jobId, limit = 50 }) seleziona job pending o running con locked_until nullo o passato e heartbeat_at (o created_at se nullo) più vecchio di JOB_STALE_AFTER_MS; per ognuno un updateMany condizionale sulla stessa soglia incrementa attempts e aggiorna heartbeat_at (una seconda invocazione ravvicinata non trova più il job), poi pianifica la continuazione; con attempts già uguale a JOB_MAX_ATTEMPTS imposta failed. Restituisce { resumed, failed }."
    - "app/api/cron/reap-jobs/route.ts (GET, pubblica nel proxy): Authorization diverso da 'Bearer ' + CRON_SECRET, o CRON_SECRET non configurata -> 401; altrimenti reapStaleJobs() e 200 { resumed, failed }."
    - "vercel.json aggiunge crons con path /api/cron/reap-jobs e schedule '0 4 * * *' (giornaliero: l'unica frequenza ammessa su Hobby); docs/ENVIRONMENTS.md (creato da T-203, macrotask precedente) documenta le nuove variabili, che su Pro la frequenza può salire fino a una volta al minuto e che il recupero principale avviene al polling di stato (collegato da T-1204)."

  acceptance_criteria:
    - id: AC-1203-1
      given: "un job pending e CRON_SECRET configurata"
      when: "si invoca POST /api/internal/jobs/{id}/advance senza firma, con firma scaduta e con firma valida per un altro jobId, e GET /api/cron/reap-jobs senza Authorization e con Bearer errato"
      then: "tutte e cinque le risposte hanno status 401 e la riga del job ha updated_at, phase e progress_done invariati"
    - id: AC-1203-2
      given: "un job pending con 30 query previste e la continuazione sostituita dal registratore di test"
      when: "si invoca la rotta advance con firma valida e si esegue il flush delle callback after()"
      then: "la risposta ha status 202, il job ha progress_done maggiore di 0 oppure phase diversa da expand, e il registratore contiene 1 continuazione per lo stesso jobId"
    - id: AC-1203-3
      given: "un job running con attempts=1, locked_until passato e heartbeat_at di 4 minuti prima"
      when: "GET /api/cron/reap-jobs con Bearer corretto viene chiamato due volte di seguito (consegna duplicata del cron)"
      then: "la prima risposta è 200 con resumed=1 e failed=0, la seconda 200 con resumed=0 e failed=0, attempts vale 2 e il registratore contiene 1 sola continuazione"
    - id: AC-1203-4
      given: "un job running bloccato con attempts=5 e JOB_MAX_ATTEMPTS=5"
      when: "viene eseguito reapStaleJobs"
      then: "il job ha status failed, completed_at valorizzato, error_message uguale a 'Estrazione interrotta dopo 5 tentativi' e il registratore non contiene continuazioni"

  target_tests:
    - file: "tests/integration/job-continuation.test.ts"
      covers: [AC-1203-1, AC-1203-2, AC-1203-3, AC-1203-4]

  security_notes:
    - "A07 Authentication Failures / CWE-345 (Insufficient Verification of Data Authenticity): la rotta interna accetta solo HMAC-SHA256 valido su jobId e scadenza (TTL 60 s) con confronto timingSafeEqual; un replay entro il TTL è innocuo perché advanceJob è idempotente sotto lease."
    - "A02 Security Misconfiguration / CWE-798 e CWE-1188: JOB_SIGNING_SECRET e CRON_SECRET arrivano dall'env validata, fail-closed in produzione, senza default nel sorgente; con CRON_SECRET assente la rotta cron risponde 401."
    - "A01 Broken Access Control / CWE-918 (SSRF): l'URL della continuazione deriva da VERCEL_URL o APP_PUBLIC_URL e mai dall'header Host, così la firma e il bypass della protezione non vengono inviati a host controllati da terzi."
    - "A09 Security Logging and Alerting Failures / CWE-778 e CWE-532: ogni fallimento definitivo per tetto di tentativi è loggato con jobId e numero di tentativi; firme, segreti e bypass non compaiono mai nei log."

  out_of_scope:
    - "Contratto 202/stato/annullamento e collegamento del reaper al polling di stato (T-1204)."
    - "Quote d'uso per workspace (T-1703)."
    - "Servizi di coda esterni (alternativa Inngest/QStash di D-10, non adottata)."

- id: T-1204
  title: "API dei job: avvio 202, stato, annullamento"
  macrotask: "background-jobs"
  depends_on: [T-1203, T-503]

  objective: >
    Rendere asincrono il contratto delle API di estrazione: l'avvio risponde 202
    con l'id del job senza eseguire la pipeline nella richiesta, lo stato è
    interrogabile (e il polling recupera i job bloccati), il job è annullabile;
    tutto nel perimetro del proprietario del progetto.

  definition_of_done:
    - "app/api/projects/[id]/run/route.ts e app/api/projects/[id]/subprojects/[subprojectId]/run/route.ts: dopo i controlli di proprietà esistenti chiamano enqueueExtractionJob; job nuovo -> 202 { data: { jobId, status, phase }, meta: { subprojectId } } con header Location /api/jobs/{jobId} e primo passo pianificato con scheduleJobContinuation; job attivo già presente -> 409 { error, code: 'JOB_ALREADY_ACTIVE', jobId }. La chiamata sincrona a runJobById viene rimossa da entrambe le route."
    - "app/api/jobs/[id]/route.ts (GET, sessione richiesta): una sola query con where id e project.owner_user_id uguale all'utente corrente (diventerà la membership del workspace con T-1502); assente -> 404 { error, code: 'JOB_NOT_FOUND' }; altrimenti reapStaleJobs({ jobId }) e 200 { data: { id, status, phase, progress: { done, total }, result, error } } con header Cache-Control no-store; result presente solo a completed, error è il messaggio generico salvato (mai stack)."
    - "app/api/jobs/[id]/cancel/route.ts (POST, sessione richiesta): stesso perimetro (404 JOB_NOT_FOUND per job altrui o inesistente); job pending -> status canceled immediato e 200; job running -> cancel_requested=true e 202 (l'annullamento effettivo avviene al batch successivo, T-1202); job in stato terminale -> 409 { code: 'JOB_NOT_CANCELABLE' }."
    - "I code JOB_ALREADY_ACTIVE, JOB_NOT_FOUND e JOB_NOT_CANCELABLE sono registrati nel registro dei code di lib/http/errors.ts (creato da T-503, macrotask precedente)."
    - "runJobById non è più chiamato da alcuna route (resta per test e CLI; l'eventuale rimozione passa da T-1101)."

  acceptance_criteria:
    - id: AC-1204-1
      given: "l'utente A proprietario di un progetto con una sezione con 3 seed e la continuazione sostituita dal registratore di test"
      when: "A invia POST /api/projects/{id}/run con subprojectId della sezione"
      then: "la risposta ha status 202, data.jobId non vuoto e header Location uguale a /api/jobs/{jobId}; il job ha status pending, il registratore contiene 1 continuazione e il numero di keyword_candidates della sezione è invariato"
    - id: AC-1204-2
      given: "la stessa sezione con un job pending"
      when: "A invia di nuovo POST /api/projects/{id}/run per la sezione"
      then: "la risposta ha status 409, code 'JOB_ALREADY_ACTIVE' e jobId uguale a quello esistente; il numero di righe in jobs della sezione è invariato"
    - id: AC-1204-3
      given: "un job di A running in fase autocomplete con progress_done=5 e progress_total=20"
      when: "GET /api/jobs/{id} viene inviato da A, dall'utente B e senza sessione"
      then: "A riceve 200 con data.phase 'autocomplete' e data.progress { done: 5, total: 20 } e header Cache-Control no-store; B riceve 404 con code 'JOB_NOT_FOUND'; la richiesta anonima riceve 401"
    - id: AC-1204-4
      given: "un job pending e un job running dell'utente A"
      when: "B invia POST cancel sul job pending, poi A invia POST cancel sul pending due volte e sul running una volta"
      then: "B riceve 404 e lo status resta pending; la prima cancel di A risponde 200 con status canceled, la seconda 409 'JOB_NOT_CANCELABLE'; la cancel sul running risponde 202 e la riga ha cancel_requested=true"

  target_tests:
    - file: "tests/integration/jobs-api.test.ts"
      covers: [AC-1204-1, AC-1204-2, AC-1204-3, AC-1204-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (IDOR): stato e annullamento caricano il job con un where che include project.owner_user_id dell'utente corrente nella stessa query; job di altri utenti -> 404 e non 403, per non rivelarne l'esistenza."
    - "A06 Insecure Design / CWE-770: al massimo un job attivo per sezione (indice di T-1201) e risposta 409 alle richieste ripetute; le quote giornaliere sono di T-1703."
    - "A10 Mishandling of Exceptional Conditions / CWE-209: l'errore esposto è solo il messaggio generico salvato da T-706 e T-1203, senza stack né messaggi Prisma."

  out_of_scope:
    - "UI di avanzamento (T-1205)."
    - "Autorizzazione per workspace e ruoli (T-1502)."
    - "Quote d'uso e risposta 429 QUOTA_EXCEEDED (T-1703)."

- id: T-1205
  title: "Interfaccia di avanzamento dell'estrazione"
  macrotask: "background-jobs"
  depends_on: [T-1204, T-1003]

  objective: >
    Mostrare l'avanzamento reale dell'estrazione con una barra con fase e
    conteggi, aggiornata da polling con backoff, persistente al ricaricamento della
    pagina e con esito finale esplicito (link ai risultati, messaggio d'errore o
    annullamento), sia nelle pagine di progetto e sezione sia nello step di
    onboarding.

  definition_of_done:
    - "Nuovo componente client components/job-progress.tsx (props jobId, resultsHref, onCompleted opzionale): polling di GET /api/jobs/{jobId} ogni 2000 ms; a ogni errore consecutivo (rete o status 5xx) l'intervallo raddoppia fino a 16000 ms e torna a 2000 ms al primo successo; il polling si ferma su completed, failed o canceled e allo smontaggio (AbortController)."
    - "Rendering: elemento con role progressbar, aria-valuenow = progress.done e aria-valuemax = progress.total; etichetta di fase (expand: Espansione query, autocomplete: Suggerimenti, metrics: Metriche, store: Salvataggio) e testo done / total; a completed un link 'Vedi risultati' verso resultsHref; a failed il campo error della risposta reso come testo; a canceled il testo 'Estrazione annullata'; pulsante 'Annulla' che invia POST /api/jobs/{jobId}/cancel finché il job è attivo."
    - "components/run-extraction-button.tsx: con risposta 202, o 409 con code JOB_ALREADY_ACTIVE, monta JobProgress con il jobId ricevuto; router.refresh viene chiamato a job completed e non più subito dopo la POST."
    - "Sopravvivenza al ricaricamento: app/projects/[id]/page.tsx, app/projects/[id]/sections/page.tsx e app/projects/[id]/subprojects/[subprojectId]/page.tsx leggono l'eventuale job pending o running della sezione e passano activeJobId a RunExtractionButton, che in quel caso mostra subito JobProgress."
    - "components/onboarding-run-step.tsx usa JobProgress: il PATCH di /api/onboarding/state verso REVIEW_EXPORT e il messaggio 'Estrazione completata' avvengono solo a status completed; con failed o canceled resta sullo step e mostra il messaggio; app/onboarding/run/page.tsx passa l'eventuale job attivo della sezione."
    - "resultsHref = /projects/{id}/results?subprojectId={sectionId}, il formato già usato dalle pagine progetto."

  acceptance_criteria:
    - id: AC-1205-1
      given: "JobProgress montato con timer finti e fetch mock che risponde prima running in fase autocomplete con progress 3/10, poi completed"
      when: "i timer avanzano di 2000 ms, poi di altri 2000 ms, poi di altri 20000 ms"
      then: "dopo il primo avanzamento la progressbar ha aria-valuenow=3 e aria-valuemax=10 e il testo 'Suggerimenti'; dopo il secondo è visibile il link 'Vedi risultati' con href uguale a resultsHref; dopo il terzo il numero di chiamate fetch è ancora 2"
    - id: AC-1205-2
      given: "JobProgress montato con timer finti e fetch mock che risponde 503 tre volte e poi running"
      when: "i timer avanzano fino a 32000 ms"
      then: "le chiamate fetch avvengono a 2000, 6000, 14000, 30000 e 32000 ms dal montaggio"
    - id: AC-1205-3
      given: "OnboardingRunStep con fetch mock in cui la POST di avvio risponde 202 e lo stato risponde failed con error 'Nessuna seed nella sezione'"
      when: "l'utente clicca 'Avvia prima estrazione' e i timer avanzano di 2000 ms"
      then: "il testo 'Nessuna seed nella sezione' è visibile, il link 'Vedi risultati' è assente e nessuna richiesta PATCH a /api/onboarding/state è stata inviata"
    - id: AC-1205-4
      given: "l'app avviata sul DB di test con provider MOCK, un utente seed e un job running inserito per la sua sezione con progress 3/10"
      when: "l'utente apre la pagina del progetto, ricarica, poi il test porta il job a completed nel DB; infine l'utente avvia un'estrazione su una seconda sezione"
      then: "dopo il ricaricamento la progressbar ha aria-valuenow=3; entro 5 s dal completamento è visibile 'Vedi risultati'; per la seconda sezione 'Vedi risultati' compare entro 60 s e la pagina risultati mostra almeno 1 riga di keyword"

  target_tests:
    - file: "tests/component/job-progress.test.tsx"
      covers: [AC-1205-1, AC-1205-2, AC-1205-3]
    - file: "tests/e2e/background-run.spec.ts"
      covers: [AC-1205-4]

  security_notes:
    - "A05 Injection / CWE-79: il messaggio d'errore del job è reso come testo React, mai con dangerouslySetInnerHTML."
    - "A01 Broken Access Control / CWE-639: il componente usa solo le API di T-1204, che applicano il perimetro sul proprietario; activeJobId è letto lato server dalle pagine già autorizzate e non accettato da query string."

  out_of_scope:
    - "Traduzione delle etichette in inglese (T-1302)."
    - "Notifiche email a fine estrazione (non pianificate)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
