# 74-mcp-serp — Macrotask `mcp-serp`

> I risultati di Google salvano anche titolo e descrizione, e Claude Code li legge per keyword (D-64).

## Obiettivo del macrotask
Scelta dell'utente del 2026-11-17: Claude Code deve avere «il quadro completo». Oggi `keyword_serps` (T-6101) salva
solo gli indirizzi dei primi 10 risultati; DataForSEO manda nella stessa risposta anche titolo e descrizione, quindi
salvarli non costa nulla in più. Disegno in `docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`.

## Task atomici

```yaml
- id: T-7401
  title: "Titolo e descrizione dei risultati di Google salvati"
  macrotask: "mcp-serp"
  depends_on: [T-6101, T-6504]

  objective: >
    Conservare con ogni indirizzo dei risultati di Google anche titolo e descrizione, senza cambiare chi usa già gli
    indirizzi.

  definition_of_done:
    - "Migrazione additiva: keyword_serps.results Json nullable, elenco nell'ordine dei risultati di { url, title, description } (title e description null se mancano); urls resta com'è e il motore del piano continua a leggere urls."
    - "collectSerpTasks (lib/modules/providers/serp/dataforseo-serp.ts) legge title e description degli item organic insieme a url, con lo stesso filtro e la stessa normalizzazione degli URL di T-6504; testi ripuliti dai caratteri di controllo e tagliati a 300 caratteri."
    - "Le righe salvate prima restano con results null e si completano quando si rinnovano dopo i 30 giorni (SERP_MAX_AGE_DAYS)."

  acceptance_criteria:
    - id: AC-7401-1
      given: "una risposta task_get/regular di DataForSEO con 10 risultati organici, uno con un link google.com/goto e uno senza description"
      when: "collectSerpTasks la legge e salva la keyword"
      then: "urls ha gli stessi indirizzi di oggi; results ha un elemento per indirizzo nello stesso ordine con title, e description null per il risultato senza description"
    - id: AC-7401-2
      given: "un title di 500 caratteri con un carattere di controllo"
      when: "collectSerpTasks lo salva"
      then: "il title salvato ha al massimo 300 caratteri e nessun carattere di controllo"

  target_tests:
    - file: "tests/integration/plan-serps.test.ts"
      covers: [AC-7401-1, AC-7401-2]

  security_notes:
    - "A03 / CWE-79: titoli e descrizioni sono testo di terzi: si salvano come testo e si restituiscono come dati, mai resi come HTML."

  out_of_scope:
    - "Mostrare titoli e descrizioni nell'interfaccia di Titan SEO."
    - "Chiedere di nuovo a DataForSEO le keyword già salvate prima dei 30 giorni."

- id: T-7402
  title: "Strumento get_serps"
  macrotask: "mcp-serp"
  depends_on: [T-7401, T-7202]

  objective: >
    Far leggere a Claude Code i primi 10 risultati di Google delle keyword di un progetto, per ragionare su accorpamenti
    e H2.

  definition_of_done:
    - "get_serps({ projectId, keywords (da 1 a 50 testi o forme canoniche) }): per ogni keyword, con la lingua e il paese del progetto, fetchedAt e i risultati con posizione, url, title e description (null per le righe salvate prima di T-7401); una keyword senza risultati salvati ha results vuoto e la nota che si chiedono con build_plan."
    - "Legge solo keyword_serps (readFreshSerps e le righe più vecchie con la loro data); nessuna richiesta a DataForSEO."

  acceptance_criteria:
    - id: AC-7402-1
      given: "un progetto it-IT con una keyword salvata con results, una salvata prima di T-7401 con i soli urls e una senza risultati"
      when: "Claude Code chiama get_serps con le tre keyword"
      then: "la prima ha 10 risultati con title, la seconda ha i suoi url con title null, la terza ha results vuoto con la nota; nessuna richiesta parte verso DataForSEO"
    - id: AC-7402-2
      given: "la stessa chiave"
      when: "Claude Code chiama get_serps con 51 keyword o con il progetto di un workspace di cui il root admin non è membro"
      then: "la prima risposta è isError VALIDATION_ERROR, la seconda è isError PROJECT_NOT_FOUND"

  target_tests:
    - file: "tests/integration/mcp-serps.test.ts"
      covers: [AC-7402-1, AC-7402-2]

  security_notes:
    - "A01 / CWE-639: lingua e paese dal progetto autorizzato, mai dall'input."

  out_of_scope:
    - "Aprire le pagine dei risultati: Claude Code lo fa da sé con gli indirizzi."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): quadro completo con titolo e descrizione dei risultati, senza costi in più.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): colonna results accanto a urls, 300 caratteri al massimo, da 1 a 50 keyword per chiamata, nessun rinnovo forzato delle righe vecchie.
- Ordine: dopo il 73; T-7402 dopo T-7401.
- Note di costruzione (2026-11-21, scelte dell'agente confermate dall'utente il 2026-11-22, D-70). Migrazione additiva `0062_serp_results` con la sola colonna `keyword_serps.results` JSONB nullable. T-7401: in `lib/modules/providers/serp/dataforseo-serp.ts` `organicResults` prende il posto di `organicUrls` con lo stesso filtro (solo organic, URL non vuoto fino a 2048 caratteri, niente link goto), lo stesso ordine di `rank_absolute`, i 10 risultati e `withoutTrackingParams`; `urls` si salva come `results.map(url)`, quindi resta identico a oggi. Titolo e descrizione con `serpText`: i caratteri di controllo (Unicode Cc) diventano spazi, gli spazi doppi si uniscono, il testo si taglia a 300 caratteri (`SERP_TEXT_MAX_LENGTH`, senza lasciare a metà una coppia surrogata) e un testo vuoto o mancante è null. T-7402: `readSavedSerps` in `lib/modules/plan-data/serps.ts` legge le righe di ogni età per lingua, paese e forme canoniche, con `fetchedAt`; i risultati vengono da `results` o, per le righe di prima, da `urls` con titolo e descrizione null; in tutte e due i link goto rimasti si tolgono e gli URL perdono srsltid come in `readFreshSerps`. Strumento `get_serps` in `lib/modules/agent/tools/serps.ts`, registrato dopo `set_keywords`: permesso project.read (`requireProjectAccess`, altrimenti PROJECT_NOT_FOUND), keyword da 1 a 50 testi fino a 200 caratteri, forme canoniche con la lingua del progetto, doppioni con la stessa forma canonica restituiti una volta sola nell'ordine della prima; risposta con `language`, `country` e per ogni keyword `keyword` (il testo passato), `canonical`, `fetchedAt` (ISO, null senza risultati), `results` con `position` da 1, `url`, `title`, `description` e, solo senza risultati salvati, `note` in inglese che rimanda a build_plan. Nessuna richiesta a DataForSEO e nessuna spesa.
