# SESSION-STATE — Seo God Mode

> Fonte di verità sullo stato vivo del progetto. Si legge all'inizio di ogni
> sessione (`prompts/session-start.md`) e si aggiorna alla chiusura
> (`prompts/session-end.md`), solo dopo conferma del diff.

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts` |
| **Ultimo aggiornamento** | 2026-10-02 |
| **Sessione corrente** | 2026-10-02 — audit + blueprint (nessun codice modificato) |

---

## 1. Stato dei macrotask

| Macrotask | Stato | Checkpoint | Note |
|---|---|---|---|
| `foundation` (01) | todo | — | Primo macrotask eseguibile (nessuna dipendenza aperta) |
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
- **Task atomici in corso**: nessuno (si parte da T-101; ordine: T-101, poi T-102, T-103…T-107, T-109, T-108, T-110).
- **Criteri/test di riferimento**: `docs/blueprint/01-foundation.md`.

## 3. Stato git

| Campo | Valore |
|---|---|
| Branch di lavoro | `trueline/blueprint` (solo il piano; locale, non pushato) |
| Ultimo commit | commit del blueprint su `trueline/blueprint` |
| Stato merge su `master` | non eseguito |
| Deploy-coupling | `main_deploy_coupled: true` (rilevato da `detect_deploy_coupling.mjs`, segnale `vercel.json`): ogni push su `master` va in produzione → merge su `master` sempre human-gated |
| Push dei branch | sospeso per ogni branch che non contiene T-202 (il deploy Preview esegue migrazioni e seed) e, per i branch con migrazioni, finché T-203 non conferma un DB di Preview separato (D-04, emendamento 2026-10-02) |

## 4. Baseline & budget

- **Baseline di sicurezza**: non ancora catturata (`.trueline/baseline.json`, al primo checkpoint dopo T-108).
- **Baseline d'igiene**: non ancora catturata (`.trueline/hygiene-baseline.json`, T-108).
- **Budget consumato**: 0 / `MAX_RETRIES_PER_FINDING = 2` per finding, `GLOBAL_WALL_CLOCK_MS = 242401` per sessione.
- **Preflight oracoli**: non ancora eseguito (`scripts/preflight.mjs` all'inizio della prima sessione BUILD). Disponibili sulla macchina: Docker 29.5 (serve a semgrep e al Postgres di test), Node 25.5 locale (il progetto fissa Node 24 con T-407).

## 5. Esiti dell'ultima sessione

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
- Emendamenti del 2026-10-02, approvati dall'utente all'avvio di BUILD: D-04 esteso a ogni push di branch prima di T-202, con la prima run della CI spostata da T-110 a T-202; quarto progetto Vitest `tooling` in T-101 e `test:tooling` nel job checks di T-110; dipendenze di T-102 (+T-101), T-109 (+T-101) e T-108 (+T-101, T-103, T-109); jscpd in T-108; il riferimento a ESLint 10 in T-102 diventa 9.39.x.

## 6. Prossimi passi

- L'utente rivede il blueprint e conferma o modifica le decisioni PROPOSTA del ledger (00-INDEX §4), soprattutto D-08, D-09, D-10 e D-23…D-29.
- L'utente decide sui rilievi di atomicità (dividere o tenere T-403, T-902, T-905, T-1101, T-1202, T-1603).
- Azione esterna: creare un account API DataForSEO quando si arriva a T-902 (verificare se offre un ambiente sandbox gratuito per lo sviluppo); nessuna nuova domanda di Basic Access a Google, salvo cambio di prodotto verso la gestione di campagne Google Ads.
- L'utente fornisce D-14 (piani, prezzi, limiti) prima del macrotask 16 e D-15 (testi legali) prima di T-1803.
- Avvio di BUILD: preflight degli oracoli, poi macrotask `foundation` su branch `trueline/build/foundation`.
