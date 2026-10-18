# 38-ai-model-fallback — Macrotask `ai-model-fallback`

> AI più affidabile (D-46), modulo 1 di 2: un elenco ordinato di modelli gratuiti al posto del modello unico, la richiesta che passa al modello successivo quando uno è sovraccarico o risponde male, e il controllo dell'elenco sul catalogo di OpenRouter.

## Obiettivo del macrotask
Il 2026-10-18 «Migliora i titoli con l'AI» rispondeva `AI_UNAVAILABLE`: il modello `google/gemma-4-31b-it:free` riceveva 429 «temporarily rate-limited upstream» dal pool gratuito di Google AI Studio, mentre altri modelli gratuiti rispondevano. Con un solo modello un fornitore sovraccarico ferma la funzione. Dopo questo modulo:

- **Elenco dei modelli**: il root admin ordina da 1 a 8 modelli `:free` nella card «Titoli con l'AI», dal migliore; il modello salvato oggi diventa il primo dell'elenco.
- **Riserve**: una richiesta prova i modelli in ordine e passa al successivo se uno è sovraccarico, non risponde, sbaglia o dà una risposta che non supera il controllo; si ferma subito se è finito il limite giornaliero dell'account. Messaggi distinti per «modelli occupati» e «richieste di oggi finite».
- **Catalogo**: ogni notte e all'apertura della card l'app confronta l'elenco con il catalogo pubblico di OpenRouter; i modelli spariti o non più gratuiti si saltano e sono segnati nella card, i modelli `:free` nuovi si aggiungono con un clic.

## Task atomici

```yaml
- id: T-3801
  title: "Elenco ordinato dei modelli gratuiti nella card"
  macrotask: "ai-model-fallback"
  depends_on: [T-3501, T-3601]

  objective: >
    Sostituire il modello unico con un elenco ordinato di modelli gratuiti, perché il root admin possa preparare le
    riserve e cambiarne l'ordine senza un deploy.

  definition_of_done:
    - "lib/ai/settings.ts: AiTitlesSettings ha models (da 1 a 8 ID ':free' distinti senza distinzione di maiuscole, stessa regola di FREE_MODEL_ID) al posto di model; un valore salvato con il solo model si legge come [model]; un valore illeggibile vale i default (CWE-1188)."
    - "PATCH /api/admin/ai-titles accetta models (array): un ID non gratuito → 400 AI_MODEL_NOT_FREE; 0 voci, più di 8 o doppioni → 400 VALIDATION_ERROR; la riga ai.update del registro ha models prima e dopo; model nel corpo non è più accettato (400 VALIDATION_ERROR)."
    - "Default: un elenco di almeno 5 modelli scelto alla costruzione provando il prompt dei titoli (buildTitlesRequest, parseTitlesResponse) sui modelli ':free' del catalogo, dal migliore; elenco e data della prova in docs/AI-TITLES.md."
    - "components/admin-ai-titles-card.tsx: elenco numerato con «Su», «Giù» e «Togli» per ogni modello e un campo «Aggiungi modello»; il salvataggio resta quello della card; testi admin it ed en."

  acceptance_criteria:
    - id: AC-3801-1
      given: "AI_TITLES_SETTINGS salvato con model 'autore/a:free' e senza models"
      when: "il root admin chiede GET /api/admin/ai-titles"
      then: "la risposta ha models uguale a ['autore/a:free']"
    - id: AC-3801-2
      given: "il root admin"
      when: "invia PATCH /api/admin/ai-titles con models ['autore/c:free', 'autore/a:free', 'autore/b:free'], poi con un ID 'autore/d' senza ':free', poi con 9 ID, poi con due ID uguali"
      then: "la prima risposta è 200 e una GET successiva restituisce lo stesso ordine, con una riga ai.update che ha models prima e dopo; la seconda è 400 AI_MODEL_NOT_FREE; la terza e la quarta sono 400 VALIDATION_ERROR e le impostazioni non cambiano"
    - id: AC-3801-3
      given: "la card resa con models ['a/uno:free', 'a/due:free', 'a/tre:free'] e un fetch simulato"
      when: "il root admin clicca «Giù» sul primo modello e salva"
      then: "l'elenco mostra 'a/due:free' al primo posto e la PATCH inviata ha models ['a/due:free', 'a/uno:free', 'a/tre:free']"

  target_tests:
    - file: "tests/integration/ai-models-settings.test.ts"
      covers: [AC-3801-1, AC-3801-2]
    - file: "tests/component/admin-ai-models.test.tsx"
      covers: [AC-3801-3]

  security_notes:
    - "A01 / CWE-285: solo il root admin legge e cambia l'elenco (rotta già protetta da T-3501)."
    - "A04 / CWE-1188: un valore salvato illeggibile o un ID non gratuito non entra mai nelle richieste; solo modelli ':free' (D-42)."

  out_of_scope:
    - "Elenchi diversi per titoli e articoli: lo stesso elenco serve entrambe le funzioni (D-46)."

- id: T-3802
  title: "Richiesta con i modelli di riserva"
  macrotask: "ai-model-fallback"
  depends_on: [T-3801, T-3502, T-3601]

  objective: >
    Far rispondere la funzione anche quando un modello gratuito è sovraccarico o risponde male, provando i modelli
    dell'elenco in ordine, e dire all'utente perché quando non risponde nessuno.

  definition_of_done:
    - "lib/ai/openrouter.ts: requestWithFallback(request, models, { apiKey, baseUrl, deadlineMs, attemptTimeoutMs, validate }) prova i modelli in ordine, saltando quelli segnati come assenti dal catalogo (T-3803); ogni tentativo ha come tempo massimo il minore fra attemptTimeoutMs e il tempo che resta alla scadenza (per i titoli 20 s e 25 s) e un esito: ok, provider_busy (429 con il fornitore nei metadati dell'errore), account_daily_limit (429 del limite giornaliero dei modelli gratuiti dell'account), account_rate_limit (429 del limite al minuto dell'account), unavailable (errore di rete, 403, 404, 5xx, risposta senza testo), timeout, invalid_response (validate rifiuta il testo), auth (401 o 402)."
    - "Si passa al modello successivo dopo provider_busy, unavailable, timeout e invalid_response; ci si ferma dopo account_daily_limit (429 AI_DAILY_LIMIT), account_rate_limit (503 AI_BUSY) e auth (502 AI_UNAVAILABLE). Finiti i modelli senza risposta valida: 503 AI_BUSY se almeno un tentativo era provider_busy, altrimenti 502 AI_UNAVAILABLE."
    - "suggestPageTitles usa requestWithFallback con parseTitlesResponse come validate; la proposta riporta il modello che ha risposto; il log ai_titles_suggest ha attempts [{ model, outcome, httpStatus }], mai messaggi del fornitore, chiave o keyword (CWE-532)."
    - "Errori AI_BUSY e AI_DAILY_LIMIT nell'elenco chiuso dei code con i testi del catalogo errors it ed en: «I modelli gratuiti sono tutti occupati: riprova tra qualche minuto.» e «Le richieste all'AI di oggi sono finite: riprova domani.»; docs/AI-TITLES.md aggiornato."

  acceptance_criteria:
    - id: AC-3802-1
      given: "models [A, B, C] e un fetch simulato in cui A risponde 429 con provider_name nei metadati e B risponde 200 con H1 e H2 validi"
      when: "un MEMBER chiede la proposta per una pagina del piano"
      then: "la risposta è 200 con model B; il fetch è stato chiamato 2 volte; il log ai_titles_suggest ha attempts con A provider_busy 429 e B ok 200"
    - id: AC-3802-2
      given: "models [A, B] con A che risponde 200 con un testo senza JSON e B con H1 e H2 validi"
      when: "un MEMBER chiede la proposta"
      then: "la risposta è 200 con model B e il primo tentativo del log è invalid_response"
    - id: AC-3802-3
      given: "models [A, B, C] con A che risponde 429 per il limite giornaliero dei modelli gratuiti dell'account"
      when: "un MEMBER chiede la proposta"
      then: "la risposta è 429 AI_DAILY_LIMIT, il fetch è stato chiamato una volta e la proposta salvata della pagina non cambia"
    - id: AC-3802-4
      given: "models [A, B, C] che rispondono tutti 429 con provider_name nei metadati"
      when: "un MEMBER chiede la proposta, poi il pannello mostra l'errore"
      then: "la risposta è 503 AI_BUSY dopo 3 chiamate al fetch e il pannello mostra «I modelli gratuiti sono tutti occupati: riprova tra qualche minuto.»"

  target_tests:
    - file: "tests/integration/ai-fallback.test.ts"
      covers: [AC-3802-1, AC-3802-2, AC-3802-3, AC-3802-4]
    - file: "tests/unit/openrouter-outcome.test.ts"
      covers: [AC-3802-1, AC-3802-3]

  security_notes:
    - "A09 / CWE-532: nei log solo modello, esito e status HTTP di ogni tentativo; mai la chiave, i messaggi del fornitore o le keyword."
    - "A04 / CWE-400: tempo totale entro la scadenza della rotta (maxDuration 30 s) qualunque sia la lunghezza dell'elenco."

  out_of_scope:
    - "Nuovi tentativi sullo stesso modello o attese fra un tentativo e l'altro."
    - "Modelli a pagamento (D-42, D-46)."

- id: T-3803
  title: "Controllo dei modelli sul catalogo di OpenRouter"
  macrotask: "ai-model-fallback"
  depends_on: [T-3801, T-1203]

  objective: >
    Accorgersi da soli dei modelli gratuiti spariti o diventati a pagamento e di quelli nuovi, perché l'elenco resti
    utilizzabile senza controlli a mano.

  definition_of_done:
    - "lib/ai/catalog.ts: refreshModelCatalog() legge GET https://openrouter.ai/api/v1/models (pubblico, senza chiave, timeout 10 s) e salva in app_settings AI_MODEL_CATALOG { checkedAt, free: [{ id, name, contextLength }] } con i soli modelli ':free' a prezzo 0; una lettura non riuscita lascia il catalogo salvato com'era e registra ai_catalog_refresh_failed."
    - "Stato di ogni modello dell'elenco: ok, missing (assente dal catalogo o con prezzo diverso da 0) oppure unknown (catalogo mai letto); requestWithFallback salta i missing, prova gli unknown."
    - "Aggiornamento ogni notte: app/api/cron/ai-catalog/route.ts (GET con Bearer CRON_SECRET come reap-jobs, 401 altrimenti) in vercel.json alle 04:30; e all'apertura della card se il catalogo ha più di un'ora."
    - "Card «Titoli con l'AI»: accanto a ogni modello lo stato («disponibile», «non più nel catalogo», «da verificare»), la data dell'ultimo controllo e l'elenco dei modelli ':free' del catalogo non ancora nell'elenco, ognuno con «Aggiungi»; testi it ed en."

  acceptance_criteria:
    - id: AC-3803-1
      given: "un catalogo simulato con 'a/uno:free' a prezzo 0, 'a/tre:free' a prezzo diverso da 0 e 'a/nuovo:free' a prezzo 0, e models ['a/uno:free', 'a/due:free', 'a/tre:free']"
      when: "si esegue refreshModelCatalog e il root admin chiede GET /api/admin/ai-titles"
      then: "gli stati sono ok per 'a/uno:free' e missing per 'a/due:free' e 'a/tre:free'; tra i modelli da aggiungere c'è 'a/nuovo:free'"
    - id: AC-3803-2
      given: "lo stesso catalogo e un fetch simulato di OpenRouter in cui 'a/uno:free' risponde 200 con titoli validi"
      when: "un MEMBER chiede la proposta con models ['a/due:free', 'a/uno:free']"
      then: "la risposta è 200 con model 'a/uno:free' e il fetch di chat/completions è stato chiamato una volta"
    - id: AC-3803-3
      given: "un catalogo salvato e una lettura del catalogo che risponde 500"
      when: "si invoca GET /api/cron/ai-catalog con il Bearer giusto, poi senza Authorization"
      then: "la prima risposta è 200 e il catalogo salvato non cambia; la seconda è 401"

  target_tests:
    - file: "tests/integration/ai-catalog.test.ts"
      covers: [AC-3803-1, AC-3803-2, AC-3803-3]

  security_notes:
    - "A10 / CWE-918: l'indirizzo del catalogo è fisso nel codice, mai preso da una richiesta."
    - "A01 / CWE-306: la rotta del cron risponde solo con CRON_SECRET (come T-1203)."

  out_of_scope:
    - "Aggiungere o togliere modelli dall'elenco senza il root admin (scelta dell'utente del 2026-10-18: segnala e salta)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dalla segnalazione dell'utente del 2026-10-18 (titoli con l'AI non raggiungibili, causa verificata: 429 upstream del modello Gemma gratuito) e dal brainstorming dello stesso giorno (D-46): elenco gestito dal root admin più controllo automatico sul catalogo che segnala e salta.
- Gate umani: nessuno.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): fino a 8 modelli; 25 s di tempo totale per i titoli; si salta al modello successivo anche per una risposta che non supera il controllo; 429 al minuto dell'account trattato come «modelli occupati» senza provare gli altri; cron del catalogo alle 04:30 e aggiornamento dalla card dopo un'ora.
