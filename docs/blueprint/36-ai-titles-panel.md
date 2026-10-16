# 36-ai-titles-panel — Macrotask `ai-titles-panel`

> Titoli con l'AI (D-42, D-33 emendata), modulo 2 di 2: la rotta che chiede la proposta per una pagina del piano, con i limiti, e il pulsante «Migliora i titoli con l'AI» nel pannello di dettaglio della pagina.

## Obiettivo del macrotask
Dopo il modulo 35 la funzione è configurabile e il cuore della proposta esiste, ma nessun utente può usarla. Dopo questo modulo:

- **Rotta della proposta**: per una pagina del piano corrente, chi può modificare il piano riceve H1 e H2 proposti dal modello, entro un limite per workspace e un tetto della piattaforma nelle ultime 24 ore; nulla si salva.
- **Pannello della pagina**: «Migliora i titoli con l'AI» mostra la proposta in una card con «Usa questi titoli» (salva con la modifica di oggi, T-1904) e «Scarta»; gli errori lasciano i titoli com'erano.

## Task atomici

```yaml
- id: T-3601
  title: "Rotta della proposta dei titoli con i limiti"
  macrotask: "ai-titles-panel"
  depends_on: [T-3502, T-1904, T-2502, T-1701, T-1502]

  objective: >
    Esporre la proposta dei titoli di una pagina con gli stessi permessi delle modifiche del piano, senza mai superare i
    limiti del piano gratuito di OpenRouter per tutta la piattaforma.

  definition_of_done:
    - "POST /api/projects/[id]/strategies/[strategyId]/pages/[pageId]/titles/suggest: utente autenticato con il permesso strategy.write sul workspace del progetto (T-1502), pagina della strategia indicata (404 altrimenti); strategia che non è il piano corrente → 409 STRATEGY_READ_ONLY (T-2502); maxDuration della rotta 30 s; nessuna scrittura su strategy_pages."
    - "Ordine dei controlli: permessi e pagina; poi funzione accesa e OPENROUTER_API_KEY presente, altrimenti 503 AI_NOT_CONFIGURED senza consumare limiti; poi il limite del workspace (regola aiTitlesWorkspace con max workspaceDailyLimit, chiave per workspace; il root admin ne è escluso) e il tetto della piattaforma (regola aiTitlesPlatform con max platformDailyLimit, chiave unica), con consumeRateLimit di T-1701 → 429 RATE_LIMITED con retryAfterSeconds; ogni richiesta che parte verso OpenRouter resta contata anche se poi fallisce."
    - "Chiamata con buildTitlesRequest, requestCompletion (timeout 20 000 ms) e parseTitlesResponse di T-3502; esiti: 200 { data: { h1, h2, model } } con header Cache-Control no-store; AI_TIMEOUT → 504; AI_UNAVAILABLE e AI_INVALID_RESPONSE → 502."
    - "Evento di log ai_titles_suggest con workspaceId, pageId, model, durationMs e outcome; mai keyword, istruzioni, risposta del modello o chiave (CWE-532)."

  acceptance_criteria:
    - id: AC-3601-1
      given: "la funzione accesa con OPENROUTER_API_KEY impostata, un MEMBER del workspace di un progetto 'Cliente-Segreto-XYZ' con il piano e uno spoke con la principale 'scarpe running donna', e un fetch simulato di OpenRouter che risponde con un JSON valido"
      when: "il MEMBER invia POST .../pages/{spoke}/titles/suggest"
      then: "la risposta è 200 con header Cache-Control no-store, h1 e h2 della risposta simulata e il model; il corpo inviato al fetch contiene 'scarpe running donna' e non 'Cliente-Segreto-XYZ'; h1, h2, h1_edited e h2_edited della pagina nel DB sono invariati; nessuna riga di log contiene 'scarpe running donna'"
    - id: AC-3601-2
      given: "workspaceDailyLimit 2, platformDailyLimit 3, due workspace W1 e W2 con un piano ciascuno e un fetch simulato che risponde 500 alla prima chiamata e con un JSON valido alle altre"
      when: "un membro di W1 chiede 3 proposte e poi un membro di W2 ne chiede 2"
      then: "le risposte di W1 sono 502, 200 e 429 RATE_LIMITED con retryAfterSeconds maggiore di 0; quelle di W2 sono 200 e 429 RATE_LIMITED; il fetch è stato chiamato 3 volte"
    - id: AC-3601-3
      given: "un piano con uno spoke e un MEMBER"
      when: "chiede la proposta senza OPENROUTER_API_KEY, poi con la chiave e la funzione spenta, poi a funzione accesa con un fetch che risponde con un h1 senza la keyword principale"
      then: "le risposte sono 503 AI_NOT_CONFIGURED, 503 AI_NOT_CONFIGURED e 502 AI_INVALID_RESPONSE; il fetch è stato chiamato 1 volta e used24h di GET /api/admin/ai-titles vale 1"
    - id: AC-3601-4
      given: "un progetto con il piano e una versione precedente, un utente fuori dal workspace e una richiesta senza sessione"
      when: "chiedono la proposta: l'utente fuori dal workspace per il piano, l'anonimo per il piano e un MEMBER per una pagina della versione precedente"
      then: "le risposte sono 404, 401 e 409 STRATEGY_READ_ONLY e il fetch non è stato chiamato"

  target_tests:
    - file: "tests/integration/ai-titles-suggest.test.ts"
      covers: [AC-3601-1, AC-3601-2, AC-3601-3, AC-3601-4]

  security_notes:
    - "A01 / CWE-639: progetto, strategia e pagina dall'indirizzo, verificati lato server con la membership del workspace (T-1502), come le modifiche del piano."
    - "A04 / CWE-770 e CWE-799: limite per workspace e tetto unico della piattaforma prima di ogni chiamata, contati con il rate limit atomico di T-1701."
    - "A09 / CWE-532: nei log solo id, modello, durata ed esito."

  out_of_scope:
    - "Proposte per tutto il piano o per più pagine insieme (D-42: una pagina alla volta)."

- id: T-3602
  title: "«Migliora i titoli con l'AI» nel pannello della pagina"
  macrotask: "ai-titles-panel"
  depends_on: [T-3601, T-2505]

  objective: >
    Mettere la proposta dell'AI dove l'utente riscrive già H1 e H2, lasciando a lui la scelta di usarla o scartarla.

  definition_of_done:
    - "La pagina del piano passa al pannello aiTitlesAvailable (funzione accesa e chiave presente); nelle versioni precedenti e senza il permesso strategy.write il pulsante non c'è."
    - "Pannello di dettaglio (T-2505): pulsante «Migliora i titoli con l'AI» sotto i campi H1 e H2; durante la richiesta «Sto scrivendo i titoli…» e il pulsante disattivato; poi la card «Proposta dell'AI» con l'H1, l'elenco degli H2, «Modello: <id>», «Usa questi titoli» e «Scarta»."
    - "«Usa questi titoli» invia PATCH .../pages/[pageId] con version, h1 e h2 della proposta (T-1904): i titoli diventano riscritti e l'etichetta «Suggerito» sparisce; un 409 STRATEGY_CONFLICT mostra il messaggio di oggi. «Scarta» chiude la card senza richieste. La proposta resta solo nello stato del pannello: chiuderlo o ricaricare la pagina la perde."
    - "Errori sotto il pulsante, titoli invariati: AI_NOT_CONFIGURED, RATE_LIMITED con l'ora in cui torna disponibile (da retryAfterSeconds), AI_TIMEOUT, AI_UNAVAILABLE e AI_INVALID_RESPONSE con i testi del catalogo; testi del pannello nei cataloghi plan.ai it ed en."
    - "E2E: il finto server locale degli E2E risponde anche a POST /chat/completions e playwright.config.ts imposta OPENROUTER_BASE_URL verso di lui e una OPENROUTER_API_KEY di prova generata a ogni esecuzione."
    - "Emendamento dichiarato alla costruzione: DoD di T-2505 (modulo 25, il pannello ha anche la proposta dell'AI)."

  acceptance_criteria:
    - id: AC-3602-1
      given: "il pannello di uno spoke del piano con aiTitlesAvailable true e un fetch che risponde alla proposta con h1 'Scarpe running donna: come sceglierle' e due H2"
      when: "l'utente clicca «Migliora i titoli con l'AI» e poi «Usa questi titoli»"
      then: "compare la card «Proposta dell'AI» con l'H1 e i due H2; parte 1 PATCH della pagina con version, h1 'Scarpe running donna: come sceglierle' e i due H2"
    - id: AC-3602-2
      given: "lo stesso pannello e la stessa proposta"
      when: "l'utente clicca «Migliora i titoli con l'AI» e poi «Scarta»"
      then: "la card sparisce, nessuna PATCH è partita e i campi H1 e H2 mostrano i titoli di prima"
    - id: AC-3602-3
      given: "il pannello con aiTitlesAvailable true e un fetch che risponde 429 RATE_LIMITED con retryAfterSeconds 3600; poi lo stesso pannello con aiTitlesAvailable false"
      when: "l'utente clicca «Migliora i titoli con l'AI»; poi si rende il pannello con aiTitlesAvailable false"
      then: "compare il messaggio del limite con l'ora in cui torna disponibile e nessuna card; con aiTitlesAvailable false il pulsante «Migliora i titoli con l'AI» non c'è"
    - id: AC-3602-4
      given: "il finto OpenRouter locale, il root admin che accende la funzione dalla card delle Impostazioni e un utente con un piano"
      when: "l'utente apre il pannello di una pagina, chiede la proposta e la usa"
      then: "l'H1 del pannello è quello della proposta, l'etichetta «Suggerito» dell'H1 non c'è più e axe riporta 0 violazioni serious o critical sul pannello con la card aperta"

  target_tests:
    - file: "tests/component/plan-ai-titles.test.tsx"
      covers: [AC-3602-1, AC-3602-2, AC-3602-3]
    - file: "tests/e2e/ai-titles.spec.ts"
      covers: [AC-3602-4]

  security_notes:
    - "XSS (CWE-79): la proposta è resa come testo da React, mai come HTML; è già ripulita da T-3502."
    - "Il salvataggio passa dalla PATCH di T-1904 con il controllo di versione: nessuna rotta nuova scrive i titoli."

  out_of_scope:
    - "Conservare le proposte, confrontarne più d'una o modificarle nella card prima di usarle (si modificano dopo, nei campi di oggi)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-16 (D-42), design approvato per sezioni.
- Gate umani: nessuno; nessuna pagina delle baseline visive (login, dashboard e risultati; il piano non è fotografato).
- Scelte dell'agente da confermare (rilievi): il root admin escluso dal limite del workspace ma non dal tetto della piattaforma; ogni richiesta partita verso OpenRouter conta anche se fallisce; testi «Migliora i titoli con l'AI», «Sto scrivendo i titoli…», «Proposta dell'AI», «Usa questi titoli» e «Scarta»; la proposta non si conserva.
