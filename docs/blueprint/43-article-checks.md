# 43-article-checks — Macrotask `article-checks`

> Articoli con l'AI (D-46), modulo 4 di 7: i controlli deterministici sul testo scritto (tratti tipici dell'AI, dati da verificare, keyword, densità, link interni, meta) e la riscrittura automatica, una volta, dei blocchi che non li superano.

## Obiettivo del macrotask
Le istruzioni da sole non bastano: i modelli gratuiti ricadono nelle formule tipiche e a volte forzano le keyword. Il verdetto deve venire da un controllo deterministico, non dal modello. Dopo questo modulo:

- **Tratti AI e dati da verificare**: per l'italiano e l'inglese un elenco di formule e tratti, più conteggi generici (trattini lunghi, emoji, aperture ripetute); segnaposto, cifre, importi, percentuali e riferimenti a leggi. Ogni corrispondenza ha la sua posizione, per evidenziarla nell'editor.
- **SEO**: keyword principale in H1, prime 100 parole, title e meta description; ogni keyword assegnata presente almeno una volta, anche in forma vicina; densità della keyword principale entro un limite; link obbligatori presenti; lunghezze di title e meta.
- **Riscrittura**: un blocco oltre le soglie si riscrive una volta con l'elenco dei problemi; quelli che restano vanno nel rapporto.

## Task atomici

```yaml
- id: T-4301
  title: "Analisi dei tratti AI e dei dati da verificare"
  macrotask: "article-checks"
  depends_on: [T-4201]

  objective: >
    Trovare in modo ripetibile i tratti tipici dei testi generati e i dati che l'utente deve controllare, con la loro
    posizione nel testo.

  definition_of_done:
    - "lib/articles/style-check.ts, puro: analyzeStyle(markdown, language) restituisce le corrispondenze { kind: 'ai_pattern' | 'to_verify', rule, start, end } e un punteggio; regole ai_pattern per 'it' ed 'en' da un elenco versionato nel codice (formule, aperture e chiusure tipiche), più per ogni lingua trattini lunghi, emoji, più di 2 domande retoriche di fila e più di 2 frasi di fila che iniziano con la stessa parola; regole to_verify: segnaposto '[da verificare: …]' e '[fonte da aggiungere]', importi con € o EUR o USD, percentuali, cifre di 3 o più caratteri, anni, e riferimenti normativi (legge, decreto, D.Lgs., art.)."
    - "Soglia: un blocco supera il limite dei tratti AI con almeno 2 ai_pattern ogni 300 parole (minimo 2); le corrispondenze to_verify non contano per la soglia."

  acceptance_criteria:
    - id: AC-4301-1
      given: "il testo italiano «In conclusione, è importante sottolineare che il noleggio costa 45 € al mese — secondo la legge 104.»"
      when: "analyzeStyle lo riceve con language it"
      then: "le corrispondenze contengono ai_pattern per «In conclusione», «è importante sottolineare» e il trattino lungo, e to_verify per «45 €» e per «legge 104», ognuna con start ed end che delimitano il testo trovato"
    - id: AC-4301-2
      given: "un blocco di 300 parole con una sola formula tipica e un blocco di 300 parole con tre"
      when: "si calcola la soglia"
      then: "il primo non la supera, il secondo sì"

  target_tests:
    - file: "tests/unit/article-style-check.test.ts"
      covers: [AC-4301-1, AC-4301-2]

  security_notes:
    - "A04 / CWE-1333: espressioni regolari senza ripetizioni annidate, provate su testi di 20.000 caratteri entro 50 ms."

  out_of_scope:
    - "Rilevatori statistici di testo generato o servizi esterni di rilevamento."

- id: T-4302
  title: "Controllo SEO e riscrittura automatica dei blocchi"
  macrotask: "article-checks"
  depends_on: [T-4301, T-4202, T-702]

  objective: >
    Verificare che keyword, link e meta seguano i canoni SEO senza forzature e far riscrivere una volta i blocchi che
    non li rispettano.

  definition_of_done:
    - "lib/articles/seo-check.ts, puro: analyzeSeo(article) con la normalizzazione delle keyword di T-702 (forma vicina = stessi token canonici in qualunque ordine, plurali compresi) controlla: keyword principale in H1, nelle prime 100 parole, in meta_title e meta_description; ogni keyword assegnata presente nel suo blocco; densità della keyword principale sull'articolo (occorrenze per 100 parole) non oltre 2,5; link obbligatori della scaletta presenti; meta_title fino a 60 e meta_description fino a 155 caratteri. Risultato: elenco di problemi per blocco e per articolo."
    - "Fase checks del lavoro, dopo faq: analyzeStyle e analyzeSeo su ogni blocco; un blocco con la soglia dei tratti AI superata, keyword assegnate mancanti, densità oltre il limite o un link obbligatorio mancante si riscrive una volta (stessa richiesta di T-4201 più l'elenco dei problemi); poi si salvano checks di ogni blocco e seo_report dell'articolo con i problemi rimasti. Un blocco con edited true non si riscrive."
    - "Con scope SECTION i controlli e l'eventuale riscrittura valgono solo per quel blocco; seo_report si ricalcola su tutto l'articolo."

  acceptance_criteria:
    - id: AC-4302-1
      given: "un articolo con keyword principale 'noleggio letto ospedaliero' citata 9 volte in 300 parole"
      when: "analyzeSeo lo riceve"
      then: "tra i problemi c'è la densità oltre 2,5"
    - id: AC-4302-2
      given: "un blocco con le keyword assegnate 'letti ospedalieri elettrici' e un testo che contiene «letto ospedaliero elettrico»"
      when: "analyzeSeo lo riceve"
      then: "la keyword è presente e non c'è un problema di keyword mancante"
    - id: AC-4302-3
      given: "un OpenRouter simulato che scrive un blocco H2 con tre formule tipiche e, alla riscrittura, lo stesso blocco senza"
      when: "si esegue il lavoro fino alla fine"
      then: "il blocco è stato richiesto 2 volte, il body salvato non ha formule tipiche e i checks del blocco non contengono ai_pattern"
    - id: AC-4302-4
      given: "un OpenRouter simulato in cui anche la riscrittura contiene due formule tipiche"
      when: "si esegue il lavoro fino alla fine"
      then: "il blocco è stato richiesto 2 volte, non di più; l'articolo è READY e seo_report elenca il blocco con i tratti AI rimasti"

  target_tests:
    - file: "tests/unit/article-seo-check.test.ts"
      covers: [AC-4302-1, AC-4302-2]
    - file: "tests/integration/article-checks.test.ts"
      covers: [AC-4302-3, AC-4302-4]

  security_notes:
    - "A04 / CWE-770: al massimo una riscrittura per blocco e per lavoro, così il costo in richieste resta dentro la stima di T-4002."

  out_of_scope:
    - "Punteggi di leggibilità con formule (Flesch e simili): tra le scelte future."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): istruzioni più controllo automatico più una riscrittura (scelta dell'utente), canoni SEO senza forzature (keyword naturali e densità naturale, aggiunta dell'utente).
- Gate umani: nessuno.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): soglia di 2 tratti AI ogni 300 parole; densità massima 2,5 occorrenze ogni 100 parole; forma vicina = stessi token canonici in qualunque ordine; i blocchi modificati dall'utente non si riscrivono da soli.
