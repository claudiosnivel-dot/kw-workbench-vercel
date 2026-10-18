# 39-ai-usage-counter — Macrotask `ai-usage-counter`

> AI più affidabile (D-46), modulo 2 di 2: un registro di ogni richiesta a OpenRouter per capire quante ne reggono davvero i modelli gratuiti, un tetto della piattaforma contato in richieste e condiviso con gli articoli, e un avviso al root admin.

## Obiettivo del macrotask
Con i modelli di riserva (modulo 38) una proposta può costare più richieste, e gli articoli (moduli 40-46) ne costeranno 10-25. Oggi il tetto della piattaforma conta le proposte e nessuno sa quante richieste reggono i modelli gratuiti. Con 10 USD di crediti comprati l'account ha circa 1000 richieste al giorno sui modelli gratuiti (scelta dell'utente del 2026-10-18). Dopo questo modulo:

- **Registro delle richieste**: una riga per ogni tentativo verso OpenRouter, con funzione, modello, esito, status HTTP e durata; mai testi o keyword; conservata 30 giorni.
- **Tetto in richieste**: il tetto della piattaforma conta le richieste delle ultime 24 ore (default 900), per titoli e articoli insieme; restano i limiti per workspace delle proposte di titoli; il root admin è escluso.
- **Contatore e avviso**: nella card una tabella per modello sulle ultime 24 ore e sugli ultimi 7 giorni; in Panoramica un avviso quando l'account ha raggiunto il limite giornaliero o quando i modelli validi sono meno di 5.

## Task atomici

```yaml
- id: T-3901
  title: "Registro delle richieste e tetto della piattaforma in richieste"
  macrotask: "ai-usage-counter"
  depends_on: [T-3802, T-3601]

  objective: >
    Contare ogni richiesta che parte verso OpenRouter, perché il tetto della piattaforma corrisponda al limite vero
    dell'account anche con i modelli di riserva e con gli articoli.

  definition_of_done:
    - "Migrazione additiva 0047_ai_requests: tabella ai_requests (id, created_at, feature 'titles' o 'article', model, outcome con i valori di T-3802, http_status null, duration_ms, workspace_id null, by_root_admin) con indice su created_at e RLS abilitata senza policy (deny by default, T-205); nessuna colonna per testi, keyword o messaggi del fornitore."
    - "requestWithFallback scrive una riga per ogni tentativo (anche quelli del root admin), fuori dalla transazione della funzione che lo usa."
    - "Impostazioni: platformDailyRequests (da 1 a 5000, default 900) al posto di platformDailyLimit; un valore salvato con il solo platformDailyLimit vale il default. Prima di una proposta di titoli si controllano il limite del workspace (come oggi) e poi che le righe di ai_requests delle ultime 24 ore siano meno del tetto, altrimenti 429 RATE_LIMITED con Retry-After; il root admin è escluso da entrambi i controlli."
    - "Righe più vecchie di 30 giorni cancellate dal cron del catalogo (T-3803); docs/AI-TITLES.md con il tetto in richieste e la conservazione."

  acceptance_criteria:
    - id: AC-3901-1
      given: "models [A, B] con A che risponde 429 con provider_name nei metadati e B 200 con titoli validi"
      when: "un MEMBER chiede la proposta per una pagina"
      then: "ai_requests ha 2 righe con feature titles: A provider_busy 429 e B ok 200, con il workspace del progetto; nessuna colonna della riga contiene la keyword principale della pagina"
    - id: AC-3901-2
      given: "platformDailyRequests 3 e 3 righe di ai_requests negli ultimi 60 minuti"
      when: "un MEMBER chiede la proposta, poi il root admin chiede la proposta"
      then: "il MEMBER riceve 429 RATE_LIMITED con Retry-After e il fetch di OpenRouter non è chiamato; il root admin riceve 200"
    - id: AC-3901-3
      given: "righe di ai_requests create 31 giorni fa e 2 giorni fa"
      when: "si invoca il cron del catalogo con il Bearer giusto"
      then: "restano solo le righe di 2 giorni fa"

  target_tests:
    - file: "tests/integration/ai-requests.test.ts"
      covers: [AC-3901-1, AC-3901-2, AC-3901-3]

  security_notes:
    - "A09 / CWE-532: il registro ha solo metadati; testi, keyword e messaggi del fornitore restano fuori."
    - "A01 / CWE-284: ai_requests con RLS senza policy, letta solo dal server."
    - "A04 / CWE-770: il tetto in richieste limita l'uso dell'account condiviso anche con i modelli di riserva."

  out_of_scope:
    - "Limiti in richieste per workspace: i workspace hanno limiti in proposte e in articoli (D-46)."

- id: T-3902
  title: "Contatore per modello nella card e avviso in Panoramica"
  macrotask: "ai-usage-counter"
  depends_on: [T-3901, T-3803, T-3302]

  objective: >
    Mostrare al root admin quante richieste reggono davvero i modelli gratuiti e avvisarlo quando l'account o
    l'elenco dei modelli sono al limite.

  definition_of_done:
    - "GET /api/admin/ai-titles aggiunge usage: per ogni modello con righe negli ultimi 7 giorni, per le ultime 24 ore e per gli ultimi 7 giorni, il numero di richieste, di ok, di provider_busy, di account_daily_limit e degli altri esiti e la durata media degli ok; richieste totali delle ultime 24 ore e tetto."
    - "Card «Titoli con l'AI»: tabella «Uso dei modelli» con quelle colonne e la riga «Richieste nelle ultime 24 ore: N su M» al posto delle proposte; testi it ed en."
    - "Panoramica dell'amministrazione (T-3302), solo per il root admin: avviso «Le richieste gratuite dell'account sono finite almeno una volta nelle ultime 24 ore» se c'è una riga account_daily_limit nelle ultime 24 ore; avviso «Meno di 5 modelli disponibili per l'AI» se i modelli ok o unknown dell'elenco sono meno di 5; ogni avviso porta alla card."

  acceptance_criteria:
    - id: AC-3902-1
      given: "righe di ai_requests per 'a/uno:free' (3 ok da 2000 ms e 4000 ms e 3000 ms, 1 provider_busy nelle ultime 24 ore) e per 'a/due:free' (2 ok di 3 giorni fa)"
      when: "il root admin chiede GET /api/admin/ai-titles"
      then: "usage di 'a/uno:free' ha per 24 ore 4 richieste, 3 ok, 1 provider_busy e durata media 3000; usage di 'a/due:free' ha 0 richieste per 24 ore e 2 per 7 giorni"
    - id: AC-3902-2
      given: "la Panoramica resa con una riga account_daily_limit nelle ultime 24 ore e un elenco con 4 modelli ok"
      when: "il root admin legge la Panoramica"
      then: "ci sono i due avvisi, ciascuno con il link alla card; con nessuna riga account_daily_limit e 5 modelli ok non ce n'è nessuno"
    - id: AC-3902-3
      given: "un admin non root"
      when: "chiede GET /api/admin/ai-titles"
      then: "la risposta è 403 e non contiene usage"

  target_tests:
    - file: "tests/integration/ai-usage.test.ts"
      covers: [AC-3902-1, AC-3902-3]
    - file: "tests/component/admin-ai-usage.test.tsx"
      covers: [AC-3902-2]

  security_notes:
    - "A01 / CWE-285: uso dei modelli e avvisi solo per il root admin."

  out_of_scope:
    - "Contatori o avvisi per gli utenti dei workspace (scelta dell'utente del 2026-10-18: solo il root admin)."

- id: T-3903
  title: "Avviso in Panoramica sulle richieste rifiutate da DataForSEO"
  macrotask: "ai-usage-counter"
  depends_on: [T-3902, T-3704, T-903]

  objective: >
    Far sapere al root admin che DataForSEO sta rifiutando le richieste dei volumi, senza dover aprire la pagina di un
    argomento (scelta dell'utente del 2026-10-18, D-48).

  definition_of_done:
    - "Migrazione 0047_ai_requests (la stessa di T-3901): metrics_provider_requests.provider_code integer null; settleProviderRequest salva il codice di DataForSEO dell'esito (T-3704), null per timeout ed errori di rete."
    - "Panoramica dell'amministrazione, solo per il root admin: se nelle ultime 24 ore ci sono richieste DATAFORSEO non riuscite, l'avviso «DataForSEO ha rifiutato N richieste nelle ultime 24 ore» seguito dal motivo dell'ultima con i testi di keywords.volumes.reason (T-3704: credenziali, account da verificare, codice N, nessuna risposta); testi admin it ed en."

  acceptance_criteria:
    - id: AC-3903-1
      given: "2 richieste DATAFORSEO non riuscite nelle ultime 24 ore, l'ultima con provider_code 40104, e una riuscita"
      when: "il root admin legge la Panoramica"
      then: "l'avviso dice «DataForSEO ha rifiutato 2 richieste nelle ultime 24 ore» con il testo dell'account da verificare"
    - id: AC-3903-2
      given: "nessuna richiesta non riuscita nelle ultime 24 ore, poi le stesse richieste di AC-3903-1 con un admin non root"
      when: "si legge la Panoramica"
      then: "in nessuno dei due casi c'è l'avviso di DataForSEO"
    - id: AC-3903-3
      given: "un fetch simulato di DataForSEO che risponde 403 con status_code 40104"
      when: "si esegue una ricerca con DATAFORSEO"
      then: "la riga di metrics_provider_requests della richiesta ha provider_code 40104"

  target_tests:
    - file: "tests/component/admin-ai-usage.test.tsx"
      covers: [AC-3903-1, AC-3903-2]
    - file: "tests/integration/dataforseo-errors.test.ts"
      covers: [AC-3903-3]

  security_notes:
    - "A01 / CWE-285: avviso solo per il root admin."
    - "A09 / CWE-532: nel registro solo il codice numerico, mai il messaggio del fornitore."

  out_of_scope:
    - "Avvisi per email o notifiche fuori dall'app."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): contatore visibile solo al root admin con l'avviso in Panoramica; tetto unico in richieste condiviso da titoli e articoli; budget di 10 USD di crediti una tantum per circa 1000 richieste al giorno sui modelli gratuiti.
- Gate umani: nessuno.
- Nota per l'utente: dopo l'acquisto dei crediti, tetto della piattaforma e limiti per workspace vanno alzati dalla card (default 900 richieste).
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): conservazione di 30 giorni; tetto da 1 a 5000; avviso dei modelli sotto i 5 contando anche quelli «da verificare».
- Emendamento (2026-10-18, D-48): T-3903 aggiunto su scelta dell'utente (avviso al root admin sulle richieste rifiutate da DataForSEO); il modulo passa a tre task.
