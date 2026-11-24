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
- Note di costruzione (2026-11-24, scelte dell'agente da confermare):
  - T-8201: cursore opaco, JSON `{ strategyId, version, next }` in base64url letto con uno schema zod stretto (al
    massimo 200 caratteri); oltre alla version porta l'id del piano, così anche un piano rigenerato (strategia nuova,
    che riparte dalla version 0) è `STRATEGY_CONFLICT` con la `currentVersion` del piano nuovo;
  - pezzi nell'ordine di lettura: ogni pagina intera nell'ordine di lavoro, poi le non assegnate a gruppi fissi di 1000
    (1-1000, 1001-2000, …); una risposta prende pezzi interi finché il totale resta entro 1000 keyword e sempre il
    primo (una pagina con più di 1000 keyword esce da sola). Un gruppo di non assegnate sta con l'ultima pagina solo se
    ci sta tutto: con AC-8201-1 la terza pagina (600) non porta 400 non assegnate, che spezzerebbero i gruppi da 1000;
  - risposta con `totalPages` e `totalUnassigned`; `number` resta la posizione della pagina nell'intero piano;
  - cursore non valido (non decodificabile, schema diverso, posizione oltre la fine) → `VALIDATION_ERROR` sul campo
    `cursor`; la posizione oltre la fine si controlla dopo la version, quindi un piano cambiato dà prima il conflitto;
  - T-8202: `IMPORT_ARTICLE_FIELDS.version` senza `optional()`, quindi `VALIDATION_ERROR` sul campo version da
    `defineTool`; senza articolo la version diversa da 0 è `ARTICLE_VERSION_CONFLICT` con `currentVersion` 0 dentro la
    transazione, prima della creazione; due prime importazioni insieme con la version 0: l'indice unico della pagina fa
    rispondere alla seconda il conflitto con la version 1 (`concurrentChange` di oggi);
  - istruzioni di `initialize` (passo 4: get_plan a parti, con nextCursor finché non è null), descrizioni di `get_plan`
    e `import_article` e `docs/AGENT-MCP.md` aggiornate; nessuna migrazione;
  - test: `tests/integration/mcp-plan-paging.test.ts` (AC-8201-1…3 più un caso con una pagina da 1200 keyword, le non
    assegnate con l'ultima pagina e il cursore non valido) e `tests/integration/mcp-articles-version.test.ts`
    (AC-8202-1), scritti prima del codice e visti rossi (5 casi), poi verdi; `tests/integration/mcp-articles.test.ts`
    impacted-by T-8202: l'aiuto `importArticle` passa la version 0 se il caso non ne dà una e il caso «senza version» si
    aspetta `VALIDATION_ERROR` sul campo version e, con la version 0 su un articolo esistente, il conflitto con la
    version 1. Il DoD di T-7601 era già emendato con il rimando a D-70 (2026-11-22).
