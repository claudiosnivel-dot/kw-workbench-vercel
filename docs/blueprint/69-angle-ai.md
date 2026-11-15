# 69-angle-ai — Macrotask `angle-ai`

> Per ogni angolo da valutare l'AI suggerisce cosa farne, con il motivo, e l'utente decide (D-62).

## Obiettivo del macrotask
Richiesta dell'utente del 2026-11-15: «vorrei anche che un AI mi suggerisca cosa fare». Il motore per risultati di Google sa che un angolo ha risultati suoi, ma non sa che «spalla» va con «ginocchio» o che «iva» va con «detraibile»: è un ragionamento sul significato. Questo modulo aggiunge al lavoro di piano una richiesta all'AI con gli angoli e le pagine del piano e mostra il consiglio nel pannello delle bozze approvate (schermata 2: «Consiglio dell'AI: fanne una pagina propria», il motivo e un'alternativa; schermata 3: H1 proposto dall'AI). Il consiglio è solo un suggerimento: nessuna azione parte da sola.

## Task atomici

```yaml
- id: T-6901
  title: "Consiglio dell'AI sugli angoli nel lavoro di piano"
  macrotask: "angle-ai"
  depends_on: [T-6702, T-6801, T-6301, T-6501, T-3802, T-3901, T-6401, T-6402]

  objective: >
    Chiedere all'AI, dopo il salvataggio del piano, un consiglio per ogni angolo (farne una pagina, spostarlo in una pagina
    del piano o tenerlo come H2) e salvarlo con l'angolo, senza fermare il piano se l'AI non risponde.

  definition_of_done:
    - "lib/modules/plan-ai/angle-advice.ts: istruzioni in it, es (variante del paese) ed en come in classify.ts; la richiesta contiene le pagine del piano (keyword principale, H1, tipo, hub) e gli angoli con la pagina in cui sono, al massimo 40 angoli per richiesta, con le keyword e i titoli come dati delimitati e non come istruzioni. La risposta è un oggetto JSON per angolo: action page, move o keep; target (keyword principale di una pagina del piano: l'hub per page, la pagina di destinazione per move); reason di al massimo 240 caratteri; alternative facoltativa di al massimo 240 caratteri; h1 facoltativo di al massimo 120 caratteri per page. Voci con un angolo o un target che non esistono, azioni sconosciute o testi oltre i limiti si scartano."
    - "lib/modules/plan-runs: fase advise dopo save (PLAN_RUN_PHASES; la colonna phase è testo, nessuna migrazione per la fase): save salva la strategia con strategy_id e passa ad advise; advise manda gli angoli della strategia salvata in lotti da 40 con 90 s per tentativo e 180 s per richiesta (come la classificazione, T-6501), salva i consigli e chiude il lavoro a completed. Senza angoli, con la funzione AI spenta, senza modelli, oltre il tetto della piattaforma per chi non è root admin o con l'AI che non risponde, il lavoro si chiude a completed senza consigli e senza cambiare grouping_notice; anche un errore nella fase advise chiude il lavoro a completed senza consigli, mai a failed, perché la strategia è già salvata. components/plan/plan-run-progress.tsx mostra la fase con «Consigli sugli angoli» nei cataloghi it, en, es-ES."
    - "Migrazione additiva 0058_strategy_keyword_angle_advice: colonna strategy_keywords.angle_advice jsonb null; schema Prisma aggiornato. Il consiglio salva action, target come forma canonica della keyword principale, reason, alternative e h1."
    - "Una riga di ai_requests per tentativo con la funzione plan (T-3901, migrazione 0055) e i modelli della card con i ripieghi di oggi (T-3802, T-6401, T-6402)."
    - "GET della strategia espone angleAdvice per le keyword con angle true: action, l'id della pagina con quella keyword principale (null se non esiste più), reason, alternative, h1. create_page, move_keywords e keep_angle tolgono il consiglio insieme ad angle."
    - "docs/AI-TITLES.md: sezione sul consiglio degli angoli (cosa parte verso il modello, limiti, tempi, cosa succede quando l'AI non risponde)."

  acceptance_criteria:
    - id: AC-6901-1
      given: "una risposta del modello con un consiglio valido per l'angolo A (page, target la pilastro, reason, h1), uno per un angolo che non esiste e uno con action sconosciuta"
      when: "si legge la risposta con parseAngleAdvice"
      then: "restituisce il solo consiglio di A con action page, il target, reason e h1"
    - id: AC-6901-2
      given: "un progetto con risultati di Google, OpenRouter simulato che risponde alla classificazione e al consiglio, e un piano che ha due angoli"
      when: "si avvia il lavoro di piano e arriva in fondo"
      then: "il lavoro è completed; le due righe degli angoli hanno angle_advice con action e reason; c'è una riga di ai_requests con funzione plan per la richiesta del consiglio; GET della strategia restituisce angleAdvice con l'id della pagina target"
    - id: AC-6901-3
      given: "lo stesso progetto con OpenRouter che risponde alla classificazione e poi 503 a ogni modello per il consiglio"
      when: "si avvia il lavoro di piano e arriva in fondo"
      then: "il lavoro è completed con la strategia salvata; gli angoli hanno angle true e angle_advice null; grouping_notice è null"

  target_tests:
    - file: "tests/unit/plan-angle-advice.test.ts"
      covers: [AC-6901-1]
    - file: "tests/integration/plan-angle-advice.test.ts"
      covers: [AC-6901-2, AC-6901-3]

  security_notes:
    - "LLM01 (prompt injection): keyword e titoli vengono dall'autocomplete e dall'utente; nella richiesta sono dati delimitati, la risposta è JSON validato con zod e un target vale solo se è una pagina del piano."
    - "A04 / CWE-770: al massimo 40 angoli per richiesta, tempi limitati, tetto della piattaforma e registro ai_requests (T-3901); nessuna azione sul piano parte dalla risposta."
    - "A03 / CWE-79: reason, alternative e h1 salvati come testo semplice e resi come testo."

  out_of_scope:
    - "Consiglio sulle città (le sceglie l'utente, modulo 70)."
    - "Applicare il consiglio da solo: decide sempre l'utente."
    - "Chiedere il consiglio di nuovo su un solo angolo dal pannello: arriva con il piano e con «Rigenera»."

- id: T-6902
  title: "Il consiglio dell'AI nel pannello e nel foglio «Nuova pagina»"
  macrotask: "angle-ai"
  depends_on: [T-6802, T-6901]

  objective: >
    Mostrare il consiglio dove l'utente decide e preparare l'azione suggerita, senza farla partire da sola.

  definition_of_done:
    - "components/plan/page-panel.tsx: nel riquadro di un angolo con consiglio, «Consiglio dell'AI» con l'azione in parole («fanne una pagina propria», «spostala in «…»», «tienila qui come H2»), il motivo e, se c'è, «In alternativa: …»; le altre keyword angolo della pagina mostrano una riga breve con l'azione consigliata. Senza consiglio il riquadro resta quello di T-6802."
    - "Con il consiglio page, il foglio «Nuova pagina» si apre con l'hub e l'H1 del consiglio («Proposto dall'AI · puoi cambiarlo»); con move, «Sposta in…» si apre con la pagina del consiglio preselezionata. Le azioni partono solo quando l'utente conferma."
    - "Testi nei cataloghi it, en, es-ES (es-419 solo se diverso)."

  acceptance_criteria:
    - id: AC-6902-1
      given: "il pannello della pilastro con l'angolo K che ha il consiglio page con target la pilastro, reason e h1 «Magnetoterapia alla spalla»"
      when: "si apre il pannello e si preme «Fanne una pagina»"
      then: "il riquadro mostra «Consiglio dell'AI» con il motivo; il foglio ha preselezionata la pilastro e l'H1 «Magnetoterapia alla spalla» con «Proposto dall'AI»; nessuna operazione è partita"
    - id: AC-6902-2
      given: "l'angolo J con il consiglio move verso la pagina D"
      when: "si preme «Sposta in…»"
      then: "il dialogo ha preselezionata la pagina D; premendo «Sposta» parte move_keywords con keywordIds [J] e targetPageId l'id di D"

  target_tests:
    - file: "tests/component/plan-angles.test.tsx"
      covers: [AC-6902-1, AC-6902-2]

  security_notes:
    - "A03 / CWE-79: testi dell'AI resi come testo da React."

  out_of_scope:
    - "Mostrare il consiglio nelle versioni precedenti del piano oltre la sola lettura di oggi."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla conversazione del 2026-11-15 (D-62): «vorrei anche che un AI mi suggerisca cosa fare»; bozze approvate («per ora va bene»: consiglio e alternativa nella schermata 2, H1 proposto nella schermata 3).
- Scelte dell'agente da confermare: il consiglio arriva con il piano (fase advise dopo save, il lavoro resta in corso fino al consiglio) e non su richiesta dal pannello; 40 angoli per richiesta; target salvato come keyword principale, così resta valido dopo le modifiche al piano finché la pagina esiste; nessun nuovo motivo in grouping_notice quando il consiglio manca; funzione plan in ai_requests senza una funzione nuova; migrazione `0058`.
- Ordine: dopo il 68; T-6902 dopo T-6901.
- Note di costruzione (2026-11-15, scelte dell'agente da confermare). T-6901: `lib/modules/plan-ai/angle-advice.ts` (`buildAngleAdviceRequest`, `parseAngleAdvice`, `adviseAngles`) con il corpo della richiesta in comune con la classificazione (`planRequest` in `classify.ts`, così il codice non si duplica); nella richiesta keyword e H1 come testo, nella risposta chiavi e target si confrontano per forma canonica (maiuscole e accenti diversi valgono). Per keep il target è la pagina dell'angolo anche se il modello lo omette; per page un target che non è un hub si scarta (non si risale all'hub di uno spoke); move nella pagina dell'angolo si scarta; un motivo vuoto si scarta; motivo, alternativa e H1 ripuliti come i titoli (`cleanTitle`); una risposta senza voci valide è `invalid_response` e passa al modello successivo; `max_tokens` 8000. La fase advise c'è solo se il piano salvato ha angoli: senza angoli save chiude il lavoro a completed come prima, senza un passo in più. Angoli in ordine fisso (volume decrescente, poi forma canonica) con l'offset nel cursore `advise`; consigli e cursore nella stessa transazione con la lease; un lotto senza risposta valida chiude il lavoro senza i lotti successivi. `failPlanRun` chiude a completed, senza error_code, un lavoro attivo che ha già strategy_id, così né il cron dei lavori fermi né JOB_MAX_ATTEMPTS lo portano a failed. Margine di 190 s anche prima di advise; `classifyAi` rinominato `planAi`. `StrategyKeywordView.angleAdvice` facoltativo (le fixture dei test di componente restano com'erano), esposto anche nelle versioni precedenti, dove il pannello in sola lettura non mostra i riquadri. AC-6901-1…3 rossi senza le fasi (verificato); in più lotti da 40 e 5 con 45 angoli, funzione AI spenta a lavoro in corso, `failPlanRun` nella fase advise, e in `strategy-operations` create_page, move_keywords e keep_angle che tolgono il consiglio. T-6902: consiglio per intero nel primo angolo della pagina che ne ha uno e riga breve «AI: …» negli altri, con i riquadri e i pulsanti di T-6802 invariati; la pagina di move si nomina con l'etichetta numerata delle destinazioni («3. H1»), e con la pagina che non c'è più «spostala in un'altra pagina» senza preselezione; il foglio parte dall'hub del consiglio se è ancora una pagina principale, altrimenti da quello di oggi, e dall'H1 proposto con «Proposto dall'AI · puoi cambiarlo» finché il testo resta quello, poi torna il suggerimento di sempre; `PickDialog` con `defaultId` facoltativo. Blocco del consiglio con i colori neutri della proposta dei titoli (`plan-angle-advice`), icona decorativa nascosta ai lettori di schermo; es-419 senza differenze. AC-6902-1 e AC-6902-2 rossi senza le modifiche dei componenti (verificato).
