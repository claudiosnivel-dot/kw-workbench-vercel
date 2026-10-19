# 36-ai-titles-panel — Macrotask `ai-titles-panel`

> Titoli con l'AI (D-42 emendata da D-43, D-33 emendata), modulo 2 di 2: la rotta che chiede la proposta per una pagina del piano, con i limiti, l'ultima proposta conservata nella pagina e il pulsante «Migliora i titoli con l'AI» nel pannello di dettaglio della pagina.

## Obiettivo del macrotask
Dopo il modulo 35 la funzione è configurabile e il cuore della proposta esiste, ma nessun utente può usarla. Dopo questo modulo:

- **Rotta della proposta**: per una pagina del piano corrente, chi può modificare il piano riceve H1 e H2 proposti dal modello, entro un limite per workspace e un tetto della piattaforma nelle ultime 24 ore (il root admin è escluso da entrambi, D-43); H2 oltre il massimo della pagina tenuti nei primi (D-43).
- **Proposta conservata** (D-43): l'ultima proposta riuscita di ogni pagina resta salvata finché non si usa o si scarta, anche chiudendo il pannello o ricaricando la pagina; H1 e H2 della pagina cambiano solo con «Usa questi titoli».
- **Pannello della pagina**: «Migliora i titoli con l'AI» mostra la proposta in una card con «Usa questi titoli» (salva con la modifica di oggi, T-1904) e «Scarta»; la card c'è anche riaprendo il pannello; gli errori lasciano i titoli e la proposta salvata com'erano.

## Task atomici

```yaml
- id: T-3601
  title: "Rotta della proposta dei titoli con i limiti"
  macrotask: "ai-titles-panel"
  depends_on: [T-3502, T-1904, T-2502, T-1701, T-1502]

  objective: >
    Esporre la proposta dei titoli di una pagina con gli stessi permessi delle modifiche del piano, senza mai superare i
    limiti scelti per gli utenti, e conservare l'ultima proposta riuscita nella pagina.

  definition_of_done:
    - "POST /api/projects/[id]/strategies/[strategyId]/pages/[pageId]/titles/suggest: utente autenticato con il permesso strategy.write sul workspace del progetto (T-1502), pagina della strategia indicata (404 altrimenti); strategia che non è il piano corrente → 409 STRATEGY_READ_ONLY (T-2502); maxDuration della rotta 30 s; h1, h2, h1_edited, h2_edited della pagina e version della strategia non cambiano (emendato da D-43 il 2026-10-17; prima: nessuna scrittura su strategy_pages)."
    - "Ordine dei controlli: permessi e pagina; poi funzione accesa e OPENROUTER_API_KEY presente, altrimenti 503 AI_NOT_CONFIGURED senza consumare limiti; poi il limite del workspace (regola aiTitlesWorkspace con max workspaceDailyLimit, chiave per workspace) e il tetto della piattaforma (regola aiTitlesPlatform con max platformDailyLimit, AI_TITLES_PLATFORM_KEY di T-3501), con consumeRateLimit di T-1701 → 429 RATE_LIMITED con retryAfterSeconds; ogni richiesta che parte verso OpenRouter resta contata anche se poi fallisce. Il root admin è escluso da entrambi: le sue richieste non consumano i limiti e non entrano in used24h (emendato da D-43 il 2026-10-17; prima era escluso solo dal limite del workspace)."
    - "Chiamata con buildTitlesRequest, requestCompletion (timeout 20 000 ms) e parseTitlesResponse di T-3502; esiti: 200 { data: { h1, h2, model, createdAt } } con header Cache-Control no-store; AI_TIMEOUT → 504; AI_UNAVAILABLE e AI_INVALID_RESPONSE → 502 (emendato da T-3802 il 2026-10-19, D-46: requestWithFallback al posto di requestCompletion, esiti AI_BUSY 503, AI_DAILY_LIMIT 429 e AI_UNAVAILABLE 502; la proposta ha anche droppedH2)."
    - "Proposta conservata (D-43): migrazione additiva 0045_page_ai_proposal con strategy_pages.ai_proposal jsonb nullable ({ h1, h2, model, createdAt }), RLS della tabella invariata; la risposta 200 salva la proposta nella pagina al posto della precedente, con un where che contiene pagina, strategia e progetto; gli errori lasciano la proposta salvata com'era."
    - "Emendamento dichiarato di T-3502 (modulo 35, D-43): oltre il massimo della pagina parseTitlesResponse tiene i primi H2 nell'ordine della risposta, dopo aver tolto vuoti e doppioni, invece di scartarla; AC-3502-3 perde il caso dei 13 H2 diversi (tests/unit/ai-titles.test.ts aggiornato), che diventa AC-3601-6 sulla rotta. docs/AI-TITLES.md aggiornato (root admin fuori dai limiti, proposta conservata, H2 in eccesso tagliati)."
    - "Evento di log ai_titles_suggest con workspaceId, pageId, model, durationMs e outcome; mai keyword, istruzioni, risposta del modello o chiave (CWE-532). (emendato da T-3802 il 2026-10-19, D-46: anche attempts con modello, esito e status HTTP di ogni tentativo.)"

  acceptance_criteria:
    - id: AC-3601-1
      given: "la funzione accesa con OPENROUTER_API_KEY impostata, un MEMBER del workspace di un progetto 'Cliente-Segreto-XYZ' con il piano e uno spoke con la principale 'scarpe running donna', e un fetch simulato di OpenRouter che risponde con un JSON valido"
      when: "il MEMBER invia POST .../pages/{spoke}/titles/suggest"
      then: "la risposta è 200 con header Cache-Control no-store, h1 e h2 della risposta simulata e il model; il corpo inviato al fetch contiene 'scarpe running donna' e non 'Cliente-Segreto-XYZ'; h1, h2, h1_edited e h2_edited della pagina e la version della strategia nel DB sono invariati e ai_proposal della pagina ha h1, h2 e model della risposta; nessuna riga di log contiene 'scarpe running donna'"
    - id: AC-3601-2
      given: "workspaceDailyLimit 2, platformDailyLimit 3, due workspace W1 e W2 con un piano ciascuno e un fetch simulato che risponde 500 alla prima chiamata e con un JSON valido alle altre"
      when: "un membro di W1 chiede 3 proposte e poi un membro di W2 ne chiede 2"
      then: "le risposte di W1 sono 502, 200 e 429 RATE_LIMITED con retryAfterSeconds maggiore di 0; quelle di W2 sono 200 e 429 RATE_LIMITED; il fetch è stato chiamato 3 volte"
    - id: AC-3601-3
      given: "un piano con uno spoke e un MEMBER"
      when: "chiede la proposta senza OPENROUTER_API_KEY, poi con la chiave e la funzione spenta, poi a funzione accesa con un fetch che risponde con un h1 senza la keyword principale"
      then: "le risposte sono 503 AI_NOT_CONFIGURED, 503 AI_NOT_CONFIGURED e 502 AI_UNAVAILABLE (emendato da T-3802 il 2026-10-19, D-46: con i modelli di riserva una risposta non valida passa al modello successivo e, finito l'elenco di un solo modello senza risposte valide, la rotta risponde AI_UNAVAILABLE); il fetch è stato chiamato 1 volta e used24h di GET /api/admin/ai-titles vale 1"
    - id: AC-3601-4
      given: "un progetto con il piano e una versione precedente, un utente fuori dal workspace e una richiesta senza sessione"
      when: "chiedono la proposta: l'utente fuori dal workspace per il piano, l'anonimo per il piano e un MEMBER per una pagina della versione precedente"
      then: "le risposte sono 404, 401 e 409 STRATEGY_READ_ONLY e il fetch non è stato chiamato"
    - id: AC-3601-5
      given: "workspaceDailyLimit 1 e platformDailyLimit 1, il root admin con un piano nel suo workspace, un MEMBER con un piano in un altro workspace e un fetch simulato che risponde con un JSON valido"
      when: "il root admin chiede 3 proposte, poi il MEMBER ne chiede 2"
      then: "le risposte del root admin sono 200, 200 e 200; quelle del MEMBER 200 e 429 RATE_LIMITED; used24h di GET /api/admin/ai-titles vale 1"
    - id: AC-3601-6
      given: "un MEMBER con il piano, uno spoke con la principale 'scarpe running donna' e un fetch simulato che risponde con un h1 che contiene la principale e 13 H2 diversi"
      when: "il MEMBER chiede la proposta per lo spoke"
      then: "la risposta è 200 con i primi 12 H2 nell'ordine della risposta simulata"

  target_tests:
    - file: "tests/integration/ai-titles-suggest.test.ts"
      covers: [AC-3601-1, AC-3601-2, AC-3601-3, AC-3601-4, AC-3601-5, AC-3601-6]

  security_notes:
    - "A01 / CWE-639: progetto, strategia e pagina dall'indirizzo, verificati lato server con la membership del workspace (T-1502), come le modifiche del piano."
    - "A04 / CWE-770 e CWE-799: limite per workspace e tetto unico della piattaforma prima di ogni chiamata, contati con il rate limit atomico di T-1701."
    - "A09 / CWE-532: nei log solo id, modello, durata ed esito."
    - "Costi (D-43): il root admin fuori dai limiti può esaurire da solo le richieste giornaliere dell'account gratuito di OpenRouter; gli altri ricevono allora AI_UNAVAILABLE fino al giorno dopo."

  out_of_scope:
    - "Proposte per tutto il piano o per più pagine insieme (D-42: una pagina alla volta)."

- id: T-3602
  title: "Proposta conservata: lettura e scarto"
  macrotask: "ai-titles-panel"
  depends_on: [T-3601, T-1903, T-2502]

  objective: >
    Tenere l'ultima proposta di ogni pagina finché l'utente non la usa o la scarta (D-43), senza toccare i titoli della
    pagina né la versione del piano.

  definition_of_done:
    - "DELETE /api/projects/[id]/strategies/[strategyId]/pages/[pageId]/titles/suggest: stessi permessi e controlli della POST di T-3601 (strategy.write sul workspace, pagina della strategia, 409 STRATEGY_READ_ONLY per una versione precedente); porta ai_proposal a null e risponde 204, anche senza proposta salvata; nessun'altra colonna e nessuna version cambiano."
    - "Vista del piano (GET /api/projects/[id]/strategies/[strategyId], T-1903, e la pagina del piano): ogni pagina porta aiProposal ({ h1, h2, model, createdAt } o null), solo per il piano corrente; nelle versioni precedenti vale sempre null."
    - "«Rigenera» (T-2502) crea pagine nuove senza proposta; le proposte delle versioni precedenti restano nelle loro righe e non si mostrano; eliminare il piano o la pagina le toglie con la riga."

  acceptance_criteria:
    - id: AC-3602-1
      given: "un MEMBER con il piano, uno spoke e un fetch simulato di OpenRouter che risponde con un JSON valido"
      when: "chiede la proposta per lo spoke, legge il piano, invia DELETE .../titles/suggest e rilegge il piano"
      then: "la prima lettura ha aiProposal dello spoke con h1, h2 e model della proposta; il DELETE risponde 204; la seconda lettura ha aiProposal null e la stessa version della prima"
    - id: AC-3602-2
      given: "uno spoke con una proposta salvata e un fetch simulato che risponde 500 e poi con un altro JSON valido"
      when: "il MEMBER chiede due proposte per lo spoke"
      then: "la prima risposta è 502 e ai_proposal resta quella salvata; la seconda è 200 e ai_proposal ha l'h1 della nuova risposta"
    - id: AC-3602-3
      given: "uno spoke del piano con una proposta salvata, una pagina con proposta in una versione precedente, un utente fuori dal workspace e una richiesta senza sessione"
      when: "inviano DELETE .../titles/suggest: l'utente fuori dal workspace e l'anonimo per lo spoke del piano, un MEMBER per la pagina della versione precedente"
      then: "le risposte sono 404, 401 e 409 STRATEGY_READ_ONLY e le due proposte salvate restano"

  target_tests:
    - file: "tests/integration/ai-titles-proposal.test.ts"
      covers: [AC-3602-1, AC-3602-2, AC-3602-3]

  security_notes:
    - "A01 / CWE-639: progetto, strategia e pagina dall'indirizzo, verificati con la membership del workspace come nella POST."
    - "La proposta salvata contiene solo testo già ripulito da T-3502 e il modello; nessun dato del progetto in più."

  out_of_scope:
    - "Più proposte per pagina o la cronologia delle proposte."

- id: T-3603
  title: "«Migliora i titoli con l'AI» nel pannello della pagina"
  macrotask: "ai-titles-panel"
  depends_on: [T-3602, T-2505]

  objective: >
    Mettere la proposta dell'AI dove l'utente riscrive già H1 e H2, lasciando a lui la scelta di usarla o scartarla.

  definition_of_done:
    - "La pagina del piano passa al pannello aiTitlesAvailable (funzione accesa e chiave presente); nelle versioni precedenti e senza il permesso strategy.write il pulsante non c'è."
    - "Pannello di dettaglio (T-2505): pulsante «Migliora i titoli con l'AI» sotto i campi H1 e H2; durante la richiesta «Sto scrivendo i titoli…» e il pulsante disattivato; poi la card «Proposta dell'AI» con l'H1, l'elenco degli H2, «Modello: <id>», «Usa questi titoli» e «Scarta». Se la pagina ha già aiProposal (T-3602) la card compare all'apertura del pannello, senza richieste; una nuova proposta la sostituisce."
    - "«Usa questi titoli» invia PATCH .../pages/[pageId] con version, h1 e h2 della proposta (T-1904) e poi DELETE .../titles/suggest (T-3602): i titoli diventano riscritti, l'etichetta «Suggerito» sparisce e la card si chiude; un 409 STRATEGY_CONFLICT mostra il messaggio di oggi e la card resta. «Scarta» invia DELETE .../titles/suggest e chiude la card; se il DELETE fallisce la card resta con l'errore (emendato da D-43 il 2026-10-17; prima la proposta restava solo nello stato del pannello)."
    - "Errori sotto il pulsante, titoli invariati: AI_NOT_CONFIGURED, RATE_LIMITED con l'ora in cui torna disponibile (da retryAfterSeconds), AI_TIMEOUT, AI_UNAVAILABLE e AI_INVALID_RESPONSE con i testi del catalogo; testi del pannello nei cataloghi plan.ai it ed en."
    - "E2E: il finto server locale degli E2E risponde anche a POST /chat/completions e playwright.config.ts imposta OPENROUTER_BASE_URL verso di lui e una OPENROUTER_API_KEY di prova generata a ogni esecuzione."
    - "Emendamento dichiarato alla costruzione: DoD di T-2505 (modulo 25, il pannello ha anche la proposta dell'AI)."

  acceptance_criteria:
    - id: AC-3603-1
      given: "il pannello di uno spoke del piano con aiTitlesAvailable true e un fetch che risponde alla proposta con h1 'Scarpe running donna: come sceglierle' e due H2"
      when: "l'utente clicca «Migliora i titoli con l'AI» e poi «Usa questi titoli»"
      then: "compare la card «Proposta dell'AI» con l'H1 e i due H2; parte 1 PATCH della pagina con version, h1 'Scarpe running donna: come sceglierle' e i due H2, poi 1 DELETE .../titles/suggest, e la card sparisce"
    - id: AC-3603-2
      given: "lo stesso pannello e la stessa proposta"
      when: "l'utente clicca «Migliora i titoli con l'AI» e poi «Scarta»"
      then: "parte 1 DELETE .../titles/suggest e nessuna PATCH, la card sparisce e i campi H1 e H2 mostrano i titoli di prima"
    - id: AC-3603-3
      given: "il pannello con aiTitlesAvailable true e un fetch che risponde 429 RATE_LIMITED con retryAfterSeconds 3600; poi lo stesso pannello con aiTitlesAvailable false"
      when: "l'utente clicca «Migliora i titoli con l'AI»; poi si rende il pannello con aiTitlesAvailable false"
      then: "compare il messaggio del limite con l'ora in cui torna disponibile e nessuna card; con aiTitlesAvailable false il pulsante «Migliora i titoli con l'AI» non c'è"
    - id: AC-3603-4
      given: "il pannello di uno spoke con aiTitlesAvailable true e aiProposal salvata con h1 'Scarpe running donna: guida' e un H2"
      when: "il pannello si apre"
      then: "la card «Proposta dell'AI» mostra 'Scarpe running donna: guida' e l'H2 senza che parta alcuna richiesta"
    - id: AC-3603-5
      given: "il finto OpenRouter locale, il root admin che accende la funzione dalla card delle Impostazioni e un utente con un piano"
      when: "l'utente apre il pannello di una pagina, chiede la proposta, chiude e riapre il pannello e usa la proposta"
      then: "riaprendo il pannello la card c'è ancora; dopo l'uso l'H1 del pannello è quello della proposta, l'etichetta «Suggerito» dell'H1 non c'è più e axe riporta 0 violazioni serious o critical sul pannello con la card aperta"

  target_tests:
    - file: "tests/component/plan-ai-titles.test.tsx"
      covers: [AC-3603-1, AC-3603-2, AC-3603-3, AC-3603-4]
    - file: "tests/e2e/ai-titles.spec.ts"
      covers: [AC-3603-5]

  security_notes:
    - "XSS (CWE-79): la proposta è resa come testo da React, mai come HTML; è già ripulita da T-3502."
    - "Il salvataggio passa dalla PATCH di T-1904 con il controllo di versione: nessuna rotta nuova scrive i titoli."

  out_of_scope:
    - "Confrontare più proposte o modificarle nella card prima di usarle (si modificano dopo, nei campi di oggi)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-16 (D-42), design approvato per sezioni.
- Gate umani: nessuno; nessuna pagina delle baseline visive (login, dashboard e risultati; il piano non è fotografato).
- Scelte dell'agente (rilievi), chiuse dall'utente il 2026-10-17 (D-43): confermati il conteggio di ogni richiesta partita anche se fallisce e i testi «Migliora i titoli con l'AI», «Sto scrivendo i titoli…», «Proposta dell'AI», «Usa questi titoli» e «Scarta»; cambiati il root admin, ora escluso da entrambi i limiti, e la proposta, ora conservata finché non si usa o si scarta (T-3602 nuovo, migrazione additiva). Con D-43 il modulo emenda anche T-3502: H2 oltre il massimo tenuti nei primi.
- Scelte dell'agente da confermare (rilievi, 2026-10-17): le richieste del root admin non entrano in «Proposte nelle ultime 24 ore»; la proposta salvata nella colonna strategy_pages.ai_proposal, una per pagina; «Usa questi titoli» con due richieste (PATCH dei titoli, poi DELETE della proposta); DELETE senza proposta salvata risponde 204; la proposta resta anche se le keyword della pagina cambiano; i tagli degli H2 in eccesso non sono segnalati all'utente.
- Emendamento dichiarato (2026-10-19, macrotask 38 ai-model-fallback, D-46): la rotta usa requestWithFallback (T-3802), quindi la risposta non valida di AC-3601-3, con un elenco di un solo modello, finisce in 502 AI_UNAVAILABLE invece di 502 AI_INVALID_RESPONSE; il DoD di T-3601 e il log ai_titles_suggest hanno gli esiti nuovi (AI_BUSY, AI_DAILY_LIMIT) e i tentativi; la proposta salvata ha droppedH2, 0 per quelle salvate prima.
- Note di costruzione (2026-10-17), da confermare dall'utente. T-3601: `lib/ai/suggest.ts` (`suggestPageTitles`, `discardPageProposal`) e in `lib/modules/strategy/service.ts` `requirePlanPage` (pagina della strategia e piano corrente), `readPlanTitlePage` e `savePageAiProposal` (where con pagina, strategia e perimetro del progetto); `titlePageOf` estratta da `suggestedTitles` in `lib/modules/strategy/editor.ts`, così la pagina inviata al modello è la stessa dei titoli a modelli fissi; ordine: permesso e progetto (404 `PROJECT_NOT_FOUND` fuori dal workspace), pagina (404 `STRATEGY_NOT_FOUND` se non è della strategia), versione precedente (409), funzione e chiave (503), limiti, chiamata; i limiti passano da `enforceRateLimits` di T-1701 (che usa `consumeRateLimit`), prima il workspace (chiave `ai-titles:workspace:<id>`) e poi la piattaforma, con i max letti dalle impostazioni a ogni richiesta: una richiesta fermata dal tetto della piattaforma resta contata nel limite del suo workspace; il 429 è quello di tutte le regole di T-1701, con i secondi in `retryAfter` nel corpo e nell'header `Retry-After` (il `retryAfterSeconds` del DoD); il modello salvato è quello della risposta di OpenRouter (quello richiesto se manca); un evento `ai_titles_suggest` di livello info per ogni richiesta partita verso il modello, con esito `ok` o il code dell'errore; gli H2 oltre il massimo si tolgono prima del controllo della lunghezza (un H2 troppo lungo fra i primi rende la risposta non valida). T-3602: `aiProposal` nella vista della pagina (`StrategyAiProposal` in `lib/modules/strategy/types.ts`), fuori dallo stato dell'editor, così nessuna modifica del piano la tocca; `readStrategy` legge in parallelo l'id del piano per sapere se mostrarla; un valore salvato senza la forma attesa non si mostra; il DELETE risponde 204 senza corpo. T-3603: componente `components/plan/ai-titles.tsx` sotto l'indicatore «Salvato» del pannello, ricreato quando il piano ricaricato porta un'altra proposta (chiave su `createdAt`); `suggestTitles` e `discardProposal` in `PlanRequestsProvider`, con il ricaricamento del piano dopo una richiesta riuscita; «Usa questi titoli» ferma i salvataggi automatici in attesa e mostra subito i titoli della proposta nei campi; se dopo la PATCH riuscita il DELETE fallisce, i titoli restano salvati e la card resta con l'errore; messaggio del limite «Hai raggiunto il limite delle proposte: potrai chiederne un'altra dalle HH:MM.» (ora e minuti nel fuso dell'app); stile `.plan-ai-card`; `aiTitlesAvailable` calcolato nella pagina del piano con `canPerform(role, "strategy.write")` e `isAiTitlesAvailable` (funzione accesa e chiave presente, `lib/ai/settings.ts`), sempre false nelle versioni precedenti; il finto OpenRouter degli E2E sta sulla porta del finto autocomplete (3199) e risponde con H1 «Guida a <principale>: la proposta dell'AI» e due H2; l'E2E usa un utente dedicato e alla fine spegne la funzione cancellando `AI_TITLES_SETTINGS`.
- Scelte dell'agente e note di costruzione chiuse dall'utente il 2026-10-18 (D-48): confermate la proposta che resta se cambiano le keyword, il testo del limite con l'ora, la proposta nella pagina del piano, «Usa questi titoli» con salvataggio e poi rimozione, lo scarto senza proposta senza errore e la richiesta fermata dal tetto contata nel limite del workspace; cambiato il taglio degli H2 senza avviso: la card dirà quanti H2 non sono stati tenuti (T-3802). Le richieste del root admin fuori da «Proposte nelle ultime 24 ore» sono superate dal tetto in richieste del modulo 39.
