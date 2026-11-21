# 75-mcp-plan — Macrotask `mcp-plan`

> Claude Code costruisce il piano senza le AI di Titan SEO, lo legge e lo modifica con le operazioni di oggi, senza
> poter rovinare le pagine già iniziate (D-64).

## Obiettivo del macrotask
Scelte dell'utente del 2026-11-17: le scelte di Claude Code «tornano nel piano così che io veda lo stesso lavoro lì»;
per i piani di Claude Code le fasi AI di Titan SEO si spengono («lascia a lui il ragionamento»); il lavoro già scritto
o pubblicato non si rovina (anti-obiettivo 2 del disegno). Disegno in
`docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`.

## Task atomici

```yaml
- id: T-7501
  title: "build_plan senza AI e get_plan"
  macrotask: "mcp-plan"
  depends_on: [T-7302, T-6201, T-6303, T-6901, T-2502]

  objective: >
    Far costruire o rigenerare a Claude Code il piano con i dati di Titan SEO ma senza la classificazione e i consigli
    dell'AI, e dargli il piano completo da leggere.

  definition_of_done:
    - "Migrazione additiva: plan_runs.origin (APP o AGENT, default APP)."
    - "build_plan({ projectId, settings? }): avvia il lavoro di piano di oggi (POST strategies, T-6201) con origin AGENT, dopo il controllo del tetto di spesa (T-7302); risponde con runId o con JOB_ALREADY_ACTIVE e il runId attivo. Con origin AGENT la fase classify usa solo i riconoscimenti fissi (fixedClasses) senza chiamare l'AI, la fase advise non c'è, e le richieste a DataForSEO del lavoro sono agent."
    - "grouping_notice AGENT_PLAN per i piani di Claude Code (al posto di AI_NOT_CONFIGURED o AI_CLASSIFY_UNAVAILABLE): nell'avviso del piano «Piano preparato per Claude Code: luoghi, concorrenti e angoli li valuta lui», in it, en, es-ES."
    - "wait_for_job accetta anche runId di un lavoro di piano: status, fase e avanzamento come nella barra di oggi, e strategyId quando è completed."
    - "get_plan({ projectId }): piano corrente con strategyId, version, groupingSource, groupingNotice, pagine nell'ordine di lavoro (id, numero, kind, hubPageId, h1, h2, contentType, status, publishedUrl, keyword con id, keyword, volume, punteggio, ruolo, angolo, sourceKeywordId), keyword non assegnate e, per le pagine locali con i consigli, il numero di città (hasLocalTips); STRATEGY_NOT_FOUND senza piano."

  acceptance_criteria:
    - id: AC-7501-1
      given: "un progetto con keyword tenute, la funzione AI del piano attiva e OpenRouter simulato"
      when: "Claude Code chiama build_plan e poi wait_for_job fino a completed"
      then: "il lavoro ha origin AGENT, non ci sono righe di ai_requests con feature plan, il piano salvato ha grouping_notice AGENT_PLAN e nessuna keyword con angle_advice"
    - id: AC-7501-2
      given: "lo stesso progetto e un lavoro di piano dell'app costruito con l'AI"
      when: "si confronta il lavoro dell'app con quello di Claude Code"
      then: "il lavoro con origin APP ha righe di ai_requests con feature plan e il suo grouping_notice non è AGENT_PLAN"
    - id: AC-7501-3
      given: "un piano con un hub, due spoke, una pagina local e due keyword non assegnate"
      when: "Claude Code chiama get_plan"
      then: "la risposta ha la version del piano, le quattro pagine nell'ordine di lavoro con h1, h2, status e keyword con id e volume, e le due keyword non assegnate"
    - id: AC-7501-4
      given: "un piano con grouping_source SERP e grouping_notice AGENT_PLAN"
      when: "si apre la pagina del piano"
      then: "l'avviso dice «Piano preparato per Claude Code: luoghi, concorrenti e angoli li valuta lui»"

  target_tests:
    - file: "tests/integration/mcp-plan.test.ts"
      covers: [AC-7501-1, AC-7501-2, AC-7501-3]
    - file: "tests/component/plan-grouping-notice.test.tsx"
      covers: [AC-7501-4]

  security_notes:
    - "A04 / CWE-770: build_plan passa dal tetto di spesa di Claude Code e dal limite di un lavoro di piano attivo per progetto."
    - "A01 / CWE-639: progetto autorizzato con i permessi di oggi (strategy.write)."

  out_of_scope:
    - "Spegnere le fasi AI per i piani avviati dall'app."
    - "Le modifiche al piano (T-7502)."

- id: T-7502
  title: "edit_plan e update_page con le pagine iniziate protette"
  macrotask: "mcp-plan"
  depends_on: [T-7501, T-1904, T-2501, T-2505, T-6801]

  objective: >
    Far modificare a Claude Code il piano con le operazioni di oggi e la version, senza eliminare o svuotare le pagine
    che l'utente ha già iniziato o pubblicato.

  definition_of_done:
    - "edit_plan({ projectId, version, operation }): le operazioni di oggi (move_keywords, merge_pages, move_page, promote_to_hub, create_page, keep_angle) con operateOnStrategy e la version (409 STRATEGY_CONFLICT come isError con la version corrente); delete_page non c'è."
    - "Guardia di Claude Code prima dell'operazione: merge_pages con sorgente o destinazione non «Da scrivere», move_keywords e create_page che tolgono keyword da una pagina non «Da scrivere», move_page e promote_to_hub di una pagina non «Da scrivere» sono isError AGENT_PAGE_LOCKED e il piano non cambia."
    - "update_page({ projectId, version, pageId, h1?, h2?, contentType?, status?, publishedUrl? }): PATCH della pagina di oggi; su una pagina non «Da scrivere» sono ammessi solo status e publishedUrl, il resto è AGENT_PAGE_LOCKED."
    - "Risposte con la version nuova e, per create_page, il pageId; code AGENT_PAGE_LOCKED in API_ERROR_CODES e nei cataloghi."

  acceptance_criteria:
    - id: AC-7502-1
      given: "un piano con lo spoke A «Da scrivere» e lo spoke B «In scrittura» sotto lo stesso hub, version 3"
      when: "Claude Code chiama edit_plan con version 3 e merge_pages da B ad A, e poi con move_keywords di una keyword di B verso A"
      then: "entrambe le risposte sono isError AGENT_PAGE_LOCKED e il piano ha ancora version 3 con le stesse keyword in A e in B"
    - id: AC-7502-2
      given: "lo stesso piano"
      when: "Claude Code chiama edit_plan con version 3 e move_keywords di una keyword di A verso B, poi con version 3 una seconda operazione"
      then: "la prima risposta ha version 4 e la keyword è in B; la seconda è isError STRATEGY_CONFLICT con version corrente 4"
    - id: AC-7502-3
      given: "la pagina B «Pubblicata»"
      when: "Claude Code chiama update_page su B con h1 nuovo, poi con publishedUrl https://esempio.it/b e la version nuova"
      then: "la prima risposta è isError AGENT_PAGE_LOCKED e l'H1 non cambia; la seconda salva published_url"
    - id: AC-7502-4
      given: "la stessa chiave"
      when: "Claude Code chiama edit_plan con un'operazione delete_page"
      then: "la risposta è isError VALIDATION_ERROR e nessuna pagina va via"

  target_tests:
    - file: "tests/integration/mcp-plan-edit.test.ts"
      covers: [AC-7502-1, AC-7502-2, AC-7502-3, AC-7502-4]

  security_notes:
    - "A04 / CWE-841: la guardia sulle pagine iniziate vale solo per Claude Code e prima di ogni operazione."
    - "A01 / CWE-639, CWE-362: operazioni con il progetto autorizzato e la version di oggi (T-1904)."

  out_of_scope:
    - "Bloccare le stesse operazioni nell'app per l'utente."
    - "Eliminare pagine, piani o progetti dal server MCP."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): scelte di Claude Code nel piano dell'app, piani senza AI di Titan SEO, pagine iniziate protette, «Rigenera» permesso.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): avviso AGENT_PLAN invece di quello dell'AI non attiva, guardia anche su move_page e promote_to_hub, delete_page assente, numero di città nella lettura delle pagine locali.
- Ordine: dopo il 74; T-7502 dopo T-7501.
- Note di costruzione (2026-11-21, scelte dell'agente da confermare). Migrazione additiva `0063_plan_run_origin` con `plan_runs.origin` dello stesso tipo `JobOrigin` delle ricerche (nessun tipo nuovo), default APP; `startPlanRun` riceve l'origin (APP se manca). T-7501: in `lib/modules/plan-runs/phases.ts` un lavoro AGENT passa dalla fase classify al raggruppamento senza cursore, quindi senza chiamare l'AI e con i soli riconoscimenti fissi di `savedClasses`; non ha angoli (come un lavoro dell'app con la classificazione dell'AI non riuscita, T-6702: con i soli riconoscimenti fissi le città diventerebbero angoli) né la fase advise; grouping_notice AGENT_PLAN solo con i risultati di Google come fonte e nessun dato mancato prima (il primo motivo resta, per esempio PLAN_NO_LICENSED_METRICS), mentre il motore di riserva tiene SERP_TOO_FEW. `isAgentJob` di `metrics-ledger.ts` legge anche `plan_runs.origin`, così le richieste a DataForSEO del lavoro sono `agent`. Strumenti in `lib/modules/agent/tools/plan.ts`, registrati dopo `get_serps`: `build_plan` con strategy.write, rigenerazione quando il progetto ha già un piano, modalità esperta solo con `settings` (lo schema della modalità esperta nel JSON Schema), nome predefinito nella lingua dell'utente, tetto di spesa controllato dopo il permesso e prima dell'avvio, risposta con `runId`, `regenerate` e `spend`; `wait_for_job` vuole uno solo fra `jobId` e `runId` e per un lavoro di piano dà `status`, `phase`, `finished`, `progress` (done e total della barra), `strategyId` a completed, `error` con il codice a failed e `spend`; `get_plan` con project.read, pagine nell'ordine e con il numero della bacheca (pilastro e poi i suoi spoke), keyword con id, testo, volume, punteggio, ruolo, angolo e `sourceKeywordId`, `cities` (numero delle keyword) solo per le pagine con `hasLocalTips`, non assegnate con la stessa forma, nessuna paginazione (un piano fino a 5000 keyword può superare il limite di output di Claude Code: rischio dichiarato). T-7502: `OPERATION_SCHEMAS` e `PAGE_PATCH_SHAPE` esportati da `lib/modules/strategy/service.ts` e usati sia dalle rotte sia dagli strumenti; `edit_plan` senza delete_page (VALIDATION_ERROR sul campo `operation.type`) e `update_page`; guardia in `lib/modules/agent/plan-guard.ts` passata a `operateOnStrategy` e `patchStrategyPage` ed eseguita nella transazione dopo la presa della version (prima il conflitto, poi la pagina bloccata; il rifiuto annulla anche la version); AGENT_PAGE_LOCKED 409 con il `pageId` della prima pagina bloccata; guardia estesa a merge_pages con una sorgente hub che ha spoke non «Da scrivere» (cambierebbero pagina principale come con move_page); aggiungere keyword o spoke a una pagina iniziata e keep_angle restano permessi (AC-7502-2); STRATEGY_CONFLICT con `currentVersion`; risposte con `strategyId`, `version` e, per create_page, `pageId`. Avviso AGENT_PLAN in it, en ed es-ES (es-419 lo eredita) e AGENT_PAGE_LOCKED nei cataloghi degli errori. Da decidere: spostare keyword verso una pagina iniziata ne ricalcola gli H2 non modificati a mano, come nell'editor dell'app (comportamento di oggi, non cambiato).
