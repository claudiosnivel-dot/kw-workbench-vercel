# 82-mcp-refine — Macrotask `mcp-refine`

> Due ritocchi del server MCP scelti dall'utente il 2026-11-22 chiudendo le scelte di 74, 75 e 76 (D-70): `get_plan` a
> pagine, così un piano grande resta sotto il limite di output di Claude Code, e `import_article` con la version sempre
> obbligatoria, anche alla prima importazione.

## Obiettivo del macrotask
Oggi `get_plan` restituisce l'intero piano in una risposta: un piano fino a 5000 keyword può superare il limite di
output degli strumenti di Claude Code (circa 25 000 token, D-64). Scelta dell'utente: «Pagine subito», con risposte fino
a circa 1000 keyword senza mai spezzare una pagina del piano. Oggi `import_article` accetta la prima importazione senza
version; scelta dell'utente: «Sempre la versione», 0 quando la pagina non ha ancora un articolo. Dopo questo modulo:

- **Piano a pagine**: Claude Code legge il piano in più chiamate, nell'ordine di lavoro, con un cursore che sa se il piano
  è cambiato nel frattempo.
- **Version sempre**: nessuna importazione senza la version letta; senza articolo la version è 0.

## Task atomici

```yaml
- id: T-8201
  title: "get_plan a pagine con il cursore"
  macrotask: "mcp-refine"
  depends_on: [T-7501, T-7502]

  objective: >
    Leggere anche un piano grande senza superare il limite di output di Claude Code, senza mai mescolare due versioni
    del piano nella stessa lettura.

  definition_of_done:
    - "get_plan({ projectId, cursor? }): ogni risposta ha strategyId, name, version, groupingSource, groupingNotice, il numero totale di pagine e di keyword non assegnate, una parte delle pagine nell'ordine di lavoro con i campi di oggi, poi, dopo l'ultima pagina, una parte delle non assegnate, e nextCursor (null alla fine)."
    - "Ogni risposta porta pagine intere fino a 1000 keyword in tutto; una pagina con più di 1000 keyword esce da sola; le non assegnate escono a gruppi di 1000 dopo l'ultima pagina, anche nella stessa risposta dell'ultima pagina se c'è posto."
    - "Il cursore porta la version del piano: se il piano ha una version diversa la risposta è isError STRATEGY_CONFLICT con currentVersion e Claude Code ricomincia senza cursore; un cursore non valido è VALIDATION_ERROR sul campo cursor."
    - "Descrizione dello strumento e istruzioni di initialize aggiornate: chiamare get_plan con nextCursor finché non è null."

  acceptance_criteria:
    - id: AC-8201-1
      given: "un piano con 3 pagine da 600 keyword ciascuna e 1500 keyword non assegnate"
      when: "Claude Code chiama get_plan senza cursore e poi con ogni nextCursor finché è null"
      then: "le risposte sono 5: la prima, la seconda e la terza con una pagina ciascuna (numeri 1, 2, 3), la quarta con 1000 non assegnate e la quinta con 500, tutte con la stessa version, e l'ultima ha nextCursor null"
    - id: AC-8201-2
      given: "la prima risposta di get_plan con il suo nextCursor"
      when: "l'utente cambia il piano (version cresciuta) e Claude Code chiama get_plan con quel nextCursor"
      then: "la risposta è isError STRATEGY_CONFLICT con currentVersion uguale alla version nuova"
    - id: AC-8201-3
      given: "un piano con 2 pagine da 10 keyword e 5 non assegnate"
      when: "Claude Code chiama get_plan senza cursore"
      then: "una sola risposta ha le 2 pagine e le 5 non assegnate con nextCursor null"

  target_tests:
    - file: "tests/integration/mcp-plan-paging.test.ts"
      covers: [AC-8201-1, AC-8201-2, AC-8201-3]

  security_notes:
    - "A04 / CWE-770: risposte limitate a circa 1000 keyword; il cursore si legge con uno schema stretto."
    - "A04 / CWE-362: la version nel cursore evita una lettura fatta di due versioni del piano."

  out_of_scope:
    - "Filtri delle pagine (per stato o per hub); un limite scelto da Claude Code."

- id: T-8202
  title: "import_article con la version sempre obbligatoria"
  macrotask: "mcp-refine"
  depends_on: [T-7601]

  objective: >
    Non lasciare mai importare un articolo senza dire quale versione si è letta, nemmeno la prima volta.

  definition_of_done:
    - "import_article: version obbligatoria (VALIDATION_ERROR sul campo version se manca); senza articolo vale 0 e crea l'articolo con version 1; senza articolo una version diversa da 0 è isError ARTICLE_VERSION_CONFLICT con currentVersion 0; con un articolo resta il controllo di oggi."
    - "Descrizione dello strumento e docs/AGENT-MCP.md: version 0 alla prima importazione; get_article senza articolo resta ARTICLE_NOT_FOUND."
    - "DoD di T-7601 emendato con il rimando a D-70; i casi di tests/integration/mcp-articles.test.ts passano la version 0 alla prima importazione (impacted-by T-8202)."

  acceptance_criteria:
    - id: AC-8202-1
      given: "una pagina «Da scrivere» senza articolo"
      when: "Claude Code chiama import_article senza version, poi con version 3, poi con version 0"
      then: "la prima risposta è isError VALIDATION_ERROR sul campo version, la seconda isError ARTICLE_VERSION_CONFLICT con currentVersion 0, e dopo le prime due la pagina non ha articolo; la terza crea l'articolo con version 1"

  target_tests:
    - file: "tests/integration/mcp-articles-version.test.ts"
      covers: [AC-8202-1]

  security_notes:
    - "A04 / CWE-362: anche la prima importazione dice cosa ha letto, così due importazioni insieme non si sovrascrivono."

  out_of_scope:
    - "Cambi alla version degli articoli nell'editor dell'app."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-11-22 (D-70) alle domande sulle scelte di 74, 75 e 76: «Pagine subito» e «1000 keyword» per get_plan, «Sempre la versione» per import_article.
- Scelte dell'agente (da confermare): cursore opaco con la version del piano, non assegnate dopo le pagine nella stessa sequenza, una pagina più grande del limite da sola, VALIDATION_ERROR per un cursore non valido, currentVersion 0 senza articolo.
- Ordine: dopo il 76; T-8201 e T-8202 indipendenti. Nel DAG viene dopo il 77 e l'80 (numero più alto).
