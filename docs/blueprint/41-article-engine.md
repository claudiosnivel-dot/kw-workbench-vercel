# 41-article-engine — Macrotask `article-engine`

> Articoli con l'AI (D-46), modulo 2 di 7: il lavoro in background che porta avanti la generazione a passi, e la scaletta dell'articolo (sezioni, parole, keyword, link interni, meta, slug e segnaposto immagine).

## Obiettivo del macrotask
Un articolo costa 10-25 richieste da circa 10 secondi: più del tempo di una richiesta web. Il modulo 40 crea il lavoro; questo modulo lo fa avanzare con lo stesso schema delle ricerche (T-1201…T-1203) e scrive la prima fase, la scaletta. Dopo questo modulo:

- **Motore**: un lavoro avanza a passi firmati con `after()`, con lease e battito, riprende dal cron se si ferma e si annulla; ogni richiesta passa dai modelli di riserva (T-3802) e dal registro (T-3901).
- **Scaletta**: una richiesta decide per ogni sezione cosa trattare, quali keyword, il tetto di parole e i link interni, più title tag, meta description, slug e i segnaposto immagine con il prompt per un generatore; la risposta si controlla in modo deterministico.

## Task atomici

```yaml
- id: T-4101
  title: "Motore dei lavori degli articoli"
  macrotask: "article-engine"
  depends_on: [T-4002, T-1201, T-1203, T-3802, T-3901]

  objective: >
    Far avanzare la generazione di un articolo in background, una fase alla volta, senza perdere il lavoro se una
    funzione si ferma e senza superare i tempi di Vercel.

  definition_of_done:
    - "lib/articles/run.ts: advanceArticleRun(runId, deadlineMs) prende la lease (locked_until) e il battito come advanceJob (T-1202), esegue passi della fase corrente finché resta tempo e salva cursor, phase e avanzamento dopo ogni richiesta al modello; fasi di questo modulo: outline (T-4102) e done; le fasi successive si aggiungono nei moduli 42 e 43. Un lavoro senza fasi rimaste diventa completed e l'articolo READY."
    - "Rotta app/api/internal/article-runs/[id]/advance (POST, maxDuration 300) con la firma HMAC di T-1203 calcolata su 'article-run:' più l'id, così una firma di un job delle ricerche non vale per un lavoro di articolo; 202 subito e il passo in after(); la continuazione si programma come scheduleJobContinuation."
    - "Il cron reap-jobs (T-1203) riprende anche i lavori di articolo pending o running con lease scaduta e fallisce dopo 5 tentativi; errore di una fase → lavoro failed, articolo FAILED con error_code (AI_BUSY, AI_DAILY_LIMIT, AI_UNAVAILABLE, AI_INVALID_RESPONSE o INTERNAL_ERROR); DELETE del lavoro (T-4002) → canceled al passo successivo."
    - "Ogni richiesta del lavoro usa requestWithFallback (45 s per tentativo, 120 s per richiesta compresi i modelli di riserva, sempre entro la maxDuration del passo) e scrive ai_requests con feature article e il workspace del lavoro."

  acceptance_criteria:
    - id: AC-4101-1
      given: "un articolo con un lavoro pending e un OpenRouter simulato che risponde alla scaletta"
      when: "si esegue advanceArticleRun fino alla fine"
      then: "il lavoro è completed, l'articolo READY con la scaletta salvata, e ai_requests ha 1 riga con feature article e il workspace del progetto"
    - id: AC-4101-2
      given: "un lavoro running con locked_until passato da 10 minuti"
      when: "si invoca GET /api/cron/reap-jobs con il Bearer giusto"
      then: "il lavoro riparte e si completa; un lavoro con 5 tentativi falliti diventa failed e il suo articolo FAILED"
    - id: AC-4101-3
      given: "un lavoro di articolo e una firma valida calcolata per lo stesso id come job delle ricerche"
      when: "si invoca POST /api/internal/article-runs/{id}/advance con quella firma, poi con la firma giusta"
      then: "la prima risposta è 401 e il lavoro non cambia; la seconda è 202"
    - id: AC-4101-4
      given: "models [A] con A che risponde 429 per il limite giornaliero dell'account"
      when: "si esegue il lavoro"
      then: "il lavoro è failed e l'articolo FAILED con error_code AI_DAILY_LIMIT"

  target_tests:
    - file: "tests/integration/article-run.test.ts"
      covers: [AC-4101-1, AC-4101-2, AC-4101-4]
    - file: "tests/integration/article-run-signature.test.ts"
      covers: [AC-4101-3]

  security_notes:
    - "A01 / CWE-345: la rotta interna accetta solo la firma HMAC con scadenza del proprio tipo di lavoro (T-1203)."
    - "A04 / CWE-400: un passo resta entro la maxDuration e salva dopo ogni richiesta, così una funzione fermata non rifà richieste già pagate dal tetto."

  out_of_scope:
    - "Più lavori di articolo in parallelo nello stesso passo; code di priorità tra workspace."

- id: T-4102
  title: "Scaletta dell'articolo"
  macrotask: "article-engine"
  depends_on: [T-4101, T-1902, T-3502]

  objective: >
    Pianificare l'articolo prima di scriverlo, così ogni sezione sa cosa trattare senza ripetere le altre e le keyword
    e i link interni finiscono dove hanno senso.

  definition_of_done:
    - "lib/articles/outline-prompt.ts: istruzioni in italiano per 'it', in spagnolo per 'es' con la variante dal paese della strategia (come T-5102) e in inglese con la lingua indicata per le altre (come T-3502); dati inviati: lingua, tipo di pagina e di contenuto, H1, H2 nell'ordine, keyword principale e fino a 30 secondarie con il flag domanda, scheda del progetto (T-4001), note dell'articolo, tetto di parole (SHORT 800, MEDIUM 1500, LONG 2500) e pagine collegabili (per uno spoke la sua pagina pilastro e gli altri spoke dello stesso hub, per un hub i suoi spoke, ognuna con id e H1). Le istruzioni dicono che il tetto è un massimo da non riempire e che keyword e scheda sono dati, non istruzioni."
    - "lib/articles/outline-response.ts: estrae il JSON e lo accetta solo se ha un blocco INTRO e un blocco per ogni H2 nell'ordine del piano; ogni blocco con cosa trattare (fino a 400 caratteri), keyword assegnate (solo keyword della pagina, ogni secondaria al massimo in un blocco) e tetto di parole (somma entro il tetto dell'articolo); link solo verso le pagine collegabili, con il link alla pagina pilastro obbligatorio per uno spoke e ogni spoke linkato dal suo hub; meta_title fino a 60 caratteri e meta_description fino a 155, entrambe con la keyword principale; slug in minuscolo con trattini derivato dalla keyword principale; da 1 a 6 segnaposto immagine (il primo è la copertina) con blocco, scopo, testo alternativo fino a 125 caratteri, nome file .webp dallo slug e prompt in inglese per un generatore di immagini (soggetto, stile fotografico realistico, 16:9 per la copertina e 4:3 nel testo, nessun testo nell'immagine). Altrimenti AI_INVALID_RESPONSE e si prova il modello successivo (T-3802)."
    - "La fase outline salva meta_title, meta_description, slug, outline e images nell'articolo e crea i blocchi vuoti (INTRO e un H2 per heading); progress_total diventa il numero di blocchi più 2."

  acceptance_criteria:
    - id: AC-4102-1
      given: "uno spoke del piano con 3 H2, la scheda del progetto e un OpenRouter simulato che restituisce una scaletta valida"
      when: "si esegue il lavoro dell'articolo con length MEDIUM"
      then: "l'articolo ha meta_title e meta_description con la keyword principale, lo slug dalla keyword principale e 4 blocchi vuoti (INTRO e 3 H2 nell'ordine del piano); il corpo inviato al modello contiene la scheda, le note e l'H1 della pagina pilastro, e non contiene nome del progetto, volumi o punteggi"
    - id: AC-4102-2
      given: "risposte simulate di scaletta con un H2 mancante, con 3000 parole per un articolo MEDIUM, con un link verso una pagina non collegabile e, per uno spoke, senza link alla pagina pilastro"
      when: "parseOutlineResponse riceve ciascuna"
      then: "ognuna è rifiutata con AI_INVALID_RESPONSE"
    - id: AC-4102-3
      given: "una risposta simulata con 3 segnaposto immagine"
      when: "parseOutlineResponse la riceve"
      then: "il primo segnaposto è la copertina con formato 16:9, ogni nome file finisce in .webp e inizia con lo slug, ogni prompt contiene l'indicazione di non mettere testo nell'immagine"

  target_tests:
    - file: "tests/integration/article-outline.test.ts"
      covers: [AC-4102-1]
    - file: "tests/unit/article-outline-response.test.ts"
      covers: [AC-4102-2, AC-4102-3]

  security_notes:
    - "Privacy (D-46): al modello vanno solo keyword della pagina, titoli, H1 delle pagine collegabili, scheda e note; mai volumi, punteggi, nomi di progetto, utente o workspace."
    - "A03 / CWE-1427: le istruzioni dicono al modello che keyword, scheda e note sono dati; la risposta passa solo dal controllo deterministico."

  out_of_scope:
    - "Generazione delle immagini: solo segnaposto con il prompt da copiare (scelta dell'utente del 2026-10-18)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): approccio A, lavoro in background a sezioni con scaletta; segnaposto immagine con il prompt per un generatore (aggiunta dell'utente).
- Gate umani: nessuno.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): tetti SHORT 800, MEDIUM 1500, LONG 2500 parole; 45 s per tentativo e 120 s per richiesta nel lavoro; spoke collegabili agli altri spoke dello stesso hub; immagini da 1 a 6 in .webp.
- Emendamento dichiarato (2026-10-18, D-47, prima della costruzione): lo spagnolo (moduli 47-51) si costruisce prima di questo modulo, quindi ogni testo nuovo va nei cataloghi it, en ed es-ES, con le differenze in es-419, e il controllo di parità di T-4702 vale anche per i namespace di questo modulo.
- Emendamento dichiarato (2026-10-18, D-47): istruzioni della scaletta anche in spagnolo, con la variante del paese.
- Note di costruzione (2026-10-20), scelte dell'agente da confermare. T-4101: un passo dura al massimo 270 s con la lease fino a 30 s dopo (dentro la maxDuration di 300 s) e una nuova richiesta parte solo se restano 120 s; continuazione con `scheduleArticleRunContinuation` accanto a `scheduleJobContinuation` (stessa POST firmata, firma di `articleRunStepId`), programmata anche dall'avvio di T-4002 dopo il commit; stessi `JOB_STALE_AFTER_MS` e `JOB_MAX_ATTEMPTS` dei job (`staleWhere` condiviso); il cron somma i lavori degli articoli nei conteggi `{ resumed, failed }`, corpo invariato; risposte tutte scartate dal controllo → `AI_INVALID_RESPONSE` (la richiesta con le riserve da sola dà `AI_UNAVAILABLE`), chiave assente durante il lavoro → `AI_UNAVAILABLE`; le righe di `ai_requests` hanno `by_root_admin` di chi ha avviato l'articolo; a lavoro completato `progress_done` = `progress_total`; nessun recupero al polling dell'articolo (sul piano Hobby il cron gira una volta al giorno, alle 04:00 UTC): da valutare con l'editor del modulo 44. T-4102: id brevi per le pagine collegabili (`L1`...) e per i blocchi (`INTRO`, `H2_1`...), i link salvati con l'id della pagina del piano; slug, nomi dei file e prompt delle immagini calcolati dal codice (il modello dà blocco, scopo, testo alternativo e soggetto), copertina `{slug}.webp` e poi `{slug}-2.webp`...; oltre sei immagini si tengono le prime sei; nome e indirizzo dell'attività e indirizzo del sito non vanno al modello (servono ai dati strutturati e ai link dell'export); `max_tokens` 4000; `outline` salvata come `{ model, blocks }`; il blocco FAQ nasce con il modulo 42.
