# 64-ai-reliability — Macrotask `ai-reliability`

> AI più affidabile (D-58): i difetti trovati il 2026-11-12 provando titoli e articoli in produzione. Le risposte tagliate dei modelli che ragionano si riconoscono e hanno più spazio, i modelli che hanno appena fallito passano in fondo all'elenco, e un elenco di modelli tutti spariti dal catalogo gratuito non spegne più la funzione in silenzio.

## Obiettivo del macrotask
Il 2026-11-12 i titoli con l'AI non partivano e il primo articolo è fallito. Cause verificate dai log di produzione e da prove con la stessa richiesta della scaletta:

- l'elenco della card aveva un solo modello, non più gratuito: segnato missing e saltato, nessun tentativo, errore «non disponibile» senza altro segno per l'utente (l'avviso c'era solo nella Panoramica di /admin);
- `nvidia/nemotron-3.5-super-vl:free` consuma nel ragionamento tutti i 4000 max_tokens della scaletta: finish_reason length, JSON tagliato o vuoto, contato come risposta non valida;
- `nvidia/nemotron-3-ultra-550b-a55b:free` ha superato i 45 s del tentativo (36 s nella prova locale), poi `baidu/ernie-5.5-flash-preview:free` non ha avuto il tempo che restava dei 120 s;
- non c'è un parametro unico per il ragionamento: `reasoning: { enabled: false }` va bene per super-vl (8 s, scaletta valida) ma ernie risponde 400 («Reasoning is mandatory») e ultra risponde vuoto; `reasoning: { effort: "low" }` non cambia nulla per super-vl; `reasoning: { max_tokens: 1000 }` va bene per ultra ma non per ernie.

Dopo questo modulo:

- **Risposte tagliate**: una risposta con finish_reason length è un esito a sé (truncated), registrato e seguito dal modello successivo; i modelli che ragionano hanno più token a disposizione.
- **Modelli che hanno appena fallito**: in ogni richiesta vanno in fondo all'elenco finché non rispondono di nuovo bene, così un articolo non perde 45 s a ogni blocco sullo stesso modello lento.
- **Tempi**: i lavori degli articoli danno a ogni modello il tempo che serve ai modelli gratuiti grandi.
- **Elenco vuoto**: se tutti i modelli dell'elenco non sono più gratuiti, la richiesta usa i modelli predefiniti ancora gratuiti; se non ce n'è nessuno, l'errore dice chiaramente che l'elenco va aggiornato.

## Task atomici

```yaml
- id: T-6401
  title: "Risposte tagliate dei modelli che ragionano"
  macrotask: "ai-reliability"
  depends_on: [T-3802, T-3803, T-4102]

  objective: >
    Non perdere un modello valido perché il suo ragionamento ha consumato tutto lo spazio della risposta.

  definition_of_done:
    - "lib/ai/openrouter.ts: una risposta 200 con finish_reason length è l'esito truncated (nuovo AttemptOutcome, nella riga di ai_requests e nel log come gli altri esiti): si passa al modello successivo come per invalid_response, senza analizzare il testo."
    - "lib/ai/catalog.ts: il catalogo salva per ogni modello gratuito se supported_parameters di OpenRouter contiene reasoning; le richieste (titoli, scaletta, blocchi, FAQ, classificazione del piano) a un modello che ragiona hanno max_tokens aumentato di REASONING_TOKEN_ALLOWANCE (8000, scelta dell'agente da verificare alla costruzione sui modelli gratuiti dell'elenco); per gli altri modelli max_tokens non cambia. Nessun parametro reasoning nel corpo (verificato il 2026-11-12: nessun valore va bene per tutti i modelli)."
    - "docs/AI-TITLES.md: le prove del 2026-11-12 sul parametro reasoning (enabled false, effort low, max_tokens) con l'esito per modello, e la regola scelta."

  acceptance_criteria:
    - id: AC-6401-1
      given: "l'elenco [A, B] e fetch simulato: A risponde 200 con finish_reason length e un JSON tagliato, B risponde con una proposta valida"
      when: "si chiede una proposta di titoli"
      then: "la proposta è quella di B; ai_requests ha una riga di A con outcome truncated e una di B con outcome ok"
    - id: AC-6401-2
      given: "un catalogo salvato in cui A ha reasoning fra i parametri supportati e B no"
      when: "si chiede la scaletta di un articolo ad A e poi a B"
      then: "il corpo verso A ha max_tokens 12000 (4000 della scaletta più 8000) e quello verso B ha max_tokens 4000; nessuno dei due corpi ha il campo reasoning"

  target_tests:
    - file: "tests/integration/ai-fallback.test.ts"
      covers: [AC-6401-1]
    - file: "tests/integration/ai-catalog.test.ts"
      covers: [AC-6401-2]

  security_notes:
    - "A09 / CWE-532: l'esito truncated si registra come gli altri, senza testo del modello nei log."
    - "A06 / CWE-770: più token non cambiano il numero di richieste né i tetti del registro (T-3901)."

  out_of_scope:
    - "Scegliere il parametro reasoning modello per modello."

- id: T-6402
  title: "Modelli che hanno appena fallito in fondo all'elenco e tempi degli articoli"
  macrotask: "ai-reliability"
  depends_on: [T-6401, T-3901, T-4101]

  objective: >
    Non ripetere a ogni richiesta l'attesa su un modello che è lento o rotto in questo momento, e dare ai modelli
    gratuiti grandi il tempo per scrivere un articolo.

  definition_of_done:
    - "lib/ai/requests.ts: recentModelFailures(models, now) legge da ai_requests gli ultimi tentativi dei 30 minuti precedenti; un modello con almeno 2 tentativi non riusciti (timeout, truncated, invalid_response, provider_busy, unavailable) e nessun ok dopo l'ultimo errore è «in pausa». requestWithFallback prova prima i modelli non in pausa nell'ordine dell'elenco e poi quelli in pausa nello stesso ordine; l'elenco salvato non cambia."
    - "lib/articles/run-context.ts: tempo per tentativo dei lavori degli articoli 90 s e scadenza della richiesta 180 s (scelte dell'agente), con STEP_BUDGET_MS e la maxDuration della rotta interna rivisti perché un passo contenga sempre una richiesta intera; i titoli restano dentro i 30 s della loro rotta."

  acceptance_criteria:
    - id: AC-6402-1
      given: "l'elenco [A, B] e in ai_requests due tentativi di A con outcome timeout negli ultimi 10 minuti e nessun ok di A dopo"
      when: "si chiede una proposta di titoli e B risponde con una proposta valida"
      then: "fetch è chiamato prima con il modello B; A non è chiamato"
    - id: AC-6402-2
      given: "l'elenco [A, B], due timeout di A 40 minuti fa e nessun altro tentativo"
      when: "si chiede una proposta di titoli"
      then: "fetch è chiamato prima con il modello A"
    - id: AC-6402-3
      given: "un lavoro di articolo con fetch simulato che risponde alla scaletta dopo 60 s con una scaletta valida (timer finti)"
      when: "avanza il lavoro"
      then: "la scaletta è salvata e ai_requests ha un solo tentativo, con outcome ok"

  target_tests:
    - file: "tests/integration/ai-fallback.test.ts"
      covers: [AC-6402-1, AC-6402-2]
    - file: "tests/integration/article-run.test.ts"
      covers: [AC-6402-3]

  security_notes:
    - "A01 / CWE-639: la lettura di ai_requests usa solo modello, esito e orario, senza dati dei workspace."

  out_of_scope:
    - "Cambiare da soli l'ordine dell'elenco salvato nella card."

- id: T-6403
  title: "Elenco con tutti i modelli spariti dal catalogo gratuito"
  macrotask: "ai-reliability"
  depends_on: [T-6401, T-3803, T-3902]

  objective: >
    Evitare che titoli e articoli si fermino in silenzio quando OpenRouter toglie dal gratuito tutti i modelli scelti.

  definition_of_done:
    - "lib/ai/settings.ts: modelsForRequest(settings, catalog) restituisce i modelli dell'elenco non missing; se sono tutti missing restituisce i modelli di DEFAULT_AI_MODELS presenti nel catalogo gratuito, nell'ordine, e scrive nel log ai_models_fallback con il numero di modelli; con il catalogo mai letto (unknown) l'elenco resta com'è. DEFAULT_AI_MODELS aggiornato alla costruzione con i modelli gratuiti che rispondono bene in quel momento (prova con la scaletta)."
    - "Senza nessun modello utilizzabile (elenco e predefiniti tutti missing) l'errore è 503 AI_NO_MODELS, con il testo «Nessun modello AI gratuito disponibile: l'elenco dei modelli va aggiornato» per tutti e, per il root admin, il link alla card dei titoli con l'AI; testi nei cataloghi it, en, es-ES ed es-419. Gli articoli falliscono con lo stesso codice."
    - "Card dei titoli con l'AI: con tutti i modelli dell'elenco missing un avviso rosso sopra l'elenco dice che si stanno usando i modelli predefiniti o che non ce n'è nessuno."

  acceptance_criteria:
    - id: AC-6403-1
      given: "l'elenco [X] con X assente dal catalogo salvato e DEFAULT_AI_MODELS con [P, Q] di cui solo Q nel catalogo"
      when: "si chiede una proposta di titoli e Q risponde con una proposta valida"
      then: "la proposta è salvata con model Q e fetch non è mai chiamato con X o P"
    - id: AC-6403-2
      given: "l'elenco [X] e nessun modello di DEFAULT_AI_MODELS nel catalogo salvato"
      when: "un MEMBER chiede una proposta di titoli"
      then: "la risposta è 503 con code AI_NO_MODELS e fetch non è chiamato"
    - id: AC-6403-3
      given: "la card dei titoli con l'AI resa per il root admin con l'elenco [X] e X missing"
      when: "la card è aperta"
      then: "sopra l'elenco c'è l'avviso dei modelli predefiniti in uso"

  target_tests:
    - file: "tests/integration/ai-models-settings.test.ts"
      covers: [AC-6403-1, AC-6403-2]
    - file: "tests/component/admin-ai-titles-card.test.tsx"
      covers: [AC-6403-3]

  security_notes:
    - "A05: i modelli predefiniti sono solo modelli gratuiti (FREE_MODEL_ID); nessun modello a pagamento entra mai da solo."
    - "A09 / CWE-532: nel log del ripiego solo il numero di modelli."

  out_of_scope:
    - "Cambiare da soli l'elenco salvato nella card."
    - "Email all'amministratore (D-11: email non attive)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo su richiesta dell'utente del 2026-11-13 («metti i difetti ai in un quarto modulo»), dai difetti verificati il 2026-11-12 in produzione e con prove locali della scaletta (D-58).
- Scelte dell'agente: esito truncated al posto di invalid_response; 8000 token in più per i modelli che ragionano invece del parametro reasoning; pausa di un modello dopo 2 errori senza successo nei 30 minuti; 90 s per tentativo e 180 s per richiesta negli articoli; ripiego sui modelli predefiniti senza toccare l'elenco salvato; codice nuovo AI_NO_MODELS.
- Ordine: indipendente dai moduli 61-63 (usa il registro di T-3901 e il motore degli articoli); se costruito dopo il 63, anche la classificazione del piano (T-6301) usa le regole nuove.
