# 61-plan-data — Macrotask `plan-data`

> Piano per intento di ricerca (D-57), 1 di 3: i dati che servono al nuovo raggruppamento. I primi 10 risultati di Google di ogni keyword, salvati per 30 giorni; i volumi alla fine di ogni ricerca per chi ha i dati con licenza; e, come rete di sicurezza, i volumi chiesti da soli a DataForSEO per le keyword del perimetro che non li hanno ancora.

## Obiettivo del macrotask
Oggi il piano lavora solo sulle parole delle keyword e i volumi arrivano solo se l'utente preme «Aggiungi i volumi» (verificato il 2026-11-12: nessuna keyword dei tre progetti dell'utente ha il volume). Dopo questo modulo:

- **Risultati di Google**: una funzione chiede a DataForSEO (Google Organic SERP, coda priority) i primi 10 risultati organici delle keyword, nella lingua e nel paese del perimetro, e li salva per 30 giorni; una keyword con risultati recenti non si paga di nuovo.
- **Volumi alla fine della ricerca**: per chi ha i dati con licenza i progetti nuovi usano DataForSEO come fornitore dei volumi, quindi ogni ricerca finisce con i volumi e l'utente sceglie tieni/scarta vedendo quanto sono cercate le keyword (scelta dell'utente del 2026-11-13: «alla fine della ricerca»).
- **Volumi da soli prima del piano**: una funzione chiede a DataForSEO i volumi delle keyword tenute del perimetro che non li hanno ancora (progetti esistenti, keyword importate) e li salva sulle keyword, come l'estrazione.
- **Stessi tetti**: ogni richiesta passa dal registro e dai tetti di spesa di T-903 e dalla regola dei dati con licenza (D-30, T-1605): chi non può usare DataForSEO non spende nulla e riceve il motivo.
- Le funzioni dei risultati e dei volumi del perimetro non sono ancora chiamate dal piano: le usa il lavoro di piano del modulo 62.

## Task atomici

```yaml
- id: T-6101
  title: "Risultati di Google delle keyword con DataForSEO, salvati per 30 giorni"
  macrotask: "plan-data"
  depends_on: [T-902, T-903, T-1605]

  objective: >
    Sapere quali pagine Google mostra per ogni keyword, che è il dato con cui il piano capisce quali keyword hanno lo
    stesso intento di ricerca.

  definition_of_done:
    - "Migrazione additiva: tabella keyword_serps (id, language_code, country_code, canonical_keyword, urls text[] con al massimo 10 URL nell'ordine dei risultati, fetched_at) con indice unico su (language_code, country_code, canonical_keyword); nessun testo dei risultati oltre agli URL."
    - "lib/modules/providers/serp/dataforseo-serp.ts: postSerpTasks(items, context) invia i task a POST /v3/serp/google/organic/task_post con priority 2 (coda priority), depth 10, language_code e location_code come per i volumi (dataforseo-targets.ts), a lotti entro il massimo per chiamata della documentazione, e restituisce gli id dei task per canonical; collectSerpTasks(ids, context) legge i task pronti (tasks_ready e task_get/regular), salva gli URL dei soli risultati di tipo organic (al massimo 10, nell'ordine di rank_absolute) e restituisce quelli ancora non pronti. Credenziali solo da DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD; senza credenziali nessuna chiamata e motivo PROVIDER_NOT_CONFIGURED."
    - "lib/modules/plan-data/serps.ts: readFreshSerps(canonicals, context) restituisce i risultati salvati da meno di 30 giorni (SERP_MAX_AGE_DAYS = 30); le keyword con risultati recenti non vengono inviate a DataForSEO."
    - "Spesa: ogni chiamata a pagamento è prenotata e chiusa nel registro metrics_provider_requests con reserveProviderRequest e settleProviderRequest (provider DATAFORSEO, costo stimato dal numero di task per il prezzo della coda priority, costo restituito da DataForSEO alla chiusura); oltre METRICS_MONTHLY_BUDGET_USD o il tetto del lavoro nessuna chiamata e motivo METRICS_BUDGET_EXCEEDED o RUN_BUDGET_EXCEEDED. La spesa compare nella card «Spesa fornitore metriche» come quella dei volumi."
    - "docs/METRICS-PROVIDERS.md: sezione SERP con i fatti verificati nella documentazione di DataForSEO (endpoint, priority, task per chiamata, limiti al minuto, tempi della coda, prezzi per SERP della coda standard, priority e live letti il 2026-11-12 da riverificare alla costruzione)."

  acceptance_criteria:
    - id: AC-6101-1
      given: "credenziali DataForSEO presenti, tetti di spesa sufficienti e fetch simulato che risponde ai task con 12 risultati di cui 11 organic e 1 people_also_ask"
      when: "si inviano e si raccolgono i task di 'noleggio magnetoterapia' e 'noleggio magnetoterapia costo' in it-IT"
      then: "keyword_serps ha 2 righe con language_code 'it' e country_code 'IT', ognuna con i primi 10 URL organic nell'ordine di rank_absolute; il corpo di task_post ha priority 2 e depth 10; metrics_provider_requests ha le richieste chiuse con il costo restituito"
    - id: AC-6101-2
      given: "una riga di keyword_serps per 'noleggio magnetoterapia' in it-IT con fetched_at di 10 giorni fa e una per 'noleggio magnetoterapia costo' di 31 giorni fa"
      when: "si chiedono i risultati delle due keyword"
      then: "readFreshSerps restituisce solo la prima e task_post riceve solo 'noleggio magnetoterapia costo'"
    - id: AC-6101-3
      given: "METRICS_MONTHLY_BUDGET_USD già raggiunto nel mese"
      when: "si chiedono i risultati di una keyword senza risultati salvati"
      then: "fetch non è chiamato, nessuna riga nuova in keyword_serps e l'esito ha il motivo METRICS_BUDGET_EXCEEDED"
    - id: AC-6101-4
      given: "DATAFORSEO_LOGIN assente"
      when: "si chiedono i risultati di una keyword"
      then: "fetch non è chiamato e l'esito ha il motivo PROVIDER_NOT_CONFIGURED"

  target_tests:
    - file: "tests/integration/plan-serps.test.ts"
      covers: [AC-6101-1, AC-6101-2, AC-6101-3, AC-6101-4]

  security_notes:
    - "A02 / CWE-798: credenziali solo dall'ambiente, mai in DB, nei log o nelle risposte; nei log solo id del task, conteggi ed esito."
    - "A06 / CWE-770: spesa limitata dai tetti di T-903 e dal registro condiviso fra istanze."
    - "A03 / CWE-79: gli URL dei risultati sono dati esterni: salvati come testo, mai seguiti dal server, mai resi come HTML."

  out_of_scope:
    - "Titoli, descrizioni, featured snippet e altri elementi della SERP."
    - "Uso dei risultati nel raggruppamento (modulo 63)."

- id: T-6102
  title: "Volumi chiesti da soli per le keyword del perimetro"
  macrotask: "plan-data"
  depends_on: [T-6101, T-1703, T-1903]

  objective: >
    Dare al piano i volumi di ricerca senza che l'utente debba ricordarsi di chiederli, perché senza volumi le priorità
    delle pagine non dicono nulla.

  definition_of_done:
    - "lib/modules/plan-data/volumes.ts: fillPerimeterVolumes(project, settings, context) legge le keyword tenute del perimetro della strategia (stesse clausole di loadPerimeter di T-1903) con metrics_status diverso da ok, le arricchisce con DataForSeoMetricsProvider a lotti da 1000 e salva sulle keyword_candidates i campi delle metriche (metrics_status, metrics_provider DATAFORSEO, avg_monthly_searches, competition, offerte, metrics_precision, metrics_updated_at) e il punteggio ricalcolato con la stessa funzione della fase store dell'estrazione; tieni/scarta non cambia (D-19)."
    - "Le keyword con volume già presente non si richiedono. La quota mensile del fornitore con licenza (T-1703) e i tetti di spesa (T-903) valgono come nell'estrazione; un rifiuto del fornitore o un tetto lasciano le keyword senza volume e restituiscono il motivo (MetricsNotice o MetricsProviderError) per l'avviso del piano."
    - "lib/billing/enforce.ts: canUseLicensedMetrics(actor, workspaceId) con la stessa regola di assertLicensedMetricsChoice (root admin; con il lancio attivo il diritto licensedMetrics del piano); senza diritto fillPerimeterVolumes e le funzioni di T-6101 non chiamano DataForSEO e restituiscono PLAN_NO_LICENSED_METRICS."

  acceptance_criteria:
    - id: AC-6102-1
      given: "un progetto del root admin con 3 keyword tenute senza volume, 1 tenuta con volume 500 e 1 scartata senza volume, provider DataForSEO simulato che restituisce 90, 40 e 10"
      when: "si chiama fillPerimeterVolumes sul perimetro del progetto"
      then: "il provider riceve solo le 3 keyword tenute senza volume; le 3 keyword hanno avg_monthly_searches 90, 40 e 10 con metrics_provider DATAFORSEO e metrics_updated_at valorizzato; la keyword con volume 500 e la scartata non cambiano; review_status di tutte e 5 non cambia"
    - id: AC-6102-2
      given: "un MEMBER non root admin con il lancio commerciale spento"
      when: "si chiama fillPerimeterVolumes sul suo progetto"
      then: "il provider non è chiamato, nessuna keyword cambia e l'esito ha il motivo PLAN_NO_LICENSED_METRICS"
    - id: AC-6102-3
      given: "un progetto del root admin con METRICS_RUN_BUDGET_USD a 0"
      when: "si chiama fillPerimeterVolumes"
      then: "il provider non è chiamato, le keyword restano senza volume e l'esito ha il motivo RUN_BUDGET_EXCEEDED"

  target_tests:
    - file: "tests/integration/plan-volumes.test.ts"
      covers: [AC-6102-1, AC-6102-2, AC-6102-3]

  security_notes:
    - "A01 / CWE-639: le keyword lette e scritte sono solo quelle del progetto autorizzato, con project_id nel where."
    - "A06 / CWE-770: stessi tetti di spesa e quota mensile dell'estrazione."

  out_of_scope:
    - "Aggiornare volumi già presenti o vecchi."
    - "Cambiare il fornitore di metriche dell'argomento (resta quello scelto dall'utente)."

- id: T-6103
  title: "Volumi alla fine di ogni ricerca per chi ha i dati con licenza"
  macrotask: "plan-data"
  depends_on: [T-6102, T-3701]

  objective: >
    Far scegliere le keyword da tenere vedendo già quanto sono cercate, senza dover premere «Aggiungi i volumi».

  definition_of_done:
    - "Creazione del progetto (POST /api/projects, parseProjectCreate) e avvio rapido (POST /api/projects/quick-start): senza metrics_provider nella richiesta, il progetto nasce con DATAFORSEO se canUseLicensedMetrics (T-6102) è vero per chi lo crea nel suo workspace, altrimenti con NONE come oggi; una scelta esplicita (anche NONE) resta quella. Gli argomenti nuovi ereditano dal progetto come oggi, quindi la ricerca arricchisce le keyword trovate con la fase metrics esistente (tetti di spesa, quota mensile, motivi)."
    - "components/project-form.tsx e project-advanced-fields.tsx: per chi ha i dati con licenza il fornitore dei volumi proposto è DataForSEO, con il testo d'aiuto che dice che i volumi arrivano alla fine della ricerca e costano qualche centesimo; testi nei cataloghi it, en, es-ES ed es-419."
    - "I progetti esistenti non cambiano: per loro restano «Aggiungi i volumi» e i volumi chiesti prima del piano (T-6102)."

  acceptance_criteria:
    - id: AC-6103-1
      given: "il root admin con DataForSEO simulato per i volumi e l'autocomplete simulato"
      when: "invia POST /api/projects/quick-start con topic 'noleggio magnetoterapia' e la ricerca arriva in fondo"
      then: "il progetto ha metrics_provider DATAFORSEO; le keyword trovate hanno avg_monthly_searches con metrics_provider DATAFORSEO; metrics_provider_requests ha le richieste della ricerca"
    - id: AC-6103-2
      given: "un MEMBER con email verificata e il lancio commerciale spento"
      when: "invia POST /api/projects/quick-start con topic 'noleggio magnetoterapia'"
      then: "il progetto ha metrics_provider NONE e fetch verso DataForSEO non è chiamato"
    - id: AC-6103-3
      given: "il root admin"
      when: "invia POST /api/projects con metrics_provider NONE"
      then: "il progetto ha metrics_provider NONE"

  target_tests:
    - file: "tests/integration/project-default-metrics.test.ts"
      covers: [AC-6103-1, AC-6103-2, AC-6103-3]

  security_notes:
    - "A01 / CWE-285: la regola dei dati con licenza (D-30) resta lato server; il form propone, la rotta decide."
    - "A06 / CWE-770: la spesa delle ricerche passa dai tetti e dalla quota mensile esistenti (T-903, T-1703)."

  out_of_scope:
    - "Cambiare il fornitore dei progetti esistenti."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-11-12 con l'utente (D-57, design in `docs/superpowers/specs/2026-11-12-plan-clustering-design.md`): «va bene pagare questi pochi centesimi», «fai in modo che titanseo prenda da solo i volumi da dataforseo».
- T-6103 aggiunto il 2026-11-13 sulla scelta dell'utente «alla fine della ricerca» (volumi mentre si scelgono le keyword, non solo dopo); T-6102 resta come rete di sicurezza per i progetti esistenti e le keyword importate.
- Scelte dell'agente, nel design: coda priority, cache di 30 giorni, solo gli URL organic, volumi già presenti non richiesti, chi non ha i dati con licenza non spende; DataForSEO predefinito solo per i progetti nuovi.
- Ordine: dopo il 60; prepara il 62 e il 63.
