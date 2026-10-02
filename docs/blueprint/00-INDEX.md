# 00-INDEX — Blueprint di Seo God Mode

> Blueprint di correzione e completamento, generato con Trueline (piano in stile
> BOOTSTRAP su codice esistente, D-01) a partire dall'audit del 2026-10-02.
> Esecuzione: modalità BUILD, un macrotask alla volta, checkpoint a 4 controlli
> al confine di ogni macrotask.

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`), in produzione su `titanseo.vercel.app` |
| **Ecosistema** | `postgres-jsts` (rilevato da `scripts/ecosystem/resolve.mjs`): Next.js + Prisma su Postgres Supabase, autorizzazione applicativa sulle rotte |
| **Obiettivo** | Correggere i difetti emersi dall'audit, aggiornare lo stack ai major stabili e portare l'app a SaaS vendibile (workspace, abbonamenti, email, IT/EN, anti-abuso, pagine pubbliche e legali, osservabilità) |
| **Schema task** | `atomic-task-schema.md` (`L-COL-019`): ogni task ha `definition_of_done`, `acceptance_criteria`, `target_tests` |
| **Branch del piano** | `trueline/blueprint` |

---

## 1. Mappa dei moduli

| File | Macrotask | Task | Contenuto |
|---|---|---|---|
| `01-foundation.md` | `foundation` | T-101…T-110 | Test (Vitest, Postgres di test in Docker, Playwright), lint/typecheck, caratterizzazione del comportamento attuale, oracoli Trueline, contratto di altitudine, CI |
| `02-environments.md` | `environments` | T-201…T-205 | Variabili d'ambiente fail-closed, guardia migrazioni nel build Vercel, staging separato, seed idempotente, blocco Data API Supabase |
| `03-hotfix.md` | `hotfix` | T-301…T-306 | Difetti visibili in produzione: cookie malformato → 500, `/.well-known` bloccato, open redirect, Google Ads API v18 dismessa, job falliti mostrati come riusciti, keyword fittizie dal fallback |
| `04-stack-upgrade.md` | `stack-upgrade` | T-401…T-407 | Next 15.5.27 → 16.3, React 19.3, TypeScript 6.0, Prisma 7.10, Tailwind 4.3, exceljs al posto di xlsx, Node 24 |
| `05-auth-hardening.md` | `auth-hardening` | T-501…T-507 | Sessioni revocabili, utenti sospesi, errori API uniformi, hash asincrono, header di sicurezza, branding, dashboard admin |
| `06-observability-ops.md` | `observability-ops` | T-601…T-605 | Error tracking, log strutturati, health check, backup e ripristino, pipeline di rilascio |
| `07-extraction-fixes.md` | `extraction-fixes` | T-701…T-707 | Budget query equo, normalizzazione multilingua, filtro brand, classificazione, re-run che conserva la revisione, job robusti, punteggio |
| `08-results-export.md` | `results-export` | T-801…T-810 | Paginazione, sezione mostrata = esportata, azioni massive sui filtrati, CSV per Excel IT, export in streaming, Sheets, sezioni, validazione input, dashboard |
| `09-google-integrations.md` | `google-integrations` | T-901…T-908 | Keyword Planner (parsing, metriche storiche), CLI di diagnosi API, CLI export/import CSV Planner, OAuth Google, scope minimo Sheets |
| `10-onboarding.md` | `onboarding` | T-1001…T-1004 | Creazione idempotente, ricomincia/indietro, precondizioni dei passi, lettura leggera dello stato |
| `11-cleanup.md` | `cleanup` | T-1101…T-1105 | Codice morto (human-gated), duplicazioni, schema e indici, accessibilità, prestazioni per richiesta |
| `12-background-jobs.md` | `background-jobs` | T-1201…T-1205 | Estrazione in background ripartibile, continuazione firmata, API 202/stato/annulla, barra di avanzamento |
| `13-i18n.md` | `i18n` | T-1301…T-1303 | Italiano/inglese: infrastruttura e migrazione di tutte le stringhe |
| `14-accounts-email.md` | `accounts-email` | T-1401…T-1405 | Identità via email, email transazionali, verifica, recupero password, consenso ai termini |
| `15-workspaces.md` | `workspaces` | T-1501…T-1504 | Workspace e membership, autorizzazione per workspace su tutte le rotte, inviti, selettore |
| `16-billing.md` | `billing` | T-1601…T-1605 | Piani e diritti, checkout Merchant of Record, webhook firmati, portale cliente, enforcement lato server |
| `17-abuse-quotas.md` | `abuse-quotas` | T-1701…T-1705 | Rate limiting, CAPTCHA, quote d'uso, registro azioni admin, KPI |
| `18-marketing-legal.md` | `marketing-legal` | T-1801…T-1805 | Landing IT/EN e SEO, prezzi, pagine legali versionate, GDPR (export/cancellazione), contatti |

Totale: 18 macrotask, 106 task atomici.

## 1bis. Contratto di altitudine (abilita `arch_check` in BUILD)

Deriva dal codice attuale (D-22). T-109 rimuove l'unica violazione esistente
(componenti client che importano tipi da `lib/onboarding/progress.ts`, che a sua
volta importa Prisma).

```yaml
architecture:
  layers:
    ui: "components/**"
    domain: "lib/modules/**"
    data: "lib/prisma.ts"
    routes: "app/**"
  forbidden:
    - { from: ui, to: data }
    - { from: domain, to: ui }
    - { from: domain, to: routes }
```

## 2. Piano di build (ordine dei macrotask)

Ordine derivato dal DAG dei task (`depends_on`). Le frecce indicano dipendenze
fra macrotask; ogni macrotask si chiude col checkpoint prima del commit.

```
macrotask                 dipende da (macrotask che contengono i task in depends_on)
01 foundation             —
02 environments           01
03 hotfix                 01
04 stack-upgrade          01, 02, 03
05 auth-hardening         02, 04
06 observability-ops      01, 02, 04, 05
07 extraction-fixes       01, 03
08 results-export         01, 04, 05
09 google-integrations    03, 05, 07
10 onboarding             03, 05
11 cleanup                01, 04, 05, 07, 08
12 background-jobs        02, 03, 04, 05, 07, 10
13 i18n                   04, 05, 12
14 accounts-email         02, 05, 12, 13
15 workspaces             11, 12, 13, 14
16 billing                15
17 abuse-quotas           05, 12, 14, 16
18 marketing-legal        03, 09, 13, 14, 15, 16, 17
```

Tabella calcolata dai `depends_on` reali dei 106 task (417 criteri di
accettazione). Ogni macrotask dipende solo da macrotask con numero inferiore.

Ordine lineare consigliato: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 →
11 → 12 → 13 → 14 → 15 → 16 → 17 → 18. Il 03 dipende solo da 01 e viene prima
del 04 apposta, per correggere subito i difetti visibili in produzione. Il 07
(dipende da 01 e 03) può essere anticipato subito dopo il 03.

## 3. Aggancio alla sicurezza

- Ecosistema `postgres-jsts`: l'isolamento fra utenti (poi fra workspace) è
  **applicativo**, sulle rotte. Ogni task che legge o scrive dati per conto di un
  utente filtra per l'identità della sessione (oggi `owner_user_id`, da T-1501
  `workspace_id` della membership). Floor degli oracoli: `secret`,
  `dependency-vuln`, `authz`.
- Eccezione RLS: T-205 abilita Row Level Security senza policy sulle tabelle
  `public` di Supabase per chiudere la Data API (D-20, standard R1; deroga
  documentata a R2).
- Macrotask che toccano dati/auth: `foundation` (guardia DB di test),
  `environments`, `hotfix`, `auth-hardening`, `results-export`,
  `google-integrations`, `onboarding`, `background-jobs`, `accounts-email`,
  `workspaces`, `billing`, `abuse-quotas`, `marketing-legal`. I loro task portano
  `security_notes` con categoria OWASP Top 10:2025 e CWE.
- Segreti: solo da variabili d'ambiente validate (T-201), mai nel sorgente;
  `gitleaks` gira a ogni checkpoint.

## 4. Decision ledger

Le decisioni si modificano **solo** con un emendamento registrato qui.
DECISA = scelta dell'utente o fatto verificato. PROPOSTA = default dell'agente:
vale finché l'utente non la cambia, va confermata prima del macrotask che la usa.
APERTA = blocca i task che la citano finché l'utente non fornisce il valore.

| ID | Decisione | Stato |
|---|---|---|
| D-01 | Piano in stile BOOTSTRAP su codice esistente; esecuzione in BUILD; prima la rete di caratterizzazione (macrotask 01). | DECISA (utente, 2026-10-02) |
| D-02 | Ecosistema `postgres-jsts`: authz applicativa route-level; floor oracoli secret, dependency-vuln, authz. | DECISA (oracolo `resolve.mjs`) |
| D-03 | Stack: Next 16.3.x, React 19.3.x, Prisma 7.10.x (8.x è RC: escluso), Tailwind 4.3.x, TypeScript 6.0.x (TS 7 escluso), ESLint 9.39.x + eslint-config-next 16, Vitest 5, Playwright 1.63, exceljs 4.4 al posto di xlsx, Node 24 LTS. Prima la patch di sicurezza Next 15.5.27, poi un major per task. Pin esatti obbligatori: i dist-tag `latest` di `prisma` (8.0.0-rc) e `typescript` (7.0) puntano a versioni escluse. | DECISA (utente: "Major stabili"). **Emendamento 2026-10-02**: ESLint 10 → 9.39.x, perché i plugin richiesti da eslint-config-next 16.3.8 (eslint-plugin-react 7.37, eslint-plugin-jsx-a11y 6.10) accettano eslint fino alla 9 (verificato con `npm view`); `--legacy-peer-deps` vietato |
| D-04 | DB delle Preview Vercel non noto: staging separato (T-203) prima di qualunque push di branch con migrazioni. Fino ad allora i branch con migrazioni restano locali. | DECISA (utente) |
| D-05 | In produzione ci sono solo dati di test: ammesse migrazioni drastiche, invalidazione di tutte le sessioni, pulizia dei dati di prova. | DECISA (utente) |
| D-06 | Pagamenti con Merchant of Record. Provider: Paddle Billing (alternativa Lemon Squeezy), dietro interfaccia `BillingProvider`. | MoR DECISO (utente); provider PROPOSTA |
| D-07 | Mercato Italia + estero: interfaccia IT/EN, default `it`. Libreria next-intl. | Mercato DECISO (utente); libreria PROPOSTA |
| D-08 | Account a team/workspace. Ruoli OWNER/ADMIN/MEMBER. Matrice: MEMBER legge/modifica progetti, avvia estrazioni, esporta; ADMIN + elimina progetti e gestisce membri; OWNER + billing e workspace. Ruoli di piattaforma (root admin) separati. | Workspace DECISO (utente); matrice PROPOSTA |
| D-09 | Keyword Planner: (a) API ufficiale v25 con CLI di diagnosi. Dal 9/9/2026 i developer token sono dismessi: il livello d'accesso appartiene al **progetto Google Cloud** del client OAuth (header `developer-token` facoltativo e ignorato). Per KeywordPlanIdeaService serve il **Basic Access** del progetto Cloud, che richiede la verifica del brand (Explorer lo esclude); la richiesta si fa dalla Google Cloud Console, senza account manager (azione esterna dell'utente). (b) Round-trip CSV via CLI e upload, come strada che funziona anche senza Basic Access. Fornitori terzi a pagamento esclusi finché non richiesti; scraping dell'interfaccia Google escluso (termini di servizio). | PROPOSTA. **Emendamento 2026-10-02**: modello d'accesso aggiornato dopo verifica su developers.google.com (access-levels, no-developer-token) |
| D-10 | Job in background senza vendor: passi con budget di tempo, continuazione firmata via `after()`, reaper al polling e via cron. Alternativa: Inngest o QStash. | PROPOSTA |
| D-11 | Email transazionali con Resend dietro interfaccia `EmailSender`; outbox in test e sviluppo. | PROPOSTA |
| D-12 | Rate limiting su Postgres (nessun Redis); CAPTCHA Cloudflare Turnstile. | PROPOSTA |
| D-13 | Error tracking con Sentry; nessuna analytics di prodotto nel piano. | PROPOSTA |
| D-14 | Nomi dei piani, prezzi, limiti, durata del trial, periodo di tolleranza: forniti dall'utente; il codice li legge da un'unica configurazione (T-1601). | APERTA (blocca T-1601…T-1605, T-1703, T-1802) |
| D-15 | Testi legali (privacy, termini, cookie): forniti dall'utente, da un consulente o da un generatore (es. iubenda). L'agente non scrive testi legali definitivi. | APERTA (blocca T-1803) |
| D-16 | `/` mostra la landing agli anonimi e la dashboard agli autenticati. | PROPOSTA |
| D-17 | Volumi di Keyword Planner a range ("1K – 10K") importati come punto medio con `metrics_precision = 'range'`. | PROPOSTA |
| D-18 | Ordinamento risultati: prima le keyword con metriche reali, poi quelle con solo punteggio euristico (`score_source`). | PROPOSTA |
| D-19 | Re-run: le keyword non più prodotte vengono rimosse; quelle ancora prodotte conservano `review_status` e `selected_for_export`. | PROPOSTA |
| D-20 | RLS abilitata senza policy sulle tabelle `public` di Supabase (Data API non usata; Prisma accede come owner). Deroga documentata allo standard R2. | PROPOSTA |
| D-21 | La "sezione predefinita" si usa davvero (`default_subproject_id`) e si collega il pulsante esistente `SetDefaultSectionButton`, invece di rimuoverlo. | PROPOSTA |
| D-22 | Contratto di altitudine §1bis: ui=`components/**`, domain=`lib/modules/**`, data=`lib/prisma.ts`, routes=`app/**`; vietati ui→data, domain→ui, domain→routes. | DECISA (deriva dal codice) |
| D-23 | Risultati ed export: pagina da 20 a 250 righe, default 100 (T-801); CSV di default nel formato Excel italiano (`;`, decimali con virgola) con opzione `csvDialect=rfc4180` (T-804); export Sheets a blocchi di 5.000 righe (T-806); ogni scope di export si combina con i filtri della vista e "selected" esclude le rifiutate (T-807); colonna `projects.last_activity_at` (T-810). | PROPOSTA |
| D-24 | Limiti di input: nome progetto 120 caratteri, descrizione 1.000, seed 200, al massimo 500 seed con errore 400 esplicito; provider metriche MOCK riservato al root admin (403) (T-809). Timeout della transazione di salvataggio 60 s, messaggio d'errore del job troncato a 500 caratteri (T-706). | PROPOSTA |
| D-25 | Normalizzazione: accenti rimossi solo per scritture latine, greche e cirilliche; articolo rimosso solo per l'inglese e solo "the" iniziale; possessivo inglese gestito (T-702). Filtro brand a parola intera, con il falso positivo noto "dell" contro "dell'aquila" (T-703). Intento neutro = valore esistente `mixed` (T-704). | PROPOSTA |
| D-26 | Export per Keyword Planner a blocchi di 1.000 keyword (default prudente e configurabile; limite reale da verificare su un file vero) (T-904). | PROPOSTA |
| D-27 | Soglie di rate limit configurabili da env (T-1701); le estrazioni contano nella quota al momento dell'avvio e i job falliti non vengono stornati (T-1703). | PROPOSTA (valori da confermare con D-14) |
| D-28 | URL pubblici: italiano senza prefisso, inglese con `/en` (landing, prezzi, pagine legali), per sitemap e hreflang; l'app autenticata usa la lingua risolta da T-1301 (T-1801). | PROPOSTA |
| D-29 | Cancellazione account: l'unico OWNER di un workspace che ha altri membri riceve 409 `OWNERSHIP_TRANSFER_REQUIRED` (T-1804). Registrazione con risposta 202 identica per email nuove ed esistenti, con avviso `account-exists` al titolare (T-1403). Il consenso ai termini blocca le pagine, non le API JSON (T-1405). | PROPOSTA |

## 5. Fonti di verità

- **Piano**: questo blueprint (`docs/blueprint/00-INDEX.md` + moduli `01-…`–`18-…`).
- **Visione e vincoli**: `docs/blueprint/VISION-AND-CONSTRAINTS.md`.
- **Stato vivo**: `docs/blueprint/SESSION-STATE.md`.
- **Baseline dei finding**: `.trueline/baseline.json` (artefatto di run, gitignorato);
  **baseline d'igiene**: `.trueline/hygiene-baseline.json` (tracciato in git con
  negazione nel `.gitignore`, creato da T-108).
- **Budget del loop di fix**: soglie Trueline (`references/oracles/thresholds.md`):
  `MAX_RETRIES_PER_FINDING = 2`, `GLOBAL_WALL_CLOCK_MS = 242401`.
- **Prompt di lifecycle**: `docs/blueprint/prompts/` (project-start, session-start, session-end).
- **Rilievi d'origine**: audit del 2026-10-02 (sintesi nelle note dei singoli task).

## 6. Self-check del blueprint

- **Strutturale**: `node <trueline>/scripts/blueprint/validate_blueprint.mjs docs/blueprint` → atteso exit 0.
- **Osservabilità degli AC**: `node <trueline>/scripts/blueprint/ac_observability_check.mjs docs/blueprint` → atteso exit 0.
- **Semantico**: `self-check-checklist.md` punti 6–10; i rilievi vanno all'utente.
