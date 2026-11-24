# 83-mcp-topics — Macrotask `mcp-topics`

> Claude Code crea altri argomenti in un progetto, sa quanto copre una ricerca e non perde keyword aggiungendo parole
> di partenza; la card della chiave dice dove incollare il comando (D-71).

## Obiettivo del macrotask
Prova dell'utente del 2026-11-23 con Claude Code collegato a Titan SEO in un suo progetto: dieci parole di partenza
hanno dato 1667 keyword; aggiunte altre dieci con `run_search`, la ricerca rifatta sull'unico argomento ne ha date
1178. Cause: ogni ricerca fa al massimo `MAX_EXPANSION_QUERIES` domande a Google (250 di default), divise fra tutte le
parole di partenza dell'argomento (con 10 parole: 10 sole, 80 composizioni, 160 con le lettere; con 20 parole: 20, 160 e
70), e rifare la ricerca toglie dall'argomento le keyword non ritrovate (D-19, T-705). Claude Code non può creare un
secondo argomento (T-7301 lo lasciava fuori), quindi ha solo due strade: rifare la ricerca e perdere keyword, oppure
aprire un progetto nuovo con un piano separato. Nella stessa prova la chiave è finita in chiaro nella conversazione,
perché il comando di collegamento era stato incollato nella chat di Claude Code invece che nel terminale. Scelta
dell'utente del 2026-11-23 («si scrivi tutto»): strumento per gli argomenti, istruzioni più chiare, avviso nella card.
Le keyword fuori tema restano compito di Claude Code con `set_keywords` (D-64): nessuna modifica.

## Task atomici

```yaml
- id: T-8301
  title: "Strumento create_topic"
  macrotask: "mcp-topics"
  depends_on: [T-7301, T-7302]

  objective: >
    Far creare a Claude Code un argomento nuovo in un progetto, con le sue parole di partenza e la sua ricerca, come
    «+ Nuovo argomento» nell'app, senza toccare le keyword degli altri argomenti.

  definition_of_done:
    - "create_topic({ projectId, name, seeds (da 1 a 10) }) in lib/modules/agent/tools/research.ts, registrato dopo run_search: crea l'argomento in fondo all'elenco con le parole di partenza ripulite come in create_project e le impostazioni del progetto (nessuna sostituzione), con i controlli della rotta POST /api/projects/[id]/subprojects (permesso section.write, limiti maxSectionsPerProject e maxSeedsPerSection, nome già usato SECTION_NAME_TAKEN), poi ne avvia la ricerca con origin AGENT come create_project; risponde con topicId, jobId (null con il code che ha impedito l'avvio, l'argomento resta creato) e la spesa di oggi."
    - "Il tetto di spesa si controlla prima della creazione: con la spesa di oggi uguale o sopra il tetto la risposta è isError AGENT_SPEND_CAP e l'argomento non nasce (come create_project, D-69)."
    - "build_plan e get_plan restano sull'intero progetto: il piano usa le keyword tenute di tutti gli argomenti, come oggi."

  acceptance_criteria:
    - id: AC-8301-1
      given: "un progetto creato con create_project con l'argomento «Permessi» e la sua ricerca finita con le keyword tenute contate"
      when: "Claude Code chiama create_topic con name «Straordinari» e seeds [«straordinari»] e aspetta la ricerca con wait_for_job"
      then: "il progetto ha due argomenti, «Straordinari» in seconda posizione con la sua parola di partenza e un lavoro di ricerca con origin AGENT, la risposta contiene topicId e jobId, e le keyword dell'argomento «Permessi» sono le stesse di prima"
    - id: AC-8301-2
      given: "lo stesso progetto"
      when: "Claude Code chiama create_topic con name «Permessi», poi con la spesa di oggi al tetto e name «TFR»"
      then: "la prima risposta è isError SECTION_NAME_TAKEN, la seconda isError AGENT_SPEND_CAP, e il progetto ha ancora un solo argomento"
    - id: AC-8301-3
      given: "un progetto con due argomenti con keyword tenute e risultati di Google per le keyword"
      when: "Claude Code chiama build_plan e poi get_plan"
      then: "il piano contiene keyword di entrambi gli argomenti"

  target_tests:
    - file: "tests/integration/mcp-topics.test.ts"
      covers: [AC-8301-1, AC-8301-2, AC-8301-3]

  security_notes:
    - "A01 / CWE-639: solo progetti dei workspace del root admin, con i permessi section.write ed extraction.run di oggi."
    - "A04 / CWE-770: tetto di spesa controllato prima della creazione, limiti del piano come nell'app."

  out_of_scope:
    - "Rinominare, riordinare o cancellare argomenti; lingua, paese o altre impostazioni diverse dal progetto."

- id: T-8302
  title: "Quanto copre una ricerca, detto a Claude Code"
  macrotask: "mcp-topics"
  depends_on: [T-8301]

  objective: >
    Far sapere a Claude Code che una ricerca ha un numero limitato di domande a Google e che rifarla sostituisce le
    keyword dell'argomento, così divide le parole di partenza in argomenti invece di perdere keyword.

  definition_of_done:
    - "wait_for_job di una ricerca risponde anche con queries: { asked, skipped }, cioè le domande a Google della ricerca e quelle tolte dal limite (dal cursore del lavoro: queries e skippedQueries); con skipped maggiore di 0 aggiunge una nota in inglese che consiglia create_topic con le parole di partenza divise per tema."
    - "Descrizioni di run_search, create_project e create_topic (in inglese): una ricerca fa un numero limitato di domande a Google divise fra le parole di partenza dell'argomento; run_search con parole nuove rifà la ricerca dell'intero argomento e toglie le keyword che non ritrova, tenute o scartate."
    - "Istruzioni di initialize: una regola nuova con il consiglio di non oltre 5 parole di partenza per argomento (con 250 domande, 8 composizioni, 26 lettere e 10 cifre ogni parola ne usa 45) e di più argomenti con create_topic, uno per tema, invece di aggiungere parole allo stesso argomento."
    - "docs/AGENT-MCP.md: create_topic nella tabella degli strumenti e una sezione «Ricerche e argomenti» con il limite e la sostituzione."

  acceptance_criteria:
    - id: AC-8302-1
      given: "MAX_EXPANSION_QUERIES 50 e un argomento con 3 parole di partenza e le composizioni, le lettere e le cifre attive"
      when: "la ricerca finisce e Claude Code chiama wait_for_job"
      then: "la risposta ha queries.asked 50, queries.skipped uguale a skippedQueries del cursore del lavoro e maggiore di 0, e una nota che nomina create_topic"
    - id: AC-8302-2
      given: "un argomento con 1 parola di partenza e il limite di default"
      when: "la ricerca finisce e Claude Code chiama wait_for_job"
      then: "la risposta ha queries.skipped 0 e nessuna nota"
    - id: AC-8302-3
      given: "una chiave valida"
      when: "Claude Code chiama initialize e tools/list"
      then: "le istruzioni contengono la regola sulle 5 parole di partenza per argomento con create_topic, e la descrizione di run_search dice che le keyword non ritrovate vengono tolte"

  target_tests:
    - file: "tests/integration/mcp-search-limits.test.ts"
      covers: [AC-8302-1, AC-8302-2, AC-8302-3]

  security_notes:
    - "Nessun dato nuovo all'esterno: i conteggi delle domande sono del lavoro dell'utente."

  out_of_scope:
    - "Cambiare MAX_EXPANSION_QUERIES o la regola di sostituzione delle keyword (D-19); ricerche che aggiungono senza togliere."

- id: T-8303
  title: "Dove incollare il comando della chiave"
  macrotask: "mcp-topics"
  depends_on: [T-7102]

  objective: >
    Evitare che la chiave finisca scritta nella conversazione di Claude Code e che il comando fallisca quando Titan
    SEO era già collegato.

  definition_of_done:
    - "Card «Claude Code», sotto il comando mostrato dopo «Crea la chiave»: «Incollalo nel terminale, prima di avviare Claude Code, non nella chat: lì la chiave resterebbe scritta nella conversazione.» e «Se avevi già collegato Titan SEO, prima togli il collegamento vecchio con claude mcp remove titanseo.», con il comando in codice; testi in it, en, es-ES ed es-419."
    - "docs/AGENT-MCP.md, punti 3 e 4 del collegamento: le stesse due avvertenze."

  acceptance_criteria:
    - id: AC-8303-1
      given: "il root admin nella card «Claude Code» senza chiave attiva"
      when: "crea la chiave"
      then: "sotto il comando la card mostra l'avvertenza sul terminale e il comando claude mcp remove titanseo; prima della creazione le due avvertenze non ci sono"

  target_tests:
    - file: "tests/component/admin-agent-key-card.test.tsx"
      covers: [AC-8303-1]

  security_notes:
    - "A02 / CWE-312: il comando con la chiave va nel terminale, non in una conversazione salvata."

  out_of_scope:
    - "Una chiave letta da una variabile d'ambiente invece che scritta nel comando."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla scelta dell'utente del 2026-11-23 («si scrivi tutto», D-71) dopo la prova con Claude Code in un suo progetto: strumento create_topic, istruzioni sul limite delle ricerche e sulla sostituzione delle keyword, avvertenze nella card.
- Scelte dell'agente (da confermare): name obbligatorio in create_topic, nessuna impostazione diversa dal progetto, tetto controllato prima della creazione come create_project, queries con asked e skipped in wait_for_job, consiglio di 5 parole di partenza per argomento, avvertenze sotto il comando e non in un dialogo.
- Ordine: dopo il 73 e il 71; T-8302 dopo T-8301, T-8303 indipendente. Nel DAG viene dopo l'80 e l'82 (numero più alto).
- Note di costruzione (2026-11-24, scelte dell'agente da confermare):
  - T-8301: la transazione della rotta POST `/api/projects/[id]/subprojects` è diventata `createSection` in
    `lib/modules/sections.ts` (limiti `maxSectionsPerProject` e `maxSeedsPerSection`, posizione in fondo, sezione
    predefinita se manca, `SECTION_NAME_TAKEN`), usata dalla rotta e da `create_topic`: stessi controlli senza codice
    doppio. `create_topic` registrato dopo `run_search`; nome con gli spazi ai lati tolti (solo spazi →
    `VALIDATION_ERROR` sul campo name), parole di partenza ripulite come in `create_project`, nessuna impostazione
    propria (l'argomento segue il progetto); ordine dei controlli: parole di partenza, accesso con `section.write`
    (progetto di altri `PROJECT_NOT_FOUND`), tetto di spesa, creazione, avvio della ricerca con
    `startQuickStartExtraction` e origin AGENT (`extraction.run`, email, piano, rate limit e quota diventano il code di
    `extraction` con `jobId` null, l'argomento resta); risposta con `projectId`, `topicId`, `jobId`, `extraction` e
    `spend`;
  - T-8302: `queries: { asked, skipped }` sempre nella risposta di `wait_for_job` di una ricerca (0 e 0 prima che la
    fase expand le calcoli), nota in inglese solo con `skipped` maggiore di 0; frasi comuni sul limite delle domande e
    sulla sostituzione nelle descrizioni (il limite in `create_project`, `run_search` e `create_topic`, la sostituzione
    in `run_search`), regola nuova delle istruzioni con «at most 5 seed keywords» e il conto di 45 domande per parola
    con il limite di 250, passo 2 del percorso con `create_topic`;
  - T-8303: le due avvertenze sono paragrafi sotto il comando, prima di «Copiali adesso»; il comando
    `claude mcp remove titanseo` in `<code>` con la classe monospazio della chiave; es-419 diverso da es-ES solo per
    «la terminal» (es-ES «el terminal»), la seconda frase viene da es-ES;
  - test: `tests/integration/mcp-topics.test.ts` (AC-8301-1…3 più progetto di altri e nome vuoto),
    `tests/integration/mcp-search-limits.test.ts` (AC-8302-1…3 più la risposta prima della fase expand) e il caso nuovo
    di AC-8303-1 in `tests/component/admin-agent-key-card.test.tsx` (impacted-by T-8303); scritti dopo il codice e
    visti rossi con il codice tolto (8 casi su 15: AC-8301-3 e gli altri casi già veri oggi restano verdi, come vuole
    il DoD di T-8301 sul piano), poi verdi; nessuna migrazione.
