# 02-environments — Macrotask `environments`

> Ambienti separati e configurazione fail-closed: nasce dai rilievi dell'audit 2026-10-02 su auth disattivabile con un refuso, segreti di default, NaN da env, migrazioni su ogni deploy Preview, seed non transazionale e tabelle Supabase esposte dalla Data API (D-04, D-05, D-20).

## Obiettivo del macrotask

Rendere la configurazione fail-closed e separare gli ambienti. Le variabili d'ambiente vengono validate
all'avvio: l'autenticazione non è più disattivabile in produzione né con un refuso, i segreti non hanno più
valori di default, i numeri non validi non diventano più NaN silenziosi. Il build Vercel applica migrazioni e
seed solo al DB giusto, lo staging separato diventa verificabile da script (D-04), il seed dei dati globali
diventa idempotente e transazionale e la Data API di Supabase viene chiusa con RLS deny-by-default (D-20).
Il risultato è un raggio d'azione ridotto per qualunque errore di configurazione o deploy Preview.

## Task atomici

```yaml
- id: T-201
  title: "Validazione delle variabili d'ambiente all'avvio (fail-closed)"
  macrotask: "environments"
  depends_on: [T-101]

  objective: >
    Introdurre un unico modulo di configurazione validata. Oggi isAuthEnabled()
    di lib/auth/config.ts è fail-open (qualunque valore diverso da 1, true, yes,
    on disattiva l'auth e ogni anonimo diventa il primo utente, cioè il root
    admin, tramite ensureLegacyDefaultUser); i fallback changeme,
    change-this-session-secret e change-this-encryption-key non hanno guardie in
    produzione; Number(process.env.X) produce NaN o 0 in extraction.ts
    (AUTOCOMPLETE_CONCURRENCY non valida crea 0 worker e il crash list is not
    iterable, MAX_EXPANSION_QUERIES non valida azzera l'espansione con
    slice(0, NaN)), in google-direct.ts e in lib/prisma.ts.

  definition_of_done:
    - "lib/env.ts con schema zod (zod come dependency con versione esatta): esporta parseEnv(source) pura, getEnv() memoizzata con resetEnvForTests(), ENV_KEYS (elenco delle variabili dichiarate) ed envInt(name, def, min, max); intervalli dichiarati accanto a ogni variabile (es. AUTOCOMPLETE_CONCURRENCY tra 1 e 20, default 6)"
    - "envInt: valore assente o stringa vuota -> def; valore non intero (abc, 6x, 1.5) -> errore che nomina la variabile; valore fuori da [min, max] -> riportato nell'intervallo"
    - "APP_AUTH_ENABLED fail-closed: solo 0, false, no, off (case-insensitive) disattivano l'auth; ogni altro valore, incluso un refuso come ture, la lascia attiva; con NODE_ENV=production (vale anche per i deploy Preview di Vercel) l'auth disattivata è un errore di configurazione"
    - "In produzione APP_SESSION_SECRET e APP_ENCRYPTION_KEY sono obbligatorie, lunghe almeno 32 caratteri e diverse dai placeholder noti (change-this-session-secret, change-this-encryption-key, replace-with-a-long-random-session-secret, replace-with-a-long-random-encryption-key); lib/auth/config.ts non ha più fallback hardcoded in produzione"
    - "In produzione il bootstrap del primo utente (ensureLegacyDefaultUser di lib/auth/credentials.ts) rifiuta APP_AUTH_PASSWORD assente, uguale a changeme o più corta di 12 caratteri, senza creare righe"
    - "Tutte le letture numeriche passano da envInt: MAX_EXPANSION_QUERIES e AUTOCOMPLETE_CONCURRENCY (lib/modules/pipeline/extraction.ts); AUTOCOMPLETE_RATE_LIMIT_MS, AUTOCOMPLETE_CACHE_TTL_MS, AUTOCOMPLETE_MAX_RETRIES, AUTOCOMPLETE_TIMEOUT_MS (lib/modules/providers/autocomplete/google-direct.ts); PRISMA_CONNECTION_LIMIT e PRISMA_POOL_TIMEOUT (lib/prisma.ts); APP_SESSION_MAX_AGE_SECONDS (lib/auth/config.ts)"
    - "instrumentation.ts chiama getEnv() in register(), così un deploy con configurazione invalida fallisce all'avvio con l'elenco delle variabili errate; lib/env.ts non importa moduli solo-Node perché è usato anche dal middleware in runtime edge"
    - ".env.example documenta vincoli e valori ammessi; se la CI di T-110 esiste già, il job build usa valori fittizi conformi ai nuovi vincoli"

  acceptance_criteria:
    - id: AC-201-1
      given: "APP_AUTH_ENABLED uguale a ture con NODE_ENV=development, poi APP_AUTH_ENABLED uguale a false con NODE_ENV=production"
      when: "si chiama parseEnv con le due sorgenti"
      then: "nel primo caso authEnabled vale true; nel secondo parseEnv lancia un errore il cui messaggio contiene APP_AUTH_ENABLED"
    - id: AC-201-2
      given: "NODE_ENV=production con APP_SESSION_SECRET assente, poi uguale a change-this-session-secret, poi lunga 31 caratteri (stessi casi per APP_ENCRYPTION_KEY)"
      when: "si chiama parseEnv"
      then: "ogni caso lancia un errore il cui messaggio contiene il nome della variabile e non contiene il valore fornito"
    - id: AC-201-3
      given: "AUTOCOMPLETE_CONCURRENCY uguale a stringa vuota, poi ad abc, poi a 999"
      when: "si chiama envInt('AUTOCOMPLETE_CONCURRENCY', 6, 1, 20)"
      then: "restituisce 6, poi lancia un errore il cui messaggio contiene AUTOCOMPLETE_CONCURRENCY, poi restituisce 20; una scansione dei file in lib/ trova 0 occorrenze di Number(process.env."
    - id: AC-201-4
      given: "users vuota, NODE_ENV=production simulato con vi.stubEnv, APP_ADMIN_EMAIL='root@example.test' e APP_AUTH_ENABLED=ture (emendato da T-1401 il 2026-10-07: il bootstrap usa APP_ADMIN_EMAIL e una password casuale mai comunicata, non più APP_AUTH_USERNAME e APP_AUTH_PASSWORD)"
      when: "si chiamano GET /api/onboarding/state da anonimo e POST /api/auth/login con APP_ADMIN_EMAIL e changeme (emendato da T-1101 il 2026-10-06: la richiesta anonima va a GET /api/onboarding/state, la rotta della sessione è rimossa)"
      then: "la richiesta anonima risponde 401; il login non risponde 200 né emette Set-Cookie e users conta 1 riga, il root admin con email 'root@example.test' e is_root_admin true"

  target_tests:
    - file: "tests/unit/env.test.ts"
      covers: [AC-201-1, AC-201-2, AC-201-3]
    - file: "tests/integration/bootstrap-admin.test.ts"
      covers: [AC-201-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-1188 (Insecure Default Initialization of Resource): APP_AUTH_ENABLED diventa fail-closed e in produzione non può disattivare l'autenticazione; oggi un refuso rende ogni anonimo il root admin via ensureLegacyDefaultUser"
    - "A07:2025 Authentication Failures, CWE-798 (Use of Hard-coded Credentials) e A04:2025 Cryptographic Failures, CWE-321 (Use of Hard-coded Cryptographic Key): niente fallback changeme, change-this-session-secret, change-this-encryption-key in produzione; segreti letti solo da env validata, mai dal sorgente"
    - "A09:2025 Security Logging and Alerting Failures, CWE-532: gli errori di validazione nominano la variabile e il vincolo violato, mai il valore"
    - "A10:2025 Mishandling of Exceptional Conditions, CWE-20: input numerici non validi diventano errori espliciti all'avvio invece di NaN silenziosi (0 worker, nessuna espansione)"
    - "A03:2025 Software Supply Chain Failures, CWE-1357: zod con versione esatta"

  out_of_scope:
    - "Versione di sessione e revoca dei token (T-501)"
    - "Identità via email e root admin da APP_ADMIN_EMAIL (T-1401)"
    - "Pool pg con max da env al posto di connection_limit nell'URL (T-403)"

- id: T-202
  title: "Guardia sulle migrazioni nel build Vercel"
  macrotask: "environments"
  depends_on: [T-201]

  objective: >
    Impedire che un deploy Preview applichi migrazioni o seed al DB di
    produzione. Oggi vercel.json usa npm run vercel-build, cioè
    db:deploy (prisma migrate deploy e prisma db seed) seguito da next build, su
    ogni deploy, anche Preview, che esegue codice di branch non revisionato.

  definition_of_done:
    - "scripts/vercel-build.mjs (Node ESM, solo moduli built-in) esporta decideMigration({ VERCEL_ENV, DIRECT_URL, PRODUCTION_DB_HOST }) pura, che restituisce { migrate, reason }, e runVercelBuild({ env, run }) con il runner dei comandi iniettabile; da CLI usa child_process"
    - "Regole: VERCEL_ENV=production -> migra; VERCEL_ENV=preview -> migra solo se PRODUCTION_DB_HOST è impostata e l'identità del DB di DIRECT_URL è diversa; PRODUCTION_DB_HOST o DIRECT_URL assenti o non parsabili, VERCEL_ENV development o assente -> salta (fail-closed)"
    - "Identità del DB: se PRODUCTION_DB_HOST è nella forma utente@host si confrontano username e hostname di DIRECT_URL, perché il pooler Supabase ha un host regionale condiviso tra progetti e il progetto sta nello username postgres.<project-ref>; altrimenti si confronta il solo hostname; confronto case-insensitive"
    - "Se migra: prisma migrate deploy, prisma db seed, next build; se salta: riga su stdout con prefisso [vercel-build] che dice migrazioni saltate e la ragione, poi next build"
    - "Un comando fallito interrompe la sequenza e il processo esce con lo stesso exit code: next build non parte dopo una migrazione fallita"
    - "package.json: vercel-build = node scripts/vercel-build.mjs; db:deploy resta per l'uso locale; PRODUCTION_DB_HOST documentata in .env.example e in ENV_KEYS di lib/env.ts come variabile del solo ambiente Preview"
    - "I log mostrano al più hostname e username del DB, mai password o query string di DIRECT_URL"

  acceptance_criteria:
    - id: AC-202-1
      given: "VERCEL_ENV=production e un runner di comandi finto che registra le invocazioni"
      when: "si esegue runVercelBuild"
      then: "il runner riceve nell'ordine prisma migrate deploy, prisma db seed e next build e l'exit code è 0"
    - id: AC-202-2
      given: "VERCEL_ENV=preview con DIRECT_URL sullo stesso host indicato in PRODUCTION_DB_HOST, e in un secondo caso con PRODUCTION_DB_HOST non impostata"
      when: "si esegue runVercelBuild"
      then: "in entrambi i casi il runner riceve solo next build e stdout contiene [vercel-build] e migrazioni saltate; nel secondo caso stdout contiene anche PRODUCTION_DB_HOST"
    - id: AC-202-3
      given: "VERCEL_ENV=preview, PRODUCTION_DB_HOST=postgres.prodref@aws-1-eu-central-1.pooler.supabase.com e DIRECT_URL sullo stesso host con utente postgres.stagingref, poi con utente postgres.prodref"
      when: "si chiama decideMigration"
      then: "con postgres.stagingref restituisce migrate true; con postgres.prodref restituisce migrate false"
    - id: AC-202-4
      given: "DIRECT_URL con password S3gretaDiProva e un runner che fa terminare prisma migrate deploy con exit code 1"
      when: "si esegue runVercelBuild con VERCEL_ENV=production"
      then: "l'exit code è 1, next build non viene invocato e né stdout né stderr contengono S3gretaDiProva"

  target_tests:
    - file: "tests/unit/vercel-build-guard.test.ts"
      covers: [AC-202-1, AC-202-2, AC-202-3, AC-202-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-668 (Exposure of Resource to Wrong Sphere): un deploy Preview, che esegue codice di branch non revisionato, non applica migrazioni né seed al DB di produzione; le migrazioni di produzione restano legate ai soli deploy Production e nel dubbio lo script salta (fail-closed, D-04)"
    - "A09:2025 Security Logging and Alerting Failures, CWE-532: nei log del build compaiono solo hostname e username, mai password o parametri dell'URL"

  out_of_scope:
    - "Creazione del DB di staging e verifica degli ambienti (T-203)"
    - "Ignored Build Step e pipeline di rilascio (T-605)"

- id: T-203
  title: "Ambiente di staging separato e verifica della configurazione"
  macrotask: "environments"
  depends_on: [T-202]

  objective: >
    Dare a Preview un DB di staging separato (D-04: oggi la separazione non è
    nota) e renderla verificabile: documentazione degli ambienti, passi manuali
    per l'utente e uno script che confronta i DB configurati per ambiente e
    segnala in modo esplicito se Preview usa il DB di produzione.

  definition_of_done:
    - "docs/ENVIRONMENTS.md con la matrice variabili per ambiente (Production, Preview, Development): per ogni chiave di ENV_KEYS di lib/env.ts indica se è obbligatoria, se è segreta e da dove proviene il valore; DATABASE_URL e DIRECT_URL di Preview puntano al DB di staging e PRODUCTION_DB_HOST è impostata solo in Preview"
    - "Sezione di passi manuali per l'utente: creare il progetto Supabase di staging, copiare le stringhe di connessione (pooler 6543 per DATABASE_URL, 5432 per DIRECT_URL) nelle env Preview di Vercel, eseguire un deploy Preview e verificare con npm run env:check; la conferma dell'utente è registrata in docs/blueprint/SESSION-STATE.md"
    - "scripts/env-check.mjs (solo moduli built-in) e script npm env:check: legge i file prodotti da vercel env pull --environment=<env> (default .env.production.local, .env.preview.local, .env.development.local; percorsi sovrascrivibili con --production, --preview, --development) e stampa per ambiente host, porta, database e utente di DATABASE_URL e DIRECT_URL con la password sostituita da ***"
    - "Se l'identità del DB di Preview (stessa regola di decideMigration di T-202) coincide con quella di Production lo script stampa PREVIEW USA IL DB DI PRODUZIONE ed esce con 1; se manca il file di Production o di Preview esce con 1 indicando il comando vercel env pull da eseguire; altrimenti esce con 0"
    - ".gitignore contiene .env*.local: oggi ignora solo .env.local, mentre vercel env pull scrive .env.production.local e .env.preview.local con segreti reali"

  acceptance_criteria:
    - id: AC-203-1
      given: "due file env di prova in cui DIRECT_URL di Production e di Preview hanno stesso host e stesso utente"
      when: "si esegue env-check con --production e --preview che puntano ai file di prova"
      then: "stdout contiene PREVIEW USA IL DB DI PRODUZIONE e l'exit code è 1"
    - id: AC-203-2
      given: "file di prova con DB distinti e password Pw-Prova-123 in tutte le URL"
      when: "si esegue env-check"
      then: "l'exit code è 0, stdout contiene l'host di ciascun ambiente e la sequenza *** e non contiene Pw-Prova-123"
    - id: AC-203-3
      given: "il file di Preview assente"
      when: "si esegue env-check"
      then: "l'exit code è 1 e stdout contiene vercel env pull --environment=preview"
    - id: AC-203-4
      given: "docs/ENVIRONMENTS.md, ENV_KEYS di lib/env.ts e .gitignore"
      when: "env-check.test.ts confronta le chiavi con il documento e legge .gitignore"
      then: "ogni chiave di ENV_KEYS compare nel documento, le intestazioni Production, Preview e Development sono presenti e .gitignore contiene la riga .env*.local"

  target_tests:
    - file: "tests/unit/env-check.test.ts"
      covers: [AC-203-1, AC-203-2, AC-203-3, AC-203-4]

  security_notes:
    - "A02:2025 Security Misconfiguration, CWE-668: la verifica segnala in modo esplicito un Preview che punta al DB di produzione, condizione che renderebbe dannosa qualunque migrazione o test su un branch (D-04)"
    - "A02:2025, CWE-538: i file di vercel env pull contengono segreti reali e sono ignorati da git tramite .env*.local"
    - "A09:2025 Security Logging and Alerting Failures, CWE-532: l'output dello script oscura la password e non stampa i parametri dell'URL"

  out_of_scope:
    - "Backup e prova di ripristino (T-604)"
    - "Promozione staging -> produzione e checklist di rilascio (T-605)"

- id: T-204
  title: "Seed idempotente e transazionale"
  macrotask: "environments"
  depends_on: [T-101]

  objective: >
    Rendere idempotente e transazionale il seed dei dati globali. Oggi
    prisma/seed.ts esegue, a ogni deploy, deleteMany e poi createMany non
    transazionali dei brand e dei pattern globali: c'è una finestra in cui le
    tabelle sono vuote, i dati globali aggiunti a mano vengono cancellati e un
    errore a metà lascia le tabelle vuote.

  definition_of_done:
    - "prisma/seed.ts esporta seedGlobalDefaults(client), DEFAULT_BRANDS e DEFAULT_PATTERNS con gli stessi valori di oggi (5 brand, 8 pattern); main viene eseguito solo quando il file è lanciato da CLI (prisma db seed), non all'import"
    - "seedGlobalDefaults esegue tutto in un'unica prisma.$transaction: legge le righe globali (project_id null) esistenti e inserisce solo quelle mancanti; nessun deleteMany"
    - "La deduplicazione non si affida a createMany con skipDuplicates né a upsert sul vincolo @@unique([project_id, brand]) o @@unique([project_id, pattern]): con project_id NULL Postgres considera distinti i valori e il vincolo non impedisce duplicati (la correzione dello schema è T-1103)"
    - "Righe globali aggiunte manualmente e righe di progetto non vengono toccate"
    - "In caso di errore la transazione fa rollback, il processo stampa l'errore ed esce con 1 (comportamento CLI attuale mantenuto)"

  acceptance_criteria:
    - id: AC-204-1
      given: "brand_blacklist ed expansion_patterns vuote"
      when: "si esegue seedGlobalDefaults due volte di seguito"
      then: "dopo ciascuna esecuzione le righe con project_id null sono 5 in brand_blacklist e 8 in expansion_patterns"
    - id: AC-204-2
      given: "i default globali già presenti"
      when: "si esegue di nuovo seedGlobalDefaults"
      then: "l'insieme degli id delle righe globali è identico prima e dopo (nessuna cancellazione e ricreazione, quindi nessuna finestra con tabelle vuote)"
    - id: AC-204-3
      given: "tabelle vuote tranne una riga globale con brand ebay e una riga di progetto con brand acme"
      when: "si esegue seedGlobalDefaults"
      then: "entrambe le righe esistono ancora con lo stesso id e brand_blacklist conta 7 righe in totale"
    - id: AC-204-4
      given: "un client che fa fallire il secondo inserimento dentro la transazione"
      when: "si esegue seedGlobalDefaults"
      then: "la promessa viene rigettata e i conteggi di brand_blacklist ed expansion_patterns sono uguali a quelli precedenti all'esecuzione"

  target_tests:
    - file: "tests/integration/seed.test.ts"
      covers: [AC-204-1, AC-204-2, AC-204-3, AC-204-4]

  security_notes:
    - "A08:2025 Software or Data Integrity Failures, CWE-362: oggi deleteMany e createMany non transazionali lasciano, a ogni deploy, una finestra in cui la blacklist globale è vuota e un'estrazione concorrente non esclude i brand; transazione unica senza cancellazioni"
    - "A07:2025 Authentication Failures, CWE-798: il seed usa la connessione DIRECT_URL letta dall'ambiente e non contiene credenziali né segreti nel sorgente"

  out_of_scope:
    - "Vincoli unici corretti per le righe globali con project_id NULL (T-1103)"
    - "Guardia sulle migrazioni nel build (T-202)"

- id: T-205
  title: "Blocco della Data API di Supabase (RLS deny-by-default)"
  macrotask: "environments"
  depends_on: [T-101]

  objective: >
    Chiudere l'accesso alle tabelle dell'app tramite la Data API di Supabase. Le
    tabelle Prisma stanno nello schema public, esposto da PostgREST se RLS è
    disattivo (standard R1). Una migrazione abilita RLS su tutte le tabelle senza
    policy: deny per anon e authenticated, mentre Prisma, che si connette come
    proprietario delle tabelle, non è toccato. Eccezione documentata allo
    standard R2 secondo D-20.

  definition_of_done:
    - "Migrazione prisma/migrations/0012_enable_rls_deny_by_default/migration.sql con ALTER TABLE ... ENABLE ROW LEVEL SECURITY per tutte le tabelle dello schema public: users, projects, subprojects, seeds, keyword_candidates, jobs, brand_blacklist, expansion_patterns, google_ads_credentials, google_sheets_credentials, user_onboarding_progress, app_settings e _prisma_migrations; nessuna CREATE POLICY e nessun FORCE ROW LEVEL SECURITY"
    - "La migrazione non nomina i ruoli anon e authenticated (assenti nel Postgres di test), così si applica identica su Supabase e sul DB di test"
    - "Commento in testa alla migrazione: deny-by-default intenzionale perché l'app non usa la Data API; R1 soddisfatto; eccezione a R2 documentata con rimando a D-20"
    - "Convenzione per le migrazioni future: ogni nuova tabella in public include ENABLE ROW LEVEL SECURITY nella stessa migrazione; il test di questo task la fa rispettare"
    - "Le suite di caratterizzazione già presenti al momento del task (T-104, T-105, T-106, T-107) restano verdi dopo la migrazione"
    - "Dopo il deploy in produzione l'utente verifica nel Security Advisor di Supabase l'assenza dell'avviso di RLS disattivata su public; esito annotato in docs/blueprint/SESSION-STATE.md"

  acceptance_criteria:
    - id: AC-205-1
      given: "il DB di test con tutte le migrazioni applicate, inclusa 0012"
      when: "si interrogano pg_class e pg_namespace per le tabelle (relkind r) dello schema public e la vista pg_policies"
      then: "le tabelle con relrowsecurity false sono 0, quelle con relforcerowsecurity true sono 0 e pg_policies ha 0 righe per lo schema public"
    - id: AC-205-2
      given: "un ruolo di prova rls_probe non proprietario con USAGE sullo schema public e SELECT e INSERT su tutte le tabelle, e 1 riga in users"
      when: "nella stessa connessione si esegue SET ROLE rls_probe, poi SELECT count(*) FROM users e un INSERT in projects"
      then: "la SELECT restituisce 0 e l'INSERT fallisce con SQLSTATE 42501 (new row violates row-level security policy)"
    - id: AC-205-3
      given: "il client Prisma dell'app, connesso come proprietario delle tabelle"
      when: "crea un utente e un progetto e li rilegge"
      then: "la rilettura restituisce 1 utente e 1 progetto con gli stessi id, e un update e un delete del progetto tramite Prisma modificano 1 riga ciascuno"

  target_tests:
    - file: "tests/integration/rls-lockdown.test.ts"
      covers: [AC-205-1, AC-205-2, AC-205-3]

  security_notes:
    - "A01:2025 Broken Access Control, CWE-862 (Missing Authorization): senza RLS le tabelle di public, inclusi users.password_hash e le credenziali Google cifrate, sono interrogabili via Data API con la anon key; RLS deny-by-default chiude il canale (standard R1)"
    - "A01:2025, CWE-639: eccezione R2 intenzionale e documentata (D-20); l'app accede solo via Prisma come proprietario delle tabelle (nessun FORCE ROW LEVEL SECURITY) e l'isolamento per utente resta applicativo, con query filtrate per owner_user_id nelle rotte (route-authz, D-02)"

  out_of_scope:
    - "Policy per utente o uso della Data API dal client (non previsto dal piano)"
    - "Revoca dei grant di anon e authenticated o disattivazione della Data API dal pannello Supabase: azione facoltativa dell'utente"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Osservabilità: `ac_observability_check.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
