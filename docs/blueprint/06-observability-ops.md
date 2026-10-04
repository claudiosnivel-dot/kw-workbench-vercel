# 06-observability-ops — Macrotask `observability-ops`

> Osservabilità e operazioni per un servizio in produzione: tracciamento errori, log strutturati con request id, health check, backup verificati e pipeline di rilascio; nasce dai rilievi dell'audit 2026-10-02 (solo `console.warn`/`console.error` sparsi, nessun health check, nessuna procedura di backup, ogni push su master deployato in produzione).

## Obiettivo del macrotask

Dare al progetto gli strumenti minimi per accorgersi dei problemi e rimediare senza improvvisare.
Gli errori di server e client arrivano a Sentry (D-13) senza dati personali; i log diventano righe JSON correlate da un request id che attraversa proxy, route e job; un endpoint pubblico di health permette il monitoraggio esterno dell'uptime.
I backup logici del database sono scriptati e provati con un ripristino verificato sul container di test, e la documentazione riporta cosa offre ogni piano Supabase.
Infine il rilascio passa da PR con CI e checkpoint verdi prima della produzione, senza staging (D-04 emendata 2026-10-05), con la branch protection su master e un Ignored Build Step che evita build inutili per i soli commit di documentazione.

## Task atomici

```yaml
- id: T-601
  title: "Tracciamento errori con Sentry e dati personali filtrati"
  macrotask: "observability-ops"
  depends_on: [T-404, T-201, T-502, T-505]

  objective: >
    Integrare @sentry/nextjs secondo la guida ufficiale di setup manuale per Next.js,
    attivo solo quando il DSN è configurato (D-13), con un filtro che rimuove cookie,
    password, token e IP da ogni evento prima dell'invio.

  definition_of_done:
    - "@sentry/nextjs aggiunto con pin esatto (verificato con npm view il 2026-10-02: 11.2.0 dichiara peer next ^14.0 || ^15.0.0-rc.0 || ^16.0.0-0 ed engines compatibili con Node 24)."
    - "File previsti dalla guida ufficiale: instrumentation.ts con register() che importa sentry.server.config o sentry.edge.config secondo NEXT_RUNTIME e onRequestError = Sentry.captureRequestError; sentry.server.config.ts; sentry.edge.config.ts; instrumentation-client.ts; next.config.ts avvolto da withSentryConfig."
    - "Attivazione condizionata: Sentry.init viene chiamato solo se SENTRY_DSN (server) o NEXT_PUBLIC_SENTRY_DSN (client) è valorizzata; senza DSN nessuna init e nessuna richiesta di rete. Variabili aggiunte allo schema di lib/env.ts (T-201) e alla matrice di docs/ENVIRONMENTS.md (T-203)."
    - "lib/observability/sentry-scrub.ts: funzione pura scrubEvent usata in beforeSend (e beforeSendTransaction se il tracing viene attivato) che elimina request.cookies e gli header cookie, authorization e x-forwarded-for, sostituisce con '[Filtered]' i valori delle chiavi password, newPassword, currentPassword, confirmPassword, token, refresh_token, access_token, client_secret e developerToken a qualsiasi profondità di request.data ed extra, e riduce user al solo id; sendDefaultPii false in tutte le config."
    - "Niente Session Replay e tracesSampleRate 0 (nessuna analytics nel piano, D-13); app/global-error.tsx di T-502 invia l'eccezione con Sentry.captureException."
    - "SENTRY_AUTH_TOKEN usato solo in build per l'upload delle source map, mai con prefisso NEXT_PUBLIC_; senza token la build esce 0 saltando l'upload; verificare nella documentazione Sentry il supporto all'upload delle source map con build Turbopack (default di Next 16)."
    - "Con la CSP di T-505 attiva: host di ingest del DSN aggiunto a connect-src oppure tunnelRoute di withSentryConfig, così il client non genera violazioni CSP."

  acceptance_criteria:
    - id: AC-601-1
      given: "SENTRY_DSN e NEXT_PUBLIC_SENTRY_DSN non impostate, Sentry.init sotto spy e fetch globale mockato"
      when: "si esegue register() di instrumentation.ts con NEXT_RUNTIME nodejs"
      then: "Sentry.init è chiamato 0 volte e fetch riceve 0 chiamate"
    - id: AC-601-2
      given: "un evento con request.cookies kwb_session=abc, header authorization 'Bearer x', data {username: 'u', password: 'segreto-123', nested: {refresh_token: 't-999'}} e user {id: '1', username: 'u', ip_address: '1.2.3.4'}"
      when: "si applica scrubEvent all'evento"
      then: "cookies e authorization sono assenti, password e refresh_token valgono '[Filtered]', user ha solo la chiave id e la serializzazione JSON dell'evento non contiene 'abc', 'Bearer x', 'segreto-123', 't-999' né '1.2.3.4'"
    - id: AC-601-3
      given: "DSN di test e transport di Sentry sostituito da uno che registra gli envelope in memoria"
      when: "onRequestError riceve un Error lanciato durante una richiesta con cookie kwb_session=tok-xyz e header authorization 'Bearer secret-abc'"
      then: "viene registrato esattamente 1 envelope con un item di tipo event e il suo contenuto non contiene 'tok-xyz' né 'secret-abc'"

  target_tests:
    - file: "tests/integration/error-tracking.test.ts"
      covers: [AC-601-1, AC-601-2, AC-601-3]

  security_notes:
    - "OWASP A09:2025 Security Logging and Alerting Failures — CWE-778 (logging insufficiente): oggi gli errori finiscono solo in console.error sparsi, senza aggregazione né notifica; con Sentry ogni eccezione di server e client genera un evento consultabile e notificabile."
    - "CWE-532 e CWE-359 (dati personali esposti): nessun cookie di sessione, password, token OAuth, username o IP negli eventi grazie a scrubEvent in beforeSend e sendDefaultPii false; il test lo verifica sull'envelope effettivamente prodotto, non solo sulla funzione."
    - "Segreti — CWE-798: SENTRY_AUTH_TOKEN solo nelle env di build su Vercel e in CI, mai nel sorgente né nel bundle client; il DSN non è segreto ma resta configurazione da env validata."

  out_of_scope:
    - "Log strutturati e request id (T-602)."
    - "Regole di alert e destinatari delle notifiche (configurazione dell'utente su Sentry)."
    - "Performance monitoring e analytics (esclusi da D-13)."

- id: T-602
  title: "Log strutturati e request id"
  macrotask: "observability-ops"
  depends_on: [T-601, T-201, T-503]

  objective: >
    Introdurre un logger JSON con redazione dei campi sensibili, assegnare nel proxy un
    x-request-id a ogni richiesta e propagarlo a risposte, route e log, e registrare con
    lo stack completo i fallimenti dei job di estrazione.

  definition_of_done:
    - "lib/observability/logger.ts: logger.debug, info, warn ed error(msg, fields) scrivono una riga JSON per evento con ts ISO, level, msg, requestId se noto e i campi; gli Error sono serializzati come {name, message, stack}; livello minimo da LOG_LEVEL (env validata di T-201, default info)."
    - "Redazione: le chiavi che corrispondono a password, token, secret, cookie, authorization o apikey (case-insensitive, a qualsiasi profondità) valgono '[REDACTED]' prima della serializzazione."
    - "proxy.ts: assegna x-request-id a ogni richiesta, riusando quello in ingresso solo se conforme a ^[A-Za-z0-9-]{8,64}$ e altrimenti generando crypto.randomUUID(); lo inoltra negli header della richiesta e lo imposta sulla risposta; il 401 JSON del proxy per le API anonime include requestId."
    - "Helper getRequestId(request) in lib/observability/request-id.ts, usato dal wrapper withApiErrors di T-503 (che oggi genera un UUID se l'header manca), così il requestId nel body d'errore coincide con l'header assegnato dal proxy."
    - "lib/modules/jobs/job-runner.ts: nel catch di runJobById chiama logger.error('job_failed', {jobId, projectId, subprojectId, error}) con lo stack completo nel log, non nel DB."
    - "Le chiamate console.error e console.warn esistenti in app/** e lib/** (14 al 2026-10-02) sostituite dal logger: la ricerca di 'console.' in app e lib restituisce 0 righe fuori da lib/observability/logger.ts."

  acceptance_criteria:
    - id: AC-602-1
      given: "logger con LOG_LEVEL=info e stdout intercettato"
      when: "si chiama logger.error('login_failed', {username: 'u', password: 'segreto', nested: {token: 't1'}, err: new Error('boom')})"
      then: "stdout riceve una sola riga JSON valida con level 'error', password e nested.token pari a '[REDACTED]', err.stack non vuoto, e la riga non contiene 'segreto' né 't1'"
    - id: AC-602-2
      given: "un messaggio che contiene un ritorno a capo seguito dal testo di una finta riga di log JSON"
      when: "lo si registra con logger.warn"
      then: "l'output contiene esattamente un carattere di fine riga, in coda, e il ritorno a capo del messaggio compare in forma escaped dentro la stringa JSON"
    - id: AC-602-3
      given: "tre richieste al proxy: senza x-request-id, con x-request-id 'abc-12345678' e con un x-request-id di 200 caratteri"
      when: "il test invoca proxy() su /api/projects per ciascuna"
      then: "la prima risposta ha un x-request-id in formato UUID, la seconda ha 'abc-12345678' e la terza ha un UUID nuovo; i 401 JSON contengono lo stesso valore nel campo requestId"
    - id: AC-602-4
      given: "pipeline di estrazione mockata che lancia Error('provider down') e logger intercettato"
      when: "si esegue runJobById su un job pending"
      then: "il job ha status failed e il logger ha emesso una riga con level 'error', msg 'job_failed', il jobId del job e uno stack che contiene 'provider down'"

  target_tests:
    - file: "tests/unit/logger.test.ts"
      covers: [AC-602-1, AC-602-2]
    - file: "tests/integration/request-id.test.ts"
      covers: [AC-602-3, AC-602-4]

  security_notes:
    - "OWASP A09:2025 Security Logging and Alerting Failures — CWE-117 (neutralizzazione dell'output nei log): un log JSON su una riga impedisce a valori controllati dall'utente di creare righe false; un x-request-id esterno è accettato solo se conforme al pattern, altrimenti sostituito."
    - "CWE-532 (dati sensibili nei log): redazione per chiave prima della scrittura; mai la stringa di connessione al DB, il body del login o i token OAuth nei log."
    - "CWE-778: oggi un job fallito salva solo error_message, senza stack né log; ogni fallimento lascia ora una riga con jobId correlabile all'evento di Sentry."

  out_of_scope:
    - "Troncamento e sanitizzazione di error_message salvato nel DB e restituito al client (T-706)."
    - "Log drain e retention su Vercel (configurazione dell'utente)."

- id: T-603
  title: "Health check pubblico e monitoraggio uptime"
  macrotask: "observability-ops"
  depends_on: [T-404]

  objective: >
    Esporre GET /api/health, pubblico e senza segreti, che verifica la raggiungibilità
    del database con un timeout breve e risponde 200 o 503, e documentare il monitor
    esterno di uptime che l'utente configura.

  definition_of_done:
    - "app/api/health/route.ts: GET e HEAD pubblici, con il percorso esatto /api/health aggiunto ai percorsi pubblici di proxy.ts; esegue SELECT 1 tramite prisma con timeout di 2 s; risponde {status: 'ok', db: 'ok', version} con 200 oppure {status: 'degraded', db: 'error', version} con 503; header Cache-Control no-store."
    - "version = primi 7 caratteri di VERCEL_GIT_COMMIT_SHA (variabile di sistema Vercel disponibile a build e runtime), altrimenti il campo version di package.json."
    - "Nessun dettaglio dell'errore nel body (niente messaggio Prisma, host o stack); il fallimento è registrato lato server con il logger di T-602 se già presente."
    - "docs/OPERATIONS.md, sezione «Monitoraggio uptime»: URL da monitorare (/api/health di produzione; niente staging, D-04), intervallo consigliato, condizione di allarme (status diverso da 200 per 2 controlli consecutivi) e destinatario; il servizio esterno lo configura l'utente e la conferma è registrata in SESSION-STATE."

  acceptance_criteria:
    - id: AC-603-1
      given: "DB di test raggiungibile e richiesta senza cookie"
      when: "GET /api/health passa da proxy() e dal route handler"
      then: "il proxy lascia passare senza 401, la risposta è 200 con status 'ok', db 'ok' e version stringa non vuota, e l'header Cache-Control vale no-store"
    - id: AC-603-2
      given: "prisma.$queryRaw forzato a lanciare un errore con messaggio 'connect ECONNREFUSED db.internal:5432'"
      when: "si chiama GET /api/health"
      then: "la risposta è 503 con status 'degraded' e db 'error' e il body non contiene 'ECONNREFUSED' né 'db.internal'"
    - id: AC-603-3
      given: "prisma.$queryRaw che non risponde per 10 s"
      when: "si chiama GET /api/health"
      then: "la risposta 503 arriva entro 3 s dall'inizio della richiesta"
    - id: AC-603-4
      given: "DATABASE_URL e APP_SESSION_SECRET valorizzate nell'ambiente del test"
      when: "si legge il body JSON di una risposta 200 di /api/health"
      then: "le chiavi del body sono esattamente status, db e version e nessun valore contiene DATABASE_URL o APP_SESSION_SECRET"

  target_tests:
    - file: "tests/integration/health.test.ts"
      covers: [AC-603-1, AC-603-2, AC-603-3, AC-603-4]

  security_notes:
    - "OWASP A02:2025 Security Misconfiguration — CWE-200: endpoint pubblico che espone solo tre campi; nessun messaggio d'errore, host, versione delle dipendenze o variabile d'ambiente."
    - "OWASP A01:2025 Broken Access Control — CWE-862: l'eccezione nel proxy riguarda solo il percorso esatto /api/health, non un prefisso, così nessun'altra API diventa pubblica per errore."
    - "OWASP A06:2025 Insecure Design — CWE-400: solo SELECT 1 con timeout di 2 s e risposta no-store; nessuna operazione costosa invocabile in modo anonimo."

  out_of_scope:
    - "Configurazione del servizio di monitoraggio esterno (azione dell'utente)."
    - "Status page pubblica."

- id: T-604
  title: "Backup logico del database e prova di ripristino verificata"
  macrotask: "observability-ops"
  depends_on: [T-203]

  objective: >
    Fornire script di backup e ripristino basati su pg_dump e pg_restore, provati sul
    container Postgres di test con conteggi e hash identici dopo il restore, con una
    guardia contro il ripristino accidentale in produzione, e documentare le garanzie
    di backup dei piani Supabase.

  definition_of_done:
    - "scripts/db-backup.mjs: esegue pg_dump in formato custom (--format=custom --no-owner --no-privileges) verso un file con timestamp in backups/; sorgente = URL passata con --url oppure container Docker passato con --container (via docker exec, il caso usato dal test); la password dell'URL non compare mai in stdout o stderr."
    - "scripts/db-restore.mjs: esegue pg_restore (--clean --if-exists --no-owner) verso un database di destinazione indicato in modo esplicito; rifiuta con exit code 2 una destinazione il cui host coincide con PRODUCTION_DB_HOST (T-202, T-203) se manca il flag --confirm-production."
    - "Script npm db:backup e db:restore; backups/ e i file .dump in .gitignore."
    - "Versioni: lo script stampa la versione del client pg_dump e quella del server; pg_dump non esporta da un server di major più recente della propria, quindi una differenza produce un errore esplicito."
    - "docs/OPERATIONS.md, sezione «Backup e ripristino», con i fatti verificati sulla documentazione Supabase il 2026-10-02: il piano Free non ha backup giornalieri automatici e va esportato con supabase db dump o pg_dump; Pro conserva 7 giorni di backup giornalieri, Team 14, Enterprise fino a 30; il Point-in-Time Recovery è un add-on per Pro, Team ed Enterprise e richiede almeno l'add-on di compute Small. La sezione indica anche frequenza del backup logico, conservazione fuori dal repo con accesso ristretto e una prova di ripristino periodica su un Postgres locale in Docker con gli stessi controlli di AC-604-1 e AC-604-2 (niente staging, D-04 emendata 2026-10-05)."
    - "Piano Supabase Free deciso dall'utente (D-31): niente backup giornalieri automatici, quindi il backup logico periodico è la sola copia; frequenza e conservazione proposte in docs/OPERATIONS.md e da confermare con l'utente."

  acceptance_criteria:
    - id: AC-604-1
      given: "DB di test nel container con dati seminati (3 utenti, 2 progetti, 3 sezioni, 500 keyword_candidates, 2 job, 2 app_settings)"
      when: "si esegue db-backup.mjs con --container e poi db-restore.mjs verso il nuovo database kwb_restore_check"
      then: "per ogni tabella dello schema public, compresa _prisma_migrations, count(*) è uguale tra origine e copia"
    - id: AC-604-2
      given: "lo stesso backup ripristinato in kwb_restore_check"
      when: "si calcola md5 della concatenazione di id e keyword di keyword_candidates ordinata per id, in origine e nella copia"
      then: "i due hash sono identici"
    - id: AC-604-3
      given: "PRODUCTION_DB_HOST=db.prod.example e una destinazione con host db.prod.example"
      when: "si esegue db-restore.mjs senza --confirm-production"
      then: "lo script esce con codice 2, stampa un messaggio che cita PRODUCTION_DB_HOST e non avvia alcun processo pg_restore"
    - id: AC-604-4
      given: "URL di origine con password 'pw-segreta-77'"
      when: "si esegue db-backup.mjs con --url"
      then: "né stdout né stderr contengono 'pw-segreta-77'"

  target_tests:
    - file: "tests/integration/backup-restore.test.ts"
      covers: [AC-604-1, AC-604-2, AC-604-3, AC-604-4]

  security_notes:
    - "OWASP A02:2025 Security Misconfiguration — CWE-530 (esposizione dei file di backup): il dump contiene hash di password e token OAuth cifrati; backups/ e i .dump sono in .gitignore, i file vanno conservati fuori dal repo con accesso ristretto e mai caricati come artifact della CI."
    - "OWASP A08:2025 Software or Data Integrity Failures — CWE-353 (verifica d'integrità mancante): un backup è valido solo dopo un restore con conteggi e hash identici; la prova periodica su un Postgres locale in Docker è parte della procedura."
    - "OWASP A06:2025 Insecure Design — CWE-693: il restore rifiuta l'host di produzione senza un flag esplicito; CWE-532: la password dell'URL non viene mai stampata."

  out_of_scope:
    - "Backup automatici pianificati (cron) e cifratura dei dump."
    - "Acquisto di add-on Supabase come il PITR (decisione dell'utente)."

- id: T-605
  title: "Pipeline di rilascio: PR, CI e checkpoint verdi, poi produzione"
  macrotask: "observability-ops"
  depends_on: [T-110, T-203]

  objective: >
    Interrompere l'accoppiamento per cui ogni push su master va in produzione senza
    passaggi: rilascio documentato tramite PR con CI e checkpoint verdi (niente
    staging, D-04), protezione del branch attivata e un Ignored Build Step che salta le
    build dei commit che toccano solo documentazione.

  definition_of_done:
    - "scripts/vercel-ignore-build.mjs: legge VERCEL_GIT_PREVIOUS_SHA e VERCEL_GIT_COMMIT_SHA (variabili di sistema Vercel; la prima è esposta solo quando un Ignored Build Step è configurato ed è vuota al primo deploy di un branch), ricava i file cambiati con git diff --name-only e decide con la funzione pura shouldSkipBuild(files): exit 0 (build annullata, stato CANCELED) solo se tutti i file stanno sotto docs/; exit 1 (build normale) in ogni altro caso, compresi SHA precedente vuoto o git diff in errore."
    - "vercel.json: ignoreCommand 'node scripts/vercel-ignore-build.mjs' (secondo la documentazione Vercel sovrascrive l'Ignored Build Step delle impostazioni del progetto: exit 1 prosegue, exit 0 annulla); buildCommand introdotto da T-202 invariato."
    - "docs/RELEASE.md: flusso branch, checkpoint Trueline verde, PR, CI verde (job di T-110), merge su master, produzione; niente staging: le Preview leggono il DB di produzione senza applicare migrazioni né seed (T-202, D-04); checklist di rilascio (migrazioni presenti, nuove variabili in tutte le colonne di docs/ENVIRONMENTS.md, npm run env:check di T-203 con l'avviso 'PREVIEW USA IL DB DI PRODUZIONE' atteso, controllo di /api/health dopo il deploy); procedura di rollback (verificare nella documentazione Vercel la funzione di rollback al deploy precedente) e nota sulle migrazioni non reversibili."
    - "Protezione del branch master attivata dall'agente via API GitHub (decisione dell'utente del 2026-10-05): PR obbligatoria, status check obbligatori checks, integration, e2e e build, niente force push né cancellazione del branch; configurazione documentata in docs/RELEASE.md e riletta con gh api dopo l'attivazione, esito in SESSION-STATE."
    - "Nota in docs/RELEASE.md: secondo la documentazione Vercel anche le build annullate dall'Ignored Build Step contano nelle quote di deploy."

  acceptance_criteria:
    - id: AC-605-1
      given: "file cambiati 'docs/blueprint/04-stack-upgrade.md' e 'docs/RELEASE.md' con git diff simulato"
      when: "si esegue lo script"
      then: "il processo esce con codice 0 e stampa che il commit tocca solo documentazione"
    - id: AC-605-2
      given: "file cambiati 'docs/README.md' e 'app/page.tsx', e in un secondo caso il solo 'package-lock.json'"
      when: "si esegue lo script"
      then: "in entrambi i casi il processo esce con codice 1"
    - id: AC-605-3
      given: "VERCEL_GIT_PREVIOUS_SHA vuota, e in un secondo caso git diff che termina con errore"
      when: "si esegue lo script"
      then: "in entrambi i casi il processo esce con codice 1, cioè la build procede"
    - id: AC-605-4
      given: "repository aggiornato"
      when: "il test legge vercel.json"
      then: "ignoreCommand vale 'node scripts/vercel-ignore-build.mjs' e buildCommand coincide con il valore introdotto da T-202"

  target_tests:
    - file: "tests/unit/vercel-ignore-build.test.ts"
      covers: [AC-605-1, AC-605-2, AC-605-3, AC-605-4]

  security_notes:
    - "OWASP A08:2025 Software or Data Integrity Failures — CWE-284 (controllo d'accesso improprio sul ramo di produzione): oggi ogni push su master va in produzione senza CI; con branch protection e status check obbligatori in produzione arriva solo codice passato da PR, CI e checkpoint."
    - "OWASP A02:2025 Security Misconfiguration — CWE-668: senza staging la Preview legge il DB di produzione ma non applica migrazioni né seed (T-202, D-04); il rischio residuo è accettato con D-05."
    - "Fail-safe: qualunque errore dello script porta alla build normale (exit 1), mai a saltare in silenzio un deploy che contiene codice; lo script non legge segreti e non stampa variabili d'ambiente (CWE-532)."

  out_of_scope:
    - "Deploy pilotato da GitHub Actions al posto dell'integrazione Git di Vercel."
    - "Rilasci canary o graduali."
```

## Dipendenze implicite (non nel DAG, da confermare)

Gli ID e i `depends_on` sono quelli dell'outline; questi artefatti sono usati ma prodotti da task non a monte nel DAG. Sono soddisfatti se i macrotask si costruiscono in ordine numerico:
- T-601 usa `lib/env.ts` (T-201), `docs/ENVIRONMENTS.md` (T-203), `app/global-error.tsx` (T-502) e la CSP (T-505).
- T-602 integra `withApiErrors` (T-503) e legge `LOG_LEVEL` da `lib/env.ts` (T-201). Proposta al coordinatore: aggiungere T-503 ai `depends_on` di T-602.
- T-605 cita nella checklist `/api/health` (T-603).

## Fonti verificate (2026-10-02)

- Sentry, setup manuale Next.js (docs.sentry.io): file `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `onRequestError = Sentry.captureRequestError`, `withSentryConfig`; `npm view @sentry/nextjs@11.2.0` per peer ed engines.
- Supabase, Database Backups (supabase.com/docs/guides/platform/backups): retention per piano e PITR come add-on.
- Vercel: Ignored Build Step e `ignoreCommand` (exit 1 prosegue, exit 0 annulla; le build annullate contano nelle quote), variabili di sistema `VERCEL_GIT_PREVIOUS_SHA` e `VERCEL_GIT_COMMIT_SHA`.

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
