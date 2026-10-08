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
| `02-environments.md` | `environments` | T-201…T-205 | Variabili d'ambiente fail-closed, guardia migrazioni nel build Vercel, matrice degli ambienti (staging annullato, D-04), seed idempotente, blocco Data API Supabase |
| `03-hotfix.md` | `hotfix` | T-301…T-306 | Difetti visibili in produzione: cookie malformato → 500, `/.well-known` bloccato, open redirect, chiamate all'API Google Ads dismessa, job falliti mostrati come riusciti, keyword fittizie dal fallback |
| `04-stack-upgrade.md` | `stack-upgrade` | T-401…T-407 | Next 15.5.27 → 16.3, React 19.3, TypeScript 6.0, Prisma 7.10, Tailwind 4.3, exceljs al posto di xlsx, Node 24 |
| `05-auth-hardening.md` | `auth-hardening` | T-501…T-507 | Sessioni revocabili, utenti sospesi, errori API uniformi, hash asincrono, header di sicurezza, branding, dashboard admin |
| `06-observability-ops.md` | `observability-ops` | T-601…T-605 | Error tracking, log strutturati, health check, backup e ripristino, pipeline di rilascio |
| `07-extraction-fixes.md` | `extraction-fixes` | T-701…T-707 | Budget query equo, normalizzazione multilingua, filtro brand, classificazione, re-run che conserva la revisione, job robusti, punteggio |
| `08-results-export.md` | `results-export` | T-801…T-810 | Paginazione, sezione mostrata = esportata, azioni massive sui filtrati, CSV per Excel IT, export in streaming, Sheets, sezioni, validazione input, dashboard |
| `09-google-integrations.md` | `google-integrations` | T-901…T-910 | Volumi di ricerca: dismissione dell'API Google Ads, fornitore con licenza (DataForSEO) con tetto di spesa, export/import CSV di Keyword Planner (CLI e interfaccia); OAuth e scope minimo di Google Sheets |
| `10-onboarding.md` | `onboarding` | T-1001…T-1004 | Creazione idempotente, ricomincia/indietro, precondizioni dei passi, lettura leggera dello stato |
| `11-cleanup.md` | `cleanup` | T-1101…T-1105 | Codice morto (human-gated), duplicazioni, schema e indici, accessibilità, prestazioni per richiesta |
| `12-background-jobs.md` | `background-jobs` | T-1201…T-1205 | Estrazione in background ripartibile, continuazione firmata, API 202/stato/annulla, barra di avanzamento |
| `13-i18n.md` | `i18n` | T-1301…T-1303 | Italiano/inglese: infrastruttura e migrazione di tutte le stringhe |
| `14-accounts-email.md` | `accounts-email` | T-1401…T-1405 | Identità via email, email transazionali, verifica, recupero password, consenso ai termini |
| `15-workspaces.md` | `workspaces` | T-1501…T-1504 | Workspace e membership, autorizzazione per workspace su tutte le rotte, inviti, selettore |
| `16-billing.md` | `billing` | T-1601…T-1606 | Piani e diritti, checkout Merchant of Record, webhook firmati, portale cliente, enforcement lato server, interruttore del lancio commerciale (D-32) |
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
16 billing                09, 15
17 abuse-quotas           05, 09, 12, 14, 16
18 marketing-legal        03, 09, 13, 14, 15, 16, 17
```

Tabella calcolata dai `depends_on` reali dei 106 task (418 criteri di
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
| D-04 | DB delle Preview Vercel non noto: staging separato (T-203) prima di qualunque push di branch con migrazioni. Fino ad allora i branch con migrazioni restano locali. **Inoltre nessun branch si pubblica finché non contiene T-202**: oggi `vercel-build` esegue `prisma migrate deploy` e `prisma db seed` (con `deleteMany` sui dati globali) su ogni deploy Preview, anche di un branch senza migrazioni. La prima run della CI su un branch pubblicato passa quindi da T-110 a T-202. | DECISA (utente). **Emendamento 2026-10-02**: esteso a ogni push di branch prima di T-202. **Emendamento 2026-10-04 (sostituisce i divieti di push)**: decisione dell'utente «deploy automatici»: a checkpoint verde push e merge su `master` sono autonomi, quindi il deploy in produzione è automatico, anche prima di T-202 e T-203. Rischio accettato con D-05: finché il branch pubblicato non contiene T-202, il suo deploy Preview esegue `prisma migrate deploy` e il seed sul DB delle Preview, che può essere quello di produzione. La prima run della CI torna a T-110 **Emendamento 2026-10-04 (decisione dell'utente «lavoriamo senza staging»)**: nessun DB di staging. Preview e Production condividono le variabili e il DB di produzione; con T-202 e `PRODUCTION_DB_HOST` non impostata i deploy Preview non applicano migrazioni né seed, mentre il codice dei branch in Preview legge e scrive il DB di produzione (rischio accettato con D-05). I passi manuali di T-203 sono annullati e `npm run env:check` segnala `PREVIEW USA IL DB DI PRODUZIONE` (esito atteso). T-601 (URL di staging nel monitoraggio) e T-605 (Preview su staging nella pipeline di rilascio) si adattano quando si costruisce il macrotask 06 **Emendamento 2026-10-05 (decisione dell'utente)**: nel macrotask 06 il monitoraggio uptime riguarda solo la produzione (T-603), la prova di ripristino del backup gira su un Postgres locale in Docker (T-604) e la pipeline di rilascio è PR + CI verde + checkpoint, senza passo di staging, con la branch protection su `master` attivata dall'agente (T-605); moduli aggiornati |
| D-05 | In produzione ci sono solo dati di test: ammesse migrazioni drastiche, invalidazione di tutte le sessioni, pulizia dei dati di prova. | DECISA (utente) |
| D-06 | Pagamenti con Merchant of Record. Provider: Paddle Billing (alternativa Lemon Squeezy), dietro interfaccia `BillingProvider`. | MoR DECISO (utente); provider DECISO (utente, 2026-10-05): Paddle Billing |
| D-07 | Mercato Italia + estero: interfaccia IT/EN, default `it`. Libreria next-intl. | DECISA (utente: mercato; libreria next-intl (utente, 2026-10-05)) |
| D-08 | Account a team/workspace. Ruoli OWNER/ADMIN/MEMBER. Matrice: MEMBER legge/modifica progetti, avvia estrazioni, esporta; ADMIN + elimina progetti e gestisce membri; OWNER + billing e workspace. Ruoli di piattaforma (root admin) separati. | DECISA (utente: workspace; matrice (utente, 2026-10-05)) |
| D-09 | Volumi di ricerca: **l'API Google Ads non si usa per le metriche**. La domanda di Basic Access è stata respinta e la policy limita KeywordPlanIdeaService agli strumenti che aiutano a creare e gestire campagne Google Ads (pagina ufficiale access-levels, "permissible use"): un SaaS SEO non rientra. Strade: (a) CSV che ogni cliente esporta dal proprio Keyword Planner e reimporta (CLI e interfaccia, T-904/T-905), sempre disponibile; (b) fornitore di dati con licenza dietro `MetricsProvider` (D-30). Il provider GOOGLE_KEYWORD_PLANNER viene disattivato (T-304) e rimosso (T-901). Scraping dell'interfaccia Google escluso (termini di servizio). | DECISA (utente, 2026-10-02: "CSV + fornitore"). Sostituisce la versione precedente basata su API ufficiale e CLI di diagnosi |
| D-10 | Job in background senza vendor: passi con budget di tempo, continuazione firmata via `after()`, reaper al polling e via cron. Alternativa: Inngest o QStash. | DECISA (utente, 2026-10-05) |
| D-11 | Email transazionali con Resend dietro interfaccia `EmailSender`; outbox in test e sviluppo. | DECISA (utente, 2026-10-05). **Emendamento 2026-10-07 (decisione dell'utente)**: l'account Resend, `RESEND_API_KEY` ed `EMAIL_FROM` si configurano alla fine del blueprint; fino ad allora in produzione le due variabili sono facoltative (insieme o nessuna), il trasporto resta `resend` e ogni invio fallisce subito come «non configurato», registrato nei log senza bloccare l'avvio. Conseguenze accettate: i nuovi utenti non ricevono l'email di verifica (quindi non avviano estrazioni) né quella di recupero password; il root admin ha l'email verificata dal seed |
| D-12 | Rate limiting su Postgres (nessun Redis); CAPTCHA Cloudflare Turnstile. | DECISA (utente, 2026-10-05) |
| D-13 | Error tracking con Sentry; nessuna analytics di prodotto nel piano. | DECISA (utente, 2026-10-05) |
| D-14 | Nomi dei piani, prezzi, limiti, durata del trial, periodo di tolleranza: forniti dall'utente; il codice li legge da un'unica configurazione (T-1601). | APERTA: serve solo ad attivare il lancio commerciale (D-32, checklist di T-1606); non blocca più la costruzione di T-1601…T-1606, T-1703 e T-1802, che usano i segnaposto dichiarati |
| D-15 | Testi legali (privacy, termini, cookie): forniti dall'utente, da un consulente o da un generatore (es. iubenda). L'agente non scrive testi legali definitivi. | APERTA: serve solo ad attivare il lancio commerciale (D-32); T-1803 si costruisce con i segnaposto già previsti |
| D-16 | `/` mostra la landing agli anonimi e la dashboard agli autenticati. | DECISA (utente, 2026-10-05); con D-28 emendata l'anonimo su `/` viene reindirizzato alla landing nella sua lingua |
| D-17 | Volumi di Keyword Planner a range ("1K – 10K") importati come punto medio con `metrics_precision = 'range'`. | DECISA (utente, 2026-10-05) |
| D-18 | Ordinamento risultati: prima le keyword con metriche reali, poi quelle con solo punteggio euristico (`score_source`). | DECISA (utente, 2026-10-05) |
| D-19 | Re-run: le keyword non più prodotte vengono rimosse; quelle ancora prodotte conservano `review_status` e `selected_for_export`. | DECISA (utente, 2026-10-05). **Emendamento 2026-10-06 (decisione dell'utente)**: con il provider di metriche effettivo NONE, le keyword con volumi importati da Keyword Planner (`PLANNER_CSV`) li conservano al re-run, con il punteggio ricalcolato su quei volumi; con un altro provider valgono le sue metriche (T-910, AC-910-3) |
| D-20 | RLS abilitata senza policy sulle tabelle `public` di Supabase (Data API non usata; Prisma accede come owner). Deroga documentata allo standard R2. | DECISA (utente, 2026-10-04: «confermo d-20»). Sblocca T-205 |
| D-21 | La "sezione predefinita" si usa davvero (`default_subproject_id`) e si collega il pulsante esistente `SetDefaultSectionButton`, invece di rimuoverlo. | DECISA (utente, 2026-10-05) |
| D-22 | Contratto di altitudine §1bis: ui=`components/**`, domain=`lib/modules/**`, data=`lib/prisma.ts`, routes=`app/**`; vietati ui→data, domain→ui, domain→routes. | DECISA (deriva dal codice) |
| D-23 | Risultati ed export: pagina da 20 a 250 righe, default 100 (T-801); CSV di default nel formato Excel italiano (`;`, decimali con virgola) con opzione `csvDialect=rfc4180` (T-804); export Sheets a blocchi di 5.000 righe (T-806); ogni scope di export si combina con i filtri della vista e "selected" esclude le rifiutate (T-807); colonna `projects.last_activity_at` (T-810). | DECISA (utente, 2026-10-05) |
| D-24 | Limiti di input: nome progetto 120 caratteri, descrizione 1.000, seed 200, al massimo 500 seed con errore 400 esplicito; provider metriche MOCK riservato al root admin (403) (T-809). Timeout della transazione di salvataggio 60 s, messaggio d'errore del job troncato a 500 caratteri (T-706). | DECISA (utente, 2026-10-05) |
| D-25 | Normalizzazione: accenti rimossi solo per scritture latine, greche e cirilliche; articolo rimosso solo per l'inglese e solo "the" iniziale; possessivo inglese gestito (T-702). Filtro brand a parola intera, con il falso positivo noto "dell" contro "dell'aquila" (T-703). Intento neutro = valore esistente `mixed` (T-704). | DECISA (utente, 2026-10-05) |
| D-26 | Export per Keyword Planner a blocchi di 1.000 keyword (default prudente e configurabile; limite reale da verificare su un file vero) (T-904). | DECISA (utente, 2026-10-05) |
| D-27 | Soglie di rate limit configurabili da env (T-1701); le estrazioni contano nella quota al momento dell'avvio e i job falliti non vengono stornati (T-1703). | DECISA (utente, 2026-10-05; soglie da env, valori numerici con D-14). **Emendamento 2026-10-05 (principio e meccanismo decisi dall'utente)**: se l'errore è nostro l'utente non paga; servono un modo per riconoscere un errore nostro (rimborso della quota) e uno per riconoscere un abuso. Meccanismo DECISO (utente, 2026-10-05): la quota si riserva all'avvio; ogni job fallito porta una causa classificata dal codice (`INTERNAL`: eccezione non prevista, DB, timeout dell'infrastruttura, fornitore esterno non disponibile → quota restituita; `USER`: input non valido o annullamento dell'utente → quota consumata); contro l'abuso restano il rate limit sugli avvii (T-1701), al massimo un job attivo per workspace e un tetto di rimborsi automatici per periodo oltre il quale il caso va all'admin con un avviso (Sentry, registro azioni T-1704) |
| D-28 | URL pubblici: italiano senza prefisso, inglese con `/en` (landing, prezzi, pagine legali), per sitemap e hreflang; l'app autenticata usa la lingua risolta da T-1301 (T-1801). | **EMENDATA (utente, 2026-10-05)**: prefisso per entrambe le lingue, `/it` e `/en`; `/` reindirizza in base alla lingua del browser (default `it`), hreflang e sitemap per entrambe. T-1801…T-1805 si adattano quando si costruisce il macrotask 18 (oggi citano `/` e `/en`) |
| D-29 | Cancellazione account: l'unico OWNER di un workspace che ha altri membri riceve 409 `OWNERSHIP_TRANSFER_REQUIRED` (T-1804). Registrazione con risposta 202 identica per email nuove ed esistenti, con avviso `account-exists` al titolare (T-1403). Il consenso ai termini blocca le pagine, non le API JSON (T-1405). | DECISA (utente, 2026-10-05) |
| D-30 | Fornitore di metriche con licenza: DataForSEO, endpoint Google Ads search volume in modalità live (fino a 1.000 keyword per richiesta, costo per richiesta indipendente dal numero di keyword: 0,09 USD live, 0,06 USD in coda con 1–3 ore; max 12 richieste/minuto). Credenziali solo da env validata; tetto di spesa mensile globale e per estrazione (T-903); metriche con licenza riservate ai piani che le includono, con quota mensile di keyword (T-1601, T-1605, T-1703; valori da D-14). Alternative valutabili: coda standard più economica dopo i job in background (12), altri fornitori. | DECISA (utente, 2026-10-05): T-902 si costruisce e si prova senza account, con risposte simulate; l'attivazione reale arriva con le credenziali dell'utente |
| D-31 | Piano Supabase di produzione: Free, senza backup giornalieri automatici. Backup logico periodico con `scripts/db-backup.mjs` (T-604), conservato fuori dal repo e fuori da Supabase con accesso ristretto; prova di ripristino su un Postgres locale in Docker con conteggi e hash. Frequenza e conservazione da indicare in `docs/OPERATIONS.md` (T-604). | Piano DECISO (utente, 2026-10-05); frequenza e conservazione DECISE (utente, 2026-10-05): backup giornaliero più uno prima di ogni deploy con migrazione, 14 giornalieri e il primo di ogni mese per 6 mesi, prova di ripristino mensile |
| D-32 | Lancio commerciale dietro un interruttore. Billing (piani, checkout, abbonamenti, limiti e quote), prezzi pubblici e registrazione pubblica si costruiscono ma restano in pausa finché il root admin non li attiva dal pannello admin (T-1606). In pausa: nessun limite né quota per gli utenti (diritti illimitati; il fornitore di metriche con licenza resta del solo root admin, T-902), nessun acquisto, registrazione pubblica chiusa (account creati dal root admin, già con l'email verificata, o inviti nei workspace). L'attivazione richiede una checklist tutta verde: valori di D-14, credenziali e prezzi Paddle (D-06), Resend (D-11), testi legali (D-15), chiavi Turnstile (D-12); l'interruttore si può rispegnere. D-14 e D-15 non bloccano più la costruzione: i task usano i segnaposto dichiarati. | DECISA (utente, 2026-10-08: nessun limite in pausa, account solo creati dal root admin, interruttore nel pannello admin con checklist) |

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
