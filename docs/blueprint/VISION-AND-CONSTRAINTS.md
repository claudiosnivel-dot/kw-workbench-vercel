# VISION & CONSTRAINTS — Titan SEO

| | |
|---|---|
| **Progetto** | Titan SEO (`kw-workbench-vercel`) |
| **Ecosistema** | `postgres-jsts`: Next.js App Router + Prisma su Postgres Supabase, deploy Vercel |
| **Owner / stakeholder** | `claudiosnivel-dot` (sviluppo e prodotto) |

---

## 1. Perché esiste (problema)

Chi fa SEO deve trasformare poche parole seme in liste ampie di keyword reali,
pulite, classificate e misurate, per poi decidere su quali lavorare. Titan SEO
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

Titan SEO diventa un SaaS vendibile:

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
7. (aggiunto il 2026-10-09, macrotask 19) dopo l'analisi, una strategia hub and spoke
   con H1 e H2 suggeriti, modificabile ed esportabile anche in PDF, usabile in un clic dai
   meno esperti (D-33, D-34).
8. (aggiunto il 2026-10-13, macrotask 23-26) un'esperienza d'uso chiara e guidata: un
   percorso unico idea → keyword → piano → scrittura, con il prossimo passo sempre
   indicato, l'avvio da un solo campo, il gesto unico tieni/scarta, il piano come
   bacheca con lo stato di scrittura e gli strumenti da esperto chiusi finché non
   servono (D-39).
9. (aggiunto il 2026-10-14, macrotask 28-34) account, workspace e amministrazione
   con la stessa chiarezza: due aree nel menu dell'utente («Il tuo account» e
   «Workspace») più Amministrazione, ciascuna a sezioni con la navigazione a
   sinistra; cambio dell'email, inviti con il link da copiare, scheda dell'utente
   ed elenco dei workspace per il root admin (D-41).
10. (aggiunto il 2026-10-16, macrotask 35-36) titoli più naturali a richiesta: nel
    pannello di una pagina del piano una proposta di H1 e H2 scritta da un modello
    gratuito via OpenRouter, che l'utente usa o scarta; alla generazione restano i
    modelli fissi (D-33 emendata, D-42).
11. (aggiunto il 2026-10-18, macrotask 37) ricerche che trovano davvero le keyword:
    più parole brevi nell'avvio rapido, composizioni nella lingua del progetto e un
    invito a cambiare le parole quando Google trova poco (D-44).
12. (aggiunto il 2026-10-18, macrotask 38-46) dal piano all'articolo: titoli e
    testi scritti da modelli gratuiti con le riserve quando uno è occupato,
    l'articolo di una pagina scritto a blocchi come da una persona, con i canoni
    SEO e i link interni del piano, riletto e modificato dall'utente, poi copiato,
    scaricato o inviato come bozza a WordPress (D-46).
13. (aggiunto il 2026-10-18, macrotask 47-51) Titan SEO in spagnolo di Spagna e
    d'America Latina: interfaccia, sito ed email localizzati come li scriverebbe un
    prodotto nato in quei mercati, e ricerche, piano, titoli e articoli nello
    spagnolo del paese del progetto (D-47).

"Fatto" = `target_tests` verdi e checkpoint Trueline verde al confine di ogni
macrotask, **non** una dichiarazione dell'agente (`L-COL-002`, `L-COL-006`).

## 4. Non-goals (cosa NON facciamo in questa versione)

- API Google Ads per le metriche: la policy la riserva agli strumenti per campagne
  Google Ads e la domanda di Basic Access è stata respinta (D-09).
- Scraping dell'interfaccia di Google Keyword Planner o di Google Search (termini di
  servizio).
- Autenticazione a due fattori, SSO/SAML, login social. (2026-10-14: verifica in due
  passaggi e dispositivi collegati annotati per un modulo di sicurezza futuro, da
  decidere con l'utente, D-41.)
- API pubblica per i clienti e app mobile.
- Analytics di prodotto e A/B test (D-13).
- Wrapping Electron (citato nel README: resta possibile, non è nel piano).
- Lingue oltre italiano e inglese.
- Analisi della SERP e scraping dei siti dei competitor per la strategia hub and spoke
  (D-33). I titoli scritti da un modello AI non sono più esclusi: dal 2026-10-16 sono una
  proposta a richiesta per una pagina alla volta (D-42); restano esclusi alla generazione
  del piano e con modelli a pagamento.
- Testi legali definitivi scritti dall'agente (D-15).
- TypeScript 7 e Prisma 8 (D-03).

## 5. Vincoli

| Tipo | Vincolo |
|---|---|
| Ecosistema | `postgres-jsts`: isolamento applicativo per utente (poi per workspace) su ogni rotta; nessuna dipendenza da supabase-js |
| Sicurezza | Nessun segreto nel sorgente; variabili d'ambiente validate e fail-closed (T-201); RLS deny-all sulle tabelle `public` per chiudere la Data API Supabase (D-20); OWASP Top 10:2025 come vocabolario |
| Git | Branch a strati; `main_deploy_coupled: true` (`vercel.json`, ogni push su `master` va in produzione): **a checkpoint verde merge e push su `master` sono autonomi: deploy automatico in produzione** (decisione dell'utente 2026-10-04, D-04; prevale sul gate di deploy `L-COL-025`); operazioni distruttive mai autonome (`L-COL-024`) |
| Ambienti | Le Preview Vercel eseguono `prisma migrate deploy` + seed sul DB del proprio ambiente: finché T-202 (guardia) e T-203 (staging separato) non sono fatti, un branch pubblicato può migrare e fare il seed sul DB di produzione; rischio accettato dall'utente (D-04 emendata 2026-10-04, D-05) |
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
