# 52-article-polish — Macrotask `article-polish`

> Articoli con l'AI (D-46, D-49): due completamenti decisi dall'utente il 2026-10-20 chiudendo le scelte del modulo 44. Il lavoro di un articolo fermo riparte quando qualcuno legge l'articolo, non solo con il cron notturno; il «Controllo SEO» segnala i blocchi più lunghi del tetto di parole della scaletta.

## Obiettivo del macrotask
Dopo i moduli 41-44 un lavoro fermo (per esempio dopo un errore di rete tra due passi) riprende solo dal cron `reap-jobs`, che sul piano Hobby gira una volta al giorno, e il tetto di parole di ogni blocco della scaletta non è controllato da nessuno. Dopo questo modulo:

- **Ripresa alla lettura**: la lettura dell'articolo (la GET, il polling dell'editor e la sua pagina) riprende il lavoro fermo come fa il cron, una volta sola anche con più letture insieme, come `GET /api/jobs/{id}` per le ricerche (T-1203).
- **Tetto di parole**: un blocco con più parole del tetto della scaletta compare nel rapporto SEO e nel riquadro «Controllo SEO», senza riscritture automatiche.

## Task atomici

```yaml
- id: T-5201
  title: "Ripresa del lavoro fermo alla lettura dell'articolo"
  macrotask: "article-polish"
  depends_on: [T-4101, T-4401]

  objective: >
    Non lasciare un articolo fermo fino al giorno dopo: chi apre l'editor fa ripartire il lavoro bloccato.

  definition_of_done:
    - "lib/articles/run.ts: reapStaleArticleRuns accetta { runId } come reapStaleJobs (T-1203) e riprende solo quel lavoro, con lo stesso where (staleWhere: attivo, senza lease valida e senza battito da JOB_STALE_AFTER_MS) e lo stesso updateMany condizionale che conta il tentativo e programma la continuazione; al tetto JOB_MAX_ATTEMPTS il lavoro è failed e l'articolo FAILED con INTERNAL_ERROR."
    - "readArticle (T-4002), quindi la GET .../article, il polling dell'editor e la pagina dell'editor (T-4401): con un lavoro attivo fermo lo riprende prima di rispondere e la risposta riflette lo stato dopo la ripresa; con un lavoro sano o senza lavoro non scrive nulla."

  acceptance_criteria:
    - id: AC-5201-1
      given: "un articolo GENERATING con il lavoro running, senza lease e con heartbeat_at più vecchio di JOB_STALE_AFTER_MS, e attempts 0"
      when: "un MEMBER del progetto chiede la GET dell'articolo"
      then: "la risposta è 200 con il lavoro attivo; il lavoro ha attempts 1 e heartbeat_at aggiornato; scheduleArticleRunContinuation è stata chiamata una volta con l'id del lavoro"
    - id: AC-5201-2
      given: "lo stesso lavoro fermo con attempts uguale a JOB_MAX_ATTEMPTS"
      when: "un MEMBER chiede la GET dell'articolo"
      then: "il lavoro è failed; la risposta ha status FAILED, errorCode INTERNAL_ERROR e run null"
    - id: AC-5201-3
      given: "un lavoro running con heartbeat_at di 10 secondi fa"
      when: "un MEMBER chiede la GET dell'articolo due volte"
      then: "attempts resta 0 e scheduleArticleRunContinuation non è stata chiamata"

  target_tests:
    - file: "tests/integration/article-resume.test.ts"
      covers: [AC-5201-1, AC-5201-2, AC-5201-3]

  security_notes:
    - "A04 / CWE-362: la ripresa è un updateMany condizionale sulla soglia: due letture insieme riprendono il lavoro una volta sola."
    - "A01 / CWE-639: si riprende solo il lavoro dell'articolo letto, già risolto nel progetto del workspace della sessione."

  out_of_scope:
    - "Un cron più frequente (piano Hobby) e la ripresa dalla pagina del piano."

- id: T-5202
  title: "Tetto di parole del blocco nel Controllo SEO"
  macrotask: "article-polish"
  depends_on: [T-4302, T-4402]

  objective: >
    Far vedere all'autore i blocchi più lunghi di quanto prevede la scaletta, senza riscriverli in automatico.

  definition_of_done:
    - "lib/articles/checks.ts: il rapporto SEO dell'articolo (seoReport di T-4302, ricalcolato anche dalla PATCH di T-4402) aggiunge al blocco con più parole di words della scaletta il problema { rule: 'words_over', count, max }, con le parole contate da markdownWords (T-4201); il blocco FAQ, che non è nella scaletta, non ha tetto. Il problema non è un motivo di riscrittura: needsRewrite resta quello di T-4302."
    - "Riquadro «Controllo SEO» (T-4402): il problema si legge «Il blocco ha {count} parole: al massimo {max}», con i testi in it, en ed es-ES."

  acceptance_criteria:
    - id: AC-5202-1
      given: "un articolo con la scaletta che dà 100 parole al blocco H2_1 e il modello che lo scrive con 130 parole senza tratti AI né problemi SEO"
      when: "il lavoro dell'articolo arriva alla fine"
      then: "il rapporto SEO contiene per il blocco 1 il problema words_over con count 130 e max 100; il blocco H2_1 è stato chiesto al modello una volta sola"
    - id: AC-5202-2
      given: "l'editor reso con un rapporto SEO che ha words_over con count 130 e max 100 per il blocco «Quanto costa»"
      when: "l'utente apre il riquadro «Controllo SEO»"
      then: "il blocco «Quanto costa» del riquadro mostra «Il blocco ha 130 parole: al massimo 100»"

  target_tests:
    - file: "tests/integration/article-word-cap.test.ts"
      covers: [AC-5202-1]
    - file: "tests/component/article-seo-report.test.tsx"
      covers: [AC-5202-2]

  security_notes:
    - "A03 / CWE-79: il riquadro rende i numeri come testo."

  out_of_scope:
    - "Riscrivere o accorciare in automatico un blocco troppo lungo; un tetto per il blocco FAQ."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-10-20 (D-49) alle domande sulle scelte del modulo 44: ripresa all'apertura dell'editor e tetto di parole segnalato nel «Controllo SEO» senza riscrittura.
- Gate umani: nessuno (nessuna schermata nuova, nessuna baseline visiva toccata).
- Ordine: dipende da 41, 43 e 44, già chiusi; nel DAG viene dopo il 45 e il 46, ma si può costruire anche prima su indicazione dell'utente.
- Note di costruzione (2026-10-21, scelte dell'agente confermate dall'utente il 2026-10-22 con AskUserQuestion, D-52):
  - `reapStaleArticleRuns` prende `{ runId?, limit? }` come `reapStaleJobs`; il cron `reap-jobs` la chiama senza
    argomenti come prima;
  - `readArticle` legge l'articolo, e solo con un lavoro attivo chiede la ripresa di quel lavoro; rilegge l'articolo
    solo se il lavoro è ripreso o fallito. Con un lavoro sano la lettura costa una query in più (la ricerca del lavoro
    fermo) e non scrive nulla;
  - `words_over` va dopo i problemi SEO e i tratti AI del blocco, con le parole di `markdownWords` sul testo salvato
    (senza la destinazione dei link); un blocco con esattamente `words` parole non lo ha. Il problema è solo nel rapporto
    dell'articolo: i controlli salvati del blocco (`article_sections.checks`) e l'elenco dei problemi mandato al modello
    nella riscrittura non lo contengono, quindi `needsRewrite` resta quello di T-4302;
  - testi: «Il blocco ha {count} parole: al massimo {max}», «The block has {count} words: {max} at most», «El bloque
    tiene {count} palabras: como máximo {max}»; es-419 lo legge da es-ES (`lib/i18n/catalogs.ts`);
  - un test in più oltre agli AC: due letture insieme riprendono il lavoro fermo una volta sola (security note
    A04 / CWE-362).
- Copertura non verificata (dichiarata): i rapporti SEO già salvati non hanno `words_over` finché un nuovo lavoro o una
  modifica dell'autore non li ricalcola; nessun E2E nuovo (il riquadro è coperto dal test di componente); il potere
  delle asserzioni (AT-1 Fase C) non è eseguito.
