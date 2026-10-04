# SESSION-STATE — Seo God Mode

> Fonte di verità sullo stato vivo del progetto. Si legge all'inizio di ogni
> sessione (`prompts/session-start.md`) e si aggiorna alla chiusura
> (`prompts/session-end.md`), solo dopo conferma del diff.

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts` |
| **Ultimo aggiornamento** | 2026-10-04 |
| **Sessione corrente** | 2026-10-02/04 — avvio BUILD: emendamenti al blueprint, T-101, correzione di Trueline (0.4.2) |

---

## 1. Stato dei macrotask

| Macrotask | Stato | Checkpoint | Note |
|---|---|---|---|
| `foundation` (01) | in corso | non eseguito | T-101 chiuso (`a1d1ad2`); prossimo T-102 |
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

- **Selezionato**: `foundation` (01) — nessuna dipendenza.
- **Task atomici**: T-101 chiuso. Prossimo T-102, poi T-103…T-107, T-109, T-108, T-110.
- **Criteri/test di riferimento**: `docs/blueprint/01-foundation.md`.

## 3. Stato git

| Campo | Valore |
|---|---|
| Branch di lavoro | `trueline/build/foundation` (da `trueline/blueprint` `36487f8`); locale, non pushato |
| Ultimo commit | `24fbdd0` (allowlist gitleaks); prima `a1d1ad2` (T-101) e `36487f8` (emendamenti, su `trueline/blueprint`) |
| Stato merge su `master` | non eseguito |
| Deploy-coupling | `main_deploy_coupled: true` (rilevato da `detect_deploy_coupling.mjs`, segnale `vercel.json`): ogni push su `master` va in produzione. Merge e push su `master` autonomi a checkpoint verde (deploy automatico), per decisione dell'utente del 2026-10-04 (D-04 emendata) |
| Push dei branch | nessun branch pushato finora. Da ora push autonomo a checkpoint verde; rischio accettato: prima di T-202/T-203 il deploy Preview può migrare e fare il seed sul DB di produzione (D-04 emendata 2026-10-04, D-05) |

## 4. Baseline & budget

- **Baseline di sicurezza**: non ancora catturata (`.trueline/baseline.json`, al primo checkpoint dopo T-108).
- **Baseline d'igiene**: non ancora catturata (`.trueline/hygiene-baseline.json`, T-108).
- **Budget consumato**: 0 / `MAX_RETRIES_PER_FINDING = 2` per finding, `GLOBAL_WALL_CLOCK_MS = 242401` per sessione.
- **Preflight oracoli** (2026-10-02, solo controllo): pronti semgrep 1.175.1 (Docker), gitleaks 8.30.1, osv-scanner 1.9.2 e rls_check (built-in); mancano knip (T-108), jscpd (T-108) e madge (T-109). Trueline installata: 0.4.2.
- **Ambiente**: Docker 29.5; Node 25.5 locale, fuori dagli engines di vitest 5 e jsdom 30 (funziona con avviso; il riferimento è la CI su Node 22, poi Node 24 con T-407). Con più stack Supabase accesi più semgrep la RAM si esaurisce: tenere accesi solo i container necessari.

## 5. Esiti dell'ultima sessione

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

- L'utente rivede il blueprint e conferma o modifica le decisioni PROPOSTA del ledger (00-INDEX §4), soprattutto D-08, D-09, D-10 e D-23…D-29.
- L'utente decide sui rilievi di atomicità (dividere o tenere T-403, T-902, T-905, T-1101, T-1202, T-1603).
- Azione esterna: creare un account API DataForSEO quando si arriva a T-902 (verificare se offre un ambiente sandbox gratuito per lo sviluppo); nessuna nuova domanda di Basic Access a Google, salvo cambio di prodotto verso la gestione di campagne Google Ads.
- L'utente fornisce D-14 (piani, prezzi, limiti) prima del macrotask 16 e D-15 (testi legali) prima di T-1803.
- BUILD, macrotask `foundation` su `trueline/build/foundation`: prossimo T-102 (lint e typecheck), poi T-103…T-107, T-109, T-108, T-110, poi il checkpoint a 4 controlli.
- Per i test d'integrazione: `docker compose -f docker-compose.test.yml up -d` (il container è fermo) e `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/kw_workbench_test` nella shell.
