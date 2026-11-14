# 65-plan-tuning — Macrotask `plan-tuning`

> Piano e articoli dopo le prove in produzione del 2026-11-14 (D-60): la classificazione di luoghi e concorrenti che non risponde con 171 keyword, la pagina principale che raccoglie quasi tutte le keyword, gli articoli delle pagine senza H2.

## Obiettivo del macrotask
Il 2026-11-14 la rigenerazione del piano di «Noleggio magnetoterapia» (175 keyword) e un articolo breve sulla pagina «farmacia» hanno mostrato tre difetti:

- **Classificazione**: un solo lotto di 171 keyword; ernie risposta tagliata anche con 12000 max_tokens, ultra oltre i 45 s, i due Gemma occupati, super-vl senza tempo nei 100 s della richiesta: luoghi e concorrenti riconosciuti solo dalle regole fisse (AI_CLASSIFY_UNAVAILABLE). Alla seconda prova, con i modelli lenti in pausa, la classificazione ha risposto.
- **Raggruppamento**: 160 keyword su 175 nella pilastro, con la soglia dei risultati in comune a 3 e a 2 (stesso esito). Motivo letto dal piano salvato: 122 keyword arrivano da pagine sotto soglia (1 keyword e meno di 100 ricerche) che confluiscono nella pagina con più URL in comune, e la pilastro vince quasi sempre perché il confronto usa l'unione degli URL di tutte le sue keyword.
- **Articoli**: una pagina con una sola keyword non ha H2 nel piano, quindi la scaletta ha il solo blocco INTRO e l'articolo esce con introduzione e FAQ (circa 470 parole).

Dopo questo modulo la classificazione lavora a lotti di 100 con più tempo, il raggruppamento è corretto e verificato sui risultati di Google veri del progetto, e la scaletta propone gli H2 quando la pagina ne ha meno di 2.

## Task atomici

```yaml
- id: T-6501
  title: "Classificazione del piano a lotti più piccoli e con più tempo"
  macrotask: "plan-tuning"
  depends_on: [T-6301, T-6303, T-6402]

  objective: >
    Far rispondere la classificazione di luoghi e concorrenti anche con i modelli gratuiti grandi e con centinaia di keyword.

  definition_of_done:
    - "lib/modules/plan-ai/classify.ts: CLASSIFY_BATCH_SIZE 100 (prima 300); la fase classify del lavoro di piano manda al modello un gruppo di al più 100 keyword per passo."
    - "lib/modules/plan-runs/phases.ts: 90 s per tentativo e 180 s per richiesta nella classificazione (prima 45 s e 100 s), sempre entro la lease del passo meno il margine; il passo di 270 s e la maxDuration di 300 s della rotta interna restano."
    - "docs/AI-TITLES.md (sezione Luoghi e concorrenti del piano): lotti di 100 e tempi nuovi, con la prova del 2026-11-14."

  acceptance_criteria:
    - id: AC-6501-1
      given: "250 keyword senza riconoscimento fisso, tutte con risultati di Google, e un modello simulato che risponde con un oggetto JSON valido"
      when: "il lavoro di piano esegue la fase classify fino al raggruppamento"
      then: "il modello riceve 3 richieste con 100, 100 e 50 keyword nel messaggio dell'utente e ai_requests ha 3 righe con feature plan e outcome ok"
    - id: AC-6501-2
      given: "un lavoro di piano nella fase classify e un modello simulato che risponde dopo 60 s con un oggetto JSON valido (timer finti)"
      when: "avanza il lavoro"
      then: "le classi del gruppo sono salvate nel cursore, grouping_notice non è AI_CLASSIFY_UNAVAILABLE e ai_requests ha un solo tentativo, con outcome ok"

  target_tests:
    - file: "tests/integration/plan-run-serp.test.ts"
      covers: [AC-6501-1, AC-6501-2]

  security_notes:
    - "A06 / CWE-770: lotti più piccoli moltiplicano le richieste per piano (da 1-4 a 1-10 con 1000 keyword): restano contate nel tetto della piattaforma, root admin escluso (D-59)."
    - "A09 / CWE-532: nel log plan_classify solo conteggi, modello ed esiti, come oggi."

  out_of_scope:
    - "Cambiare l'elenco dei modelli o il loro ordine."

- id: T-6502
  title: "Raggruppamento corretto sui risultati di Google veri del progetto"
  macrotask: "plan-tuning"
  depends_on: [T-6302, T-6303]

  objective: >
    Evitare che la pilastro raccolga quasi tutte le keyword, verificandolo sui risultati di Google veri di un progetto e non solo su dati scritti a mano.

  definition_of_done:
    - "tests/fixtures/strategy/it-magnetoterapia-real-serp.json: keyword tenute del progetto «Noleggio magnetoterapia» con forma canonica, volume, flag domanda e i primi 10 URL organici salvati in keyword_serps, lette dal database di produzione con sole SELECT (scelta dell'utente del 2026-11-14); nessun id di utente, workspace o progetto nel file."
    - "Diagnosi scritta nel Self-check del modulo: pagine per intento prima della confluenza, quante sotto soglia e dove confluiscono, con le soglie dei risultati in comune 2, 3 e 4."
    - "lib/modules/strategy/serp-cluster.ts: una pagina sotto soglia confluisce nella pagina tenuta la cui keyword principale ha più URL in comune con la sua keyword principale (non con l'unione degli URL della pagina); a parità uno spoke prima della pilastro; nella pilastro solo se nessuno spoke ha almeno 1 URL in comune. Altre correzioni che la diagnosi rende necessarie (per esempio soglie per i volumi bassi) si scrivono nelle note di costruzione e restano entro i limiti delle regole della modalità esperta."

  acceptance_criteria:
    - id: AC-6502-1
      given: "la fixture it-magnetoterapia-real-serp.json, le regole predefinite e nessuna classe dall'AI"
      when: "si costruisce il piano con buildSerpPlan"
      then: "la pilastro ha meno della metà delle keyword del piano e il piano ha almeno 4 spoke"
    - id: AC-6502-2
      given: "un piano con la pilastro P, uno spoke S e una pagina sotto soglia T la cui keyword principale ha 2 URL in comune con quella di S e 1 con quella di P, mentre l'unione degli URL di P ne ha 6 in comune con T"
      when: "si costruisce il piano con buildSerpPlan"
      then: "le keyword di T sono nello spoke S e non nella pilastro"

  target_tests:
    - file: "tests/unit/strategy-serp-cluster.test.ts"
      covers: [AC-6502-1, AC-6502-2]

  security_notes:
    - "A01 / CWE-200: la lettura dalla produzione è solo SELECT con l'accesso già configurato (CLI di Supabase); nel file solo keyword, volumi e URL pubblici dei risultati di Google, nessun dato di account."
    - "A04: buildSerpPlan resta una funzione pura e deterministica."

  out_of_scope:
    - "Più hub da una sola parola di partenza quando tutte le keyword la contengono (da valutare dopo la diagnosi, con l'utente)."

- id: T-6503
  title: "H2 proposti dalla scaletta per le pagine con meno di 2 H2"
  macrotask: "plan-tuning"
  depends_on: [T-4102, T-4201]

  objective: >
    Scrivere un articolo con le sue sezioni anche per una pagina del piano con una sola keyword e senza H2.

  definition_of_done:
    - "lib/articles/outline-prompt.ts: con meno di 2 H2 nella pagina la richiesta della scaletta chiede al modello da 2 a 4 H2 nuovi dopo quelli della pagina, ognuno in un blocco con id NEW_1, NEW_2... e heading; istruzioni in italiano, spagnolo e inglese; con 2 H2 o più la richiesta resta com'è."
    - "lib/articles/outline-response.ts: i blocchi nuovi hanno heading di testo da 3 a 120 caratteri, senza tag né Markdown, diversi tra loro e dagli H2 della pagina; meno di 2 o più di 4 blocchi nuovi è una risposta non valida; i blocchi nuovi diventano blocchi H2 dell'articolo con il loro heading, dopo quelli della pagina. Gli H2 della pagina nel piano non cambiano."
    - "docs/AI-TITLES.md (scaletta degli articoli): la regola degli H2 proposti."

  acceptance_criteria:
    - id: AC-6503-1
      given: "una pagina senza H2 e un modello simulato che risponde alla scaletta con INTRO e 3 blocchi NEW_1…NEW_3 con heading validi"
      when: "il lavoro dell'articolo esegue la fase outline"
      then: "l'articolo ha i blocchi INTRO e 3 blocchi H2 con gli heading della risposta nell'ordine, e strategy_pages.h2 della pagina resta vuoto"
    - id: AC-6503-2
      given: "una pagina senza H2 e una risposta della scaletta con 1 blocco nuovo, oppure con 5"
      when: "si controlla la risposta"
      then: "il controllo la rifiuta con AI_INVALID_RESPONSE"
    - id: AC-6503-3
      given: "una pagina con 3 H2"
      when: "si costruisce la richiesta della scaletta"
      then: "il messaggio non chiede H2 nuovi e una risposta con un blocco NEW_1 è rifiutata con AI_INVALID_RESPONSE"

  target_tests:
    - file: "tests/integration/article-outline.test.ts"
      covers: [AC-6503-1]
    - file: "tests/unit/article-outline-response.test.ts"
      covers: [AC-6503-2, AC-6503-3]

  security_notes:
    - "A03 / CWE-79: gli heading proposti dal modello si salvano come testo e si mostrano come testo, come gli altri (markdown-sanitizer)."
    - "A06 / CWE-770: nessuna richiesta in più; più blocchi nel tetto di parole della lunghezza scelta."

  out_of_scope:
    - "Scrivere gli H2 proposti nel piano (strategy_pages.h2)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo su richiesta dell'utente del 2026-11-14 («si facciamo queste correzioni»), dalle prove in produzione dello stesso giorno, con le scelte prese con AskUserQuestion: diagnosi del raggruppamento sui dati veri del progetto (con la fixture nel repository) e H2 proposti dalla scaletta (D-60).
- Scelte dell'agente da confermare: lotti di 100 keyword; 90 s e 180 s nella classificazione come negli articoli; soglia di AC-6502-1 (pilastro con meno della metà delle keyword e almeno 4 spoke); da 2 a 4 H2 proposti, ids NEW_n dopo gli H2 della pagina; H2 proposti solo nell'articolo e non nel piano.
- Ordine: dopo il 64; i tre task sono indipendenti tra loro.
