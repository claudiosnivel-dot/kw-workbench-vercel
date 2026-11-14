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

- id: T-6504
  title: "URL veri dei risultati di Google al posto dei link google.com/goto"
  macrotask: "plan-tuning"
  depends_on: [T-6101]

  objective: >
    Salvare per ogni keyword gli indirizzi veri delle pagine che Google mostra, così due keyword con le stesse pagine hanno
    URL in comune e il raggruppamento per risultati funziona.

  definition_of_done:
    - "lib/modules/providers/serp/dataforseo-serp.ts: il corpo di task_post ha resolve_goto_urls true (per i task con priority 2 il valore predefinito è false, documentazione di DataForSEO letta il 2026-11-15); gli URL organic che sono ancora link di reindirizzamento di Google (host google.<dominio> con o senza www e percorso /goto) non si salvano, gli altri restano nell'ordine di rank_absolute, al massimo 10."
    - "lib/modules/plan-data/serps.ts: readFreshSerps non restituisce le righe di keyword_serps che contengono link goto (salvate prima di questo task), così le loro keyword si chiedono di nuovo a DataForSEO."
    - "docs/METRICS-PROVIDERS.md (sezione SERP): i link goto di Google (dal 2026-08-26), resolve_goto_urls e i dati di produzione del 2026-11-14 (1655 URL su 1655 erano link goto)."

  acceptance_criteria:
    - id: AC-6504-1
      given: "fetch simulato di DataForSEO che risponde a un task con 10 risultati organic, di cui 3 link https://google.com/goto?url=... e 7 indirizzi diretti"
      when: "si inviano e si raccolgono i task di 'noleggio magnetoterapia' in it-IT"
      then: "il corpo di task_post ha resolve_goto_urls true e keyword_serps ha una riga con i soli 7 indirizzi diretti nell'ordine di rank_absolute"
    - id: AC-6504-2
      given: "una riga di keyword_serps di 2 giorni fa con link goto per 'noleggio magnetoterapia' e una di 2 giorni fa con indirizzi diretti per 'noleggio magnetoterapia costo'"
      when: "si chiedono i risultati delle due keyword"
      then: "readFreshSerps restituisce solo 'noleggio magnetoterapia costo' e task_post riceve solo 'noleggio magnetoterapia'"

  target_tests:
    - file: "tests/integration/plan-serps.test.ts"
      covers: [AC-6504-1, AC-6504-2]

  security_notes:
    - "A06 / CWE-770: le keyword salvate con i link goto si richiedono una volta, dentro i tetti di spesa di T-903; resolve_goto_urls non ha un prezzo a parte nella documentazione (aggiunge fino a 40 s al tempo del task)."
    - "A03 / CWE-20: gli URL restano dati esterni salvati come testo, con la lunghezza massima di oggi."

  out_of_scope:
    - "Seguire i link goto rimasti per scoprire la pagina di arrivo."
    - "Cambiare la coda di DataForSEO (priority 2)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo su richiesta dell'utente del 2026-11-14 («si facciamo queste correzioni»), dalle prove in produzione dello stesso giorno, con le scelte prese con AskUserQuestion: diagnosi del raggruppamento sui dati veri del progetto (con la fixture nel repository) e H2 proposti dalla scaletta (D-60).
- Scelte dell'agente da confermare: lotti di 100 keyword; 90 s e 180 s nella classificazione come negli articoli; soglia di AC-6502-1 (pilastro con meno della metà delle keyword e almeno 4 spoke); da 2 a 4 H2 proposti, ids NEW_n dopo gli H2 della pagina; H2 proposti solo nell'articolo e non nel piano.
- Ordine: dopo il 64; i tre task sono indipendenti tra loro. T-6504 (aggiunto il 2026-11-15, D-60 emendata) va costruito e messo in produzione prima della fixture di T-6502, che nasce dai risultati riletti con gli URL veri.
- Note di costruzione (2026-11-14, sessantottesima sessione), scelte dell'agente da confermare:
  - T-6501: `CLASSIFY_BATCH_SIZE` 100, 90 s per tentativo e 180 s per richiesta. In più `CLASSIFY_PHASE_MS` (190 s, la richiesta intera più il margine di 10 s) in `lib/modules/plan-runs/run.ts`: una fase classify che non è la prima del passo parte solo con 190 s davanti, altrimenti il passo rilascia la lease e il successivo riparte da lì, come i lavori degli articoli con REQUEST_DEADLINE_MS; senza, il secondo gruppo di un passo di 270 s partiva con circa 80 s. I due test nuovi sono rossi con il codice di prima (una richiesta con 250 keyword; la risposta dopo 60 s oltre i 45 s del tentativo).
  - T-6502, costruito in parte: `mergeTarget` in `lib/modules/strategy/serp-cluster.ts` confronta la keyword principale della pagina sotto soglia con quella di ogni spoke tenuto, con il DoD letto alla lettera: la pagina va nella pilastro solo se nessuno spoke ha almeno 1 URL in comune, anche quando la principale della pilastro ne ha di più; la regola vale anche per gli spoke oltre maxSpokesPerHub. Le domande sotto questionSpokeVolume verso le FAQ restano sull'unione degli URL (fuori dal DoD). AC-6502-2 verde, rosso con il codice di prima. **Non costruiti**: la fixture `it-magnetoterapia-real-serp.json`, la diagnosi e AC-6502-1, perché la lettura in sola SELECT dalla produzione (`supabase db query --linked`, link in una cartella dello scratchpad fuori dal repository) è stata negata dal controllo dei permessi di Claude Code: serve l'autorizzazione dell'utente nella sessione, oppure la query lanciata da lui.
  - T-6503: `MIN_PAGE_H2` 2 e `PROPOSED_H2` (da 2 a 4) in `lib/articles/lengths.ts`, `proposesH2`, `proposedBlockId` e `PROPOSED_HEADING_LENGTH` in `outline-prompt.ts`; la riga sugli H2 nuovi entra nelle istruzioni dopo quella dei blocchi, i dati inviati non cambiano. Nel controllo un heading con `<`, `>`, `*`, `_`, `#`, `[`, `]`, `|`, l'accento grave o caratteri invisibili è rifiutato (non ripulito); heading distinti per forma canonica; le immagini possono andare anche nei blocchi NEW_n.
  - Emendamento dichiarato della security note A06 di T-6503: i blocchi proposti si scrivono uno per richiesta (T-4201), quindi fino a 4 richieste in più per articolo; `estimateArticleRequests` conta i 4 H2 possibili quando la pagina ne ha meno di 2 (posto nel tetto della piattaforma all'avvio e stima nella finestra di avvio).
  - Emendamento dichiarato di AC-6301-3 e del DoD di T-6301 (modulo 63): 101 keyword in 2 richieste da 100 e da 1 (prima 301, 300 e 1), con `tests/unit/plan-classify.test.ts` aggiornato (`impacted-by: T-6501`).
  - Test toccati senza cambiare gli AC: `tests/helpers/articles.ts` (outlineReply propone NEW_1 e NEW_2 per una pagina con meno di 2 H2), `tests/integration/article-run.test.ts` (AC-4101-1, AC-6402-3) e `tests/integration/article-faq.test.ts` (AC-4202-1) con `impacted-by: T-6503`: lo spoke dei test ha un solo H2 e l'articolo ha 2 blocchi e 2 richieste in più.
- Note di costruzione di T-6504 (2026-11-15, sessantottesima sessione, seguito), scelte dell'agente da confermare:
  - La causa della pilastro piena l'ha mostrata l'esportazione in sola SELECT lanciata dall'utente: 175 keyword tenute di «Noleggio magnetoterapia», tutte con 8-10 risultati, 1655 URL su 1655 link `google.com/goto` (1654 diversi), 123 keyword senza volume. La chiamata reale a DataForSEO approvata dall'utente non è partita dall'agente (credenziali di produzione non leggibili per il controllo dei permessi di Claude Code): la fa la produzione, rigenerando il piano dopo il deploy di T-6504.
  - `resolve_goto_urls: true` con la coda priority di oggi (fuori dal task cambiare coda); i link goto rimasti si scartano invece di salvarli o di sostituirli con il solo dominio (`domain`), che darebbe URL in comune fra pagine diverse dello stesso sito. Con circa metà dei link risolti per pagina una keyword può avere meno di 10 URL: lo dirà la fixture.
  - Le righe salvate prima con i link goto si riconoscono in `readFreshSerps` (nessuna migrazione dei dati): al prossimo piano le loro keyword si richiedono, dentro i tetti di spesa.
  - Emendamento dichiarato di AC-6101-1 (modulo 61): il corpo di task_post ha anche `resolve_goto_urls` true; `tests/integration/plan-serps.test.ts` con `impacted-by: T-6504`.
