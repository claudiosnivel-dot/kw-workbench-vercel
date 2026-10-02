# 04-stack-upgrade — Macrotask `stack-upgrade`

> Aggiornamento dello stack un major per task (D-03), sulla rete di caratterizzazione di 01-foundation; nasce dai rilievi dell'audit 2026-10-02 su `npm audit` (next 15.5.12 critico, xlsx senza fix), runtime non fissato e toolchain datata (Next 15, Prisma 5, Tailwind 3, TypeScript 5.6).

## Obiettivo del macrotask

Portare l'app allo stack target deciso in D-03 senza cambiare comportamento: prima la patch di sicurezza sul ramo 15.x, poi un major per task (TypeScript 6.0, Prisma 7.10, Next 16.3, Tailwind 4.3), la sostituzione di `xlsx` con `exceljs` e il runtime Node 24 fissato ovunque.
Ogni task usa come oracolo di non-regressione le suite di caratterizzazione T-104..T-107, lo smoke E2E e le baseline visive di T-103: uno snapshot che cambia è un rilievo da portare al gate umano, mai da rigenerare in silenzio.
Le versioni sono fissate in modo esatto, perché al 2026-10-02 i dist-tag `latest` di npm puntano a versioni escluse da D-03 (prisma 8.0.0-rc.19, typescript 7.0.2).

## Task atomici

```yaml
- id: T-401
  title: "Patch di sicurezza: Next 15.5.27, React 19.3 e dipendenze transitive"
  macrotask: "stack-upgrade"
  depends_on: [T-103, T-104, T-105, T-106, T-107]

  objective: >
    Chiudere l'advisory critica di next 15.5.12 restando sul ramo 15.x (15.5.27,
    dist-tag backport su npm), portare react e react-dom a 19.3.x e aggiornare le
    dipendenze transitive vulnerabili che hanno un fix non-major, usando come
    oracolo la rete di caratterizzazione (T-104..T-107) e lo smoke E2E (T-103).

  definition_of_done:
    - "package.json: next = 15.5.27 con pin esatto (senza ^ o ~), react e react-dom = 19.3.x, @types/react e @types/react-dom = 19.3.x; package-lock.json rigenerato e committato; next 15.5.27 dichiara peer react ^19.0.0 (verificato con npm view)."
    - "Transitive con fix non-major aggiornate con npm audit fix SENZA --force: nanoid, picomatch, browserslist, yaml, baseline-browser-mapping e sharp (next 15.5.27 ammette sharp ^0.35.4, fuori dal range vulnerabile); tsx portato a 4.23.x (fix dell'advisory esbuild del dev server indicato da npm audit)."
    - "tests/tooling/audit-allowlist.json: elenco delle advisory high residue ammesse, ciascuna con id GHSA, pacchetto, motivazione e task che la chiude. Attese al 2026-10-02: xlsx 0.18.5 senza fix su npm (chiusa da T-406) e postcss 8.4.31 annidato in next, che next 15.5.27 fissa in modo esatto (chiusa da T-404: next 16.3.8 dichiara postcss 8.5.23, fuori dal range vulnerabile fino a 8.5.22)."
    - "tests/tooling/dependency-audit.test.ts esegue npm ls --json e npm audit --json e verifica versioni e advisory (vedi AC); il test richiede accesso al registry npm e gira nel job tooling della CI (T-110)."
    - "Suite di caratterizzazione T-104..T-107 verdi senza aggiornare snapshot: git diff --exit-code tests/integration/characterization/__snapshots__ esce 0."
    - "npm run build esce 0 con next 15.5.27 e lo smoke E2E di T-103 passa sulla build."

  acceptance_criteria:
    - id: AC-401-1
      given: "lockfile rigenerato dopo l'aggiornamento e dipendenze installate con npm ci"
      when: "il test esegue npm ls next react react-dom --json"
      then: "next risulta 15.5.27, react e react-dom risultano 19.3.x e il comando esce 0 senza dipendenze marcate invalid o missing"
    - id: AC-401-2
      given: "albero delle dipendenze aggiornato e tests/tooling/audit-allowlist.json presente"
      when: "il test esegue npm audit --json"
      then: "metadata.vulnerabilities.critical vale 0 e ogni advisory di severità high compare nell'allowlist con un task di chiusura; un'advisory high non elencata fa fallire il test"
    - id: AC-401-3
      given: "DB Postgres di test e provider mock delle suite di caratterizzazione"
      when: "si eseguono auth.char, projects-authz.char, pipeline.golden ed export.char"
      then: "tutte escono 0 e nessun file in tests/integration/characterization/__snapshots__ risulta modificato"
    - id: AC-401-4
      given: "build di produzione con next 15.5.27 avviata sul DB di test con l'utente seed"
      when: "si esegue tests/e2e/smoke.spec.ts"
      then: "il login dell'utente seed porta alla dashboard con risposta HTTP 200 e lo spec esce 0"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-401-1, AC-401-2]
    - file: "tests/integration/characterization/auth.char.test.ts"
      covers: [AC-401-3]
    - file: "tests/integration/characterization/projects-authz.char.test.ts"
      covers: [AC-401-3]
    - file: "tests/integration/characterization/pipeline.golden.test.ts"
      covers: [AC-401-3]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-401-3]
    - file: "tests/e2e/smoke.spec.ts"
      covers: [AC-401-4]

  security_notes:
    - "OWASP A03:2025 Software Supply Chain Failures — CWE-1395 (dipendenza da componente vulnerabile): next 15.5.12 ha advisory critica (request smuggling nei rewrites) e high (DoS su Server Components, cache next/image illimitata); pin esatti, lockfile committato, installazioni in CI con npm ci, mai npm audit fix --force (introdurrebbe major non pianificati)."
    - "OWASP A09:2025 Security Logging and Alerting Failures — CWE-778: l'allowlist esplicita impedisce l'assuefazione agli avvisi; ogni voce scade con il task che la chiude e una nuova advisory high non elencata rompe la CI."

  out_of_scope:
    - "Passaggio a Next 16 e rinomina middleware in proxy (T-404)."
    - "Sostituzione di xlsx (T-406)."
    - "TypeScript 6 (T-402), Prisma 7 (T-403), Tailwind 4 (T-405), Node 24 (T-407)."

- id: T-402
  title: "TypeScript 6.0 e tsconfig allineato ai nuovi default"
  macrotask: "stack-upgrade"
  depends_on: [T-401]

  objective: >
    Portare TypeScript a 6.0.x (TS 7 escluso da D-03) e adeguare tsconfig.json ai
    cambi di default introdotti dalla 6.0, mantenendo verdi typecheck e lint senza
    silenziare errori o deprecazioni.

  definition_of_done:
    - "package.json: typescript = 6.0.x con pin esatto; verificato il 2026-10-02 che il dist-tag latest di typescript è 7.0.2, quindi vietato npm install typescript@latest."
    - "tsconfig.json: aggiunto compilerOptions.types con almeno 'node' (in TS 6.0 il default di types è l'array vuoto e i pacchetti @types non vengono più inclusi in automatico; fonte: release notes ufficiali TS 6.0), più gli eventuali tipi globali realmente usati dai test (es. vitest/globals solo se i test usano i globals)."
    - "tsconfig.json senza ignoreDeprecations e senza baseUrl (deprecato in 6.0; oggi assente e paths usa già './*'); la voce 'dom.iterable' in lib può restare ma in 6.0 è un file vuoto perché incluso in 'dom'."
    - "Errori di tipo emersi corretti nel codice: nessun nuovo any esplicito, nessun nuovo @ts-ignore o @ts-expect-error (conteggio con grep uguale a prima del task)."
    - "Tooling compatibile: typescript-eslint 8.71 dichiara peer typescript >=4.8.4 <6.1.0 (verificato con npm view), quindi 6.0.x è ammesso; npm ls typescript-eslint esce 0."
    - "Script npm typecheck (tsc --noEmit, introdotto da T-102) invariato e verde."

  acceptance_criteria:
    - id: AC-402-1
      given: "dipendenze installate con npm ci"
      when: "il test esegue npx tsc --version e legge package.json"
      then: "l'output inizia con 'Version 6.0.' e devDependencies.typescript ha la forma 6.0.N, senza prefissi ^ o ~"
    - id: AC-402-2
      given: "tsconfig.json aggiornato"
      when: "il test esegue npm run typecheck"
      then: "il comando esce 0 e l'output contiene 0 righe con 'error TS'"
    - id: AC-402-3
      given: "tsconfig.json aggiornato"
      when: "il test lo legge come JSON"
      then: "compilerOptions.types contiene 'node' e le chiavi ignoreDeprecations e baseUrl sono assenti"
    - id: AC-402-4
      given: "TypeScript 6.0 installato"
      when: "il test esegue npm run lint e npm ls typescript-eslint"
      then: "entrambi escono 0 e l'output non contiene 'invalid' né 'ERESOLVE'"

  target_tests:
    - file: "tests/tooling/lint-typecheck.test.ts"
      covers: [AC-402-1, AC-402-2, AC-402-3, AC-402-4]

  security_notes:
    - "OWASP A03:2025 Software Supply Chain Failures — CWE-1104 (componenti non mantenuti): pin esatto a 6.0.x per evitare che un install con range aperto porti TS 7 (escluso da D-03) e rompa la catena di build in modo non riproducibile."

  out_of_scope:
    - "@types/node allineato a Node 24 (T-407)."
    - "Regole ESLint nuove o più severe: restano quelle di T-102."

- id: T-403
  title: "Prisma 7.10 con driver adapter pg e prisma.config.ts"
  macrotask: "stack-upgrade"
  depends_on: [T-401, T-204, T-205, T-201]

  objective: >
    Migrare da Prisma 5.22 a Prisma 7.10.x: nuovo generator prisma-client con output
    esplicito, prisma.config.ts, driver adapter @prisma/adapter-pg con pool configurato
    da env validata al posto dell'hack connection_limit nell'URL di lib/prisma.ts,
    seed eseguito con tsx; migrazioni esistenti invariate e caratterizzazioni verdi.

  definition_of_done:
    - "package.json: prisma e @prisma/client = 7.10.x con pin esatto, @prisma/adapter-pg = 7.10.x, pg 8.x, dotenv; verificato il 2026-10-02 che il dist-tag latest di prisma è 8.0.0-rc.19 (escluso da D-03), quindi vietato installare con @latest; engines di prisma 7.10.0: node ^20.19 || ^22.12 || >=24.0."
    - "prisma/schema.prisma: generator con provider 'prisma-client' (la guida ufficiale indica prisma-client-js come destinato alla rimozione) e output esplicito, proposta '../lib/generated/prisma' (cartella in .gitignore, esclusa da ESLint e da knip di T-108); binaryTargets rimosso se il client Rust-free non lo usa più (verificare nella guida ufficiale di migrazione); blocco datasource senza url e directUrl."
    - "prisma.config.ts nella root: import 'dotenv/config' (la CLI v7 non carica più .env da sola), defineConfig da 'prisma/config' con schema 'prisma/schema.prisma', migrations.path 'prisma/migrations', migrations.seed 'tsx prisma/seed.ts' e datasource.url = DIRECT_URL; in v7 la proprietà directUrl non esiste più e la CLI usa solo datasource.url, per cui la connessione diretta/session (non il transaction pooler) va messa lì, come nella guida Supabase di Prisma; chiave 'prisma' rimossa da package.json."
    - "env() di prisma/config lancia se la variabile manca: la config deve permettere npx prisma generate senza DIRECT_URL (postinstall in CI e su clone pulito), mentre migrate deploy senza DIRECT_URL deve fallire con un messaggio che nomina la variabile."
    - "lib/prisma.ts: rimosso getTunedDatasourceUrl (connection_limit, pgbouncer e pool_timeout nell'URL erano parametri del vecchio engine e non governano il pool di pg); client creato con new PrismaPg(poolConfig) dove buildPoolConfig() esportata restituisce connectionString = DATABASE_URL, max = PRISMA_CONNECTION_LIMIT, connectionTimeoutMillis = PRISMA_POOL_TIMEOUT x 1000, idleTimeoutMillis esplicito, valori letti con envInt di lib/env.ts (T-201) e default come oggi (max 3 in produzione, 1 altrove; timeout 15 s); verificato nei tipi di @prisma/adapter-pg 7.10.0 che PrismaPg accetta pg.Pool, pg.PoolConfig o stringa; la guida v7 segnala che pg ha connection timeout 0 (nessuno) invece dei 5 s di Prisma 6 e idle timeout 10 s invece di 300 s."
    - "Singleton globale in sviluppo mantenuto; nessun componente in components/** importa dal client generato (contratto di altitudine D-22, test di T-109 verde)."
    - "I 26 file che oggi importano da '@prisma/client' (route in app/api, moduli in lib, prisma/seed.ts) importano tipi, enum e Prisma dal percorso di output generato; la ricerca di '@prisma/client' in app, lib, components e prisma restituisce 0 righe."
    - "prisma/seed.ts crea il client con lo stesso adapter (in v7 PrismaClient richiede un driver adapter) e resta idempotente come da T-204; scripts/vercel-build.mjs di T-202 chiama prisma db seed in modo esplicito (in v7 il seed non parte più da solo dopo le migrazioni)."
    - "Scelta sul formato dei moduli documentata nel commit: la guida generale v7 chiede 'type': 'module' in package.json, la guida Next.js v7 di Prisma non lo imposta; se lo si imposta, postcss.config.js (oggi CommonJS con module.exports) e gli script .js CommonJS vanno convertiti."
    - "Migrazioni invariate: git diff --stat prisma/migrations vuoto; la suite rls-lockdown di T-205 resta verde."
    - "Compatibilità con il transaction pooler Supabase (porta 6543) provata sullo staging di T-203 con un'estrazione completa ed esito registrato in SESSION-STATE (verificare nella documentazione Prisma/Supabase le note su pg e prepared statement in transaction mode)."

  acceptance_criteria:
    - id: AC-403-1
      given: "DB Postgres di test vuoto e DIRECT_URL che punta ad esso"
      when: "si esegue npx prisma migrate deploy tramite prisma.config.ts e poi npx prisma migrate status"
      then: "_prisma_migrations contiene una riga con finished_at valorizzato per ogni cartella di prisma/migrations e migrate status esce 0"
    - id: AC-403-2
      given: "PRISMA_CONNECTION_LIMIT=2 e PRISMA_POOL_TIMEOUT=7 nell'ambiente del test"
      when: "il test chiama buildPoolConfig() ed esegue una create seguita da findUnique su users con il client di lib/prisma.ts"
      then: "la config ha max 2 e connectionTimeoutMillis 7000, connectionString non contiene connection_limit né pgbouncer né pool_timeout, e findUnique restituisce la riga appena creata"
    - id: AC-403-3
      given: "DIRECT_URL e DATABASE_URL non impostate nel processo"
      when: "il test esegue npx prisma generate e poi cerca '@prisma/client' nei sorgenti di app, lib, components e prisma"
      then: "generate esce 0, la ricerca restituisce 0 righe e package.json dichiara prisma, @prisma/client e @prisma/adapter-pg con versione 7.10.N esatta"
    - id: AC-403-4
      given: "migrazioni applicate e seed eseguito due volte di seguito con npx prisma db seed"
      when: "si eseguono la suite del seed di T-204 e le caratterizzazioni T-104..T-107"
      then: "brand_blacklist globali = 5 righe, expansion_patterns globali = 8 righe, tutte le suite escono 0 e nessuno snapshot risulta modificato"

  target_tests:
    - file: "tests/integration/prisma-client.test.ts"
      covers: [AC-403-1, AC-403-2, AC-403-3]
    - file: "tests/integration/seed.test.ts"
      covers: [AC-403-4]
    - file: "tests/integration/characterization/auth.char.test.ts"
      covers: [AC-403-4]
    - file: "tests/integration/characterization/projects-authz.char.test.ts"
      covers: [AC-403-4]
    - file: "tests/integration/characterization/pipeline.golden.test.ts"
      covers: [AC-403-4]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-403-4]

  security_notes:
    - "OWASP A02:2025 Security Misconfiguration — CWE-770 (allocazione senza limiti): con l'adapter pg il pool non legge più connection_limit dall'URL; senza max e connectionTimeoutMillis espliciti ogni istanza serverless apre il default di pg e attende all'infinito una connessione. Max e timeout arrivano da env validata (T-201), mai hardcoded."
    - "Segreti — CWE-798 e CWE-532: DATABASE_URL e DIRECT_URL letti solo da variabili d'ambiente, mai stampati; i messaggi di errore di bootstrap riportano solo il nome della variabile mancante, non l'URL."
    - "OWASP A01:2025 Broken Access Control — CWE-284: Prisma resta connesso come owner (ecosistema postgres-jsts, isolamento applicativo); il blocco deny-all della Data API di T-205 (D-20) non dipende da Prisma e la sua suite deve restare verde dopo il cambio di driver."

  out_of_scope:
    - "Prisma 8 (RC, escluso da D-03)."
    - "Nuovi indici e pulizia dello schema (T-1103)."
    - "Modifiche alle migrazioni già applicate."

- id: T-404
  title: "Next 16.3: middleware diventa proxy, ESLint CLI, Turbopack"
  macrotask: "stack-upgrade"
  depends_on: [T-402, T-403, T-301, T-302, T-303]

  objective: >
    Aggiornare a Next 16.3.x applicando i cambi obbligatori della guida ufficiale
    (rinomina middleware in proxy, rimozione di next lint, Turbopack di default,
    API di richiesta solo asincrone) e eslint-config-next 16, mantenendo invariato
    il comportamento di autenticazione già coperto da T-301, T-302 e T-303.

  definition_of_done:
    - "Upgrade avviato con npx @next/codemod@canary upgrade latest (secondo la guida ufficiale migra next lint verso ESLint CLI, middleware verso proxy, rimuove i prefissi unstable_ ed experimental_ppr) e diff rivisto a mano; versioni: next 16.3.x con pin esatto (latest verificato 16.3.8), eslint-config-next 16.3.x, react e react-dom 19.3.x invariati."
    - "middleware.ts rinominato in proxy.ts con funzione esportata proxy (in Next 16 file e export middleware sono deprecati); config.matcher conservato con le esclusioni introdotte da T-302; nessuna opzione runtime nel file: il proxy gira sempre su nodejs, non è configurabile e non supporta edge."
    - "Test che importavano la funzione middleware (proxy-auth di T-301, proxy-public-paths di T-302) aggiornati a importare proxy da proxy.ts senza cambiare le asserzioni."
    - "package.json senza 'next lint' (comando rimosso in Next 16; next build non esegue più il lint): lint = ESLint CLI con la flat config di T-102; next.config.ts senza opzione eslint (rimossa in Next 16)."
    - "Build con Turbopack, default di next dev e next build in Next 16: nessuna configurazione webpack nel progetto (next.config.ts oggi vuoto), quindi nessun flag --webpack; next dev scrive in .next/dev."
    - "API di richiesta: in Next 16 l'accesso sincrono a cookies, headers, params e searchParams è rimosso; il codice usa già await (params e searchParams tipizzati come Promise nelle route e nelle pagine, cookies() atteso in lib/auth/current-user.ts); eseguito comunque npx @next/codemod@canary next-async-request-api . con diff vuoto atteso."
    - "ESLint: verificato il 2026-10-02 che eslint-config-next 16.3.8 dipende da eslint-plugin-react 7.37.5, eslint-plugin-import 2.32.0 ed eslint-plugin-jsx-a11y 6.10.2, i cui peerDependencies arrivano a eslint ^9; quindi eslint resta 9.x finché quei plugin non dichiarano la 10 (deviazione da D-03 da confermare con l'utente); vietato --legacy-peer-deps."
    - "AGENTS.md: la guida ufficiale indica che next dev scrive un blocco gestito in AGENTS.md e consiglia di committarlo; scelta (committare o ignorare) registrata in SESSION-STATE."
    - "Cambi di default senza impatto verificati sul codice: next/image non usato, nessuna rotta parallela, nessun revalidateTag o unstable_cache, nessuna configurazione AMP o runtimeConfig."

  acceptance_criteria:
    - id: AC-404-1
      given: "proxy.ts al posto di middleware.ts"
      when: "proxy-auth.test.ts invoca proxy() con una GET anonima su /api/projects e una su /projects/abc?tab=x"
      then: "la prima risposta è 401 con body JSON, la seconda è 307 con Location /login?next= seguito dal percorso con la query codificata, e il file middleware.ts non esiste"
    - id: AC-404-2
      given: "build Next 16 avviata e richiesta anonima con header x-middleware-subrequest valorizzato (regressione CVE-2025-29927)"
      when: "lo spec E2E esegue GET /api/projects con quell'header"
      then: "la risposta è 401"
    - id: AC-404-3
      given: "package.json aggiornato"
      when: "il test esegue npm ls next, npm run lint e npm run build"
      then: "npm ls riporta next 16.3.N, lint e build escono 0 e package.json non contiene la stringa 'next lint'"
    - id: AC-404-4
      given: "build Next 16 avviata sul DB di test con l'utente seed"
      when: "si esegue smoke.spec.ts (login, apertura dashboard e apertura di /login con cookie kwb_session=abc.!!!)"
      then: "il login porta alla dashboard con HTTP 200 e /login con il cookie malformato risponde 200 (regressione T-301)"

  target_tests:
    - file: "tests/integration/proxy-auth.test.ts"
      covers: [AC-404-1]
    - file: "tests/e2e/smoke.spec.ts"
      covers: [AC-404-2, AC-404-4]
    - file: "tests/tooling/lint-typecheck.test.ts"
      covers: [AC-404-3]

  security_notes:
    - "OWASP A01:2025 Broken Access Control — CWE-862 (autorizzazione mancante): il proxy è il primo cancello di autenticazione per pagine e /api; la rinomina non deve cambiare il matcher né i percorsi pubblici, e il bypass noto via x-middleware-subrequest (CVE-2025-29927) è coperto da un test HTTP sul server reale."
    - "OWASP A03:2025 Software Supply Chain Failures — CWE-1395: next 16.3.x chiude le advisory che npm audit riporta fino a 16.3.0-preview.10 e il postcss annidato vulnerabile; ESLint e plugin solo con peerDependencies soddisfatte, perché --legacy-peer-deps nasconderebbe incompatibilità reali."

  out_of_scope:
    - "Cache Components (cacheComponents) e React Compiler: non attivati."
    - "Header di sicurezza e CSP con nonce nel proxy (T-505)."
    - "Tailwind 4 (T-405)."

- id: T-405
  title: "Tailwind 4.3 con @tailwindcss/postcss e configurazione CSS-first"
  macrotask: "stack-upgrade"
  depends_on: [T-404]

  objective: >
    Migrare da Tailwind 3.4 a Tailwind 4.3.x con il plugin @tailwindcss/postcss e la
    configurazione CSS-first, eliminando tailwind.config.ts e autoprefixer, e dimostrare
    con le baseline visive di T-103 che le pagine principali non cambiano aspetto oltre
    la soglia dichiarata.

  definition_of_done:
    - "Migrazione avviata con npx @tailwindcss/upgrade (richiede Node 20 o superiore secondo la guida ufficiale) e diff rivisto a mano."
    - "devDependencies: tailwindcss 4.3.x e @tailwindcss/postcss 4.3.x con pin esatto (latest verificato 4.3.3); autoprefixer rimosso (non più necessario secondo la guida); postcss diretto rimosso se nessun altro lo usa (@tailwindcss/postcss 4.3.3 dipende già da postcss ^8.5.16)."
    - "postcss.config.js sostituito da postcss.config.mjs con il solo plugin '@tailwindcss/postcss'."
    - "app/globals.css: le tre direttive @tailwind sostituite da @import 'tailwindcss'; tailwind.config.ts eliminato: la sua unica estensione (colore slate 950) non è usata in nessun file e la palette v4 lo include; il rilevamento dei sorgenti in v4 è automatico (oggi content copre app, components e lib, e lib non contiene classi)."
    - "Cambi di default v4 gestiti: le 38 occorrenze della classe border senza colore (in v4 il colore predefinito del bordo passa da gray-200 a currentColor) mantengono l'aspetto attuale con lo stile di compatibilità indicato dalla guida o un colore esplicito; ring passa da 3px a 1px; le utility rinominate (rounded in rounded-sm, shadow-sm in shadow-xs, outline-none in outline-hidden, ring in ring-3) convertite dal tool; il selettore di space-x e space-y cambia (76 usi) ed è verificato dagli screenshot."
    - "Override in app/globals.css che ridefiniscono utility con !important (.text-slate-*, .bg-*, .border-*, .ring-* tramite --tw-ring-color) verificati sul CSS generato da v4; verificare nella guida ufficiale che --tw-ring-color resti la variabile usata da ring."
    - "Confronto con le baseline di T-103 con maxDiffPixelRatio dichiarato in playwright.config.ts (proposta 0,01); le differenze oltre soglia si correggono nel CSS, non si accettano rigenerando le baseline senza gate umano."

  acceptance_criteria:
    - id: AC-405-1
      given: "build di produzione con Tailwind 4.3 e baseline visive di T-103"
      when: "si esegue tests/e2e/visual.spec.ts su /login, dashboard e risultati senza --update-snapshots"
      then: "ogni screenshot differisce dalla baseline per una quota di pixel non superiore al maxDiffPixelRatio dichiarato e lo spec esce 0"
    - id: AC-405-2
      given: "repository dopo la migrazione"
      when: "il test tooling legge package.json, postcss.config.mjs e app/globals.css e controlla l'esistenza di tailwind.config.ts"
      then: "tailwindcss e @tailwindcss/postcss sono 4.3.N, autoprefixer e tailwind.config.ts sono assenti, postcss.config.mjs contiene '@tailwindcss/postcss' e globals.css non contiene la stringa '@tailwind'"
    - id: AC-405-3
      given: "build di produzione aperta nel browser dell'E2E"
      when: "si legge lo stile calcolato di un elemento di /login che usa la classe border senza colore"
      then: "border-top-color coincide con il valore registrato sulla baseline v3 e non con il colore del testo dell'elemento"

  target_tests:
    - file: "tests/e2e/visual.spec.ts"
      covers: [AC-405-1, AC-405-3]
    - file: "tests/tooling/tailwind-config.test.ts"
      covers: [AC-405-2]

  security_notes:
    - "OWASP A03:2025 Software Supply Chain Failures — CWE-1395: la rimozione di autoprefixer e del postcss diretto 8.4.49 (advisory high fino a 8.5.22) riduce le dipendenze di build vulnerabili; nessun dato o flusso di autenticazione toccato."

  out_of_scope:
    - "Redesign o nuove componenti grafiche."
    - "Accessibilità di base (T-1104)."

- id: T-406
  title: "exceljs al posto di xlsx per l'export XLSX"
  macrotask: "stack-upgrade"
  depends_on: [T-107, T-401]

  objective: >
    Rimuovere xlsx 0.18.5 (ultima versione su npm, advisory high senza fix) e generare
    l'export XLSX con exceljs 4.4, mantenendo foglio, intestazioni e tipi delle celle
    fotografati dalla caratterizzazione di T-107.

  definition_of_done:
    - "package.json: xlsx rimosso (0.18.5 è il dist-tag latest; advisory GHSA-4r6h-8v6p-xvw6 prototype pollution e GHSA-5pgg-2g8v-p4x9 ReDoS, fix solo fuori da npm); exceljs 4.4.x aggiunto (latest verificato 4.4.0)."
    - "lib/modules/export.ts: unico uso di xlsx (json_to_sheet, book_new, book_append_sheet, write) sostituito con ExcelJS.Workbook: foglio 'keywords', riga di intestazione con le chiavi di ExportRow nello stesso ordine di oggi (22 colonne), una riga per record, buffer da workbook.xlsx.writeBuffer(); generateExport mantiene firma, filename e contentType."
    - "Tipi delle celle: numeri come numeri, booleani come booleani, micros come stringhe (già serializzati così da serialize), null come cella vuota; nessuna cella scritta come oggetto formula."
    - "Export con 0 righe allineato a quanto fotografato da T-107; ogni differenza voluta è segnalata come asserzione impattata con gate umano."
    - "Caratterizzazione export.char di T-107 verde (intestazioni XLSX invariate); nessun import di xlsx nel repo; voce xlsx rimossa da tests/tooling/audit-allowlist.json di T-401."
    - "Albero di exceljs (archiver, unzipper, jszip, uuid, tmp e altri) controllato con npm audit: eventuali advisory high o critical introdotte sono risolte con overrides documentati o aggiunte all'allowlist con motivazione."

  acceptance_criteria:
    - id: AC-406-1
      given: "progetto di test con 3 keyword e scope filtered"
      when: "si chiama GET /api/projects/[id]/export?format=xlsx con la sessione del proprietario"
      then: "la risposta è 200 con Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet e, riletto con ExcelJS, il foglio 'keywords' ha 4 righe e intestazioni identiche alle 22 chiavi di ExportRow nello stesso ordine"
    - id: AC-406-2
      given: "keyword con avg_monthly_searches 1200, is_question true e low_top_of_page_bid_micros 1500000"
      when: "si rilegge la riga esportata in xlsx"
      then: "la cella del volume è numerica con valore 1200, la cella is_question vale il booleano true e la cella dei micros è la stringa '1500000'"
    - id: AC-406-3
      given: "keyword il cui testo inizia con '=SUM(A1)'"
      when: "si esporta in xlsx e si rilegge la cella keyword"
      then: "la cella non ha formula (proprietà formula assente) e il suo valore è la stringa '=SUM(A1)'"
    - id: AC-406-4
      given: "repository dopo la sostituzione"
      when: "il test esegue npm ls xlsx --json e cerca import di 'xlsx' nei sorgenti"
      then: "xlsx non compare nell'albero delle dipendenze e la ricerca restituisce 0 righe"

  target_tests:
    - file: "tests/integration/export-xlsx.test.ts"
      covers: [AC-406-1, AC-406-2, AC-406-3]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-406-1]
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-406-4]

  security_notes:
    - "OWASP A03:2025 Software Supply Chain Failures — CWE-1395, con CWE-1321 (prototype pollution) e CWE-1333 (ReDoS) come advisory di xlsx: il pacchetto è rimosso del tutto, non solo inutilizzato."
    - "OWASP A05:2025 Injection — CWE-1236 (formula injection): ogni valore è scritto come stringa o numero, mai come oggetto formula, quindi un testo che inizia con = resta testo; la neutralizzazione del CSV è di T-804."
    - "OWASP A01:2025 Broken Access Control — CWE-639: la route di export continua a filtrare il progetto per owner_user_id dell'utente in sessione; il task cambia solo la serializzazione."

  out_of_scope:
    - "CSV con BOM, separatore e protezione dalle formule (T-804)."
    - "Export in streaming con il writer di exceljs (T-805)."

- id: T-407
  title: "Runtime Node 24 fissato in package.json, .nvmrc, CI e Vercel"
  macrotask: "stack-upgrade"
  depends_on: [T-401, T-110, T-202]

  objective: >
    Fissare Node 24 come unico runtime di sviluppo, CI e produzione, al posto del range
    aperto '>=20.0.0' di oggi, allineando i tipi @types/node e facendo fallire presto
    una build Vercel che giri su una major diversa.

  definition_of_done:
    - "package.json engines.node = '24.x' (oggi '>=20.0.0'); secondo la documentazione Vercel engines.node prevale sulle impostazioni del progetto e '24.x' installa l'ultima 24.x; 24.x è anche il default dei nuovi progetti e Node 20 è in deprecazione su Vercel dal 1 ottobre 2026."
    - ".nvmrc nella root con contenuto '24'; README.md aggiornato ai requisiti Node 24 (in locale oggi c'è v25: usare nvm use)."
    - "Workflow CI di T-110 in .github/workflows: ogni step actions/setup-node usa node-version-file '.nvmrc', nessuna versione hardcoded diversa."
    - "@types/node allineato alla major del runtime: 24.x (oggi 22.9.0; latest 24 verificato 24.19.1)."
    - "scripts/vercel-build.mjs (T-202) stampa process.version all'avvio e, quando VERCEL=1, esce con codice 1 se la major non è 24; la funzione assertNodeMajor(version, expected) è esportata e testata."
    - "Compatibilità verificata con npm view il 2026-10-02: next 16.3.8 richiede node >=20.9.0, prisma 7.10.0 richiede ^20.19 || ^22.12 || >=24.0; Node 24 soddisfa entrambi."

  acceptance_criteria:
    - id: AC-407-1
      given: "repository aggiornato"
      when: "il test legge package.json e .nvmrc"
      then: "engines.node vale '24.x', .nvmrc contiene '24' e devDependencies di @types/node inizia con '24.'"
    - id: AC-407-2
      given: "workflow presenti in .github/workflows"
      when: "il test analizza ogni step che usa actions/setup-node"
      then: "tutti dichiarano node-version-file '.nvmrc' e nessuno dichiara node-version con major diversa da 24"
    - id: AC-407-3
      given: "VERCEL=1 nell'ambiente del test"
      when: "si chiama assertNodeMajor('v22.11.0', 24) e poi assertNodeMajor('v24.3.0', 24)"
      then: "la prima chiamata lancia un errore il cui messaggio contiene 'Node 24' e la seconda non lancia"

  target_tests:
    - file: "tests/tooling/runtime-pin.test.ts"
      covers: [AC-407-1, AC-407-2, AC-407-3]

  security_notes:
    - "OWASP A02:2025 Security Misconfiguration — CWE-1104 (componenti non mantenuti): con '>=20.0.0' la produzione può girare su una major in deprecazione o diversa da quella testata in CI; una sola major fissata in tutti gli ambienti e un controllo che fallisce la build se diverge."

  out_of_scope:
    - "engine-strict in .npmrc (decisione dell'utente)."
    - "Aggiornamenti futuri di Node oltre la 24."
```

## Dipendenze implicite (non nel DAG, da confermare)

Gli ID e i `depends_on` sono quelli dell'outline; questi artefatti sono usati ma prodotti da task non a monte nel DAG. Sono soddisfatti se i macrotask si costruiscono in ordine numerico:
- T-403 usa `envInt` di `lib/env.ts` (T-201) e lo staging (T-203).
- T-406 aggiorna `tests/tooling/audit-allowlist.json` creato da T-401.
- T-407 modifica `scripts/vercel-build.mjs` creato da T-202.

## Fonti verificate (2026-10-02)

- `npm view`: next latest 16.3.8 (engines node >=20.9.0, peer react ^19.0.0), backport 15.5.27; react/react-dom latest 19.3.0; prisma latest = 8.0.0-rc.19, prev = 7.10.0; @prisma/client latest 7.10.0; typescript latest 7.0.2 (6.0.3 disponibile); tailwindcss e @tailwindcss/postcss 4.3.3; exceljs 4.4.0; xlsx 0.18.5; typescript-eslint 8.71.0 peer typescript <6.1.0; eslint-plugin-react 7.37.5, eslint-plugin-import 2.32.0, eslint-plugin-jsx-a11y 6.10.2 con peer eslint fino a ^9.
- `npm audit` del repo: 1 critical (next), 6 high (xlsx, postcss, sharp, nanoid, picomatch, browserslist), fix di next indicato in 15.5.27.
- Guida ufficiale Next 16 (nextjs.org/docs/app/guides/upgrading/version-16): middleware→proxy (runtime nodejs non configurabile), `next lint` e opzione `eslint` rimossi, Turbopack di default, accesso sincrono alle Request API rimosso, codemod `upgrade` e `next-async-request-api`, AGENTS.md scritto da `next dev`.
- Guida ufficiale Prisma 7 (prisma.io): generator `prisma-client` con `output` obbligatorio, `prisma.config.ts` con `datasource.url` (directUrl rimosso), dotenv esplicito, seed non automatico, driver adapter obbligatorio, timeout di pg diversi da Prisma 6; tipi di `@prisma/adapter-pg` 7.10.0 (`PrismaPg(pg.Pool | pg.PoolConfig | string)`).
- Guida ufficiale Tailwind 4 (tailwindcss.com/docs/upgrade-guide); release notes TypeScript 6.0 (typescriptlang.org); Vercel, versioni di Node supportate.

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
