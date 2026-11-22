# 76-mcp-articles — Macrotask `mcp-articles`

> Claude Code importa in Titan SEO gli articoli che scrive nel sito, riceve i controlli SEO, e l'utente vede in Titan
> SEO articoli, registro e spesa di Claude Code (D-64).

## Obiettivo del macrotask
Scelte dell'utente del 2026-11-17: gli articoli finiscono «dentro il sito che Claude Code sta costruendo» e in Titan
SEO l'utente vuole «vedere tutto», anche il testo; gli articoli non passano dalle AI di Titan SEO. Il disegno
(`docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`) evita gli articoli che divergono senza che nessuno se
ne accorga (anti-obiettivo 5) con la versione dell'articolo, e fa vedere chi ha fatto cosa (anti-obiettivo 4).

## Task atomici

```yaml
- id: T-7601
  title: "import_article e get_article"
  macrotask: "mcp-articles"
  depends_on: [T-7502, T-4002, T-4201, T-4302, T-4402, T-5202]

  objective: >
    Salvare in Titan SEO l'articolo scritto da Claude Code come articolo pronto della pagina, con i controlli di oggi,
    senza sovrascrivere mai alla cieca le modifiche fatte dall'utente in Titan SEO.

  definition_of_done:
    - "Migrazione additiva: articles.source (TITAN_AI o AGENT, default TITAN_AI)."
    - "import_article({ projectId, pageId, markdown, metaTitle, metaDescription, slug, version? }): il Markdown si divide nei blocchi di oggi (testo prima del primo H2 = INTRO, ogni «## » = H2 con il suo titolo, una sezione «## » con il titolo delle domande frequenti della lingua del piano = FAQ), ogni blocco passa da sanitizeSectionMarkdown come i blocchi dell'AI, la lunghezza (SHORT, MEDIUM, LONG) si ricava dalle parole con le soglie di lib/articles/lengths.ts; articolo READY con source AGENT, created_by il root admin, senza lavori di generazione né righe di ai_requests e senza toccare il contatore e i limiti degli articoli."
    - "Dopo il salvataggio girano seoReport e analyzeStyle di oggi; la risposta ha version, blocchi salvati e i controlli (avvisi SEO e di stile) da far correggere a Claude Code."
    - "Versione (emendato da T-8202, D-70: version sempre obbligatoria, 0 senza articolo): con un articolo già presente serve la version letta da Claude Code; diversa da quella salvata è isError ARTICLE_VERSION_CONFLICT con la version corrente e nulla cambia; con un lavoro dell'AI di Titan SEO in corso sulla pagina è isError JOB_ALREADY_ACTIVE, come l'avvio di oggi. Un'importazione riuscita aumenta version di 1."
    - "Importare su una pagina «Da scrivere» la porta «In scrittura» (T-2501); sugli altri stati lo stato non cambia. Pagina di un'altra strategia o di un piano precedente: STRATEGY_NOT_FOUND o STRATEGY_READ_ONLY come oggi."
    - "get_article({ projectId, pageId }): blocchi in ordine con tipo, titolo e testo, meta title, meta description, slug, version, source, stato, controlli salvati; ARTICLE_NOT_FOUND senza articolo."

  acceptance_criteria:
    - id: AC-7601-1
      given: "una pagina «Da scrivere» con 2 H2 nel piano e nessun articolo"
      when: "Claude Code chiama import_article con un Markdown di introduzione, due sezioni «## » e una sezione «## Domande frequenti», meta title, meta description e slug"
      then: "l'articolo è READY con source AGENT e version 1, ha i blocchi INTRO, H2, H2, FAQ nell'ordine, la pagina è «In scrittura», non c'è nessuna riga di ai_requests né di article_runs, e la risposta contiene i controlli SEO"
    - id: AC-7601-2
      given: "un articolo importato con version 1 che l'utente ha modificato nell'editor (version 2)"
      when: "Claude Code chiama import_article con version 1"
      then: "la risposta è isError ARTICLE_VERSION_CONFLICT con version corrente 2 e i blocchi restano quelli dell'utente"
    - id: AC-7601-3
      given: "lo stesso articolo con version 2"
      when: "Claude Code chiama get_article e poi import_article con version 2"
      then: "get_article restituisce i blocchi dell'utente con version 2; l'importazione riesce con version 3"
    - id: AC-7601-4
      given: "un Markdown con un tag <script> e un link javascript:"
      when: "Claude Code lo importa"
      then: "i blocchi salvati non contengono il tag né il link javascript:, come i blocchi scritti dall'AI"

  target_tests:
    - file: "tests/integration/mcp-articles.test.ts"
      covers: [AC-7601-1, AC-7601-2, AC-7601-3, AC-7601-4]

  security_notes:
    - "A03 / CWE-79: il Markdown di Claude Code passa dallo stesso sanitizer dei blocchi dell'AI (T-4201)."
    - "A04 / CWE-362: version dell'articolo per non perdere le modifiche dell'utente."
    - "A04 / CWE-770: Markdown di al massimo 200 000 caratteri e 40 blocchi."

  out_of_scope:
    - "Immagini dell'articolo: i segnaposto restano come li scrive Claude Code."
    - "Inviare l'articolo a WordPress dal server MCP."

- id: T-7602
  title: "Articoli, registro e spesa di Claude Code visibili in Titan SEO"
  macrotask: "mcp-articles"
  depends_on: [T-7601, T-7302, T-4401]

  objective: >
    Far vedere all'utente quali articoli ha scritto Claude Code e cosa ha fatto Claude Code, con la spesa del giorno.

  definition_of_done:
    - "Editor dell'articolo e voce dell'articolo nel pannello della pagina: con source AGENT l'etichetta «Scritto da Claude Code» al posto del modello dell'AI; l'utente modifica e riscrive i blocchi come oggi."
    - "Card «Claude Code» (T-7102): elenco delle ultime 50 chiamate da agent_calls (ora, strumento, progetto con link al progetto se esiste ancora, esito ok o codice, durata), spesa di oggi e tetto (T-7302); lista vuota con «Nessuna chiamata»."
    - "GET /api/admin/agent-key restituisce anche le ultime 50 chiamate e la spesa di oggi, solo per il root admin."
    - "Testi in it, en, es-ES; a 390 px l'elenco va a capo senza scorrimento orizzontale."
    - "docs/AGENT-MCP.md: come creare la chiave, il comando claude mcp add, gli strumenti, le protezioni e una prova dal computer dell'utente su un sito di prova."

  acceptance_criteria:
    - id: AC-7602-1
      given: "un articolo con source AGENT"
      when: "si apre l'editor dell'articolo e il pannello della sua pagina"
      then: "entrambi mostrano «Scritto da Claude Code» e nessun nome di modello"
    - id: AC-7602-2
      given: "la card «Claude Code» con tre chiamate registrate, una con esito AGENT_PAGE_LOCKED, e una spesa di oggi di 1,25 $ con tetto 5 $"
      when: "si apre la card"
      then: "l'elenco ha le tre righe con strumento, progetto, esito e durata, la riga con AGENT_PAGE_LOCKED ha l'esito d'errore, e la card mostra «1,25 $ di 5 $ oggi»"

  target_tests:
    - file: "tests/component/agent-activity.test.tsx"
      covers: [AC-7602-1, AC-7602-2]

  security_notes:
    - "A01 / CWE-285: registro e spesa solo per il root admin."
    - "A09 / CWE-532: l'elenco mostra solo quello che il registro tiene (nessun parametro né testo)."

  out_of_scope:
    - "Filtri e ricerca nel registro; più di 50 righe."
    - "Avvisi email sulla spesa."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): articoli di Claude Code nel sito e uguali in Titan SEO, versione contro le sovrascritture, registro e spesa visibili.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): FAQ riconosciute dal titolo delle domande frequenti della lingua, lunghezza dalle soglie di oggi, pagina «Da scrivere» portata «In scrittura», limiti di 200 000 caratteri e 40 blocchi, etichetta «Scritto da Claude Code», guida in docs/AGENT-MCP.md.
- Ordine: ultimo dei moduli 71-76; T-7602 dopo T-7601. Dopo il merge: prova vera dal computer dell'utente con Claude Code collegato a produzione.
- Note di costruzione (2026-11-22, scelte dell'agente confermate dall'utente lo stesso giorno, D-70, salvo la version alla prima importazione, che il modulo 82 rende obbligatoria con T-8202). Migrazione additiva `0064_article_source` con il tipo `ArticleSource` (TITAN_AI, AGENT) e `articles.source` default TITAN_AI; «Scrivi di nuovo» dall'editor (`startArticle`) riporta l'articolo a TITAN_AI, «Riscrivi questo blocco» lascia AGENT. T-7601: servizio in `lib/articles/import.ts` (`importAgentArticle`, `readAgentArticle`), strumenti in `lib/modules/agent/tools/articles.ts` registrati dopo `update_page`, prima `get_article` e poi `import_article`; `import_article` risponde con la stessa forma di `get_article` (articleId, pageId, version, source, status, length, meta, slug, blocchi con position, kind, heading e text, controlli con densità, problemi dell'articolo e, per i blocchi con qualcosa da correggere, problemi e corrispondenze dei controlli del testo con kind, rule e il testo trovato fino a 200 caratteri). Divisione: righe «## » con fino a 3 spazi davanti, mai dentro un blocco di codice (`nextFence` di `markdown-sanitizer.ts`, comune alla pulizia); introduzione assente se dopo la pulizia non ha testo (per esempio il solo «# H1»); titolo come testo semplice senza HTML, link, grassetto e corsivo, al massimo 200 caratteri; una sezione o un titolo senza testo, più di 40 blocchi o una seconda sezione FAQ sono VALIDATION_ERROR con field markdown (e heading); FAQ riconosciuta senza maiuscole e senza punteggiatura finale, in qualunque posizione; link page: tenuti solo verso le pagine collegabili, come nell'editor. Lunghezza: fino a 800 parole SHORT, fino a 1500 MEDIUM, poi LONG. Nessuna scaletta salvata (outline e images null): i controlli per blocco di keyword assegnate, link obbligatori e tetto di parole non valgono per gli articoli importati; restano quelli dell'articolo (keyword principale nell'H1 della pagina, nell'apertura e nelle meta, lunghezze, densità) e i controlli del testo. Version: la prima importazione senza version (ignorata se l'articolo non c'è) crea la version 1; con un articolo una version assente o diversa è ARTICLE_VERSION_CONFLICT con `currentVersion`; due creazioni insieme (indice unico della pagina) danno JOB_ALREADY_ACTIVE o il conflitto; note e bozza di WordPress restano a una nuova importazione. `get_article` legge l'articolo della pagina in qualunque piano del progetto (project.read). Pulizia (T-4201) rinforzata: un link o un'immagine con un livello di parentesi tonde nella destinazione (`[x](javascript:alert(1))`) restava com'era nel testo, mai reso come link perché editor ed export rendono solo i link page:; ora si toglie lasciando il testo, anche per i blocchi dell'AI. T-7602: «Scritto da Claude Code» accanto allo stato nell'editor e accanto ad «Apri l'articolo» nel pannello (`articlePages` al posto di `articlePageIds`); oggi né l'editor né il pannello mostrano il modello, quindi per gli articoli TITAN_AI non cambia nulla. Card: sezione «Ultime chiamate» (non «Attività di Claude Code», che l'E2E di T-7102 confonderebbe con il titolo della card), riga «1,25 $ di 5 $ oggi» con il simbolo stretto e senza decimali per gli interi, aggiornata dopo il salvataggio del tetto; chiamate delle sole chiavi dell'utente, link `/projects/<id>`, «Nessun progetto» senza progetto, durata in secondi con un decimale; GET `/api/admin/agent-key` risponde `{ data, activity: { calls, spend } }`. L'E2E `agent-key.spec.ts` (impacted-by T-7602) prova a 390 px tre chiamate con un nome di progetto lungo. Istruzioni di `initialize`: passo 6 con i controlli e la rilettura. Guida in `docs/AGENT-MCP.md`.
