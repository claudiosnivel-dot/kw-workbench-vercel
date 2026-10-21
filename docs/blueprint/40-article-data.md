# 40-article-data — Macrotask `article-data`

> Articoli con l'AI (D-46), modulo 1 di 7: la scheda «Per gli articoli» e l'indirizzo del sito nelle impostazioni del progetto, i dati degli articoli e la rotta che avvia la generazione con i suoi limiti. La funzione resta spenta finché il root admin non la accende (dopo il modulo 44).

## Obiettivo del macrotask
Il piano dice quali pagine scrivere, con H1, H2 e keyword; dal modulo 36 un modello gratuito propone i titoli. Il passo successivo chiesto dall'utente il 2026-10-18 è il testo dell'articolo, scritto un H2 alla volta in background e poi riletto e modificato dall'utente. Questo modulo prepara le basi. Dopo questo modulo:

- **Scheda «Per gli articoli»**: nelle impostazioni del progetto chi siete e cosa offrite, a chi vi rivolgete, tono, e facoltativi nome e indirizzo dell'attività; più l'indirizzo del sito, che servirà ai link interni. Una riga dice che questi testi vanno a OpenRouter.
- **Dati degli articoli**: un articolo per pagina del piano, con i suoi blocchi (introduzione, H2, FAQ) e i lavori di generazione.
- **Avvio**: la rotta che avvia la generazione con lunghezza e note, i limiti per workspace e il tetto della piattaforma; la pagina del piano passa a «In scrittura» e «Rigenera» porta l'articolo con la pagina.

## Task atomici

```yaml
- id: T-4001
  title: "Scheda «Per gli articoli» e indirizzo del sito"
  macrotask: "article-data"
  depends_on: [T-2602, T-809, T-5102]

  objective: >
    Dare al modello le informazioni dell'attività che rendono un articolo utile e non generico, e sapere dove vivranno
    le pagine per costruire i link interni.

  definition_of_done:
    - "Migrazione additiva 0049_project_article_brief: projects con article_about (fino a 1000 caratteri), article_audience (fino a 300), article_tone (enum professional, friendly, technical, default professional), business_name (fino a 120), business_address (fino a 300) e site_url (fino a 300), tutti null tranne il tono."
    - "PATCH del progetto (T-809) accetta i nuovi campi con gli spazi tolti ai lati e '' come null; site_url solo assoluto in https, senza credenziali, query o frammento, salvato senza barra finale; altrimenti 400 VALIDATION_ERROR."
    - "Impostazioni del progetto (T-2602): blocco «Per gli articoli» con i sei campi, il contatore dei caratteri e la riga «Questi testi vanno a OpenRouter insieme alle keyword quando generi un articolo.»; modificabile con project.update, in sola lettura senza; testi it ed en."

  acceptance_criteria:
    - id: AC-4001-1
      given: "un OWNER del progetto"
      when: "invia PATCH del progetto con article_about '  Noleggio letti ospedalieri a Roma  ', article_tone 'friendly' e site_url 'https://www.esempio.it/'"
      then: "la risposta è 200 e il progetto ha article_about 'Noleggio letti ospedalieri a Roma', article_tone friendly e site_url 'https://www.esempio.it'"
    - id: AC-4001-2
      given: "un OWNER del progetto"
      when: "invia PATCH con site_url 'http://esempio.it', poi 'https://utente:pw@esempio.it', poi 'javascript:alert(1)', poi article_about di 1001 caratteri"
      then: "tutte le risposte sono 400 VALIDATION_ERROR e il progetto non cambia"
    - id: AC-4001-3
      given: "le impostazioni del progetto rese per un OWNER e per un utente senza project.update"
      when: "si legge il blocco «Per gli articoli»"
      then: "per l'OWNER i campi sono modificabili e c'è la riga su OpenRouter; per l'utente senza project.update i campi sono in sola lettura"

  target_tests:
    - file: "tests/integration/project-article-brief.test.ts"
      covers: [AC-4001-1, AC-4001-2]
    - file: "tests/component/article-brief-card.test.tsx"
      covers: [AC-4001-3]

  security_notes:
    - "A03 / CWE-79: i testi della scheda sono testo, resi da React e mai come HTML."
    - "A10 / CWE-918: site_url serve solo a costruire link nel testo esportato; l'app non lo chiama mai."
    - "Privacy: la scheda dichiara che i testi vanno a OpenRouter (D-46); la privacy policy (D-15) dovrà dirlo."

  out_of_scope:
    - "Scheda diversa per argomento o per pagina: le differenze vanno nelle note dell'articolo (T-4002)."

- id: T-4002
  title: "Articoli, lavori di generazione e avvio con i limiti"
  macrotask: "article-data"
  depends_on: [T-4001, T-3901, T-2501, T-2502]

  objective: >
    Salvare l'articolo di una pagina e avviarne la generazione entro i limiti, senza perdere il lavoro quando il piano
    si rigenera.

  definition_of_done:
    - "Migrazione additiva 0050_articles con RLS abilitata senza policy su ogni tabella: articles (id, page_id unico verso strategy_pages con cascade, project_id, length SHORT/MEDIUM/LONG, notes fino a 1000 caratteri, status GENERATING/READY/FAILED, error_code, meta_title, meta_description, slug, outline jsonb, images jsonb, seo_report jsonb, version, created_by_user_id, timestamp); article_sections (id, article_id, position, kind INTRO/H2/FAQ, heading, body testo Markdown, checks jsonb, edited, model, updated_at; unico su article_id e position); article_runs (id, article_id, workspace_id, scope ARTICLE/SECTION, section_id null, instruction fino a 500 caratteri null, status pending/running/completed/failed/canceled, phase, cursor jsonb, progress_done, progress_total, attempts, heartbeat_at, locked_until, error_code, timestamp)."
    - "Impostazioni dell'AI (card del root admin): articlesEnabled (default false), articlesPerWorkspaceDaily (default 3) e sectionRewritesPerWorkspaceDaily (default 20), da 1 a 1000, con la riga ai.update del registro."
    - "POST /api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article con { length, notes? }: permesso strategy.write e pagina del piano corrente (404, 409 STRATEGY_READ_ONLY); funzione spenta o chiave assente → 503 AI_NOT_CONFIGURED; un lavoro attivo sull'articolo → 409 JOB_ALREADY_ACTIVE; poi il limite del workspace in articoli nelle ultime 24 ore e il tetto della piattaforma, che deve avere posto per la stima (numero di H2 + 3, più il 30%) → 429 RATE_LIMITED con Retry-After; root admin escluso dai limiti. In una transazione crea o sostituisce l'articolo (status GENERATING, blocchi cancellati), crea il lavoro pending e porta la pagina da TODO a WRITING; risposta 202 { articleId, runId }."
    - "GET della stessa rotta: articolo con blocchi in ordine e lavoro attivo con avanzamento, oppure 404 ARTICLE_NOT_FOUND; DELETE .../article/run annulla il lavoro attivo. Nella transazione di «Rigenera» (T-2502) l'articolo di una pagina iniziata passa alla sua copia nel nuovo piano."

  acceptance_criteria:
    - id: AC-4002-1
      given: "articoli accesi, un MEMBER e una pagina TODO del piano corrente con 4 H2"
      when: "invia POST .../article con length MEDIUM e notes 'Consegna in 24 ore'"
      then: "la risposta è 202; l'articolo ha status GENERATING, length MEDIUM e notes 'Consegna in 24 ore'; c'è un lavoro pending con scope ARTICLE; la pagina è WRITING"
    - id: AC-4002-2
      given: "articlesPerWorkspaceDaily 1 e un articolo già avviato oggi nel workspace, poi platformDailyRequests 900 con 895 righe di ai_requests nelle ultime 24 ore"
      when: "un MEMBER avvia un articolo in ciascuna situazione, poi il root admin nella seconda"
      then: "le risposte del MEMBER sono 429 RATE_LIMITED con Retry-After e non creano articoli; quella del root admin è 202"
    - id: AC-4002-3
      given: "articoli spenti, poi accesi con un lavoro attivo sull'articolo, poi una versione precedente del piano"
      when: "un MEMBER invia POST .../article in ciascun caso"
      then: "le risposte sono 503 AI_NOT_CONFIGURED, 409 JOB_ALREADY_ACTIVE e 409 STRATEGY_READ_ONLY"
    - id: AC-4002-4
      given: "una pagina WRITING con un articolo nel piano corrente"
      when: "l'OWNER rigenera il piano con «Rigenera»"
      then: "l'articolo ha come page_id la copia della pagina nel nuovo piano, con gli stessi blocchi"

  target_tests:
    - file: "tests/integration/article-start.test.ts"
      covers: [AC-4002-1, AC-4002-2, AC-4002-3]
    - file: "tests/integration/article-regenerate.test.ts"
      covers: [AC-4002-4]

  security_notes:
    - "A01 / CWE-639: pagina e articolo si risolvono nel progetto del workspace della sessione (T-1502); nessun id di workspace dal corpo."
    - "A04 / CWE-770: limite per workspace in articoli e tetto della piattaforma prima di creare il lavoro."
    - "A01 / CWE-284: tabelle nuove con RLS senza policy, lette solo dal server (T-205)."

  out_of_scope:
    - "Il motore che scrive l'articolo (moduli 41-43) e l'editor (modulo 44)."
    - "Articoli per pagine delle versioni precedenti del piano."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): scheda del progetto più note per articolo; lunghezza Breve, Media o Lunga come tetto; generazione in background a sezioni; limiti in articoli per workspace e tetto unico in richieste.
- Gate umani: nessuno. La funzione resta spenta (articlesEnabled false) finché l'editor (modulo 44) non è in produzione.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): stima delle richieste di un articolo (H2 + 3, più il 30%); un nuovo avvio sostituisce l'articolo esistente (l'editor chiederà conferma); nome e indirizzo dell'attività facoltativi, usati solo per i dati strutturati della pagina locale.
- Emendamento dichiarato (2026-10-18, D-47, prima della costruzione): lo spagnolo (moduli 47-51) si costruisce prima di questo modulo, quindi ogni testo nuovo va nei cataloghi it, en ed es-ES, con le differenze in es-419, e il controllo di parità di T-4702 vale anche per i namespace di questo modulo.
- Emendamento dichiarato (2026-10-18, D-47): T-4001 dipende da T-5102 perché gli articoli si costruiscano dopo lo spagnolo; le migrazioni diventano 0049 e 0050 (la 0048 è del modulo 47).
- Emendamento dichiarato (2026-10-19, costruzione): AC-4001-3 parlava di un VIEWER, ruolo che non esiste (D-08: OWNER, ADMIN e MEMBER hanno tutti project.update); il criterio parla ora di un utente senza project.update, reso nel test con la prop che la pagina calcola con canPerform. Il comportamento del DoD («in sola lettura senza») è invariato.
- Note di costruzione (2026-10-19), scelte dell'agente confermate dall'utente il 2026-10-21 con AskUserQuestion (D-51). T-4001: la scheda sta fra i marchi dei concorrenti e le Avanzate e si salva con il Salva del progetto (un solo Salva, T-2602), con uno stato del form separato da quello del progetto; i cinque testi hanno il contatore «N su M caratteri» e il limite della colonna nel campo, il tono è un elenco (Professionale, Amichevole, Tecnico); senza project.update i testi sono readOnly, il tono è disabilitato e una riga dice chi può cambiarli; la riga su OpenRouter si vede sempre; l'indirizzo del sito si salva come origine più percorso senza barre finali (host in minuscolo, porta tenuta); i campi si accettano solo nella PATCH, non nella creazione del progetto. T-4002: i lavori usano l'enum JobStatus dei job e una fase di testo (default outline, i moduli 41-43 aggiungono le loro); un indice unico parziale tiene un solo lavoro pending o running per articolo; il limite del workspace usa il rate limiter (chiave ai-articles:workspace, regola aiArticlesWorkspace di 24 ore con il max delle impostazioni) e si consuma dopo il controllo del tetto della piattaforma, che non consuma nulla, così un 429 del tetto non toglie un articolo al workspace; la stima è arrotondata per eccesso; un nuovo avvio sostituisce l'articolo (blocchi, meta, scaletta, immagini e controlli cancellati, version più 1, autore chi avvia); la pagina passa da TODO a WRITING senza cambiare la version del piano e la transazione riverifica che la strategia sia ancora il piano; la risposta dell'avvio è 202 { data: { articleId, runId } } e il 409 JOB_ALREADY_ACTIVE porta il runId; la GET chiede project.read e non chiede il piano corrente (l'articolo segue la pagina); la DELETE risponde 200 { data: { runId, status } }, senza lavoro attivo 409 JOB_NOT_CANCELABLE, e se annulla la generazione dell'intero articolo lo porta a FAILED con error_code CANCELED; le impostazioni degli articoli stanno nella stessa chiave cifrata dei titoli e nella stessa card, sezione «Articoli con l'AI»; «Rigenera» porta gli articoli di tutte le pagine copiate, anche degli hub ancorati. Nota per il modulo 44: i testi dei code AI_NOT_CONFIGURED e JOB_ALREADY_ACTIVE nei cataloghi parlano di titoli e ricerche, quindi l'editor degli articoli dovrà mostrare testi suoi per quei code.
