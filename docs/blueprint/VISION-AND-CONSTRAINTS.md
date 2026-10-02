# VISION & CONSTRAINTS — Seo God Mode

| | |
|---|---|
| **Progetto** | Seo God Mode (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts`: Next.js App Router + Prisma su Postgres Supabase, deploy Vercel |
| **Owner / stakeholder** | `claudiosnivel-dot` (sviluppo e prodotto) |

---

## 1. Perché esiste (problema)

Chi fa SEO deve trasformare poche parole seme in liste ampie di keyword reali,
pulite, classificate e misurate, per poi decidere su quali lavorare. Seo God Mode
espande le seed con Google Autocomplete, normalizza e deduplica i suggerimenti, li
classifica per intento, li arricchisce con i volumi di ricerca e
permette di revisionarli ed esportarli (CSV, XLSX, JSON, Google Sheets).

L'app è online e funziona nel percorso base, ma l'audit del 2026-10-02 ha trovato
difetti in produzione e lacune che impediscono di venderla:

- **Difetti visibili oggi**: un cookie corrotto manda in errore 500 tutto il sito; i
  file di `/.well-known` sono bloccati dal login; i volumi di Keyword Planner non
  arrivano mai (API v18 dismessa; Basic Access respinto; la policy riserva Keyword
  Planner via API agli strumenti per campagne Google Ads, non a un SaaS SEO);
  le estrazioni fallite risultano riuscite; quando Google limita l'autocomplete la
  query stessa diventa una keyword.
- **Difetti di flusso**: ogni nuova estrazione cancella le revisioni; solo le prime
  5 o 6 seed vengono espanse; l'export non corrisponde alla sezione mostrata; la
  paginazione può duplicare o perdere righe.
- **Lacune da SaaS**: account senza email, nessun abbonamento né piano, nessun
  team, nessuna pagina pubblica o legale, nessun limite anti-abuso, nessun test,
  nessuna CI, nessun monitoraggio.

## 2. Per chi (utenti)

- **Clienti paganti**: freelance SEO e agenzie (team con più persone), in Italia e
  all'estero, interfaccia in italiano e inglese.
- **Root admin**: il proprietario del servizio. Gestisce utenti, fornitore delle
  metriche e relativa spesa, branding e KPI, senza accedere ai progetti dei clienti.

## 3. Obiettivo (cosa significa "fatto")

Seo God Mode diventa un SaaS vendibile:

1. i difetti dell'audit sono corretti e coperti da test;
2. lo stack gira sui major stabili (D-03) con CI verde;
3. l'estrazione gira in background con avanzamento visibile;
4. i volumi di ricerca si ottengono in modo affidabile e conforme: CSV dal Keyword
   Planner del cliente (sempre disponibile) e fornitore con licenza con tetto di
   spesa (D-09, D-30);
5. clienti con email verificata, workspace di team, abbonamenti via Merchant of
   Record, quote e limiti anti-abuso;
6. landing, prezzi, pagine legali e GDPR in IT/EN; errori tracciati, backup provati,
   rilascio da staging a produzione.

"Fatto" = `target_tests` verdi e checkpoint Trueline verde al confine di ogni
macrotask, **non** una dichiarazione dell'agente (`L-COL-002`, `L-COL-006`).

## 4. Non-goals (cosa NON facciamo in questa versione)

- API Google Ads per le metriche: la policy la riserva agli strumenti per campagne
  Google Ads e la domanda di Basic Access è stata respinta (D-09).
- Scraping dell'interfaccia di Google Keyword Planner o di Google Search (termini di
  servizio).
- Autenticazione a due fattori, SSO/SAML, login social.
- API pubblica per i clienti e app mobile.
- Analytics di prodotto e A/B test (D-13).
- Wrapping Electron (citato nel README: resta possibile, non è nel piano).
- Lingue oltre italiano e inglese.
- Testi legali definitivi scritti dall'agente (D-15).
- TypeScript 7 e Prisma 8 (D-03).

## 5. Vincoli

| Tipo | Vincolo |
|---|---|
| Ecosistema | `postgres-jsts`: isolamento applicativo per utente (poi per workspace) su ogni rotta; nessuna dipendenza da supabase-js |
| Sicurezza | Nessun segreto nel sorgente; variabili d'ambiente validate e fail-closed (T-201); RLS deny-all sulle tabelle `public` per chiudere la Data API Supabase (D-20); OWASP Top 10:2025 come vocabolario |
| Git | Branch a strati; `main_deploy_coupled: true` (`vercel.json`, ogni push su `master` va in produzione): **ogni merge su `master` è human-gated anche col checkpoint verde** (`L-COL-024`, `L-COL-025`) |
| Ambienti | Le Preview Vercel eseguono `prisma migrate deploy` + seed sul DB del proprio ambiente: nessun push di branch che non contenga la guardia di T-202, e nessun push di branch con migrazioni finché lo staging separato non è confermato (D-04, T-202, T-203) |
| Dati | In produzione solo dati di test (D-05) |
| Piattaforma | Vercel (funzioni con durata massima configurata; `maxDuration` attuale 300 s per la run e 120 s per l'export); Supabase via transaction pooler (porta 6543) per il runtime e session/direct (5432) per le migrazioni |
| Metriche | Volumi solo da file esportati dal cliente dal proprio Keyword Planner o da un fornitore con licenza (D-09, D-30); nessuna chiamata all'API Google Ads per le metriche, nessuno scraping |
| Pagamenti | Merchant of Record (D-06): IVA e fatture a carico del provider |
| Lingue | Italiano (default) e inglese per interfaccia, email, landing e pagine legali (D-07) |
| Test | Nessuna chiamata di rete reale nei test: Google, Paddle, Resend, Turnstile e Sentry sempre mockati |

## 6. Parity gate (promessa forte)

Per i task nuovi: conformità alla specifica, cioè i `target_tests` del task passano
al checkpoint. Per il codice esistente vale anche l'invarianza: la baseline di
caratterizzazione del macrotask 01 resta verde. Quando una correzione cambia
volutamente un comportamento fotografato, le asserzioni impattate si aggiornano
con conferma umana; una regressione su un'asserzione di guardia blocca il commit.

## 7. Baseline & budget

- **Baseline di sicurezza**: `.trueline/baseline.json` (catturata al primo
  checkpoint dopo T-108).
- **Baseline d'igiene**: `.trueline/hygiene-baseline.json` (morto e duplicati
  pre-esistenti; si riduce con il macrotask 11).
- **Budget del loop**: `MAX_RETRIES_PER_FINDING = 2`, `GLOBAL_WALL_CLOCK_MS = 242401`.

## 8. Fonti di verità

- **Piano**: `docs/blueprint/00-INDEX.md` + moduli `01-…`–`18-…`.
- **Stato vivo**: `docs/blueprint/SESSION-STATE.md`.
