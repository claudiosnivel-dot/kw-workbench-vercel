# 01-foundation — Macrotask `foundation`

> Rete di sicurezza prima di toccare il codice: test, lint/typecheck, E2E, caratterizzazione, oracoli Trueline e CI; nasce dal rilievo dell'audit 2026-10-02 «nessun test, nessuna configurazione ESLint, nessuna CI» (D-01, D-02, D-22).

## Obiettivo del macrotask

Costruire la rete di sicurezza richiesta da D-01 prima di qualunque modifica al codice: oggi il repository
non ha alcun test, nessuna configurazione ESLint (lo script `lint` chiama `next lint` senza config), nessun
typecheck come comando e nessuna CI. Il macrotask introduce Vitest con un Postgres di test in Docker,
Playwright con baseline visive, quattro suite di caratterizzazione (autenticazione, isolamento tra utenti,
pipeline di estrazione, export) che fotografano il comportamento attuale inclusi i difetti noti, gli oracoli
Trueline (knip con baseline del morto preesistente, contratto di altitudine D-22) e una CI GitHub Actions che
non tocca mai database remoti. Al termine, ogni macrotask successivo dispone di comandi che diventano rossi
se rompe un comportamento esistente.

## Task atomici

```yaml
- id: T-101
  title: "Infrastruttura di test: Vitest + Postgres di test in Docker"
  macrotask: "foundation"
  depends_on: []

  objective: >
    Introdurre da zero l'infrastruttura di test (oggi nel repo non esiste alcun
    test né alcuna configurazione di test): Vitest 5 con i progetti unit,
    component e integration, un Postgres 16 di test in Docker, gli helper
    condivisi per DB, sessione e invocazione dei route handler App Router, e una
    guardia che impedisce ai test d'integrazione di connettersi a un database non
    locale.

  definition_of_done:
    - "vitest.config.ts definisce quattro progetti: unit (tests/unit, environment node), component (tests/component, environment jsdom con @testing-library/react e @testing-library/jest-dom), integration (tests/integration, environment node, fileParallelism disattivato perché il DB è condiviso), tooling (tests/tooling, environment node, per i test di lint, typecheck, oracoli, architettura e CI di T-102, T-108, T-109, T-110); alias @/ risolto come in tsconfig.json"
    - "docker-compose.test.yml avvia postgres:16 sulla porta host 54329 con database kw_workbench_test e credenziali solo locali; .env.test.example documenta TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/kw_workbench_test"
    - "package.json: script test (tutti i progetti), test:unit, test:component, test:integration, test:tooling; il globalSetup del progetto integration esegue prima la guardia e poi prisma migrate deploy con DATABASE_URL e DIRECT_URL uguali a TEST_DATABASE_URL"
    - "Il setup del progetto integration imposta DATABASE_URL = TEST_DATABASE_URL e un APP_SESSION_SECRET fittizio prima di qualunque import di lib/prisma.ts (il client Prisma è un singleton creato all'import)"
    - "tests/helpers/db-guard.ts esporta assertLocalTestDatabase(url): accetta solo gli host localhost, 127.0.0.1 e ::1; in ogni altro caso, o se TEST_DATABASE_URL manca, lancia un errore che nomina l'host o la variabile e mai la password"
    - "tests/helpers/db.ts esporta resetDatabase(), che svuota con TRUNCATE ... CASCADE tutte le tabelle dello schema public tranne _prisma_migrations"
    - "tests/helpers/auth.ts esporta createUserWithSession({ role, status, isRootAdmin }) che crea l'utente via Prisma e restituisce { user, cookie } con cookie = kwb_session=<token> firmato da createSessionToken di lib/auth/session.ts"
    - "tests/helpers/http.ts esporta callRoute(handler, { method, url, body, cookie, params }) che costruisce un NextRequest (serve a request.nextUrl nelle rotte results ed export) e passa il context { params: Promise.resolve(params) } come App Router"
    - "Nuove devDependencies (vitest 5.x, jsdom, @testing-library/react, @testing-library/jest-dom) con versione esatta e package-lock.json aggiornato"

  acceptance_criteria:
    - id: AC-101-1
      given: "il container di docker-compose.test.yml avviato e TEST_DATABASE_URL che punta a localhost:54329"
      when: "si esegue npm run test:integration"
      then: "smoke.db.test.ts passa: SELECT 1 restituisce 1 e _prisma_migrations ha tante righe con finished_at valorizzato quante sono le cartelle in prisma/migrations"
    - id: AC-101-2
      given: "TEST_DATABASE_URL uguale a postgresql://u:pw-segreta@db.example.supabase.co:5432/postgres, oppure non impostata"
      when: "si chiama assertLocalTestDatabase"
      then: "lancia un errore il cui messaggio contiene db.example.supabase.co (o TEST_DATABASE_URL se assente) e non contiene pw-segreta; con postgresql://postgres:postgres@localhost:54329/kw_workbench_test non lancia"
    - id: AC-101-3
      given: "il progetto component con jsdom e next/navigation mockato"
      when: "smoke.test.tsx renderizza LogoutButton di components/logout-button.tsx"
      then: "getByRole('button', { name: 'Esci' }) trova esattamente un elemento"
    - id: AC-101-4
      given: "un DB di test con righe in users e projects"
      when: "si chiama resetDatabase() e poi createUserWithSession()"
      then: "dopo il reset users e projects contano 0 righe e _prisma_migrations conserva le sue righe; verifySessionToken applicato al token del cookie restituito ha userId uguale all'id dell'utente creato"

  target_tests:
    - file: "tests/integration/smoke.db.test.ts"
      covers: [AC-101-1, AC-101-4]
    - file: "tests/unit/test-db-guard.test.ts"
      covers: [AC-101-2]
    - file: "tests/component/smoke.test.tsx"
      covers: [AC-101-3]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-668: resetDatabase esegue TRUNCATE, quindi ogni esecuzione d'integrazione passa da assertLocalTestDatabase prima di connettersi; un TEST_DATABASE_URL remoto (es. il Supabase di produzione) fa fallire il globalSetup senza migrazioni né TRUNCATE"
    - "A07:2025 Authentication Failures, CWE-798: il segreto di sessione dei test è un valore fittizio definito nella config di Vitest; nessun file .env reale viene letto dai test"
    - "A03:2025 Software Supply Chain Failures, CWE-1357: devDependencies con versione esatta e lockfile versionato"

  out_of_scope:
    - "E2E Playwright (T-103) e CI (T-110)"
    - "Test di caratterizzazione del comportamento applicativo (T-104, T-105, T-106, T-107)"

- id: T-102
  title: "Lint e typecheck come comandi"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Rendere lint e typecheck due comandi deterministici e non interattivi. Oggi
    lo script lint chiama next lint senza alcuna configurazione ESLint (il comando
    chiede di crearla) e non esiste uno script di typecheck; tsconfig.json ha
    incremental attivo, quindi tsc scriverebbe tsconfig.tsbuildinfo nella radice
    del repo.

  definition_of_done:
    - "eslint.config.mjs in formato flat con le regole di eslint-config-next allineata alla versione di next installata (15.5.x) ed ESLint 9; ignora .next, node_modules, coverage, playwright-report, test-results e tests/fixtures/tooling"
    - "package.json: lint = eslint . --max-warnings=0 (sostituisce next lint ed è non interattivo); typecheck = tsc --noEmit"
    - "Il codice attuale passa il lint: le violazioni preesistenti sono corrette solo se meccaniche (import inutilizzati, escape in JSX); ogni regola declassata è elencata in eslint.config.mjs con un commento che ne spiega il motivo"
    - "tsconfig.tsbuildinfo aggiunto a .gitignore"
    - "Fixture tests/fixtures/tooling/lint-violation.tsx (hook chiamato dentro un if) e tests/fixtures/tooling/type-error.ts con un tsconfig.json dedicato nella stessa cartella, esclusi dal lint e dal typecheck del repo"

  acceptance_criteria:
    - id: AC-102-1
      given: "il repo con le dipendenze installate"
      when: "lint-typecheck.test.ts esegue npm run lint e npm run typecheck con stdin chiuso"
      then: "entrambi i comandi terminano con exit code 0 entro il timeout del test, senza richieste interattive"
    - id: AC-102-2
      given: "la fixture tests/fixtures/tooling/lint-violation.tsx"
      when: "si esegue npx eslint --no-ignore sulla sola fixture"
      then: "exit code diverso da 0 e l'output nomina la regola react-hooks/rules-of-hooks"
    - id: AC-102-3
      given: "la fixture tests/fixtures/tooling/type-error.ts con il suo tsconfig"
      when: "si esegue npx tsc --noEmit -p tests/fixtures/tooling/tsconfig.json"
      then: "exit code diverso da 0 e l'output contiene il codice di errore TS2322"
    - id: AC-102-4
      given: "npm run typecheck appena eseguito"
      when: "si eseguono git status --porcelain e git check-ignore tsconfig.tsbuildinfo"
      then: "nessuna riga di git status nomina tsconfig.tsbuildinfo e git check-ignore esce con 0"

  target_tests:
    - file: "tests/tooling/lint-typecheck.test.ts"
      covers: [AC-102-1, AC-102-2, AC-102-3, AC-102-4]

  security_notes:
    - "A03:2025 Software Supply Chain Failures, CWE-1357: eslint, eslint-config-next e plugin aggiunti come devDependencies con versione esatta; nessuno script postinstall nuovo"

  out_of_scope:
    - "Passaggio a eslint-config-next 16 (T-404); ESLint resta 9.39.x (D-03)"
    - "TypeScript 6.0 (T-402)"

- id: T-103
  title: "E2E Playwright: smoke di login e baseline visive"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Introdurre Playwright con l'app avviata sul DB di test e un utente seed: uno
    smoke del login e le baseline visive di /login, dashboard e pagina risultati,
    che serviranno da confronto per la migrazione a Tailwind 4 (T-405).

  definition_of_done:
    - "@playwright/test 1.63.x come devDependency; playwright.config.ts con testDir tests/e2e, solo chromium, viewport 1280x800, locale it-IT, timezoneId Europe/Rome, toHaveScreenshot con maxDiffPixelRatio 0.01 e animations disabled, updateSnapshots none quando CI=true"
    - "webServer di Playwright: next build e next start sulla porta 3100 con env esplicite per tutte le variabili lette dall'app: DATABASE_URL e DIRECT_URL = TEST_DATABASE_URL (passato da assertLocalTestDatabase di T-101), APP_SESSION_SECRET e APP_ENCRYPTION_KEY di test lunghe almeno 32 caratteri e non placeholder (next start gira con NODE_ENV=production e T-201 le valida), APP_AUTH_ENABLED=true, APP_COOKIE_SECURE=false, NEXT_TELEMETRY_DISABLED=1, variabili Google vuote"
    - "tests/e2e/global-setup.ts: assertLocalTestDatabase, prisma migrate deploy, resetDatabase, poi crea e2e-user (password da E2E_USER_PASSWORD con default fittizio) con user_onboarding_progress.status COMPLETED (altrimenti app/page.tsx redirige a /onboarding), un progetto con la sezione Generale e 30 keyword_candidates deterministiche con timestamp fissi"
    - "Script npm test:e2e = playwright test; playwright-report e test-results in .gitignore"
    - "Baseline committate in tests/e2e/visual.spec.ts-snapshots/ per /login, dashboard (/) e risultati (/projects/<id>/results), generate su Linux (CI o container ufficiale Playwright della stessa versione) con suffisso di piattaforma nel nome; su piattaforme diverse da Linux visual.spec.ts è saltato con test.skip esplicito"
    - "Elementi con date o contatori variabili mascherati con l'opzione mask di toHaveScreenshot"

  acceptance_criteria:
    - id: AC-103-1
      given: "il server di test avviato e l'utente e2e-user presente"
      when: "smoke.spec.ts compila il form di /login con credenziali valide e lo invia"
      then: "l'URL finale ha pathname /, il context del browser contiene il cookie kwb_session e almeno un pulsante Esci è visibile"
    - id: AC-103-2
      given: "lo stesso server"
      when: "si invia il form di /login con password errata"
      then: "il pathname resta /login e il testo Credenziali non valide è visibile"
    - id: AC-103-3
      given: "le tre baseline committate in tests/e2e/visual.spec.ts-snapshots/"
      when: "si esegue npx playwright test tests/e2e/visual.spec.ts su Linux con CI=true"
      then: "i tre confronti toHaveScreenshot passano con maxDiffPixelRatio 0.01 e il comando esce con 0; rimuovendo una baseline il comando esce con codice diverso da 0 senza crearla"

  target_tests:
    - file: "tests/e2e/smoke.spec.ts"
      covers: [AC-103-1, AC-103-2]
    - file: "tests/e2e/visual.spec.ts"
      covers: [AC-103-3]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-668: il webServer E2E imposta esplicitamente ogni variabile usata dall'app, così i valori del file .env locale (che Next carica in automatico e che può puntare a un DB reale o contenere token Google) non prevalgono; il DB è solo quello verificato da assertLocalTestDatabase"
    - "A07:2025, CWE-798: la password di e2e-user è un valore di test, mai una credenziale reale"

  out_of_scope:
    - "Confronto visivo dopo Tailwind 4 (T-405)"
    - "E2E di pagine di errore, header di sicurezza e flussi funzionali (T-502, T-505, T-1205)"

- id: T-104
  title: "Caratterizzazione: autenticazione e sessione"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Fotografare con test di caratterizzazione il comportamento attuale di login,
    registrazione, logout, sessione e middleware prima di qualunque modifica
    (D-01). I difetti noti sono fotografati così come sono e marcati come
    asserzioni impattate dai task che li correggeranno (T-301, T-302, T-303).

  definition_of_done:
    - "tests/integration/characterization/auth.char.test.ts invoca i route handler reali di app/api/auth/login, register, logout e session tramite tests/helpers/http.ts e la funzione middleware di middleware.ts con NextRequest costruite nel test"
    - "Env esplicite nel test: APP_AUTH_ENABLED=true, APP_AUTH_USERNAME e APP_AUTH_PASSWORD di test, APP_COOKIE_SECURE=auto con NODE_ENV=test, APP_SESSION_MAX_AGE_SECONDS non impostata (default 604800)"
    - "Gli attributi del cookie si leggono dall'header Set-Cookie della risposta"
    - "Le asserzioni sui difetti noti portano il commento // impacted-by: T-301, // impacted-by: T-302 o // impacted-by: T-303; il loro aggiornamento futuro passa da gate umano"
    - "Nessuna modifica al codice di produzione: il task aggiunge solo test"

  acceptance_criteria:
    - id: AC-104-1
      given: "un utente ACTIVE e un utente SUSPENDED con password note"
      when: "si chiama POST /api/auth/login con credenziali valide, poi con password errata, poi con l'utente sospeso"
      then: "rispettivamente: 200 con body {success: true} e Set-Cookie kwb_session con HttpOnly, SameSite=lax, Path=/ e Max-Age=604800 senza Secure; 401 con error 'Credenziali non valide'; 403 con error che inizia con 'Account sospeso'"
    - id: AC-104-2
      given: "la tabella users vuota"
      when: "si chiama POST /api/auth/register con uno username nuovo, poi di nuovo con lo stesso username, poi POST /api/auth/logout"
      then: "la prima risposta è 200 con cookie kwb_session e users conta 2 righe (l'utente di bootstrap APP_AUTH_USERNAME con role ADMIN e is_root_admin true, più il nuovo SUBSCRIBER); la seconda è 400 con error 'Username gia in uso'; il logout risponde 200 con Set-Cookie kwb_session vuoto e Max-Age=0"
    - id: AC-104-3
      given: "nessun cookie di sessione, poi il cookie di un utente ACTIVE"
      when: "si invoca middleware su /projects e su /api/projects e si chiama GET /api/auth/session"
      then: "da anonimo /projects risponde 307 con location di pathname /login e parametro next uguale a /projects, /api/projects risponde 401 con body {error: 'Unauthorized'}, la sessione risponde 401 con {authenticated: false, authEnabled: true}; da autenticato la sessione risponde 200 con userId uguale all'id dell'utente"
    - id: AC-104-4
      given: "i difetti noti dell'audit 2026-10-02"
      when: "si invoca middleware con Cookie kwb_session=abc.!!!, poi middleware su /projects/x/results?view=all senza cookie, poi LoginPage di app/login/page.tsx con searchParams next=//evil.com"
      then: "la prima chiamata rigetta la promessa (impacted-by T-301); la location del redirect ha next uguale a /projects/x/results senza query (impacted-by T-302); il LoginForm restituito riceve nextPath uguale a //evil.com (impacted-by T-303)"

  target_tests:
    - file: "tests/integration/characterization/auth.char.test.ts"
      covers: [AC-104-1, AC-104-2, AC-104-3, AC-104-4]

  security_notes:
    - "A07:2025 Authentication Failures, CWE-1004 e CWE-1275: il test blocca come regressione HttpOnly e SameSite=lax del cookie di sessione; la loro rimozione accidentale fa fallire la caratterizzazione"
    - "A01:2025 Broken Access Control, CWE-601: l'open redirect con next=//evil.com è fotografato come difetto (impacted-by T-303), non come comportamento atteso"
    - "A07:2025, CWE-798: i token dei test sono firmati con il segreto fittizio della config di test, mai con un segreto reale"

  out_of_scope:
    - "Correzione dei difetti fotografati (T-301, T-302, T-303)"
    - "Revoca delle sessioni e token minimale (T-501)"

- id: T-105
  title: "Caratterizzazione: progetti, sezioni, risultati e isolamento tra utenti"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Fotografare l'isolamento applicativo tra utenti (route-authz, D-02) su
    progetti, sezioni, risultati, export ed estrazione, più due invarianti di
    dominio: la creazione di un progetto crea la sezione iniziale e l'ultima
    sezione non si può eliminare. È la rete che proteggerà il passaggio ai
    workspace (T-1502).

  definition_of_done:
    - "tests/integration/characterization/projects-authz.char.test.ts crea gli utenti A e B con createUserWithSession; A ha un progetto con una sezione, 3 seed e 5 keyword_candidates; B ha un proprio progetto con 2 keyword_candidates"
    - "Rotte esercitate tramite tests/helpers/http.ts: app/api/projects/route.ts (POST), app/api/projects/[id]/route.ts (GET, PATCH, DELETE), subprojects/route.ts (GET, POST), subprojects/[subprojectId]/route.ts (GET, PATCH, DELETE), results/route.ts (PATCH), export/route.ts (GET), run/route.ts (POST)"
    - "Dopo ogni tentativo di B il test rilegge il DB e verifica che i dati di A siano invariati (nome del progetto, numero di sezioni, seed, review_status)"
    - "Nessuna modifica al codice di produzione"

  acceptance_criteria:
    - id: AC-105-1
      given: "il progetto di A e la sessione di B"
      when: "B chiama GET, PATCH e DELETE su /api/projects/{idA}"
      then: "ogni risposta è 404 con error 'Progetto non trovato' e dopo le chiamate il progetto di A esiste con nome invariato"
    - id: AC-105-2
      given: "la sezione S del progetto di A e la sessione di B"
      when: "B chiama GET, PATCH e DELETE su /api/projects/{idA}/subprojects/{S}, GET su /api/projects/{idA}/export e POST su /api/projects/{idA}/run"
      then: "le rotte di sezione rispondono 404 con error 'Sezione non trovata', export e run rispondono 404 con error 'Progetto non trovato' e jobs non contiene righe per il progetto di A"
    - id: AC-105-3
      given: "la sessione di A e gli id delle 2 keyword_candidates di B"
      when: "A chiama PATCH /api/projects/{idA}/results con action approve e quegli id"
      then: "la risposta è 200 con {success: true} e le 2 candidate di B hanno ancora review_status pending (0 righe modificate)"
    - id: AC-105-4
      given: "la sessione di A"
      when: "A chiama POST /api/projects con un nome valido e poi DELETE sull'unica sezione del nuovo progetto"
      then: "la creazione risponde 201 con data.initial_subproject_id non nullo, il progetto ha 1 sezione di nome Generale e position 0 e default_subproject_id uguale a quell'id; la DELETE risponde 400 con error che inizia con 'Non puoi eliminare l'ultima sezione' e la sezione esiste ancora"

  target_tests:
    - file: "tests/integration/characterization/projects-authz.char.test.ts"
      covers: [AC-105-1, AC-105-2, AC-105-3, AC-105-4]

  security_notes:
    - "A01:2025 Broken Access Control, CWE-639 (IDOR): il test fissa che ogni rotta progetto, sezione, risultati, export e run filtra per owner_user_id dell'utente di sessione e risponde 404 (non 403) a chi non è proprietario, senza rivelare l'esistenza della risorsa"
    - "A01:2025, CWE-639: la PATCH dei risultati con id di un altro progetto non modifica righe perché il where include il project_id già verificato"

  out_of_scope:
    - "Autorizzazione per workspace e ruoli (T-1502)"
    - "TOCTOU check-then-update per solo id (T-1502)"

- id: T-106
  title: "Caratterizzazione: pipeline di estrazione (golden master con provider mock)"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Fotografare l'output di runExtractionPipeline (lib/modules/pipeline/extraction.ts)
    con autocomplete e metriche MOCK e seed fisse, come golden master che renderà
    visibile ogni cambiamento di normalizzazione, classificazione, filtro brand,
    punteggio e salvataggio introdotto dai task successivi.

  definition_of_done:
    - "Fixture: progetto con language_code it, country_code IT, autocomplete_provider MOCK, metrics_provider MOCK, exclude_brands true, auto_classification true, scoring_profile balanced; una sezione con 3 seed fisse (caffè moka, amazon kindle offerte, how to learn seo); pattern e brand globali uguali ai default di prisma/seed.ts inseriti dal test"
    - "MAX_EXPANSION_QUERIES=250 e AUTOCOMPLETE_CONCURRENCY=6 impostate nel test: con 3 seed le query (45 per seed) restano sotto il limite, così l'ordine non deterministico delle seed (include seeds senza orderBy, corretto in T-701) non cambia l'insieme delle query"
    - "fetch globale sostituito da uno stub che registra le chiamate e fa fallire il test se invocato"
    - "Snapshot in tests/integration/characterization/__snapshots__/pipeline.golden.test.ts.snap: per ogni candidata keyword, normalized_keyword, canonical_keyword, score, search_intent, keyword_type, brand_status, review_status, selected_for_export, metrics_status, avg_monthly_searches; ordinate per canonical_keyword e poi keyword; id, timestamp, source e source_query esclusi (dipendono dall'ordine delle seed)"
    - "Gli aggiornamenti futuri dello snapshot (T-306, T-702, T-705, T-707) passano da gate umano con diff motivato"

  acceptance_criteria:
    - id: AC-106-1
      given: "la fixture con 3 seed, provider MOCK e i default globali di prisma/seed.ts"
      when: "si esegue runExtractionPipeline(subprojectId)"
      then: "l'elenco ordinato delle candidate con i campi dichiarati coincide con lo snapshot committato e lo stub di fetch registra 0 chiamate"
    - id: AC-106-2
      given: "la stessa esecuzione"
      when: "si confronta il riepilogo restituito con il DB"
      then: "queries vale 135, storedCandidates è uguale al numero di righe keyword_candidates della sezione e l'oggetto {queries, rawSuggestions, dedupedCandidates, storedCandidates} coincide con lo snapshot"
    - id: AC-106-3
      given: "una prima esecuzione completata e una candidata portata a review_status approved"
      when: "si riesegue runExtractionPipeline sulla stessa sezione"
      then: "snapshot e numero di righe sono identici alla prima esecuzione e la candidata approvata torna pending (impacted-by T-705)"
    - id: AC-106-4
      given: "una sezione con 0 seed e 4 keyword_candidates preesistenti"
      when: "si esegue runExtractionPipeline"
      then: "restituisce {queries: 0, rawSuggestions: 0, dedupedCandidates: 0, storedCandidates: 0} e la sezione ha 0 righe in keyword_candidates (impacted-by T-706)"

  target_tests:
    - file: "tests/integration/characterization/pipeline.golden.test.ts"
      covers: [AC-106-1, AC-106-2, AC-106-3, AC-106-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-668: nessuna chiamata di rete nei test; lo stub di fetch fallisce al primo uso, così un provider reale (GOOGLE_DIRECT, GOOGLE_KEYWORD_PLANNER) attivato per errore non può usare credenziali o quote reali"

  out_of_scope:
    - "Correzioni di normalizzazione, brand, classificazione e punteggio (T-702, T-703, T-704, T-707)"
    - "Budget di query equo e orderBy delle seed (T-701)"

- id: T-107
  title: "Caratterizzazione: export CSV/XLSX/JSON"
  macrotask: "foundation"
  depends_on: [T-101]

  objective: >
    Fotografare il formato attuale degli export di
    app/api/projects/[id]/export/route.ts e lib/modules/export.ts (intestazioni,
    separatori, numero di righe, header HTTP e semantica degli scope), prima della
    sostituzione di xlsx (T-406) e delle correzioni del CSV (T-804) e degli scope
    (T-807).

  definition_of_done:
    - "tests/integration/characterization/export.char.test.ts chiama GET della rotta export tramite tests/helpers/http.ts su una fixture di 12 keyword_candidates con i conteggi attesi per ogni scope (approved, selected, review, non-excluded, filtered con searchIntent=commercial) dichiarati in testa al file"
    - "La fixture include una candidata con brand_status allowed e review_status rejected e una keyword che inizia con il carattere = (esportata grezza)"
    - "Il CSV è letto come byte: si verificano assenza del BOM UTF-8, separatore virgola, terminatore LF e virgolette doppie attorno a ogni valore"
    - "L'XLSX è letto con exceljs aggiunto come devDependency con versione esatta: lettore indipendente dalla libreria xlsx che lo scrive, così il test sopravvive alla sostituzione di T-406"
    - "Le asserzioni destinate a cambiare portano // impacted-by: T-804 (CSV vuoto senza header, BOM, separatore, cella con =), T-807 (scope non-excluded con le rifiutate) o T-1003 (onboarding completato da qualunque export)"

  acceptance_criteria:
    - id: AC-107-1
      given: "la fixture di 12 candidate del proprietario"
      when: "si chiama GET /api/projects/{id}/export?format=csv&scope=non-excluded"
      then: "status 200, Content-Type text/csv; charset=utf-8, Cache-Control no-store, Content-Disposition con filename seo-god-mode-{id}-project-non-excluded-AAAA-MM-GG.csv; i primi byte non sono EF BB BF; la prima riga elenca le 22 colonne da subproject_name a score separate da virgola; le righe sono il conteggio atteso più 1"
    - id: AC-107-2
      given: "la stessa fixture"
      when: "si chiama l'export con format=xlsx e scope=selected"
      then: "Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; letto con exceljs il file ha un solo foglio keywords, la riga 1 contiene le 22 intestazioni nello stesso ordine del CSV e le righe dati sono pari al conteggio atteso per selected"
    - id: AC-107-3
      given: "la stessa fixture, con la candidata allowed e rejected"
      when: "si chiama l'export con format=json per ciascuno scope approved, selected, review, non-excluded e filtered con searchIntent=commercial"
      then: "ogni risposta è un array JSON di lunghezza pari al conteggio dichiarato per quello scope e l'array di non-excluded contiene la candidata rifiutata (impacted-by T-807)"
    - id: AC-107-4
      given: "un progetto senza candidate approvate e il proprietario con onboarding IN_PROGRESS"
      when: "si chiama l'export con format=csv e scope=approved"
      then: "status 200 con body di 0 byte, senza riga di intestazione (impacted-by T-804), e dopo la chiamata user_onboarding_progress.status del proprietario vale COMPLETED (impacted-by T-1003)"

  target_tests:
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-107-1, AC-107-2, AC-107-3, AC-107-4]

  security_notes:
    - "A05:2025 Injection, CWE-1236 (CSV Formula Injection): oggi una cella che inizia con = + - @ non viene neutralizzata; il test fotografa il valore grezzo con impacted-by T-804, non lo considera comportamento atteso"
    - "A01:2025 Broken Access Control, CWE-639: l'export resta filtrato per owner_user_id (isolamento coperto da T-105)"
    - "A03:2025 Software Supply Chain Failures, CWE-1357: exceljs con versione esatta"

  out_of_scope:
    - "Correzioni del CSV, streaming e scope (T-804, T-805, T-807)"
    - "Export Google Sheets (T-806)"

- id: T-108
  title: "Oracoli Trueline: knip, baseline d'igiene e file ignorati"
  macrotask: "foundation"
  depends_on: [T-101, T-102, T-103, T-109]

  objective: >
    Configurare gli oracoli Trueline sul repo: knip per il codice morto con le
    entry di Next (senza, pagine e route risultano inutilizzate), una baseline
    versionata del morto preesistente così che il gate blocchi solo il morto nuovo
    (L-COL-018), e l'esclusione da git degli artefatti locali degli oracoli.

  definition_of_done:
    - "knip come devDependency con versione esatta; knip.json con plugin next attivo, entry app/**/{page,layout,route}.{ts,tsx}, middleware.ts (proxy.ts dopo T-404), prisma/seed.ts, scripts/**/*.{mjs,ts} e i file di config (next.config.ts, tailwind.config.ts, postcss.config.js, vitest.config.ts, playwright.config.ts); project = app, components, lib, prisma, scripts, tests"
    - "tests/tooling/knip-baseline.json elenca il morto preesistente rilevato dall'audit: il file components/set-default-section-button.tsx (D-21 prevede di collegarlo in T-802, non di rimuoverlo); gli export isRootAdminUser, requireAdminUserFromCookies, requireRootAdminUserFromCookies (lib/auth/current-user.ts), il re-export SESSION_COOKIE_NAME di lib/auth/session.ts, getSettingValue (lib/integrations/app-settings.ts), runQueuedExtractionJobs e getJobStats (lib/modules/jobs/job-runner.ts), repairCommonMojibake (lib/text/encoding.ts), parseBoolean e toNumber (lib/utils.ts)"
    - "Il confronto è una funzione pura diffKnipAgainstBaseline(report, baseline) che normalizza le segnalazioni in triple (tipo, file, simbolo)"
    - "Script npm knip = knip --reporter json; ulteriori segnalazioni presenti al momento del task sono risolte in knip.json se falsi positivi di configurazione, altrimenti aggiunte alla baseline con una nota, previa approvazione umana"
    - ".gitignore contiene .trueline/* con la negazione !.trueline/hygiene-baseline.json (report, binari e baseline di sicurezza restano locali; la baseline d'igiene è versionata) e tsconfig.tsbuildinfo (aggiunto da T-102)"
    - "Baseline Trueline di sicurezza catturata con baseline.mjs capture in .trueline/baseline.json, non versionata"
    - "jscpd 4.x come devDependency con versione esatta: è l'oracolo di duplicazione dell'ecosistema postgres-jsts (min_tokens 50) e, con madge di T-109, serve alla cattura della baseline d'igiene"
    - "Baseline d'igiene catturata con baseline.mjs capture . --hygiene in .trueline/hygiene-baseline.json e committata: senza di essa il controllo 1 del checkpoint BUILD non può risultare verde"

  acceptance_criteria:
    - id: AC-108-1
      given: "knip.json committato"
      when: "oracles-config.test.ts esegue npx knip --reporter json"
      then: "tra i file inutilizzati non compare alcun page.tsx, layout.tsx o route.ts sotto app/, né middleware.ts, né prisma/seed.ts"
    - id: AC-108-2
      given: "tests/tooling/knip-baseline.json"
      when: "si confronta con diffKnipAgainstBaseline il report reale di knip e poi un report sintetico con un export inutilizzato in più"
      then: "per il report reale la differenza è vuota; per il report sintetico la differenza contiene esattamente 1 elemento con il simbolo aggiunto"
    - id: AC-108-3
      given: ".gitignore aggiornato"
      when: "si esegue git check-ignore su .trueline/baseline.json e su tsconfig.tsbuildinfo"
      then: "il comando esce con 0 per entrambi i percorsi"
    - id: AC-108-4
      given: ".gitignore aggiornato e la baseline d'igiene catturata"
      when: "si esegue git check-ignore su .trueline/hygiene-baseline.json e git ls-files .trueline/hygiene-baseline.json"
      then: "git check-ignore esce con 1 (file non ignorato) e git ls-files restituisce esattamente 1 riga con quel percorso"

  target_tests:
    - file: "tests/tooling/oracles-config.test.ts"
      covers: [AC-108-1, AC-108-2, AC-108-3, AC-108-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-538: .trueline/ contiene i report degli oracoli (gitleaks può riportare frammenti di segreti trovati); è ignorata da git e mai pubblicata come artefatto della CI"
    - "A03:2025 Software Supply Chain Failures, CWE-1357: knip e jscpd con versione esatta"

  out_of_scope:
    - "Rimozione del codice morto (T-1101, human-gated)"
    - "Collegamento di SetDefaultSectionButton (T-802, D-21)"

- id: T-109
  title: "Contratto di altitudine: tipi condivisi fuori dai moduli server"
  macrotask: "foundation"
  depends_on: [T-101, T-102]

  objective: >
    Rendere verificabile il contratto di altitudine D-22 (ui = components/**,
    domain = lib/modules/**, data = lib/prisma.ts, routes = app/**; vietati ui ->
    data, domain -> ui, domain -> routes) e correggere l'unica violazione nota:
    components/onboarding-project-targeting-form.tsx e
    components/onboarding-seeds-form.tsx importano tipi da
    lib/onboarding/progress.ts, che importa lib/prisma.ts.

  definition_of_done:
    - "lib/onboarding/types.ts esporta OnboardingProjectSnapshot e OnboardingSubprojectSnapshot usando solo import type da @prisma/client e nessun import di lib/prisma.ts"
    - "lib/onboarding/progress.ts importa e ri-esporta i tipi da lib/onboarding/types.ts senza duplicarli; i due componenti importano da lib/onboarding/types.ts"
    - "tests/tooling/architecture.test.ts usa madge (devDependency con versione esatta) su app, components e lib con tsConfig tsconfig.json (alias @/), estensioni ts e tsx e skipTypeImports disattivato: anche gli import type contano"
    - "La verifica è una funzione pura findForbiddenPaths(graph, rules) che restituisce i cammini proibiti secondo D-22: components/** -> lib/prisma.ts, lib/modules/** -> components/**, lib/modules/** -> app/**"
    - "npm run typecheck resta a exit 0 dopo lo spostamento"

  acceptance_criteria:
    - id: AC-109-1
      given: "il grafo madge del repo dopo lo spostamento dei tipi"
      when: "si chiama findForbiddenPaths con la regola components/** -> lib/prisma.ts"
      then: "restituisce un elenco vuoto"
    - id: AC-109-2
      given: "lo stesso grafo"
      when: "si chiama findForbiddenPaths con le regole lib/modules/** -> components/** e lib/modules/** -> app/**"
      then: "restituisce un elenco vuoto"
    - id: AC-109-3
      given: "un grafo sintetico components/x.tsx -> lib/y.ts -> lib/prisma.ts"
      when: "si chiama findForbiddenPaths con la regola components/** -> lib/prisma.ts"
      then: "restituisce 1 cammino uguale a components/x.tsx, lib/y.ts, lib/prisma.ts"
    - id: AC-109-4
      given: "i sorgenti di lib/onboarding/types.ts e dei due componenti di onboarding"
      when: "architecture.test.ts li legge"
      then: "lib/onboarding/types.ts non contiene lib/prisma né import non di tipo; entrambi i componenti importano da @/lib/onboarding/types e non da @/lib/onboarding/progress"

  target_tests:
    - file: "tests/tooling/architecture.test.ts"
      covers: [AC-109-1, AC-109-2, AC-109-3, AC-109-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-200: impedire che componenti client dipendano, anche transitivamente, dal modulo che crea il client Prisma e legge DATABASE_URL evita che codice server o riferimenti a segreti finiscano nel bundle del browser"

  out_of_scope:
    - "Altre duplicazioni di tipi tra componenti (T-1102)"
    - "Oracolo arch_check del checkpoint Trueline (configurato dal coordinatore in 00-INDEX)"

- id: T-110
  title: "CI GitHub Actions"
  macrotask: "foundation"
  depends_on: [T-101, T-102, T-103]

  objective: >
    Introdurre la CI (oggi non esiste .github): installazione, generazione del
    client Prisma, typecheck, lint, test unit e component, test d'integrazione con
    Postgres di servizio, E2E e build con env fittizie, senza alcun segreto del DB
    di produzione e senza migrazioni verso DB remoti.

  definition_of_done:
    - ".github/workflows/ci.yml attivato su push e pull_request verso master (mai pull_request_target), permissions contents: read a livello di workflow, concurrency che annulla le run superate dello stesso ref"
    - "Job checks: npm ci, npx prisma generate, npm run typecheck, npm run lint, npm run test:unit, npm run test:component, npm run test:tooling"
    - "Job integration ed e2e: service postgres:16 mappato su 54329, TEST_DATABASE_URL su localhost; e2e esegue npx playwright install --with-deps chromium e npm run test:e2e e carica il report come artefatto solo in caso di fallimento"
    - "Job build: next build con env fittizie generate nel job (APP_SESSION_SECRET e APP_ENCRYPTION_KEY casuali di 48 caratteri, DATABASE_URL e DIRECT_URL locali)"
    - "Node 22.x provvisorio, compatibile con engines >=20.0.0; il pin a 24.x è di T-407"
    - "Ogni azione referenziata in uses è fissata allo SHA di commit completo con un commento che riporta la versione"

  acceptance_criteria:
    - id: AC-110-1
      given: ".github/workflows/ci.yml"
      when: "ci-workflow.test.ts lo legge con il pacchetto yaml (devDependency)"
      then: "esistono i job checks, integration, e2e e build; gli step contengono npm ci, npx prisma generate e i comandi typecheck, lint, test:unit, test:component, test:tooling, test:integration, test:e2e e build; integration ed e2e dichiarano services.postgres con image postgres:16"
    - id: AC-110-2
      given: "lo stesso file"
      when: "si cercano riferimenti a segreti e URL di database"
      then: "0 occorrenze della stringa secrets. e ogni valore di DATABASE_URL, DIRECT_URL e TEST_DATABASE_URL ha host localhost o 127.0.0.1"
    - id: AC-110-3
      given: "lo stesso file"
      when: "si analizzano i comandi run e i trigger"
      then: "0 occorrenze di prisma db push, prisma migrate reset, vercel e pull_request_target; ogni step con prisma migrate deploy ha un env il cui URL punta a localhost"
    - id: AC-110-4
      given: "lo stesso file"
      when: "si leggono permissions e i valori di uses"
      then: "permissions a livello di workflow vale {contents: read} e ogni valore di uses termina con @ seguito da 40 caratteri esadecimali"

  target_tests:
    - file: "tests/tooling/ci-workflow.test.ts"
      covers: [AC-110-1, AC-110-2, AC-110-3, AC-110-4]

  security_notes:
    - "A03:2025 Software Supply Chain Failures, CWE-829: azioni fissate per SHA e npm ci con lockfile, così un tag spostato o una dipendenza non bloccata non entrano nella pipeline"
    - "A01:2025 Broken Access Control, CWE-272 (Least Privilege Violation): permissions contents: read e nessun pull_request_target, così le PR da fork non ricevono token con scrittura né segreti"
    - "A02:2025 Security Misconfiguration, CWE-798: env fittizie generate nel job a ogni run; nessun segreto del DB di produzione nel repository o nei secrets della CI, nessuna migrazione verso DB remoti (D-04)"

  out_of_scope:
    - "Deploy, Ignored Build Step e pipeline di rilascio (T-605)"
    - "Pin di Node 24 (T-407) e audit delle dipendenze (T-401)"
    - "Prima run della CI su un branch pubblicato: spostata a T-202, perché prima di T-202 ogni push avvia un deploy Preview che esegue migrazioni e seed (D-04)"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Osservabilità: `ac_observability_check.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
