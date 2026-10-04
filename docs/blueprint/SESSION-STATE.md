# SESSION-STATE — Seo God Mode

> Fonte di verità sullo stato vivo del progetto. Si legge all'inizio di ogni
> sessione (`prompts/session-start.md`) e si aggiorna alla chiusura
> (`prompts/session-end.md`), solo dopo conferma del diff.

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts` |
| **Ultimo aggiornamento** | 2026-10-04 |
| **Sessione corrente** | 2026-10-04 (seconda) — merge di `foundation` su `master`; BUILD del macrotask `environments` (T-201…T-204; T-205 sospeso su D-20), checkpoint VERDE; deploy Vercel falliti per il DB Supabase di produzione in pausa |

---

## 1. Stato dei macrotask

| Macrotask | Stato | Checkpoint | Note |
|---|---|---|---|
| `foundation` (01) | chiuso | VERDE (2026-10-04) | T-101…T-110 chiusi; CI verde; PR #1 mergiata su `master` (`37d2bd0`) |
| `environments` (02) | costruito in parte | VERDE (2026-10-04) | T-201, T-202, T-204 chiusi; T-203 chiuso nel codice, passi manuali dell'utente aperti (staging); T-205 non costruito: usa D-20 (PROPOSTA). PR #2 |
| `hotfix` (03) | todo | — | Difetti visibili in produzione |
| `stack-upgrade` (04) | todo | — | |
| `auth-hardening` (05) | todo | — | |
| `observability-ops` (06) | todo | — | |
| `extraction-fixes` (07) | todo | — | |
| `results-export` (08) | todo | — | Include i 7 fix di paginazione dell'audit 2026-05-31 |
| `google-integrations` (09) | todo | — | Volumi: CSV del cliente + fornitore con licenza (D-09, D-30); API Google Ads dismessa per le metriche |
| `onboarding` (10) | todo | — | |
| `cleanup` (11) | todo | — | Rimozioni human-gated |
| `background-jobs` (12) | todo | — | D-10 da confermare |
| `i18n` (13) | todo | — | |
| `accounts-email` (14) | todo | — | D-11 da confermare |
| `workspaces` (15) | todo | — | D-08 (matrice ruoli) da confermare |
| `billing` (16) | todo | — | Bloccato da D-14 (piani e prezzi) |
| `abuse-quotas` (17) | todo | — | D-12 da confermare |
| `marketing-legal` (18) | todo | — | Bloccato da D-15 (testi legali) |

## 2. Macrotask corrente

- **Ultimo costruito**: `environments` (02): T-201, T-202, T-204 chiusi; T-203 chiuso nel codice (AC-203-1…4 verdi) con i passi manuali dell'utente ancora aperti; T-205 non costruito perché usa D-20, ancora PROPOSTA. Checkpoint VERDE.
- **Prossimo**: `hotfix` (03, dipende solo da 01). T-205 si costruisce dopo la conferma di D-20 e blocca T-403 (04 `stack-upgrade`); i passi manuali di T-203 (staging) bloccano T-604, T-605 (06) e T-1203 (12).
- **Criteri/test di riferimento**: `docs/blueprint/03-hotfix.md`.

## 3. Stato git

| Campo | Valore |
|---|---|
| Branch di lavoro | `trueline/build/environments` (da `master` `37d2bd0`), pushato su `origin` il 2026-10-04; PR #2 verso `master` (https://github.com/claudiosnivel-dot/kw-workbench-vercel/pull/2) |
| Ultimo commit | chiusura sessione (questo file); prima `0580772` (fix del checkpoint, T-201), `a1fc82e` T-204, `92530ee` T-203, `c768f9d` T-202, `218f046` T-201 |
| CI della PR | verde su `0580772`: run 37189337083 (checks, integration, e2e, build) |
| Deploy Preview del branch | **verde**: `dpl_AXiKaLgQ2Wy3Fe1tSonVHjAy5nj7` (87 s). Con T-202 il build di Preview salta migrazioni e seed (`PRODUCTION_DB_HOST` non impostata) e `next build` passa: conferma che i deploy falliti si fermavano a `prisma migrate deploy` |
| Merge su `master` | PR #1 mergiata (`37d2bd0`). PR #2: merge autonomo a checkpoint e CI verdi dopo questo commit di chiusura. Il deploy di produzione che ne segue esegue ancora le migrazioni e fallirà finché il DB Supabase di produzione resta in pausa; il sito resta sul deploy di giugno |
| Deploy-coupling | `main_deploy_coupled: true` (segnale `vercel.json`): ogni push su `master` va in produzione. Merge e push su `master` autonomi a checkpoint verde (D-04 emendata 2026-10-04) |
| Push dei branch | `trueline/build/environments` pushato a checkpoint verde; contiene T-202 e nessuna migrazione |

## 4. Baseline & budget

- **Baseline di sicurezza**: invariata (`.trueline/baseline.json`, locale e gitignorata, 59 finding: gitleaks 4, osv 47, knip 8, rls 0; al checkpoint si passa `.trueline/baseline-fingerprints.json`, array dei 59 fingerprint, perché Trueline 0.4.2 non legge il formato snapshot con `--baseline`).
- **Baseline d'igiene**: invariata (`.trueline/hygiene-baseline.json`, 202 finding: jscpd 201, twin 1, cicli 0). I fingerprint di jscpd dipendono dai fine riga del working tree: con `core.autocrlf=true` un checkout riscrive in CRLF i file cambiati e il checkpoint vede cloni «nuovi» in file mai toccati (9 nella prima esecuzione di questa sessione). Il working tree è stato riportato a LF (contenuto identico all'indice, `git diff` vuoto) e il checkpoint è tornato a dup 201. Prima di un checkpoint: `git ls-files --eol` non deve mostrare `i/lf w/crlf`.
- **Budget consumato** (macrotask 02): 2 finding gitleaks CRITICAL (`trueline-generic-assigned-secret` sui default di sviluppo di `APP_SESSION_SECRET` e `APP_ENCRYPTION_KEY` in `lib/env.ts`), chiusi `verified` al primo tentativo togliendo i default (`0580772`; riverifica: `run_gitleaks` senza i due finding, `npm test` 58/58, checkpoint VERDE). 9 duplicazioni `new` da fine riga CRLF, chiuse senza modifiche al codice (normalizzazione LF del working tree; riverifica: checkpoint VERDE con dup 201). Nessun retry. `GLOBAL_WALL_CLOCK_MS = 242401` superato dalle sole esecuzioni del checkpoint (circa 283 s l'una, 2 esecuzioni): loop condotto a mano, non da `run_loop.mjs`.
- **Preflight oracoli**: PREFLIGHT OK del 2026-10-04 (semgrep via Docker, gitleaks 8.30.1, osv-scanner 1.9.2, knip 6.39.0, jscpd 4.3.0, madge 8.0.0, rls_check built-in), non ripetuto. Trueline installata: 0.4.2.
- **Ambiente**: Docker 29.5; Node 25.5 locale (fuori dagli engines di vitest 5 e jsdom 30, funziona con avviso; riferimento la CI su Node 22). Con più stack Supabase accesi più semgrep la RAM si esaurisce: tenere accesi solo i container necessari. CLI Vercel non autenticata; CLI Supabase autenticata (`supabase projects list`).

## 5. Esiti dell'ultima sessione

### Sessione 2026-10-04 (seconda) — merge di `foundation`, BUILD di `environments`

- **Causa dei deploy Vercel falliti** (diagnosi per evidenza, log di Vercel ancora non leggibili da qui): il progetto Supabase di produzione «keyword miner» (eu-central-1, creato il 2026-03-11) risulta `INACTIVE`, cioè in pausa, in `supabase projects list`. In produzione `POST /api/auth/login` risponde 500 (interroga il DB) mentre `GET /api/auth/session` senza cookie risponde 401 (nessuna query). I build falliscono in circa 30 s contro i 49 s dell'ultimo build riuscito (giugno). Il build di `vercel-build` simulato in Docker (`VERCEL=1`, Node 20, 22 e 24, `npm install` da zero) è verde con un DB raggiungibile, mentre senza `DIRECT_URL` fallisce con P1012 e con un DB irraggiungibile con P1001 ed exit 1. Il sito resta servito dal deploy di giugno.
- **Merge di PR #1** su `master` (`37d2bd0`, merge commit) a checkpoint e CI verdi, dopo la simulazione del build. Deploy di produzione `dpl_8hbtXBoMhS1RcQnzHQTUwvyLR6kr` fallito come i Preview (stessa causa); CI su `master` verde (checks, integration, e2e, build).
- **T-201** (`218f046`, `0580772`): `lib/env.ts` con schema zod 4.6.5 (dependency esatta), `parseEnv`, `getEnv` memoizzata, `resetEnvForTests`, `ENV_KEYS`, `INT_ENV` (default e intervallo per variabile), `envInt` e `getIntEnv`; `APP_AUTH_ENABLED` fail-closed; segreti obbligatori in produzione (almeno 32 caratteri, niente segnaposto) e senza default in ogni ambiente; bootstrap del primo utente in produzione con `APP_AUTH_PASSWORD` di almeno 12 caratteri e diversa da `changeme`; letture numeriche via `envInt` (0 occorrenze di `Number(process.env.` in `lib/`); `instrumentation.ts` chiama `getEnv()` in `register()`. Gate: `tests/unit/env.test.ts` (AC-201-1…3) e `tests/integration/bootstrap-admin.test.ts` (AC-201-4) verdi; AC-201-4 rosso sul codice precedente (sessione anonima 200 con `APP_AUTH_ENABLED=ture`). `next build` con zod nel middleware edge: exit 0 (middleware da 34,7 a 84,9 kB).
- **T-202** (`c768f9d`): `scripts/vercel-build.mjs` (`decideMigration`, `runVercelBuild`) e `vercel-build = node scripts/vercel-build.mjs`; `PRODUCTION_DB_HOST` in `.env.example` ed `ENV_KEYS`. Gate: `tests/unit/vercel-build-guard.test.ts` (AC-202-1…4) 4/4; CLI provata su Windows e su Linux (Node 22): Preview senza `PRODUCTION_DB_HOST` e senza DB → migrazioni saltate e build exit 0; Production → migrate, seed, build exit 0; Production con DB irraggiungibile → exit 1 senza `next build`.
- **T-203** (`92530ee`): `docs/ENVIRONMENTS.md` (matrice per ogni chiave di `ENV_KEYS`, passi manuali), `scripts/env-check.mjs` e `npm run env:check`, `.env*.local` in `.gitignore`. Gate: `tests/unit/env-check.test.ts` (AC-203-1…4) 4/4. **Aperto**: i passi manuali dell'utente (progetto Supabase di staging, env Preview, `env:check` con exit 0) e la loro conferma qui.
- **T-204** (`a1fc82e`): `seedGlobalDefaults` in un'unica transazione, solo inserimenti dei default mancanti, `main` solo da CLI. Gate: `tests/integration/seed.test.ts` (AC-204-1…4) 4/4, rossi prima dell'implementazione; CLI: due esecuzioni → 5 brand e 8 pattern, DB irraggiungibile → exit 1.
- **T-205**: non costruito, usa D-20 (PROPOSTA non confermata).
- **Checkpoint** (`run_checkpoint.mjs --in-place --mode build --blueprint docs/blueprint`, baseline dei fingerprint): prima esecuzione NON-VERDE (2 segreti nuovi CRITICAL in `lib/env.ts`; 9 duplicazioni `new` da fine riga CRLF); dopo il loop di fix (§4) **VERDE**: 1 igiene verde (dead-code 8, dup 201, cicli 0, twin 1, arch 0, tutti preesistenti), 2 sicurezza verde (gitleaks 4, osv 47, semgrep 0, nessun nuovo ≥ HIGH), 3 regressioni verde, 4 conformità verde (`npm test` 58/58). Tracciabilità AC: `ac_assertion_trace_check` ristretto a `02-environments.md`: OK, 5 target test in scope (gli AC di T-205 sono saltati perché il suo target test non esiste).
- **Altre verifiche**: `tsc --noEmit` e `eslint . --max-warnings=0` exit 0; E2E su Windows 2 passati e 3 visivi saltati; E2E nel container `mcr.microsoft.com/playwright:v1.63.0-noble` con `CI=true`: 5/5.
- **Copertura non verificata** (dichiarata): controllo 4 sul ramo legacy (`npm test`, senza E2E, eseguiti a parte); potere delle asserzioni (AT-1 Fase C) non eseguito; osv normalizza tutto a MEDIUM; `instrumentation.ts` con configurazione invalida provato solo tramite i test di `parseEnv`, non con un `next start` reale; T-203 non verificato contro le env reali di Vercel (serve lo staging).
- **Dipendenze aggiunte**: zod 4.6.5 (già presente come dipendenza transitiva, ora diretta).

### Sessione 2026-10-04 — BUILD del macrotask `foundation`

- **T-102** (`2cccdd1`): `eslint.config.mjs` flat con eslint-config-next 15.5.12 via FlatCompat, ESLint 9.39.5; `lint` = `eslint . --max-warnings=0`, `typecheck` = `tsc --noEmit`; 4 escape in JSX; `no-unused-vars` ignora i parametri `_` (motivo nel config). Gate: `tests/tooling/lint-typecheck.test.ts` 4/4.
- **T-103** (`892a970`): Playwright 1.63.0, server `next build` + `next start` su 3100 con ogni variabile dell'app esplicita, segreti casuali a ogni run, global setup con e2e-user e 30 candidate a timestamp fissi; baseline login, dashboard e risultati generate nel container `mcr.microsoft.com/playwright:v1.63.0-noble`. Gate: smoke verde su Windows e Linux; su Linux con `CI=true` confronti verdi (exit 0) e, senza una baseline, exit 1 senza crearla; job e2e della CI verde.
- **T-104** (`c4d3357`), **T-105** (`bc52a88`), **T-106** (`1da8135`), **T-107** (`21bf448`): caratterizzazione di auth e sessione (4/4), isolamento tra utenti e invarianti (5/5), golden master della pipeline (4/4; 927 candidate, 135 query; stabile su 3 esecuzioni), export CSV/XLSX/JSON (4/4, exceljs 4.4.0). Difetti fotografati con `impacted-by` T-301, T-302, T-303, T-705, T-706, T-804, T-807, T-1003. Nessuna modifica al codice di produzione.
- **T-109** (`f21f390`): `lib/onboarding/types.ts` (solo `import type`), `progress.ts` importa e ri-esporta, i due componenti importano da `types`; madge 8.0.0 e `findForbiddenPaths`. Gate: test scritto prima e rosso (2 cammini `components` → `lib/prisma.ts`), poi 4/4.
- **T-108** (`4ac9f5c`): knip 6.39.0 (minimo di Trueline: 6), jscpd 4.3.0, `knip.json`, `tests/tooling/knip-baseline.json` con il morto dell'audit, `diffKnipAgainstBaseline`, `.gitignore` con `.trueline/*` e la negazione della baseline d'igiene. Gate: 4/4. Falsi positivi di configurazione risolti in `knip.json`: plugin Playwright senza caricare la config (che esige `TEST_DATABASE_URL`), `eslint-config-next` e `jscpd` in `ignoreDependencies`, `ignoreExportsUsedInFile: true`. Con quest'ultima opzione 3 voci dell'audit (`isRootAdminUser`, `requireAdminUserFromCookies`, `repairCommonMojibake`, usate nel proprio file) non sono più segnalate e restano nella baseline; senza l'opzione sarebbero comparse 7 segnalazioni fuori dall'audit (3 costanti di `lib/onboarding/constants.ts`, `LoginFailureReason`, `TEST_USER_PASSWORD`, le due ri-esportazioni di T-109), tutte usate nel proprio file.
- **T-110** (`4f8c27c`, `41e2f19`): `.github/workflows/ci.yml` su push e pull_request verso `master`, `permissions: contents: read`, azioni fissate per SHA (checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1), Node 22.x, Postgres 16 di servizio, env fittizie generate nel job; ancore YAML per i passi condivisi. Gate: `tests/tooling/ci-workflow.test.ts` 4/4; **prima run verde**: https://github.com/claudiosnivel-dot/kw-workbench-vercel/actions/runs/37168260206 (checks, integration, e2e, build: success).
- **Checkpoint** (`run_checkpoint.mjs --in-place --mode build --blueprint docs/blueprint`, baseline dei fingerprint): **VERDE** — 1 igiene verde (dead-code 8, dup 201, cicli 0, twin 1, arch 0, tutti preesistenti), 2 sicurezza verde (gitleaks 4, osv 47, semgrep 0 su 139 file, rls 0; nessun nuovo ≥ HIGH), 3 regressioni verde, 4 conformità verde (`npm test`). Tracciabilità AC: oracolo `assertionTrace` di Trueline ristretto ai 10 task di `foundation`: 39 AC, 13 target test, ok.
- **Loop di fix**: (a) segreto nuovo in `playwright.config.ts` (password di bootstrap letterale di T-103): ora generata a ogni run; riverificato con l'oracolo secret (sparito) e con lo smoke E2E. (b) duplicazione nuova in `ci.yml` (2 tentativi, vedi §4): riverificata con `run_dupcheck` (0 cloni in `ci.yml`), con il test di T-110 e con il checkpoint completo. Nessuna rimozione di dead-code.
- **Copertura non verificata** (dichiarata): il controllo 4 del checkpoint gira sul ramo legacy (`npm test`, senza E2E) perché il pack `postgres-jsts` non dichiara `test_runner.run_file`; il controllo del potere delle asserzioni (AT-1 Fase C) non è stato eseguito. L'oracolo osv di Trueline normalizza tutte le vulnerabilità come MEDIUM: la soglia HIGH non può scattare (`npm audit`: 21 voci, 1 critica `next` e 14 alte, preesistenti o della stessa famiglia braces/micromatch; correzioni in T-401/T-402). L'E2E visivo è verificato solo su Linux (container e CI).
- **Dipendenze aggiunte** (versione esatta): eslint 9.39.5, eslint-config-next 15.5.12, @eslint/eslintrc 3.3.7, @playwright/test 1.63.0, exceljs 4.4.0, madge 8.0.0, @types/madge 5.0.3, knip 6.39.0, jscpd 4.3.0, yaml 2.9.1. `npm audit`: 11 → 21 voci (stessi avvisi su nuovi percorsi: braces/micromatch via @next/eslint-plugin-next e jscpd; nuovo `uuid` MEDIUM via exceljs).
- **Problemi di Trueline 0.4.2 da riportare al repo della skill** (non corretti in questa sessione, regola un macrotask per sessione): `run_checkpoint.mjs --baseline` ignora lo snapshot di `baseline.mjs` (campo `findings` oggetto); `baseline.mjs capture --hygiene` senza `--out` sovrascrive `.trueline/baseline.json`; `run_semgrep.mjs` risolve i percorsi relativi contro la radice della skill (dentro il checkpoint riceve il percorso assoluto e scansiona il progetto); osv senza severità; i path dei finding d'igiene sono prefissati `eval/reference-app/`.

### Sessione 2026-10-02/04 — avvio BUILD

- Emendamenti al blueprint approvati dall'utente (`36487f8` su `trueline/blueprint`): D-04 esteso a ogni push di branch prima di T-202, con la prima run della CI spostata da T-110 a T-202; quarto progetto Vitest `tooling` in T-101 e `test:tooling` nel job checks di T-110; dipendenze di T-102 (+T-101), T-109 (+T-101) e T-108 (+T-101, T-103, T-109); jscpd in T-108; il riferimento a ESLint 10 in T-102 diventa 9.39.x. `validate_blueprint` e `ac_observability_check`: exit 0.
- Emendamento del 2026-10-04 (decisione dell'utente «deploy automatici»): a checkpoint verde push e merge su `master` sono autonomi, anche prima di T-202/T-203, con il rischio sulle Preview accettato (D-04, D-05). La prima run della CI torna a T-110 e T-202 non dipende più da T-110. Aggiornati 00-INDEX, VISION, 01-foundation, 02-environments e i tre prompt.
- **T-101 chiuso** (`a1d1ad2`): `vitest.config.ts` con 4 progetti (unit, component, integration, tooling), `docker-compose.test.yml` (postgres:16 su 54329), `.env.test.example`, helper `tests/helpers/` (db-guard, db, auth, http), globalSetup e setup d'integrazione. Gate: target_tests AC-101-1…4 verdi (`npm test`: 3 file, 7 test, exit 0); `ac_assertion_trace_check` OK; `tsc --noEmit` exit 0; `next build` exit 0; guardia provata con variabile assente e host remoto (exit 1, password mai stampata); 11/11 migrazioni applicate su `localhost:54329`.
- Scostamenti di T-101: aggiunte `vite` 8.3.2 e `@testing-library/dom` 10.4.2 (peer obbligatorie); `@types/node` 22.9.0 → 22.20.5 (peer di vite, senza `--legacy-peer-deps`); il client Prisma carica il `.env` reale all'import, quindi il setup d'integrazione scarta le variabili aggiunte (verificato con una sonda); `npm run test:tooling` esce 1 finché T-102 non aggiunge il primo test.
- `npm audit` dopo T-101: nessun pacchetto vulnerabile nuovo (12 → 11, `nanoid` uscito).
- gitleaks: due falsi positivi di T-101 (URL finto di AC-101-2, segreto di sessione fittizio) confermati dall'utente e codificati in `.gitleaks.toml` (`24fbdd0`), per valore esatto: con `paths` gitleaks 8.30 salta i file interi, e i `targetRules` sulle regole di Trueline rompono gitleaks lanciato da solo.
- Trueline corretta e rilasciata 0.4.2 (repo Trueline `d0db08b`, pushato; plugin aggiornato, `diff -r` pulito): l'oracolo secret legge le allowlist del `.gitleaks.toml` di progetto e `fp_policy` propone `[[allowlists]]` con `targetRules`. Batteria Trueline verde (m5 56/56 compreso).
- Oracolo secret installato sul working tree: 363 finding, quasi tutti in `.next/` (build, gitignorato). Fuori dalla build restano 3 preesistenti (`lib/integrations/google-sheets-config.ts:5`, `lib/integrations/google-ads-config.ts:4`, `lib/modules/providers/metrics/google-keyword-planner.ts:253`) e 1 in `.npm-cache/` (gitignorato, dentro il repo): da gestire alla cattura della baseline (T-108).
- Checkpoint del macrotask: non eseguito (gira al confine di `foundation`). Loop di fix non usato: budget consumato 0.

### Sessione 2026-10-02 — audit + blueprint

- Audit completo del 2026-10-02 in 4 aree (auth, pipeline, progetti/export, integrazioni/onboarding): circa 100 rilievi, riportati nelle note dei task.
- Riprodotti in produzione: cookie `kwb_session` malformato → HTTP 500 su `/login`, `/` e `/api/projects`; `/.well-known/bastione-ownership.txt` → redirect 307 al login.
- `tsc --noEmit` passato sul codice attuale; `npm audit --omit=dev`: 5 vulnerabilità (1 critica su `next` 15.5.12, risolta da 15.5.27); `knip`: 1 file e 10 export inutilizzati.
- Blueprint generato: 18 macrotask, 106 task, 418 criteri di accettazione, 288 note di sicurezza.
- `validate_blueprint.mjs docs/blueprint`: exit 0 (TASKS_PRESENT, REQUIRED_FIELDS, AC_COVERAGE, DAG_VALID, UNIQUE_IDS, MACROTASK_OWNERSHIP, ARCH_CONTRACT_WELL_FORMED tutti OK).
- `ac_observability_check.mjs docs/blueprint`: exit 0 (nessun `then` con token vietati).
- Checklist semantica 6–10: nessun task senza criteri né senza `security_notes`; rilievi di atomicità aperti su T-403, T-902, T-905, T-1101, T-1202, T-1603 (più di 9 voci di DoD), da confermare o dividere con l'utente.
- Verificato su developers.google.com (2026-10-02): dal 9/9/2026 il livello d'accesso all'API Google Ads è del progetto Google Cloud; Keyword Planner richiede Basic Access e l'uso consentito "Researching keywords and recommendations" è riservato agli strumenti che aiutano a creare e gestire campagne Google Ads.
- La domanda di Basic Access dell'utente è stata respinta (tool dichiarato in sviluppo, senza design document). Decisione dell'utente: niente API Google Ads per le metriche; volumi da CSV del Keyword Planner del cliente + fornitore con licenza DataForSEO (D-09 emendata, D-30 nuova). Aggiornati T-304, modulo 09, T-1601, T-1605, T-1703, T-1803, visione.
- Verificato con `npm view`: ESLint resta 9.39.x (D-03 emendata).
- Nessun codice applicativo modificato.

## 6. Prossimi passi

- **Utente (sblocca i deploy)**: riattivare il progetto Supabase di produzione «keyword miner» dal pannello Supabase (oggi `INACTIVE`); poi rilanciare il deploy di produzione (Redeploy su Vercel, o il prossimo merge su `master`). Senza questo ogni deploy Production fallisce a `prisma migrate deploy`. Prima del deploy con T-201 controllare che in Production `APP_SESSION_SECRET` e `APP_ENCRYPTION_KEY` abbiano almeno 32 caratteri e non siano segnaposto: altrimenti l'app non parte (fail-closed voluto). Se `APP_ENCRYPTION_KEY` cambia, le credenziali Google cifrate a DB non si leggono più.
- **Utente**: confermare o modificare D-20 (RLS senza policy sulle tabelle `public`): sblocca T-205 e, tramite T-205, T-403 del macrotask 04.
- **Utente (T-203)**: creare il progetto Supabase di staging e configurare le env Preview seguendo `docs/ENVIRONMENTS.md` (passi manuali), poi `npm run env:check` con exit 0; la conferma va registrata qui. Sblocca T-604, T-605 (06) e T-1203 (12).
- **Utente**: confermare la scelta `ignoreExportsUsedInFile: true` di `knip.json` (T-108) o chiedere di tornare al default con le 7 voci in più nella baseline.
- **Utente**: confermare o modificare le altre decisioni PROPOSTA del ledger (00-INDEX §4) e decidere sui rilievi di atomicità (T-403, T-902, T-905, T-1101, T-1202, T-1603); D-14 prima del macrotask 16, D-15 prima di T-1803; account DataForSEO per T-902.
- **Utente (facoltativo)**: per evitare i falsi «nuovi» duplicati da fine riga, valutare un `.gitattributes` con `* text=auto eol=lf` o `core.autocrlf=false` in questo clone (vedi §4).
- **BUILD**: macrotask `hotfix` (03) su `trueline/build/hotfix` da `master`; usa solo D-03 e D-09, entrambe DECISE.
- **Trueline**: riportare al repo della skill i problemi della sessione precedente e i nuovi: fingerprint di jscpd sensibili ai fine riga del working tree; `ac_assertion_trace_check` sull'intero blueprint fallisce per i target test condivisi dei macrotask futuri (va ristretto al macrotask corrente).
- Per test d'integrazione ed E2E: `docker compose -f docker-compose.test.yml up -d` e `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/kw_workbench_test` nella shell; per il checkpoint, `.trueline/baseline-fingerprints.json` come `--baseline` (rigenerabile da `.trueline/baseline.json`, campo `fingerprints`).
