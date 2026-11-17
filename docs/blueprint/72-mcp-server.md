# 72-mcp-server — Macrotask `mcp-server`

> Il server MCP di Titan SEO in `/api/mcp`: protocollo, accesso con la chiave del modulo 71, limite di richieste,
> registro delle chiamate, istruzioni di lavoro e i primi strumenti di lettura (D-64).

## Obiettivo del macrotask
Claude Code si collega a Titan SEO come server MCP remoto (disegno `docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`).
Il protocollo che serve è la versione «Streamable HTTP» senza stato, con risposte JSON: lo scriviamo nel repo senza
la libreria ufficiale (scelta dell'agente nel disegno approvato), così resta sotto i test e gli oracoli. Questo modulo
fa la rotta, l'accesso, il registro (anti-obiettivo 4) e gli strumenti per leggere i progetti; ricerca, piano e
articoli arrivano con i moduli 73-76.

## Task atomici

```yaml
- id: T-7201
  title: "Rotta /api/mcp con protocollo, accesso e registro"
  macrotask: "mcp-server"
  depends_on: [T-7101, T-1701, T-404]

  objective: >
    Rispondere ai messaggi MCP di Claude Code solo con una chiave valida del root admin, limitare le richieste e
    registrare ogni chiamata di strumento.

  definition_of_done:
    - "app/api/mcp/route.ts (runtime nodejs): POST con un messaggio JSON-RPC 2.0; initialize (risponde con la versione del protocollo chiesta se è fra quelle supportate, altrimenti con la più recente supportata, capabilities.tools, serverInfo { name: \"titan-seo\" } e instructions), notifications/initialized e le altre notifiche 202 senza corpo, ping, tools/list, tools/call; GET e DELETE 405; corpo non valido o metodo ignoto con l'errore JSON-RPC corrispondente (-32700, -32600, -32601, -32602)."
    - "/api/mcp fra i percorsi pubblici di proxy.ts; la rotta legge la chiave solo da Authorization: Bearer (mai dall'URL né dai cookie) con verifyAgentKey (T-7101): senza chiave valida 401 con WWW-Authenticate Bearer e nessuna chiamata eseguita; last_used_at aggiornato a ogni richiesta valida."
    - "Limite di richieste per chiave con consumeRateLimit (T-1701), 120 al minuto: oltre, 429 con Retry-After."
    - "lib/modules/agent/server.ts: registro degli strumenti (nome, descrizione in inglese, inputSchema JSON Schema, validazione zod dell'input, handler con l'utente e la chiave); un errore di uno strumento è un risultato con isError true e un testo con code e messaggio nella lingua delle preferenze del root admin; un errore inatteso non mostra dettagli interni (CWE-209)."
    - "Migrazione additiva: tabella agent_calls (id, key_id, tool, project_id nullable, ok, error_code nullable, duration_ms, created_at, indice su created_at); ogni tools/call scrive una riga, mai i parametri né i testi."
    - "Istruzioni di lavoro nella risposta a initialize, in inglese: percorso (progetto, ricerca, keyword, piano, modifiche, articoli), «non usare le AI di Titan SEO: il ragionamento SEO è tuo», wait_for_job per i lavori lunghi, rileggere dopo un conflitto di versione, tetto di spesa, pagine non «Da scrivere» bloccate. Testo in lib/modules/agent/instructions.ts."

  acceptance_criteria:
    - id: AC-7201-1
      given: "una chiave valida del root admin"
      when: "si invia initialize con protocolVersion 2025-06-18 e poi tools/list"
      then: "initialize risponde con protocolVersion 2025-06-18, capabilities.tools e instructions non vuote; tools/list elenca gli strumenti registrati con name, description e inputSchema"
    - id: AC-7201-2
      given: "nessuna chiave, una chiave revocata, una chiave scaduta e il solo cookie di sessione del root admin"
      when: "si invia tools/call di list_projects con ciascuna"
      then: "ogni risposta è 401 con WWW-Authenticate e la tabella agent_calls resta vuota"
    - id: AC-7201-3
      given: "una chiave valida"
      when: "si invia tools/call di uno strumento che non esiste e poi di list_projects"
      then: "la prima risposta è l'errore JSON-RPC -32602; la seconda è un risultato senza isError e agent_calls ha una riga list_projects con ok true e duration_ms"
    - id: AC-7201-4
      given: "una chiave valida che ha già fatto 120 richieste nell'ultimo minuto"
      when: "invia la richiesta numero 121"
      then: "la risposta è 429 con Retry-After"
    - id: AC-7201-5
      given: "una chiave valida"
      when: "si invia un GET a /api/mcp e un POST con un corpo che non è JSON"
      then: "il GET risponde 405; il POST risponde con l'errore JSON-RPC -32700"

  target_tests:
    - file: "tests/integration/mcp-route.test.ts"
      covers: [AC-7201-1, AC-7201-2, AC-7201-3, AC-7201-4, AC-7201-5]

  security_notes:
    - "A01 / CWE-285, CWE-306: ogni richiesta rilegge chiave, stato e ruolo (verifyAgentKey); il cookie di sessione non basta."
    - "A04 / CWE-770: 120 richieste al minuto per chiave."
    - "A09 / CWE-532: il registro tiene strumento, progetto, esito e durata, mai parametri, testi o la chiave."
    - "A05 / CWE-209: errori inattesi senza stack né messaggi interni."

  out_of_scope:
    - "Stream SSE, sessioni MCP, resources e prompts del protocollo, OAuth."
    - "Gli strumenti di ricerca, piano e articoli (moduli 73-76)."

- id: T-7202
  title: "Strumenti list_projects e get_project"
  macrotask: "mcp-server"
  depends_on: [T-7201, T-1502]

  objective: >
    Far vedere a Claude Code i progetti del root admin e lo stato di ciascuno, con gli stessi confini dei workspace
    dell'app.

  definition_of_done:
    - "lib/modules/agent/tools/projects.ts: list_projects (progetti dei workspace di cui il root admin è membro: id, nome, workspace, lingua, paese, numero di argomenti e di keyword tenute, id e version del piano o null, aggiornato il) e get_project({ projectId }) (argomenti con parole di partenza e numero di keyword, ultimi 5 lavori di ricerca con stato, piano corrente con id, version, pagine e articoli)."
    - "Lettura con i permessi di oggi (requireProjectAccess, T-1502): un progetto di un workspace di cui il root admin non è membro è un errore PROJECT_NOT_FOUND, come nell'app."
    - "Risposte come testo JSON compatto; agent_calls con il project_id per get_project."

  acceptance_criteria:
    - id: AC-7202-1
      given: "il root admin membro dei workspace W1 e W2 con un progetto ciascuno, e un progetto di un workspace W3 di cui non è membro"
      when: "Claude Code chiama list_projects"
      then: "la risposta elenca i due progetti di W1 e W2 con lingua, paese e workspace e non contiene il progetto di W3"
    - id: AC-7202-2
      given: "un progetto con due argomenti, parole di partenza, una ricerca completata e un piano"
      when: "Claude Code chiama get_project con il suo id e poi con l'id del progetto di W3"
      then: "la prima risposta contiene gli argomenti con le parole di partenza, la ricerca con stato completed e il piano con id e version; la seconda è isError con code PROJECT_NOT_FOUND e agent_calls ha ok false con quel codice"

  target_tests:
    - file: "tests/integration/mcp-projects.test.ts"
      covers: [AC-7202-1, AC-7202-2]

  security_notes:
    - "A01 / CWE-639: confini dei workspace come nelle rotte dell'app; anche il root admin vede solo i propri workspace."

  out_of_scope:
    - "Creare o modificare progetti (modulo 73)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): server MCP remoto, chiave solo per `/api/mcp`, registro di ogni chiamata, istruzioni di lavoro all'avvio.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): protocollo scritto nel repo, versione 2025-06-18 come più recente supportata, 120 richieste al minuto, istruzioni e descrizioni in inglese, errori nella lingua delle preferenze del root admin, il root admin vede solo i progetti dei propri workspace.
- Ordine: dopo il 71; T-7202 dopo T-7201.
