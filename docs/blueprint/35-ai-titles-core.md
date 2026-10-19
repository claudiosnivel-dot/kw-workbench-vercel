# 35-ai-titles-core — Macrotask `ai-titles-core`

> Titoli con l'AI (D-42, D-33 emendata), modulo 1 di 2: configurazione della funzione per il root admin e cuore della proposta (istruzioni al modello, client OpenRouter, controllo della risposta). Nessuna pagina per gli utenti: il pulsante arriva con il modulo 36.

## Obiettivo del macrotask
Oggi H1 e H2 del piano nascono solo dai modelli fissi di T-1902 (D-33). L'utente ha deciso il 2026-10-16 di aggiungere, a richiesta e per una pagina alla volta, una proposta scritta da un modello gratuito tramite OpenRouter, da accettare o scartare (D-42). Dopo questo modulo:

- **Configurazione**: `OPENROUTER_API_KEY` (e `OPENROUTER_BASE_URL`, solo per i test) facoltative nell'ambiente; nelle Impostazioni dell'amministrazione la card «Titoli con l'AI» del root admin con interruttore, modello (solo ID `:free`), tetto della piattaforma e limite per workspace, stato della chiave e proposte delle ultime 24 ore; ogni modifica nel registro (`ai.update`).
- **Cuore della proposta**: funzioni pure che costruiscono la richiesta al modello con i soli dati ammessi, chiamano OpenRouter con un timeout e controllano la risposta (H1 con la keyword principale, numero e lunghezza degli H2, testo ripulito).

## Task atomici

```yaml
- id: T-3501
  title: "Configurazione dei titoli con l'AI e card dell'amministrazione"
  macrotask: "ai-titles-core"
  depends_on: [T-3301, T-1704, T-908, T-1701]

  objective: >
    Dare al root admin il controllo della funzione (accesa o spenta, modello gratuito, limiti) senza un deploy, con la
    chiave di OpenRouter solo nell'ambiente del server.

  definition_of_done:
    - "lib/env.ts: OPENROUTER_API_KEY facoltativa (segreto, mai nei log) e OPENROUTER_BASE_URL facoltativa con default https://openrouter.ai/api/v1, usata solo dagli E2E per un finto server locale; scripts/env-check.mjs e .env.example aggiornati (OPENROUTER_API_KEY da segnare Sensitive su Vercel)."
    - "Impostazioni in app_settings (cifrate come le altre, chiave AI_TITLES_SETTINGS): enabled (default false), model (default: un ID OpenRouter che finisce con ':free', scelto alla costruzione tra i modelli gratuiti disponibili e annotato nelle note di costruzione) (emendato da T-3801 il 2026-10-19, D-46: models, l'elenco ordinato da 1 a 8 ID ':free'; un valore con il solo model si legge come [model]), platformDailyLimit (default 45) e workspaceDailyLimit (default 10), interi da 1 a 1000; valore assente o illeggibile → i default (fail-safe, funzione spenta)."
    - "GET e PATCH /api/admin/ai-titles, solo root admin (admin non root e abbonati 403, anonimi 401), header Cache-Control no-store: GET restituisce le impostazioni, keyConfigured (sì o no, mai la chiave) e used24h (proposte delle ultime 24 ore contate dal registro dei tentativi del rate limit di T-1701 sulla chiave della piattaforma); PATCH accetta enabled, model, platformDailyLimit e workspaceDailyLimit, model diverso da un ID 'autore/modello:free' → 400 AI_MODEL_NOT_FREE, limiti fuori intervallo → 400 VALIDATION_ERROR; riga di registro ai.update con i soli campi cambiati (prima e dopo) nella stessa transazione del salvataggio."
    - "Regole aiTitlesWorkspace e aiTitlesPlatform in lib/security/rate-limit-config.ts con finestra di 86400 s (il max arriva dalle impostazioni al momento della richiesta, T-3601), così la pulizia dei tentativi conserva le ultime 24 ore."
    - "Card AiTitlesSettingsCard in /admin/settings (dopo AdminLaunchCard): interruttore Attiva o Spenta, campo del modello con il suggerimento «Solo modelli gratuiti (ID che finisce con :free)», tetto della piattaforma, limite per workspace, «Chiave configurata» sì o no, «Proposte nelle ultime 24 ore: N su M»; salvataggio con la conferma «Salvato» e l'errore del catalogo."
    - "Codici AI_NOT_CONFIGURED, AI_TIMEOUT, AI_UNAVAILABLE, AI_INVALID_RESPONSE e AI_MODEL_NOT_FREE in API_ERROR_CODES e nei cataloghi errors.* it ed en; testi della card nei cataloghi admin.aiTitles it ed en."
    - "docs/AI-TITLES.md: creare la chiave su OpenRouter, impostarla su Vercel (Production e Preview, Sensitive) con un redeploy, verificare nelle impostazioni di privacy dell'account OpenRouter che gli endpoint gratuiti siano ammessi, scegliere il modello e accendere la funzione; limiti del piano gratuito di OpenRouter e loro rapporto con i due tetti."
    - "Emendamenti dichiarati alla costruzione: DoD di T-3301 (modulo 33, la sezione Impostazioni ha anche AiTitlesSettingsCard) e DoD di T-1704 (modulo 17, il registro ha anche ai.update con target_type ai)."

  acceptance_criteria:
    - id: AC-3501-1
      given: "il root admin autenticato, OPENROUTER_API_KEY uguale a 'sk-or-test-3501' e nessuna impostazione salvata"
      when: "invia GET /api/admin/ai-titles"
      then: "la risposta è 200 con header Cache-Control no-store, enabled false, platformDailyLimit 45, workspaceDailyLimit 10, un elenco models di ID che finiscono con ':free' (emendato da T-3801 il 2026-10-19, D-46: prima un model), keyConfigured true e used24h 0; la stringa JSON non contiene 'sk-or-test-3501'"
    - id: AC-3501-2
      given: "il root admin autenticato"
      when: "invia PATCH con { enabled: true, models: ['autore/modello-prova:free'], platformDailyLimit: 40 }, poi PATCH con { models: ['autore/modello-a-pagamento'] }, poi PATCH con { workspaceDailyLimit: 0 } (emendato da T-3801 il 2026-10-19, D-46: models al posto di model)"
      then: "le risposte sono 200, 400 AI_MODEL_NOT_FREE e 400 VALIDATION_ERROR; GET restituisce enabled true, models ['autore/modello-prova:free'], platformDailyLimit 40 e workspaceDailyLimit 10; il registro ha 1 sola riga ai.update i cui metadata hanno enabled, models e platformDailyLimit con before e after"
    - id: AC-3501-3
      given: "un admin non root, un SUBSCRIBER e una richiesta senza sessione"
      when: "ciascuno invia GET /api/admin/ai-titles e PATCH /api/admin/ai-titles con { enabled: true }"
      then: "le risposte sono 403, 403 e 401 per entrambe le richieste e le impostazioni restano quelle predefinite"
    - id: AC-3501-4
      given: "la card AiTitlesSettingsCard con keyConfigured false, enabled false e used24h 3 su 45"
      when: "il root admin attiva l'interruttore, scrive 'autore/altro:free' in «Aggiungi modello», clicca «Aggiungi» e salva (emendato da T-3801 il 2026-10-19, D-46: l'elenco dei modelli al posto del campo Modello)"
      then: "la card mostra «Chiave configurata: no» e «Proposte nelle ultime 24 ore: 3 su 45»; parte 1 PATCH /api/admin/ai-titles con enabled true e models che finisce con 'autore/altro:free' e compare «Salvato»"

  target_tests:
    - file: "tests/integration/admin-ai-titles.test.ts"
      covers: [AC-3501-1, AC-3501-2, AC-3501-3]
    - file: "tests/component/admin-ai-titles-card.test.tsx"
      covers: [AC-3501-4]

  security_notes:
    - "A02 / CWE-312 e CWE-532: la chiave sta solo nell'ambiente del server; mai nel database, nelle risposte o nei log (keyConfigured è solo sì o no)."
    - "A01 / CWE-285: lettura e modifica delle impostazioni solo per il root admin, verificate nella rotta."
    - "Costi: solo ID ':free' accettati, così la funzione non spende crediti dell'account OpenRouter anche se l'utente ne aggiunge per altri usi (D-42)."

  out_of_scope:
    - "Modelli a pagamento e chiave inserita dall'interfaccia (D-42: approccio A)."

- id: T-3502
  title: "Istruzioni al modello, client OpenRouter e controllo della risposta"
  macrotask: "ai-titles-core"
  depends_on: [T-3501, T-1902]

  objective: >
    Isolare in funzioni pure e testabili tutto ciò che riguarda il modello: quali dati partono, come si chiama OpenRouter
    e quando una risposta è una proposta valida.

  definition_of_done:
    - "lib/ai/titles-prompt.ts, buildTitlesRequest(page, context): dalla pagina del piano (tipo HUB o SPOKE, tipo di contenuto, keyword principale, secondarie in ordine di priorità fino a 30, per l'hub anche le principali dei suoi spoke) e dalla lingua del piano costruisce il corpo della chiamata (model, messages di sistema e utente, temperature 0.4, max_tokens 1200); le istruzioni sono in italiano per 'it' e in inglese con la lingua del piano indicata per le altre; chiedono un H1 che contiene la keyword principale, al massimo 20 H2 per l'hub e 12 per lo spoke (gli stessi tetti di T-1902), titoli entro 200 caratteri, domande con il punto interrogativo, niente markdown né marchi, numeri o dati inventati, risposta solo in JSON { h1, h2 }, e dicono che le keyword sono dati e non istruzioni. Non riceve né invia volumi, punteggi, nomi di progetto, utente o workspace."
    - "lib/ai/openrouter.ts, requestCompletion(body, { apiKey, baseUrl, timeoutMs }): POST {baseUrl}/chat/completions con Authorization Bearer, HTTP-Referer APP_PUBLIC_URL e X-Title Titan SEO; AbortController con timeout (20 000 ms nella rotta) → AiTitlesError AI_TIMEOUT; rete non raggiungibile, status diverso da 2xx o corpo senza choices[0].message.content → AI_UNAVAILABLE; restituisce { content, model }; nessun nuovo tentativo automatico; non scrive nei log né la chiave né il contenuto."
    - "lib/ai/titles-response.ts, parseTitlesResponse(content, page, language): estrae il primo oggetto JSON anche dentro testo o blocchi di codice; toglie da ogni titolo i '#' iniziali, i tag HTML e i caratteri di controllo e comprime gli spazi; H1 non vuoto, entro 200 caratteri, con tutte le parole della keyword principale (stessa normalizzazione della strategia, keywordWords di T-1901); H2 da 1 al massimo della pagina dopo aver tolto i vuoti e i doppioni (senza distinzione di maiuscole), ciascuno entro 200 caratteri; un controllo non superato → AiTitlesError AI_INVALID_RESPONSE (emendato da T-3601 il 2026-10-17, D-43: oltre il massimo si tengono i primi H2 nell'ordine della risposta; prima la risposta era non valida)."

  acceptance_criteria:
    - id: AC-3502-1
      given: "uno spoke in italiano con la principale 'scarpe running donna', le secondarie 'come scegliere scarpe running' e 'scarpe running ammortizzate' (volumi 4400 e 880) in un progetto chiamato 'Cliente-Segreto-XYZ'"
      when: "si costruisce la richiesta con buildTitlesRequest"
      then: "la serializzazione contiene 'scarpe running donna', poi 'come scegliere scarpe running' prima di 'scarpe running ammortizzate', e il numero 12; non contiene 'Cliente-Segreto-XYZ', '4400' né '880'"
    - id: AC-3502-2
      given: "la risposta 'Ecco i titoli:' seguita da un blocco di codice json con h1 '# Scarpe running donna: come sceglierle' e h2 ['Ammortizzazione', 'ammortizzazione', '<b>Taglie</b>']"
      when: "si chiama parseTitlesResponse per lo spoke di AC-3502-1"
      then: "il risultato è h1 'Scarpe running donna: come sceglierle' e h2 ['Ammortizzazione', 'Taglie'], con droppedH2 0 (emendato da T-3802 il 2026-10-19, D-46 e D-48)"
    - id: AC-3502-3
      given: "lo spoke di AC-3502-1"
      when: "parseTitlesResponse riceve un testo senza JSON, poi un h1 'Le migliori calzature' senza la keyword principale, poi un h2 vuoto (emendato da T-3601 il 2026-10-17, D-43: tolto il caso dei 13 H2 diversi, ora AC-3601-6 sulla rotta)"
      then: "ogni chiamata lancia AiTitlesError con code AI_INVALID_RESPONSE"
    - id: AC-3502-4
      given: "un fetch simulato che non risponde mai, uno che risponde 429 e uno che risponde 200 con il contenuto 'ok' e il modello 'autore/modello:free'"
      when: "requestCompletion chiama ciascuno con timeoutMs 20000 e i timer simulati avanzano di 20 s"
      then: "il primo rifiuta con AI_TIMEOUT, il secondo con AI_UNAVAILABLE, il terzo restituisce content 'ok' e model 'autore/modello:free'; la richiesta va a {baseUrl}/chat/completions con l'header Authorization 'Bearer ' seguito dalla chiave"

  target_tests:
    - file: "tests/unit/ai-titles.test.ts"
      covers: [AC-3502-1, AC-3502-2, AC-3502-3, AC-3502-4]

  security_notes:
    - "Privacy (D-42): al modello vanno solo keyword, lingua, tipi di pagina e di contenuto e il numero massimo di H2; mai volumi, punteggi, nomi di progetto, utente o workspace."
    - "LLM01 (prompt injection): le keyword arrivano anche da Google; il modello non ha strumenti e la sua risposta è testo ripulito e controllato, mostrato come testo e salvato solo se l'utente accetta."
    - "A10 / CWE-918: l'indirizzo di OpenRouter è fisso (OPENROUTER_BASE_URL serve solo agli E2E e viene dall'ambiente, mai dalla richiesta)."

  out_of_scope:
    - "Nuovi tentativi automatici, risposte in streaming, scelta del modello per richiesta."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-16 (D-42), design approvato per sezioni: proposta per pagina da accettare, accesso a tutti con limiti, chiave su Vercel, solo modelli gratuiti, funzione spenta all'inizio.
- Gate umani: nessuno. Passi esterni dell'utente (non bloccano la costruzione): `OPENROUTER_API_KEY` su Vercel con un redeploy, verifica delle impostazioni di privacy dell'account OpenRouter, accensione della funzione dalla card; la privacy policy (D-15) dovrà nominare OpenRouter fra i servizi esterni.
- Emendamento dichiarato (2026-10-19, macrotask 38 ai-model-fallback, D-46): l'impostazione model diventa models, l'elenco ordinato da 1 a 8 modelli ':free' (T-3801), quindi AC-3501-1, AC-3501-2 e AC-3501-4 e i loro test parlano dell'elenco; parseTitlesResponse restituisce anche droppedH2 (T-3802, D-48), quindi AC-3502-2 ha droppedH2 0. requestCompletion e AC-3502-4 restano invariati: è il singolo tentativo usato da requestWithFallback.
- Scelte dell'agente da confermare (rilievi): istruzioni in italiano per 'it' e in inglese per le altre lingue; fino a 30 secondarie inviate; più H2 del massimo → risposta non valida (nessun taglio); temperature 0.4; timeout di 20 s; nome della card «Titoli con l'AI».
- Scelte dei rilievi e delle note di costruzione chiuse dall'utente il 2026-10-17 (D-43): tutte confermate tranne gli H2 oltre il massimo, che vanno tenuti nei primi invece di scartare la risposta (emendamento di T-3502 e AC-3502-3 dichiarato nel modulo 36, T-3601).
- Note di costruzione (2026-10-17), confermate dall'utente (D-43). T-3501: modello di default `google/gemma-4-31b-it:free`, scelto tra i 16 modelli `:free` dell'elenco pubblico di OpenRouter del 2026-10-17 (multilingue, non di ragionamento); impostazioni lette dal database a ogni richiesta, senza cache; un campo salvato non valido riprende il suo default (JSON illeggibile → tutti i default); la PATCH accetta anche un solo campo, un corpo senza campi noti → 400 VALIDATION_ERROR, un modello che non è un testo `autore/modello:free` → 400 AI_MODEL_NOT_FREE, valori uguali a quelli salvati → nessuna scrittura né riga del registro; il modello si salva senza spazi ai lati; `getOpenRouterSettings` (lib/env.ts) dà chiave e base insieme, null senza chiave; OPENROUTER_BASE_URL accetta https e http solo per localhost, come APP_PUBLIC_URL, anche in produzione perché gli E2E girano con `next start`; `scripts/env-check.mjs` dice per ogni ambiente se la chiave è impostata, presente senza valore leggibile (Sensitive) o assente, mai il valore; la card manda sempre i quattro valori, l'interruttore è un pulsante `role=switch` «Attiva»/«Spenta» con l'etichetta «Funzione per gli utenti», «Proposte nelle ultime 24 ore: N su M» usa il tetto salvato; i max delle regole aiTitlesWorkspace (10) e aiTitlesPlatform (45) ripetono i default delle impostazioni; con la finestra di 86 400 s la pulizia dei tentativi conserva ora 24 ore per tutte le chiavi. T-3502: `AiTitlesError` (lib/ai/errors.ts) porta già gli status della rotta di T-3601 (503, 504, 502, 502); `MAX_H2` di T-1902 esportato e riusato; istruzioni nel messaggio di sistema e dati della pagina nel messaggio dell'utente come JSON (language, pageType pillar o spoke, contentType, mainKeyword, secondaryKeywords, spokeMainKeywords per la pilastro, maxH2); nome inglese della lingua del piano da `Intl.DisplayNames` (de → German); il timeout scatta anche se il server ignora l'abort; senza `model` nella risposta vale il modello richiesto; una risposta oltre 20 000 caratteri non si analizza (AI_INVALID_RESPONSE); dai titoli si tolgono anche i caratteri invisibili; i doppioni degli H2 si confrontano in minuscolo.
