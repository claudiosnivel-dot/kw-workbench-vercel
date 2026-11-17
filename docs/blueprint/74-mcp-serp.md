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
- Scelte dell'agente da confermare: colonna results accanto a urls, 300 caratteri al massimo, da 1 a 50 keyword per chiamata, nessun rinnovo forzato delle righe vecchie.
- Ordine: dopo il 73; T-7402 dopo T-7401.
