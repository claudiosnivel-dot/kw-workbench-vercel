# 37-quick-start-seeds — Macrotask `quick-start-seeds`

> Parole di partenza più efficaci (D-44): più parole nell'avvio rapido, composizioni nella lingua del progetto e un avviso quando Google trova poche keyword. Con D-45 anche il motivo visibile quando DataForSEO non restituisce i volumi.

## Obiettivo del macrotask
Il campo «Di cosa parla il tuo sito?» dell'avvio rapido (T-2301) porta a scrivere una frase descrittiva, che diventa l'unica parola di partenza: per una frase lunga Google Autocomplete non ha suggerimenti (verificato il 2026-10-18: «letto elettronico ospedaliero» 0 suggerimenti su 45 query, «letto ospedaliero» 165, con il codice di oggi e con quello della prima versione). Le composizioni globali sono in inglese e si aggiungono anche ai progetti in italiano. Dopo questo modulo:

- **Più parole**: l'avvio rapido accetta fino a 5 parole o frasi separate da virgola, ognuna una parola di partenza dello stesso argomento, con un testo d'aiuto che chiede 1-3 parole per idea.
- **Composizioni per lingua**: le composizioni globali hanno una lingua; la ricerca usa solo quelle della lingua del progetto (inglesi per `en`, un set italiano per `it`, nessuna per le altre lingue).
- **Pochi risultati**: a ricerca finita, un argomento con meno di 20 keyword mostra un invito a usare parole più brevi o più generali, con il pulsante per cambiare le parole di partenza.
- **Volumi che non arrivano** (D-45): la password di DataForSEO si legge senza spazi ai lati come il login, e il motivo di una richiesta dei volumi non riuscita resta nell'esito della ricerca e si legge nella pagina dell'argomento, anche dopo la scadenza dei log di Vercel (un'ora sul piano Hobby). Il 2026-10-18 le richieste fallivano con 403 `40104` (account non verificato) senza che l'app lo mostrasse.

## Task atomici

```yaml
- id: T-3701
  title: "Più parole di partenza nell'avvio rapido"
  macrotask: "quick-start-seeds"
  depends_on: [T-2301, T-1605, T-2305]

  objective: >
    Far partire la ricerca da più idee brevi invece che da una sola frase, perché Google Autocomplete trovi
    suggerimenti anche quando l'utente descrive il sito a parole.

  definition_of_done:
    - "POST /api/projects/quick-start: topic diviso sulle virgole; ogni voce senza spazi ai lati, voci vuote tolte, doppioni tolti senza distinzione di maiuscole (resta la prima scrittura); ogni voce da 1 a 200 caratteri (limite delle seed, D-24); da 1 a 5 voci, altrimenti 400 VALIDATION_ERROR senza creare nulla. Le voci diventano, nell'ordine, le seed del primo argomento; nome del progetto e dell'argomento dalla prima voce (quickStartName)."
    - "Limite del piano maxSeedsPerSection controllato sul numero di voci (oggi fisso a 1) con assertWithinLimit, come la creazione normale (T-1605)."
    - "components/quick-start-form.tsx: sotto il campo, nella forma piena e in quella compatta, il testo d'aiuto «1-3 parole per idea; più idee separate da virgola (fino a 5)» e il placeholder «es. scarpe running, scarpe trail»; con più di 5 voci il modulo mostra l'errore sotto il campo senza inviare la richiesta. Testi nei cataloghi dashboard.quickStart it ed en."
    - "Emendamento dichiarato alla costruzione: DoD e AC-2301-1 di T-2301 (modulo 23: più seed dall'avvio rapido) e l'out_of_scope «Creazione di più argomenti in una volta», che resta: le voci sono parole dello stesso argomento."

  acceptance_criteria:
    - id: AC-3701-1
      given: "un MEMBER con email verificata in un workspace senza progetti"
      when: "invia POST /api/projects/quick-start con topic 'letto ospedaliero, Letto elettrico,  materasso antidecubito , letto ospedaliero'"
      then: "la risposta è 201 con extraction started; il progetto si chiama 'Letto ospedaliero'; l'argomento ha le seed 'letto ospedaliero', 'Letto elettrico' e 'materasso antidecubito' in quest'ordine"
    - id: AC-3701-2
      given: "un MEMBER con email verificata"
      when: "invia POST /api/projects/quick-start con 6 voci diverse separate da virgola, poi con topic ' , , '"
      then: "entrambe le risposte sono 400 VALIDATION_ERROR e il numero di progetti non cambia"
    - id: AC-3701-3
      given: "un workspace con il lancio attivo e un piano con maxSeedsPerSection 2"
      when: "un MEMBER invia POST /api/projects/quick-start con 3 voci"
      then: "la risposta è 402 PLAN_LIMIT e il numero di progetti non cambia"
    - id: AC-3701-4
      given: "il modulo dell'avvio rapido reso con un fetch simulato"
      when: "l'utente scrive 6 voci separate da virgola e invia"
      then: "sotto il campo compare l'errore delle 5 voci e il fetch non è stato chiamato; il testo d'aiuto «1-3 parole per idea» è visibile"

  target_tests:
    - file: "tests/integration/quick-start.test.ts"
      covers: [AC-3701-1, AC-3701-2, AC-3701-3]
    - file: "tests/component/quick-start-form.test.tsx"
      covers: [AC-3701-4]

  security_notes:
    - "A06 / CWE-770: al massimo 5 seed per richiesta e il limite del piano maxSeedsPerSection, poi lo stesso budget di query della ricerca (MAX_EXPANSION_QUERIES, T-701)."
    - "A05 / CWE-79: le voci sono testo, rese da React e mai come HTML."

  out_of_scope:
    - "Allargare la ricerca da soli togliendo parole a una frase senza suggerimenti (escluso da D-44)."
    - "Più argomenti creati insieme dall'avvio rapido."

- id: T-3702
  title: "Composizioni nella lingua del progetto"
  macrotask: "quick-start-seeds"
  depends_on: [T-204, T-701, T-1103, T-1202]

  objective: >
    Usare solo composizioni che hanno senso nella lingua delle ricerche, invece di aggiungere frasi inglesi ai
    progetti in italiano.

  definition_of_done:
    - "Migrazione additiva 0046_pattern_language: expansion_patterns.language_code text NOT NULL DEFAULT 'en' (le 8 composizioni globali di oggi restano inglesi); l'indice unico delle righe globali diventa (language_code, pattern) WHERE project_id IS NULL; RLS della tabella invariata."
    - "prisma/seed.ts: DEFAULT_PATTERNS per lingua, en con le 8 di oggi e it con '{seed} per', '{seed} vicino a me', '{seed} recensioni', '{seed} prezzo', '{seed} online', 'migliori {seed}', '{seed} offerte' e '{seed} opinioni' (scelte il 2026-10-18 contando i suggerimenti di Google su quattro parole di prova); seedGlobalDefaults inserisce le righe globali mancanti per (lingua, pattern), sempre in una transazione e senza cancellazioni (T-204)."
    - "Fase expand dei job (T-1202): si usano solo le composizioni abilitate con language_code uguale alla lingua effettiva della ricerca; una lingua senza composizioni usa solo la parola, le lettere e le cifre."
    - "Emendamento dichiarato alla costruzione: AC-204-1 (modulo 02: le righe globali di expansion_patterns diventano 16)."

  acceptance_criteria:
    - id: AC-3702-1
      given: "le composizioni globali del seed, un argomento in italiano con la seed 'letto ospedaliero', uno in inglese con 'running shoes' e uno in spagnolo con 'zapatillas', e un autocomplete simulato"
      when: "si esegue la ricerca di ciascuno"
      then: "le query dell'argomento italiano contengono 'letto ospedaliero prezzo' e nessuna con 'near me' o 'best'; quelle dell'argomento inglese contengono 'best running shoes' e nessuna con 'prezzo'; quelle dell'argomento spagnolo sono solo la parola, la parola con a…z e con 0…9"
    - id: AC-3702-2
      given: "expansion_patterns vuota"
      when: "si esegue seedGlobalDefaults due volte di seguito"
      then: "dopo ciascuna esecuzione le righe globali sono 16, 8 con language_code en e 8 con language_code it"

  target_tests:
    - file: "tests/integration/expansion-language.test.ts"
      covers: [AC-3702-1]
    - file: "tests/integration/seed.test.ts"
      covers: [AC-3702-2]

  security_notes:
    - "A08 / CWE-362: il seed resta transazionale e senza cancellazioni (T-204)."

  out_of_scope:
    - "Composizioni modificabili dall'interfaccia o per singolo progetto."
    - "Set di composizioni per lingue diverse da inglese e italiano."

- id: T-3703
  title: "Avviso quando la ricerca trova poche keyword"
  macrotask: "quick-start-seeds"
  depends_on: [T-2403, T-2404]

  objective: >
    Spiegare all'utente perché la ricerca ha trovato poco e portarlo a cambiare le parole di partenza, invece di
    lasciargli credere che la ricerca non funzioni.

  definition_of_done:
    - "Pagina delle keyword dell'argomento (T-2403): senza job attivo, con almeno una ricerca completata dell'argomento e meno di 20 keyword nell'argomento (tenute e scartate), un riquadro «Google ha pochi suggerimenti per queste parole: prova con parole più brevi o più generali» con il pulsante «Cambia le parole di partenza», che apre il dialogo «Parole di partenza» di T-2404."
    - "Il riquadro non c'è durante una ricerca, senza ricerche completate o da 20 keyword in su; se compare anche «Aggiungi i volumi» (T-2405), l'avviso viene prima. Testi nei cataloghi it ed en."

  acceptance_criteria:
    - id: AC-3703-1
      given: "la pagina di un argomento resa con 3 keyword, nessun job attivo e una ricerca completata"
      when: "l'utente clicca «Cambia le parole di partenza»"
      then: "il riquadro con «Google ha pochi suggerimenti per queste parole» è visibile e si apre il dialogo «Parole di partenza»"
    - id: AC-3703-2
      given: "la stessa pagina resa con 20 keyword, poi con 3 keyword e un job attivo, poi con 0 keyword e nessuna ricerca completata"
      when: "si legge la pagina in ciascun caso"
      then: "in nessuno dei tre casi c'è il riquadro dei pochi suggerimenti"

  target_tests:
    - file: "tests/component/few-keywords-notice.test.tsx"
      covers: [AC-3703-1, AC-3703-2]

  security_notes:
    - "Nessun dato nuovo esposto: il conteggio è quello dell'argomento già autorizzato dalla pagina (T-1502)."

  out_of_scope:
    - "Suggerire da soli parole più brevi o rilanciare la ricerca senza l'utente (D-44)."

- id: T-3704
  title: "Password di DataForSEO ripulita e motivo dei volumi mancanti"
  macrotask: "quick-start-seeds"
  depends_on: [T-902, T-903, T-1202, T-2405]

  objective: >
    Far capire all'utente perché i volumi non sono arrivati e togliere un errore di copia delle credenziali che
    blocca l'accesso a DataForSEO.

  definition_of_done:
    - "lib/env.ts, getDataForSeoCredentials: anche la password senza spazi, tabulazioni e a capo ai lati, come il login; una password fatta solo di spazi vale assente (provider non configurato)."
    - "lib/modules/providers/metrics/dataforseo.ts: per ogni tentativo il codice di DataForSEO (status_code del task, oppure quello della risposta quando lo status HTTP non è 2xx o il task manca) accanto allo status HTTP, che resta la base dei nuovi tentativi; il log dataforseo_request riporta anche code. Un lotto non riuscito porta nell'esito della ricerca metricsProviderError { httpStatus, code } dell'ultimo tentativo, nel result del job come gli altri campi delle metriche (toMetricsResult); mai credenziali, status_message del fornitore o keyword (CWE-532)."
    - "Pagina delle keyword dell'argomento: il riquadro «Aggiungi i volumi» (T-2405) mostra, sotto il testo di oggi, il motivo dell'ultima ricerca completata dell'argomento se il suo result ha metricsProviderError o metricsNotice: per i codici 40100 (credenziali rifiutate) e 40104 (account da verificare nel pannello di DataForSEO), verificati il 2026-10-18, e per ogni metricsNotice un testo del catalogo; per gli altri codici «DataForSEO ha risposto con il codice <code>». Testi nei cataloghi keywords.volumes it ed en."

  acceptance_criteria:
    - id: AC-3704-1
      given: "un ambiente con DATAFORSEO_LOGIN ' utente@example.test ' e DATAFORSEO_PASSWORD con un a capo di Windows finale, poi con DATAFORSEO_PASSWORD fatta solo di spazi"
      when: "si chiama getDataForSeoCredentials"
      then: "la prima volta login e password non hanno spazi né a capo ai lati; la seconda il risultato è null"
    - id: AC-3704-2
      given: "un argomento con DATAFORSEO come fornitore, il root admin e un fetch simulato che risponde HTTP 403 con status_code 40104 e status_message 'Please verify your account before using the API.'"
      when: "si esegue la ricerca dell'argomento fino alla fine"
      then: "il job è completed; le sue keyword hanno metrics_status failed; il result del job ha metricsProviderError con httpStatus 403 e code 40104; la riga di log dataforseo_request ha code 40104 e nessuna riga di log contiene 'Please verify'"
    - id: AC-3704-3
      given: "il riquadro «Aggiungi i volumi» reso con metricsProviderError code 40104, poi con code 40999, poi con metricsNotice RUN_BUDGET_EXCEEDED, poi senza motivo"
      when: "si legge il riquadro in ciascun caso"
      then: "il primo dice che l'account DataForSEO va verificato; il secondo contiene «DataForSEO ha risposto con il codice 40999»; il terzo il testo del tetto di spesa per estrazione; il quarto solo il testo di oggi"

  target_tests:
    - file: "tests/unit/dataforseo-credentials.test.ts"
      covers: [AC-3704-1]
    - file: "tests/integration/dataforseo-errors.test.ts"
      covers: [AC-3704-2]
    - file: "tests/component/add-volumes-reason.test.tsx"
      covers: [AC-3704-3]

  security_notes:
    - "A09 / CWE-532: nei log e nel result solo status HTTP e codice numerico; credenziali e messaggi del fornitore restano fuori."
    - "A05 / CWE-209: la pagina mostra testi del catalogo o il solo codice numerico, mai il testo restituito dal fornitore."

  out_of_scope:
    - "Recupero dei soli volumi senza rifare la ricerca dei suggerimenti (T-2405)."
    - "Avvisi per email o nel pannello di amministrazione sugli errori del fornitore."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dalla segnalazione dell'utente del 2026-10-18 («l'autocomplete non funziona») e dal brainstorming dello stesso giorno (D-44): quattro scelte dell'utente con AskUserQuestion, design approvato in chat. T-3704 aggiunto lo stesso giorno su richiesta dell'utente (D-45), dalla correzione proposta dopo la diagnosi di DataForSEO; il modulo passa a quattro task, uno in più della regola dei macrotask piccoli, per costruirlo nella stessa sessione come chiesto.
- Gate umani: la baseline visiva della dashboard (`dashboard.png`) cambia, perché il campo compatto dell'avvio rapido riceve il testo d'aiuto e il placeholder nuovo (T-3701): va approvata dall'utente prima del merge, come per i macrotask 23 e 24. Approvata dall'utente il 2026-10-18 («approvo immagine, approvo merge»), dopo la costruzione.
- Scelte dell'agente (rilievi, 2026-10-18), confermate dall'utente il 2026-10-18 insieme all'approvazione del modulo: soglia di 20 keyword per l'avviso; nome del modulo `quick-start-seeds`; set italiano delle composizioni (le 8 con più suggerimenti su 16 provate); 400 VALIDATION_ERROR anche per un topic fatto solo di virgole; nome del progetto dalla prima voce; le composizioni seguono la lingua effettiva della ricerca (anche l'eventuale lingua diversa dell'argomento).
- Scelte dell'agente da confermare per T-3704 (2026-10-18): testi dedicati ai soli codici 40100 e 40104, gli unici verificati; il motivo nel riquadro «Aggiungi i volumi» e non altrove; il motivo è quello dell'ultima ricerca completata dell'argomento.
- Note di costruzione (2026-10-18), scelte dell'agente da confermare dall'utente. T-3701: in ogni voce gli spazi ripetuti e gli a capo diventano uno spazio, come prima per il topic; i doppioni si confrontano in minuscolo; la divisione sta in `splitQuickStartTopics` (`lib/modules/quick-start-topics.ts`), la stessa per la rotta e per il modulo della home; il campo ammette fino a 1010 caratteri (5 voci da 200 con i separatori); oltre le 5 voci il messaggio è «Puoi scrivere al massimo 5 idee separate da virgola.» e il campo è collegato al testo d'aiuto con `aria-describedby`. T-3702: l'indice delle righe globali si chiama `expansion_patterns_global_language_pattern_key`; anche le composizioni di progetto (oggi non create dall'interfaccia) hanno la lingua, `en` di default, e seguono la stessa regola; i test della pipeline (golden master, `job-steps`, `job-continuation`, `pipeline-autocomplete-failures`) registrano le loro composizioni con `language_code` it, la lingua dei loro progetti, e lo snapshot del golden master resta invariato. T-3703: riquadro con i colori d'avviso di «Aggiungi i volumi» e l'etichetta «Pochi suggerimenti» per i lettori di schermo; le keyword contate sono tutte quelle dell'argomento, senza i filtri della vista; l'ultima ricerca completata è il job completed dell'argomento con `completed_at` più recente. T-3704: per un timeout o un errore di rete il codice è null e il testo è «DataForSEO non ha risposto in tempo: riprova più tardi.»; se l'esito ha sia `metricsProviderError` sia `metricsNotice` si mostra il motivo del fornitore; un `metricsNotice` senza testo nel catalogo non aggiunge nulla; il codice entra nel testo come stringa, senza separatore delle migliaia; anche il log `dataforseo_batch_failed` riporta `code`.
- Ledger (2026-10-18, costruzione): le righe di D-44 e D-45 non avevano la colonna Stato; aggiunta (DECISA, utente, 2026-10-18), senza cambiare il testo delle decisioni.
- Scelte dell'agente di T-3704 e note di costruzione chiuse dall'utente il 2026-10-18 (D-48): confermati i testi dedicati ai soli codici 40100 e 40104, il motivo nel riquadro «Aggiungi i volumi» dall'ultima ricerca completata, il testo per timeout ed errori di rete, la priorità del motivo del fornitore, il messaggio oltre le 5 voci e i colori d'avviso; aggiunto un avviso in Panoramica per il root admin sulle richieste rifiutate da DataForSEO (T-3903).
