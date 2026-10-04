# SESSION-STATE — Seo God Mode

> Fonte di verità sullo stato vivo del progetto. Si legge all'inizio di ogni
> sessione (`prompts/session-start.md`) e si aggiorna alla chiusura
> (`prompts/session-end.md`), solo dopo conferma del diff.

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts` |
| **Ultimo aggiornamento** | 2026-10-04 |
| **Sessione corrente** | 2026-10-04 — BUILD del macrotask `foundation` (T-102…T-110), checkpoint VERDE, CI verde, merge su `master` sospeso (deploy Preview Vercel fallito) |

---

## 1. Stato dei macrotask

| Macrotask | Stato | Checkpoint | Note |
|---|---|---|---|
| `foundation` (01) | costruito; merge sospeso | VERDE (2026-10-04) | T-101…T-110 chiusi; CI verde (run 37168260206); PR #1 aperta, merge in attesa della causa del deploy Preview fallito |
| `environments` (02) | todo | — | T-203 richiede un'azione dell'utente (creare il DB di staging) |
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

- **Ultimo costruito**: `foundation` (01): tutti i task chiusi, checkpoint VERDE, CI verde; manca solo il merge su `master` (sospeso, vedi §3).
- **Prossimo**: `environments` (02, dipende da 01) dopo il merge di 01; in alternativa `hotfix` (03, dipende solo da 01). T-203 richiede di creare il DB di staging.
- **Criteri/test di riferimento**: `docs/blueprint/02-environments.md`.

## 3. Stato git

| Campo | Valore |
|---|---|
| Branch di lavoro | `trueline/build/foundation` (da `trueline/blueprint` `36487f8`), pushato su `origin` il 2026-10-04; PR #1 verso `master` (https://github.com/claudiosnivel-dot/kw-workbench-vercel/pull/1) |
| Ultimo commit | chiusura sessione (questo file); prima `41e2f19` (fix del checkpoint su `ci.yml`), `4f8c27c` T-110, `4ac9f5c` T-108, `f21f390` T-109, `21bf448` T-107, `1da8135` T-106, `bc52a88` T-105, `c4d3357` T-104, `892a970` T-103, `2cccdd1` T-102 |
| Stato merge su `master` | **SOSPESO**. Checkpoint e CI verdi, ma il deploy Preview Vercel del branch (`dpl_8Jx64SmFd7F47ae1kEGUgkTNAYNj`, check «Vercel» della PR) è fallito con causa non leggibile da questa macchina: CLI Vercel non autenticata e Chrome collegato a un altro account Vercel (404). È il primo deploy Preview del progetto (prima solo Production). Il merge farebbe partire il deploy di produzione con lo stesso `vercel-build`; si riprende dopo aver letto i log (`npx vercel inspect dpl_8Jx64SmFd7F47ae1kEGUgkTNAYNj --logs`). `master` è antenato del branch: merge fast-forward possibile |
| Deploy-coupling | `main_deploy_coupled: true` (rilevato da `detect_deploy_coupling.mjs`, segnale `vercel.json`): ogni push su `master` va in produzione. Merge e push su `master` autonomi a checkpoint verde (deploy automatico), per decisione dell'utente del 2026-10-04 (D-04 emendata) |
| Push dei branch | `trueline/build/foundation` pushato a checkpoint verde (nessuna migrazione nel branch, nessun T-202); il push ha avviato il deploy Preview (che usa `vercel-build`: rischio accettato con D-04 emendata e D-05), fallito per una causa non ancora nota |

## 4. Baseline & budget

- **Baseline di sicurezza**: catturata il 2026-10-04 (`.trueline/baseline.json`, locale e gitignorata): 59 finding (gitleaks 4, osv 47, knip 8, rls 0). Confrontata con una cattura sul commit `36487f8` (prima del macrotask): i soli finding in più sono il segreto in `.npm-cache/` (cache locale gitignorata, già nota) e `uuid@8.3.2` MEDIUM (GHSA-w5hq-g745-h8pq, portato da exceljs di T-107). Il checkpoint di Trueline 0.4.2 non legge il formato snapshot con `--baseline` (si aspetta un array): si passa `.trueline/baseline-fingerprints.json`, array dei 59 fingerprint.
- **Baseline d'igiene**: catturata e versionata (`.trueline/hygiene-baseline.json`): 202 finding (jscpd 201, twin 1, cicli 0).
- **Budget consumato**: 2 finding nel loop di fix, entrambi chiusi `verified`: segreto nuovo in `playwright.config.ts` (1 tentativo) e duplicazione nuova in `.github/workflows/ci.yml` (2 tentativi su 3, cioè 1 retry su `MAX_RETRIES_PER_FINDING = 2`). `GLOBAL_WALL_CLOCK_MS = 242401` superato dalle sole esecuzioni del checkpoint (circa 260-270 s l'una, 3 esecuzioni): il loop è stato condotto a mano, non da `run_loop.mjs`.
- **Preflight oracoli** (2026-10-04): PREFLIGHT OK, semgrep (Docker), gitleaks 8.30.1, osv-scanner 1.9.2, knip 6.39.0, jscpd 4.3.0, madge 8.0.0, rls_check built-in. Trueline installata: 0.4.2.
- **Ambiente**: Docker 29.5; Node 25.5 locale, fuori dagli engines di vitest 5 e jsdom 30 (funziona con avviso; il riferimento è la CI su Node 22, poi Node 24 con T-407). Con più stack Supabase accesi più semgrep la RAM si esaurisce: tenere accesi solo i container necessari.

## 5. Esiti dell'ultima sessione

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

- **Utente**: leggere i log del deploy Preview fallito (`npx vercel inspect dpl_8Jx64SmFd7F47ae1kEGUgkTNAYNj --logs`, oppure il check «Vercel» della PR #1) e dire se la causa riguarda il codice o la configurazione del progetto Vercel (per esempio variabili d'ambiente non definite per l'ambiente Preview). Poi merge di PR #1 su `master` (deploy di produzione automatico).
- **Utente**: confermare la scelta `ignoreExportsUsedInFile: true` di `knip.json` (T-108) o chiedere di tornare al default con le 7 voci in più nella baseline.
- **Utente**: confermare o modificare le decisioni PROPOSTA del ledger (00-INDEX §4), in particolare quelle che servono ai macrotask 02 e 03, e decidere sui rilievi di atomicità (T-403, T-902, T-905, T-1101, T-1202, T-1603).
- **Utente**: D-14 (piani, prezzi, limiti) prima del macrotask 16, D-15 (testi legali) prima di T-1803; azioni esterne: creare il DB di staging per T-203 e l'account DataForSEO per T-902.
- **BUILD**: dopo il merge di 01, macrotask `environments` (02) su `trueline/build/environments`.
- **Trueline**: riportare al repo della skill i problemi elencati nella sessione 2026-10-04.
- Per test d'integrazione ed E2E: `docker compose -f docker-compose.test.yml up -d` e `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/kw_workbench_test` nella shell; per il checkpoint, `.trueline/baseline-fingerprints.json` come `--baseline` (rigenerabile da `.trueline/baseline.json`, campo `fingerprints`).
