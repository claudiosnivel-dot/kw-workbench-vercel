# 09-google-integrations — Macrotask `google-integrations`

> Volumi di ricerca e integrazioni Google: dismissione dell'API Google Ads per le metriche, contratto unico `MetricsProvider`, fornitore con licenza DataForSEO con tetto di spesa, round-trip CSV con il Keyword Planner del cliente (CLI e interfaccia), OAuth e configurazione di Google Sheets. Nasce dai rilievi dell'audit 2026-10-02 su `lib/modules/providers/metrics/google-keyword-planner.ts`, `app/api/integrations/**`, `lib/modules/google-sheets-export.ts` e sulle card di configurazione, e dalla decisione dell'utente del 2026-10-02 (D-09 emendata, D-30).

## Obiettivo del macrotask

L'API Google Ads non si usa più per le metriche (D-09): la domanda di Basic Access è stata respinta e la
policy di Google limita il Keyword Planner via API agli strumenti per campagne Google Ads. I volumi arrivano
da due strade dietro un'unica interfaccia `MetricsProvider`: (a) il CSV che ogni cliente esporta dal proprio
Keyword Planner e reimporta, strada principale e gratuita, con export e upload direttamente nella pagina
risultati; (b) un fornitore di dati con licenza, DataForSEO (D-30), con limiti di richiesta rispettati, costo
registrato e tetto di spesa. Tutto il codice e i dati dell'integrazione Google Ads vengono rimossi con gate
umano. Per Google Sheets il macrotask rende il flusso OAuth leggibile e revocabile, riduce lo scope a
`drive.file` e rende la configurazione azzerabile.

## Fatti verificati (consultati il 2026-10-02)

I DoD citano solo questi fatti; ciò che non è stato possibile verificare è marcato «da verificare nel task».

| Fatto | Fonte |
|---|---|
| Uso consentito di KeywordPlanIdeaService: «Researching keywords and recommendations … is only used by tools requiring suggestions to help facilitate the creation and management of Google Ads campaigns»; un SaaS SEO non rientra (motivo di D-09) | https://developers.google.com/google-ads/api/docs/api-policy/access-levels |
| DataForSEO: `POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`, autenticazione Basic con login e password dell'account API; un task per chiamata live; fino a 1.000 keyword per richiesta; massimo 12 richieste al minuto per account sugli endpoint live Google Ads | https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/ |
| Keyword: massimo 80 caratteri e 10 parole, convertite in minuscolo; simboli UTF ed emoji non ammessi; «Google Ads may return no data for certain groups of keywords»; keyword simili possono ricevere un volume combinato; se la keyword sembra scritta male il dato è della forma corretta (campo `spell`) | stessa pagina |
| Parametri: `location_code` intero (senza location i dati sono mondiali), `language_code` (es. `en`), `search_partners` default false. Risultato per keyword: `keyword`, `spell`, `search_volume` (intero o null), `competition` (HIGH/MEDIUM/LOW o null), `competition_index` (0-100 o null), `low_top_of_page_bid` e `high_top_of_page_bid` (float), `cpc` (float, USD), `monthly_searches` (12 mesi); ogni risposta e ogni task hanno `cost` in USD; `status_code` 20000 = Ok | stessa pagina |
| Prezzo per richiesta, indipendente dal numero di keyword (fino a 1.000): live 0,09 USD; coda standard (task_post/tasks_ready) 0,06 USD con 1-3 ore | https://dataforseo.com/pricing/keywords-data/google-ads |
| Elenco location: `GET .../v3/keywords_data/google_ads/locations` non addebitato; CSV completo `locations_kwrd_2026_09_01.csv`; Russia e Bielorussia non supportate | https://docs.dataforseo.com/v3/keywords_data/google_ads/locations/ |
| `location_code` = Criteria ID dei geo target Google: confronto completo eseguito il 2026-10-02 tra il CSV DataForSEO (96.429 location) e il CSV geotargets Google 2026-08-12: tutti i 96.429 codici esistono come Criteria ID (es. 2840 Stati Uniti, 2380 Italia, 2376 Israele), 15 differenze solo nel nome canonico (riordino regionale norvegese). Codici paese dell'app senza location di primo livello: AX, BY, CU, IR, KP, RU | CSV DataForSEO sopra + https://developers.google.com/google-ads/api/data/geotargets |
| Lingue: `language_code` secondo ISO 639-1, elenco via `GET .../v3/keywords_data/google_ads/languages`; **elenco completo e corrispondenza con i 55 codici dell'app da verificare nel task** | https://docs.dataforseo.com/v3/keywords_data/google_ads/languages/ |
| Keyword Planner «Ottieni volume di ricerca e previsioni»: caricamento CSV con una sola colonna con intestazione `Keyword`; ogni keyword al massimo 80 caratteri e 10 parole. **Numero massimo di keyword per caricamento: non documentato, da verificare nel task** | https://support.google.com/google-ads/answer/7337243 |
| Colonne UI di Keyword Planner: «Avg. monthly searches», «Competition» (low/medium/high), «Top of page bid (low range)», «Top of page bid (high range)». **Encoding, separatore, righe prima dei nomi colonna del file scaricato, nomi IT, «Competition (indexed value)» e volumi a range: non documentati, da verificare nel task su un file reale** | https://support.google.com/google-ads/answer/3022575 ; https://support.google.com/google-ads/answer/6325025 |
| OAuth: revoca con `POST https://oauth2.googleapis.com/revoke` (parametro `token`, `Content-Type: application/x-www-form-urlencoded`, 200 = revocato); il campo `scope` della risposta token elenca gli scope concessi (separati da spazio); permessi granulari sempre attivi per i client recenti; significato di `invalid_grant` | https://developers.google.com/identity/protocols/oauth2/web-server |
| Scope Sheets: `spreadsheets` = Sensitive; `drive.file` = Recommended, Non-sensitive («only the specific Google Drive files you use with this app»); app non verificata con scope sensibili: schermata «unverified app» e limite di 100 nuovi utenti | https://developers.google.com/workspace/sheets/api/scopes ; https://support.google.com/cloud/answer/7454865 |

## Task atomici

```yaml
- id: T-901
  title: "Contratto MetricsProvider e dismissione del provider Google Keyword Planner via API"
  macrotask: "google-integrations"
  depends_on: [T-304]

  objective: >
    Definire un'unica interfaccia MetricsProvider che riceve la forma di visualizzazione della keyword (con
    accenti), il canonical e la lingua e il paese effettivi, e restituisce metriche indicizzate per canonical
    con precisione e sorgente; poi rimuovere, con approvazione umana di ciascun elemento (L-COL-021), tutto il
    codice, le rotte, la UI, le variabili e i dati dell'integrazione Google Ads, migrando a NONE i progetti e
    le sezioni che usavano GOOGLE_KEYWORD_PLANNER (D-09, D-05).

  definition_of_done:
    - "lib/modules/providers/metrics/types.ts: interfaccia unica MetricsProvider (sostituisce MetricsProviderClient) con id e enrichKeywords(items, context); ogni item ha displayKeyword (keyword originale con accenti) e canonical; context ha languageCode e countryCode effettivi; il risultato è una Map indicizzata per canonical di KeywordMetric con metrics_status, metrics_provider, metrics_precision (exact o range), avg_monthly_searches, competition, offerte in micros, più notice e costUsd facoltativi a livello di esito"
    - "Colonna keyword_candidates.metrics_precision (enum MetricsPrecision exact o range, nullable) creata dal primo tra T-901 e T-910 con migrazione"
    - "lib/modules/pipeline/extraction.ts passa per ogni canonical la keyword di visualizzazione della prima candidata (ordine keyword asc, id asc) e legge le metriche per canonical; salva metrics_precision; il notice del provider finisce in result.metricsNotice del job (convenzione di T-304, T-1605, T-1703); MockMetricsProvider e NoMetricsProvider adeguati; golden master di T-106 aggiornato solo con gate umano"
    - "Proposta di rimozione con, per ogni elemento, il git grep rieseguito al momento del task; l'umano approva o scarta ogni elemento e l'esito è registrato in SESSION-STATE prima del commit (L-COL-021)"
    - "Elementi: lib/modules/providers/metrics/google-keyword-planner.ts (incluso il provider da file GOOGLE_ADS_METRICS_FILE) e il ramo GOOGLE_KEYWORD_PLANNER disattivato da T-304 in factory.ts; lib/integrations/google-ads.ts, lib/integrations/google-ads-config.ts e lib/integrations/google-ads-version.ts se esiste; app/api/integrations/google-ads/** (route, config, connect, callback, disconnect); components/google-ads-integration-card.tsx e il suo uso in app/admin/page.tsx (import, ramo del Promise.all, JSX)"
    - "Elementi: model GoogleAdsCredential e migrazione con DROP TABLE google_ads_credentials; nella stessa migrazione DELETE delle righe app_settings con chiave che inizia per GOOGLE_ADS_ (contengono segreti cifrati); variabili GOOGLE_ADS_* (righe 56-66 e 80 di oggi) tolte da .env.example e dallo schema env di T-201"
    - "Migrazione dei dati: UPDATE a NONE di projects.metrics_provider, subprojects.metrics_provider_override e keyword_candidates.metrics_provider dove valgono GOOGLE_KEYWORD_PLANNER, poi ricreazione dell'enum MetricsProvider senza quel valore (Postgres non elimina valori di un enum: tipo nuovo, ALTER COLUMN ... USING, drop del vecchio); provata prima sullo staging (D-04, T-203); D-05 consente il drop"
    - "Rimossi i riferimenti residui: opzione GOOGLE_KEYWORD_PLANNER in components/project-form.tsx e components/subproject-form.tsx, rami in lib/modules/project-settings.ts (un valore sconosciuto riceve 400 come gli altri valori non validi), avviso PROVIDER_DISABLED di T-304"
    - "Dopo le rimozioni npm run typecheck, npm run lint, npm test e next build terminano con exit code 0 e knip non segnala nuove voci rispetto alla baseline di T-108"

  acceptance_criteria:
    - id: AC-901-1
      given: "le rimozioni approvate applicate e un root admin autenticato"
      when: "chiama GET /api/integrations/google-ads, GET /api/integrations/google-ads/connect e PATCH /api/integrations/google-ads/config"
      then: "tutte e tre le risposte hanno status 404 e la pagina /admin resa non contiene il testo 'Google Keyword Planner'"
    - id: AC-901-2
      given: "un DB di test con un progetto, una sezione e 3 candidate con metrics_provider GOOGLE_KEYWORD_PLANNER, una riga google_ads_credentials e 2 righe app_settings GOOGLE_ADS_"
      when: "si applicano le migrazioni del task"
      then: "progetto, sezione e candidate hanno metrics_provider NONE, pg_enum non contiene GOOGLE_KEYWORD_PLANNER per MetricsProvider, information_schema.tables non contiene google_ads_credentials e app_settings ha 0 righe con chiave che inizia per GOOGLE_ADS_"
    - id: AC-901-3
      given: "il repository dopo le rimozioni"
      when: "il test esegue git grep di GOOGLE_ADS_, GoogleAds, google-ads, GOOGLE_KEYWORD_PLANNER e googleAdsCredential su app, components, lib, prisma/schema.prisma e .env.example"
      then: "ogni ricerca restituisce 0 righe (exit code 1 di git grep)"
    - id: AC-901-4
      given: "una candidata 'Caffè Espresso' (canonical 'caffe espresso') e un MockMetricsProvider spia che restituisce precision 'range' per quel canonical"
      when: "si esegue runExtractionPipeline"
      then: "il provider riceve 1 item con displayKeyword 'Caffè Espresso' e canonical 'caffe espresso', e la riga salvata ha metrics_precision 'range'"

  target_tests:
    - file: "tests/integration/google-ads-removal.test.ts"
      covers: [AC-901-1, AC-901-2]
    - file: "tests/tooling/google-ads-removal.test.ts"
      covers: [AC-901-3]
    - file: "tests/unit/metrics-provider-contract.test.ts"
      covers: [AC-901-4]

  security_notes:
    - "A07 Authentication Failures / CWE-522 (credenziali protette in modo insufficiente): eliminati refresh token OAuth Ads, client secret e developer token cifrati (google_ads_credentials, app_settings GOOGLE_ADS_) che non servono più"
    - "A01 Broken Access Control / CWE-284: rimosse le 5 rotte app/api/integrations/google-ads/**, riducendo la superficie raggiungibile"
    - "A02 Security Misconfiguration / CWE-1188: nessun progetto resta configurato con un provider inesistente; la migrazione porta i valori a NONE prima di ricreare l'enum"
    - "Processo: ogni rimozione è una proposta approvata dall'umano (L-COL-021) con evidenza grep; migrazione provata sullo staging (T-203)"

  out_of_scope:
    - "Fornitore con licenza DataForSEO: T-902"
    - "Import dei volumi dal CSV di Keyword Planner: T-905 (parser) e T-910 (servizio, upload e CLI)"
    - "Codice morto non legato a Google Ads: T-1101"

- id: T-902
  title: "Provider di metriche con licenza (DataForSEO)"
  macrotask: "google-integrations"
  depends_on: [T-901, T-702]

  objective: >
    Implementare il provider DataForSEO dietro MetricsProvider (D-30): richieste live a lotti di al massimo
    1.000 keyword con limitatore, retry e timeout, keyword non accettate filtrate senza chiamata, lingua e
    paese convertiti in language_code e location_code (mai dati mondiali spacciati per locali), risultati
    ricollegati per canonical e costo di ogni richiesta sommato nel risultato del job.

  definition_of_done:
    - "lib/modules/providers/metrics/dataforseo.ts implementa MetricsProvider; valore DATAFORSEO aggiunto all'enum MetricsProvider con migrazione; factory.ts crea il provider per DATAFORSEO"
    - "Richiesta: POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live con header Authorization Basic base64(DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD) e corpo con un solo task {keywords, location_code, language_code, search_partners: false}; location_code sempre presente (senza location DataForSEO restituisce dati mondiali)"
    - "Lotti di al massimo 1.000 keyword (limite documentato); filtro prima della chiamata: più di 80 caratteri, più di 10 parole, simboli non ammessi (emoji e simboli UTF secondo la nota di DataForSEO; insieme esatto dei caratteri ammessi da verificare nel task sull'articolo di help collegato) -> metrics_status missing senza chiamata e conteggio per motivo in result"
    - "Mappa in lib/modules/providers/metrics/dataforseo-targets.ts con commento di provenienza: countryCode -> location_code dalle location di primo livello del CSV DataForSEO 2026-09-01 (coincidono con i Criteria ID Google); AX, BY, CU, IR, KP, RU senza location -> nessuna chiamata, metrics_status missing e metricsNotice LOCATION_UNSUPPORTED; languageCode -> language_code dall'elenco di GET .../google_ads/languages scaricato nel task; lingua senza corrispondenza -> missing e metricsNotice LANGUAGE_UNSUPPORTED"
    - "Parsing: search_volume intero -> avg_monthly_searches, null -> missing per quella keyword; competition_index/100 se presente, altrimenti HIGH/MEDIUM/LOW -> 0.8/0.5/0.2; low_top_of_page_bid e high_top_of_page_bid convertiti in micros (Math.round del valore per 1.000.000, BigInt), valuta delle offerte da verificare nel task (la doc indica USD solo per cpc); metrics_status fetched, metrics_precision exact, metrics_provider DATAFORSEO"
    - "Match: canonicalizeKeyword(result.keyword, languageCode) (firma di T-702) ricollega ogni risultato al canonical richiesto; keyword richieste senza risultato -> missing; risultati con spell non nullo contati in result.metricsSpellCorrected"
    - "Costo: il campo cost (USD) di ogni risposta è sommato in result.metricsCostUsd del job insieme a result.metricsRequests"
    - "Credenziali DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD solo da env validata (T-201) e in .env.example vuote; mai in DB, mai nei log (i log riportano status, id del task e cost); credenziali assenti -> nessuna chiamata, missing e metricsNotice PROVIDER_NOT_CONFIGURED"
    - "Il valore DATAFORSEO è selezionabile in project-form e subproject-form solo dal root admin finché T-1605 non introduce il diritto di piano licensedMetrics; nei test fetch è sempre mockato, nessuna chiamata reale"

  acceptance_criteria:
    - id: AC-902-1
      given: "2.500 keyword valide con canonical distinti tra cui 'Caffè Espresso', progetto it/IT, credenziali di test e un mock che risponde 200 con cost 0.09 per richiesta"
      when: "si chiama enrichKeywords"
      then: "il mock riceve 3 richieste con 1000, 1000 e 500 keyword, ogni corpo ha location_code 2380 e language_code 'it', l'header Authorization vale 'Basic ' più base64 di login:password, la candidata 'caffe espresso' è fetched e result.metricsCostUsd vale 0.27"
    - id: AC-902-2
      given: "una keyword di 81 caratteri, una di 11 parole e una con un'emoji, insieme a 5 keyword valide"
      when: "si chiama enrichKeywords"
      then: "nessun corpo inviato contiene le 3 keyword scartate, che hanno metrics_status 'missing', e il conteggio per motivo riporta 1 per ciascun motivo"
    - id: AC-902-3
      given: "un progetto con country_code 'RU', e separatamente un ambiente senza DATAFORSEO_LOGIN"
      when: "si esegue l'arricchimento delle metriche"
      then: "in entrambi i casi il mock registra 0 richieste verso api.dataforseo.com, tutte le keyword hanno metrics_status 'missing' e result.metricsNotice vale LOCATION_UNSUPPORTED nel primo caso e PROVIDER_NOT_CONFIGURED nel secondo"

  target_tests:
    - file: "tests/unit/dataforseo-provider.test.ts"
      covers: [AC-902-1, AC-902-2, AC-902-3]

  security_notes:
    - "A04 Cryptographic Failures / CWE-798 e CWE-532: credenziali del fornitore solo da env validata, mai nel sorgente, nel DB o nei log"
    - "A06 Insecure Design / CWE-770 (allocazione di risorse senza limiti): lotti da 1.000 keyword e scelta del provider a pagamento riservata al root admin fino a T-1605; limitatore in T-909, tetto di spesa in T-903"
    - "A08 Software or Data Integrity Failures / CWE-345: location_code sempre inviato, lingua e paese non mappati producono missing con motivo, mai volumi mondiali salvati come locali"
    - "A10 Mishandling of Exceptional Conditions / CWE-755: un errore del lotto non produce metriche inventate (le keyword del lotto restano senza volumi)"

  out_of_scope:
    - "Limitatore, timeout e retry: T-909"
    - "Tetto di spesa e registro dei costi: T-903"
    - "Abilitazione per piano e quote per workspace: T-1601, T-1605, T-1703"
    - "Coda standard di DataForSEO (più economica, 1-3 ore): valutabile dopo i job in background del macrotask 12 (D-30)"

- id: T-909
  title: "Provider DataForSEO: limitatore, timeout e retry"
  macrotask: "google-integrations"
  depends_on: [T-902]

  objective: >
    Rispettare il limite di richieste del fornitore e rendere robusta ogni chiamata del provider DataForSEO di
    T-902: al massimo 12 richieste al minuto, timeout per richiesta e retry limitati solo sugli errori
    transitori, senza mai esporre le credenziali nei log. Nato dalla divisione di T-902 (emendamento del
    2026-10-06, rilievo di atomicità).

  definition_of_done:
    - "Limitatore: al massimo 12 richieste in qualunque finestra di 60 secondi (limite documentato per account sugli endpoint live), in memoria per istanza; T-903 lo rende condiviso tra istanze tramite il registro delle richieste"
    - "Timeout con AbortSignal.timeout e numero massimo di tentativi da env validata (T-201); retry con backoff esponenziale e jitter solo su HTTP 429, 5xx e timeout; nessun retry sugli altri 4xx; status_code del task diverso da 20000 trattato come errore del lotto (codici d'errore di DataForSEO e codice del superamento del limite da verificare nel task sulla pagina degli status code)"
    - "Un lotto che esaurisce i tentativi lascia le sue keyword senza volumi (metrics_status failed) e non interrompe gli altri lotti; i log riportano status, id del task e cost, mai login o password"

  acceptance_criteria:
    - id: AC-909-1
      given: "13.000 keyword valide con timer finti, un mock che risponde 500 alla prima chiamata e 200 alle successive, e console spiata"
      when: "si chiama enrichKeywords"
      then: "nessuna finestra di 60 secondi contiene più di 12 richieste, il primo lotto è inviato 2 volte, tutte le keyword risultano fetched e nessun messaggio di console contiene la password di test"

  target_tests:
    - file: "tests/unit/dataforseo-limiter.test.ts"
      covers: [AC-909-1]

  security_notes:
    - "A06 Insecure Design / CWE-770 (allocazione di risorse senza limiti): limitatore a 12 richieste al minuto per istanza e tentativi limitati da env"
    - "A10 Mishandling of Exceptional Conditions / CWE-755: timeout, retry solo sugli errori transitori ed esito per lotto"
    - "A09 Security Logging and Alerting Failures / CWE-532: i log del provider non contengono credenziali"

  out_of_scope:
    - "Limitatore condiviso tra istanze tramite il registro delle richieste: T-903"

- id: T-903
  title: "Tetto di spesa del fornitore e registro dei costi"
  macrotask: "google-integrations"
  depends_on: [T-902, T-909]

  objective: >
    Impedire che il fornitore con licenza generi costi senza controllo: ogni richiesta è registrata con il
    suo costo, un tetto mensile globale e un tetto per singola estrazione bloccano le chiamate oltre soglia
    con un motivo esplicito nel job, e il root admin vede lo speso del mese.

  definition_of_done:
    - "Model MetricsProviderRequest (tabella metrics_provider_requests: id, created_at, provider, project_id nullable con onDelete SetNull, job_id nullable, keyword_count, cost_usd Decimal(10,4), estimated_cost_usd, status) con indice su created_at, creato con migrazione e con RLS abilitata senza policy come le altre tabelle (T-205)"
    - "Env validate (T-201): METRICS_MONTHLY_BUDGET_USD e METRICS_RUN_BUDGET_USD decimali maggiori o uguali a 0, default 0 (nessuna spesa ammessa finché l'operatore non li imposta); METRICS_COST_PER_REQUEST_USD con default 0.09 (prezzo live verificato)"
    - "Prima di ogni richiesta, in una transazione con pg_advisory_xact_lock, si calcola lo speso del mese UTC (somma di cost_usd, o di estimated_cost_usd per le righe ancora in corso) e dell'estrazione corrente; se speso più costo stimato supera il tetto, nessuna chiamata, keyword del lotto missing e result.metricsNotice METRICS_BUDGET_EXCEEDED (mensile) o RUN_BUDGET_EXCEEDED (estrazione); altrimenti si inserisce una riga di prenotazione con estimated_cost_usd"
    - "Dopo la risposta la riga è aggiornata con il cost restituito da DataForSEO e lo status; anche le richieste fallite sono registrate con il cost riportato (0 se assente)"
    - "Il limitatore di T-909 conta anche le righe degli ultimi 60 secondi del registro, così il limite di 12 richieste al minuto vale tra istanze diverse"
    - "Rotta GET /api/admin/metrics-spend riservata al root admin: {month, spentUsd, budgetUsd, requests, keywords}; card 'Spesa fornitore metriche' in app/admin/page.tsx visibile solo al root admin"
    - "Nessuna abilitazione per piano né quota per workspace in questo task (le aggiungono T-1601, T-1605, T-1703)"

  acceptance_criteria:
    - id: AC-903-1
      given: "METRICS_MONTHLY_BUDGET_USD 1.00, righe del mese corrente per 0.95 USD e una sezione con metrics_provider DATAFORSEO"
      when: "si esegue l'estrazione con il fetch del fornitore mockato"
      then: "il mock registra 0 richieste, tutte le candidate hanno metrics_status 'missing', result.metricsNotice vale METRICS_BUDGET_EXCEEDED e il job ha status completed"
    - id: AC-903-2
      given: "METRICS_RUN_BUDGET_USD 0.18, budget mensile ampio, 2.500 keyword valide e un mock che risponde con cost 0.09"
      when: "si esegue l'estrazione"
      then: "il mock registra 2 richieste, le 500 keyword del terzo lotto sono missing, result.metricsNotice vale RUN_BUDGET_EXCEEDED e metrics_provider_requests ha 2 righe con cost_usd 0.09"
    - id: AC-903-3
      given: "budget residuo del mese sufficiente per una sola richiesta e due estrazioni avviate in parallelo"
      when: "entrambe arrivano all'arricchimento delle metriche"
      then: "il mock del fornitore registra esattamente 1 richiesta in totale"
    - id: AC-903-4
      given: "righe di registro per 0.27 USD nel mese corrente e 0.09 USD nel mese precedente"
      when: "il root admin, un ADMIN non root e un SUBSCRIBER chiamano GET /api/admin/metrics-spend"
      then: "il root admin riceve 200 con spentUsd 0.27 e budgetUsd uguale a METRICS_MONTHLY_BUDGET_USD; gli altri due ricevono 403"

  target_tests:
    - file: "tests/integration/metrics-budget.test.ts"
      covers: [AC-903-1, AC-903-2, AC-903-3, AC-903-4]

  security_notes:
    - "A06 Insecure Design / CWE-770 e CWE-400: tetti di spesa mensile e per estrazione, default 0 (fail-closed), prenotazione atomica sotto advisory lock per evitare superamenti concorrenti"
    - "A01 Broken Access Control / CWE-285: la spesa è visibile solo al root admin (requireRootAdminUserFromRequest), verificato con ADMIN non root e SUBSCRIBER"
    - "A09 Security Logging and Alerting Failures / CWE-778: ogni richiesta al fornitore lascia una riga di registro con costo e stato, senza credenziali"

  out_of_scope:
    - "Abilitazione per piano e quote mensili per workspace: T-1601, T-1605, T-1703"
    - "KPI economici del root admin: T-1705"

- id: T-904
  title: "CLI di export keyword per Keyword Planner"
  macrotask: "google-integrations"
  depends_on: [T-702]

  objective: >
    Dare al cliente e all'operatore il primo passo del round-trip con Keyword Planner, che è la strada
    principale per i volumi (D-09): le keyword di un progetto o di una sezione, uniche per canonical, in file
    CSV pronti per «Ottieni volume di ricerca e previsioni», a blocchi di dimensione configurabile, sia da
    CLI sia con il download «Esporta per Keyword Planner» nella pagina risultati.

  definition_of_done:
    - "Logica pura in lib/modules/planner/export-keywords.ts (input: righe candidate, opzioni; output: blocchi e riepilogo), usata sia dalla CLI sia dalla rotta web"
    - "CLI scripts/planner-export.ts eseguita con tsx e registrata come planner:export; argomenti --project <id> obbligatorio, --section <id> facoltativo e appartenente al progetto (altrimenti exit 1 senza file), --chunk <n> intero da 1 a 10.000 con default prudente 1000 (D-26), --out <cartella> con default ./planner-exports/ aggiunta a .gitignore"
    - "Una keyword per canonical (canonicalizeKeyword con il languageCode effettivo della sezione, firma di T-702): come testo la keyword di visualizzazione della prima candidata in ordine keyword asc, id asc; output deterministico"
    - "Keyword oltre i limiti di Keyword Planner (più di 80 caratteri o più di 10 parole, limiti della guida Google Ads) e keyword che iniziano con = + - @ sono saltate e conteggiate per motivo"
    - "Ogni file: UTF-8, prima riga 'Keyword' (modello di caricamento a una colonna della guida Google Ads), poi una keyword per riga; nome <projectId>-<sectionId o all>-partNN.csv"
    - "Download web: rotta GET /api/projects/[id]/planner-export (sectionId facoltativo) che restituisce JSON {canonicals, parts, skipped}; con parametro part=N restituisce il blocco N come text/csv con Content-Disposition attachment; rotta autenticata e filtrata per owner_user_id della sessione (poi membership di workspace con T-1502)"
    - "Componente components/planner-export-download.tsx nella pagina app/projects/[id]/results/page.tsx, accanto all'upload di T-910, con un link per blocco e le istruzioni del round-trip"
    - "Limite massimo di keyword per singolo caricamento in Keyword Planner: non documentato da Google, da verificare nel task con un caricamento reale e annotare in docs/PLANNER-ROUNDTRIP.md insieme alla procedura export -> Keyword Planner -> import (T-910)"

  acceptance_criteria:
    - id: AC-904-1
      given: "2.500 candidate con 2.100 canonical distinti"
      when: "si esegue l'export con --chunk 1000"
      then: "vengono scritti 3 file con 1000, 1000 e 100 keyword più la riga 'Keyword' e nessun canonical compare in due file"
    - id: AC-904-2
      given: "una keyword di 81 caratteri, una di 11 parole e una che inizia con '='"
      when: "si esegue l'export"
      then: "le tre keyword non compaiono in nessun file e il riepilogo riporta 3 keyword saltate con il motivo di ciascuna"
    - id: AC-904-3
      given: "un --section che appartiene a un altro progetto, e separatamente --chunk con valore 0 oppure 'abc'"
      when: "si esegue l'export"
      then: "ogni esecuzione termina con exit code 1, la cartella di output non contiene file nuovi e per --chunk l'output contiene il messaggio d'uso del parametro"
    - id: AC-904-4
      given: "un progetto dell'utente A con 1.500 canonical e un utente B autenticato"
      when: "A chiama GET /api/projects/[id]/planner-export e poi con part=2, e B chiama la stessa rotta"
      then: "A riceve JSON con parts 2 e poi un CSV text/csv con Content-Disposition attachment, prima riga 'Keyword' e 500 righe di keyword; B riceve 404"

  target_tests:
    - file: "tests/unit/planner-export-cli.test.ts"
      covers: [AC-904-1, AC-904-2, AC-904-3]
    - file: "tests/integration/planner-export-route.test.ts"
      covers: [AC-904-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (IDOR): la rotta web filtra progetto e sezione per owner_user_id della sessione e risponde 404 agli altri utenti; la CLI verifica che la sezione appartenga al progetto e non è esposta via HTTP"
    - "A05 Injection / CWE-1236 (CSV formula injection): le keyword che iniziano con = + - @ non vengono scritte nei file"
    - "A02 Security Misconfiguration / CWE-538 (informazioni in file accessibili): la cartella di output della CLI è in .gitignore, i dati di keyword dei clienti non finiscono nel repository"

  out_of_scope:
    - "Import dei volumi dal CSV di Keyword Planner: T-905 (parser) e T-910 (servizio, upload e CLI)"
    - "Export dei risultati in CSV/XLSX per l'utente: T-804 e T-805"

- id: T-905
  title: "Parser del CSV di Keyword Planner"
  macrotask: "google-integrations"
  depends_on: [T-904, T-707]

  objective: >
    Leggere il file che il cliente scarica dal proprio Keyword Planner (anche localizzato, in UTF-16 con
    tabulazioni e con volumi a range) e ricavarne per ogni riga keyword, volume con la sua precisione,
    concorrenza e offerte, primo passo dell'import dei volumi (D-09). Nato dalla divisione di T-905
    (emendamento del 2026-10-06, rilievo di atomicità): servizio, upload e CLI sono in T-910.

  definition_of_done:
    - "Parser in lib/modules/planner/csv-parser.ts: rileva l'encoding dal BOM (UTF-16LE, UTF-16BE, UTF-8 con o senza BOM), il separatore (tab, virgola, punto e virgola) e la riga dei nomi colonna come prima riga che contiene una colonna keyword riconosciuta, saltando le righe di titolo precedenti; encoding, separatore e numero di righe iniziali del file reale da verificare nel task e fissati in una fixture"
    - "Colonne riconosciute per nome, case-insensitive, EN e IT: Keyword, Avg. monthly searches, Competition, Top of page bid (low range), Top of page bid (high range) (nomi EN verificati sulla guida Google Ads); nomi IT e Competition (indexed value) da verificare nel task sul file reale"
    - "Volumi: intero -> metrics_precision exact; range (es. '1K – 10K', trattino lungo o corto, suffissi K/M, decimali localizzati) -> punto medio arrotondato e metrics_precision range (D-17); vuoto o '--' -> nessuna metrica; separatori delle migliaia punto, virgola, spazio e NBSP gestiti"
    - "Offerte convertite in micros (valore per 1.000.000) come BigInt; Competition low/medium/high (anche IT) mappata su 0.2/0.5/0.8"
    - "Fixture in tests/fixtures/planner/: file UTF-16LE con tabulazioni e righe d'intestazione (EN), file con colonne IT, file con volumi a range; appena disponibile un file reale scaricato da Keyword Planner, la fixture principale ne riproduce la struttura (dati anonimizzati)"
    - "Nessuna nuova dipendenza: decodifica con TextDecoder (utf-16le, utf-16be, utf-8)"

  acceptance_criteria:
    - id: AC-905-1
      given: "la fixture UTF-16LE con tabulazioni e righe di titolo prima dei nomi colonna"
      when: "si chiama parsePlannerCsv"
      then: "il numero di righe restituite è uguale alle righe dati della fixture e ogni avgMonthlySearches è un numero uguale al valore atteso dichiarato nel test"
    - id: AC-905-2
      given: "una riga con volume '1K – 10K' e una con '1.200'"
      when: "si chiama parsePlannerCsv"
      then: "la prima ha avgMonthlySearches 5500 e precision 'range', la seconda ha 1200 e precision 'exact'"

  target_tests:
    - file: "tests/unit/planner-csv-parser.test.ts"
      covers: [AC-905-1, AC-905-2]

  security_notes:
    - "A08 Software or Data Integrity Failures / CWE-20 (validazione dell'input): numeri e range validati, righe non interpretabili scartate e conteggiate, nessun aggiornamento parziale fuori transazione"

  out_of_scope:
    - "Abbinamento alle candidate, upload e CLI: T-910"
    - "Export delle keyword verso Keyword Planner: T-904"

- id: T-910
  title: "Import dei volumi da Keyword Planner: servizio, upload e CLI"
  macrotask: "google-integrations"
  depends_on: [T-905, T-904, T-707]

  objective: >
    Chiudere il round-trip con la strada principale per i clienti (D-09): l'upload nella pagina risultati
    del file scaricato dal proprio Keyword Planner, letto dal parser di T-905 e abbinato alle candidate per
    canonical, con aggiornamento di metriche, provider e punteggio in transazione; la stessa funzione è
    disponibile da CLI per l'operatore. Nato dalla divisione di T-905 (emendamento del 2026-10-06).

  definition_of_done:
    - "Migrazione: valore PLANNER_CSV nell'enum MetricsProvider; colonna keyword_candidates.metrics_precision creata qui se T-901 non l'ha già creata; metrics_status 'imported' già esistente"
    - "Servizio applyPlannerImport(projectId, sectionId opzionale, righe) in lib/modules/planner/import.ts: match tramite canonicalizeKeyword(keyword, languageCode effettivo della sezione) (T-702) sul canonical_keyword delle candidate del perimetro; aggiorna avg_monthly_searches, competition, offerte, metrics_provider PLANNER_CSV, metrics_status imported, metrics_precision, metrics_updated_at e ricalcola score e score_source con scoreKeyword (che restituisce {score, score_source}, T-707); tutto in una transazione; ritorna {matched, unmatched, updated, rangeRows}"
    - "Upload, strada principale per i clienti: rotta POST /api/projects/[id]/planner-import (multipart, campo file, sectionId facoltativo) e componente components/planner-import-upload.tsx in evidenza nella pagina app/projects/[id]/results/page.tsx, accanto al download di T-904 e con le istruzioni del round-trip; dimensione massima 5 MB come costante esportata e mostrata in UI; estensioni .csv e .tsv; il file non viene salvato su disco"
    - "CLI per l'operatore scripts/planner-import.ts registrata come planner:import (npm run planner:import -- --project <id> [--section <id>] <file>), stessa funzione applyPlannerImport"
    - "Nessuna nuova dipendenza: multipart letto con request.formData() nativo"

  acceptance_criteria:
    - id: AC-910-1
      given: "un progetto con la candidata 'caffè espresso' (canonical 'caffe espresso', score precedente S0) e un CSV con la riga 'Caffe Espresso' e volume 1200"
      when: "il proprietario invia il file a POST /api/projects/[id]/planner-import"
      then: "la risposta è 200 con matched 1, e la riga in DB ha avg_monthly_searches 1200, metrics_provider PLANNER_CSV, metrics_status imported, score_source metrics e score diverso da S0"
    - id: AC-910-2
      given: "un utente B autenticato e un progetto dell'utente A, e separatamente un file da 6 MB inviato dal proprietario"
      when: "si invia l'upload a POST /api/projects/[id]/planner-import"
      then: "l'utente B riceve 404, il file da 6 MB riceve 413 e in entrambi i casi 0 righe di keyword_candidates hanno metrics_updated_at modificato"

  target_tests:
    - file: "tests/integration/planner-import.test.ts"
      covers: [AC-910-1, AC-910-2]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (IDOR): progetto e sezione filtrati per owner_user_id della sessione (poi membership di workspace con T-1502); gli update usano un where che include project_id"
    - "A06 Insecure Design / CWE-400 (consumo di risorse non controllato): limite di 5 MB verificato sul Content-Length e sui byte letti, tetto di righe, parsing in memoria senza file temporanei"
    - "A05 Injection / CWE-89: valori del CSV scritti solo tramite query parametrizzate di Prisma; nessun SQL composto a mano"

  out_of_scope:
    - "Parser del file di Keyword Planner: T-905"
    - "Export delle keyword verso Keyword Planner: T-904"
    - "Diritti di piano per l'import (plannerImport): T-1601 e T-1605"

- id: T-906
  title: "OAuth Google Sheets: errori in UI, scope verificati, token revocati"
  macrotask: "google-integrations"
  depends_on: [T-503]

  objective: >
    Rendere il flusso OAuth di Google Sheets leggibile e coerente: errori mostrati nella pagina Personalizza
    invece di JSON grezzo, scope concessi verificati al callback, cookie di state sempre cancellato, motivo
    d'errore ridotto a codici noti, invalid_grant riconosciuto e mostrato come 'da ricollegare', revoca del
    token alla disconnessione e fallimenti di decifratura registrati. L'OAuth di Google Ads non esiste più
    (rimosso da T-901).

  definition_of_done:
    - "app/api/integrations/google-sheets/connect/route.ts: configurazione OAuth mancante o sessione scaduta -> redirect 302 a /personalizza con google_sheets=error e reason config_oauth_mancante o sessione_scaduta, invece di JSON"
    - "Callback Sheets: il campo scope della risposta token (scope concessi, separati da spazio) deve contenere lo scope richiesto da connect (oggi auth/spreadsheets, auth/drive.file dopo T-907), letto da una costante condivisa tra connect e callback; se manca, nessuna credenziale salvata e reason scope_mancante"
    - "Il cookie kwb_google_sheets_oauth_state è cancellato con maxAge 0 su tutti i return della callback, inclusi errore Google, state non valido e configurazione mancante"
    - "reason nell'URL è sempre un codice di una whitelist (accesso_negato, stato_non_valido, config_oauth_mancante, scope_mancante, scambio_token_fallito, sessione_scaduta), mai error.message né error_description di Google; GoogleSheetsPersonalCard mostra il testo italiano del codice e un testo generico per codici sconosciuti"
    - "invalid_grant al rinnovo del token in refreshUserAccessToken (lib/modules/google-sheets-export.ts) -> errore tipizzato GoogleReauthRequiredError e valorizzazione della nuova colonna google_sheets_credentials.reauth_required_at (migrazione); un nuovo consenso la azzera"
    - "getGoogleSheetsCredentialSnapshot espone status connected, reauth_required o disconnected; la card mostra 'Da ricollegare' con il link di connessione quando status è reauth_required; l'export Sheets risponde 409 con code GOOGLE_REAUTH_REQUIRED"
    - "disconnect: POST https://oauth2.googleapis.com/revoke con il refresh token decifrato (application/x-www-form-urlencoded) prima della cancellazione; revoca fallita o in timeout -> credenziale eliminata comunque e risposta {success: true, revoked: false}"
    - "Decifratura fallita in lib/integrations/app-settings.ts (getManySettingValues, getSettingValue) e lib/integrations/google-sheets.ts: console.error con chiave o id del record e nome dell'errore, mai il valore cifrato; la credenziale illeggibile è riportata come reauth_required invece che come assente"

  acceptance_criteria:
    - id: AC-906-1
      given: "configurazione OAuth Google Sheets assente in DB ed env e un utente autenticato"
      when: "si chiama GET /api/integrations/google-sheets/connect"
      then: "la risposta è 302 con Location '/personalizza?google_sheets=error&reason=config_oauth_mancante' e Content-Type non è application/json"
    - id: AC-906-2
      given: "una callback Sheets con state valido che riceve error='<b>x</b>' oppure, in un secondo caso, una risposta token con scope 'openid email' senza lo scope richiesto"
      when: "l'utente arriva su GET /api/integrations/google-sheets/callback"
      then: "la risposta è 302 con reason 'accesso_negato' nel primo caso e 'scope_mancante' nel secondo, la Location non contiene '<b>', google_sheets_credentials ha 0 righe per l'utente e Set-Cookie riporta kwb_google_sheets_oauth_state con Max-Age=0"
    - id: AC-906-3
      given: "una credenziale Sheets collegata e un endpoint token mock che risponde 400 con error invalid_grant"
      when: "l'utente chiama POST /api/projects/[id]/export/google-sheets e poi GET /api/integrations/google-sheets"
      then: "l'export risponde 409 con code GOOGLE_REAUTH_REQUIRED, reauth_required_at non è null e lo snapshot ha data.status 'reauth_required'"
    - id: AC-906-4
      given: "una credenziale Sheets collegata con refresh token noto, e un secondo caso in cui l'endpoint di revoca risponde 500"
      when: "l'utente chiama POST /api/integrations/google-sheets/disconnect"
      then: "il mock riceve 1 POST a https://oauth2.googleapis.com/revoke con token uguale al refresh token; la risposta è 200 con revoked true nel primo caso e revoked false nel secondo; google_sheets_credentials ha 0 righe per l'utente in entrambi i casi"

  target_tests:
    - file: "tests/integration/oauth-google.test.ts"
      covers: [AC-906-1, AC-906-2, AC-906-3, AC-906-4]

  security_notes:
    - "A07 Authentication Failures / CWE-613: revoca del refresh token alla disconnessione e marcatura reauth_required su invalid_grant; nessun token revocato resta in uso"
    - "A01 Broken Access Control / CWE-352 (CSRF sul callback OAuth): state casuale confrontato con il cookie e cookie cancellato su ogni uscita; credenziale sempre letta e scritta per user_id della sessione"
    - "A06 Insecure Design / CWE-863 (autorizzazione errata): gli scope realmente concessi sono verificati, il consenso granulare non produce credenziali parziali"
    - "A05 Injection / CWE-79 (contenuto riflesso): reason limitato a una whitelist di codici, mai testo proveniente da Google o da eccezioni"
    - "A09 Security Logging and Alerting Failures / CWE-778 e CWE-532: i fallimenti di decifratura sono registrati senza valori cifrati né token"

  out_of_scope:
    - "Riduzione dello scope Sheets a drive.file: T-907"
    - "Azzeramento della configurazione OAuth salvata: T-908"
    - "Rimozione dell'OAuth Google Ads: T-901"

- id: T-907
  title: "Google Sheets con scope minimo drive.file"
  macrotask: "google-integrations"
  depends_on: [T-906]

  objective: >
    Ridurre lo scope OAuth di Google Sheets da spreadsheets (sensibile, verifica Google necessaria e limite
    di 100 nuovi utenti per app non verificate) a drive.file (non sensibile), sufficiente perché l'export
    crea solo file nuovi; le connessioni esistenti vengono invitate a ricollegarsi.

  definition_of_done:
    - "app/api/integrations/google-sheets/connect/route.ts richiede lo scope 'https://www.googleapis.com/auth/drive.file openid email' al posto di auth/spreadsheets (drive.file: Recommended, Non-sensitive nella tabella ufficiale degli scope Sheets)"
    - "La callback Sheets (verifica di T-906) richiede drive.file tra gli scope concessi"
    - "lib/modules/google-sheets-export.ts usa solo la creazione dello spreadsheet e la scrittura dei valori sul file appena creato (eventuale pulizia del file orfano di T-806 sullo stesso id); verifica end-to-end con un account Google reale a carico dell'utente, esito registrato in SESSION-STATE"
    - "getGoogleSheetsCredentialSnapshot espone needsReconnect true quando lo scope salvato in google_sheets_credentials non contiene drive.file; GoogleSheetsPersonalCard mostra l'invito a ricollegarsi con il link /api/integrations/google-sheets/connect"
    - "docs/GOOGLE-SHEETS.md: passi per aggiornare la schermata di consenso OAuth nel progetto Google Cloud (rimuovere spreadsheets, aggiungere drive.file) come azione dell'utente, con riferimento alla pagina ufficiale degli scope"

  acceptance_criteria:
    - id: AC-907-1
      given: "configurazione OAuth Sheets valida e un utente autenticato"
      when: "si chiama GET /api/integrations/google-sheets/connect"
      then: "la Location punta ad accounts.google.com e il parametro scope contiene 'auth/drive.file' e non contiene 'auth/spreadsheets'"
    - id: AC-907-2
      given: "una callback Sheets con state valido e risposta token con scope 'openid email https://www.googleapis.com/auth/drive.file'"
      when: "l'utente completa la callback e poi chiama GET /api/integrations/google-sheets"
      then: "google_sheets_credentials ha 1 riga con scope contenente 'drive.file' e lo snapshot ha data.needsReconnect false"
    - id: AC-907-3
      given: "una credenziale esistente con scope 'https://www.googleapis.com/auth/spreadsheets openid email'"
      when: "l'utente chiama GET /api/integrations/google-sheets"
      then: "lo snapshot ha data.needsReconnect true e data.status 'connected'"
    - id: AC-907-4
      given: "una credenziale con drive.file e un mock delle API Google che restituisce spreadsheetId 'S1' alla creazione"
      when: "l'utente chiama POST /api/projects/[id]/export/google-sheets"
      then: "ogni richiesta registrata verso sheets.googleapis.com o www.googleapis.com/drive riguarda la creazione oppure lo spreadsheetId 'S1' e nessun altro id"

  target_tests:
    - file: "tests/integration/sheets-scope.test.ts"
      covers: [AC-907-1, AC-907-2, AC-907-3, AC-907-4]

  security_notes:
    - "A01 Broken Access Control / CWE-272 (violazione del minimo privilegio): con drive.file l'app accede solo ai file che crea, non a tutti i fogli dell'utente"
    - "A06 Insecure Design / CWE-250 (privilegi non necessari): lo scope sensibile spreadsheets viene rimosso dalla richiesta e dalla schermata di consenso"

  out_of_scope:
    - "Robustezza dell'export Sheets (batch, file orfani, titoli dei fogli): T-806"

- id: T-908
  title: "Configurazione OAuth di Google Sheets: valori azzerabili e feedback"
  macrotask: "google-integrations"
  depends_on: [T-906]

  objective: >
    Rendere gestibile la configurazione globale OAuth di Google Sheets, l'unica integrazione configurabile
    da UI: un override salvato in DB si può rimuovere per tornare al valore di ambiente, gli input sono
    validati lato server in modo atomico e la card aggiorna stato e messaggi dopo il salvataggio. Le
    credenziali DataForSEO stanno solo in env (T-902) e non hanno UI.

  definition_of_done:
    - "PATCH /api/integrations/google-sheets/config: campo assente o stringa vuota = invariato; campo null = eliminazione dell'override (deleteSettingValue) e ritorno al valore env"
    - "Le scritture di una PATCH avvengono in una sola prisma.$transaction (oggi Promise.all di upsert indipendenti in updateGoogleSheetsApiConfig)"
    - "Validazione server prima di ogni scrittura: redirectUri URL https (http ammesso solo per localhost) che termina con /api/integrations/google-sheets/callback; clientId che termina con .apps.googleusercontent.com; valore non valido -> 400 con code e nessuna scrittura"
    - "getGoogleSheetsApiConfigSnapshot riporta per ogni campo la fonte (db, env, none); per il client secret solo hasClientSecret e fonte, mai il valore"
    - "components/google-sheets-api-config-card.tsx: router.refresh() dopo il salvataggio riuscito, così hasClientSecret e il placeholder si aggiornano; messaggio di esito in un elemento role=status; pulsante 'Rimuovi override' per i campi con fonte db che invia null"
    - "Nessuna rotta né UI per le credenziali del fornitore di metriche: DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD restano solo nell'env validata (T-201, T-902)"

  acceptance_criteria:
    - id: AC-908-1
      given: "un override in app_settings GOOGLE_SHEETS_OAUTH_CLIENT_ID = 'db-id.apps.googleusercontent.com' e la variabile d'ambiente con 'env-id.apps.googleusercontent.com'"
      when: "il root admin invia PATCH /api/integrations/google-sheets/config con {clientId: null}"
      then: "la risposta è 200, app_settings non contiene la chiave GOOGLE_SHEETS_OAUTH_CLIENT_ID e lo snapshot riporta clientId 'env-id.apps.googleusercontent.com' con fonte 'env'"
    - id: AC-908-2
      given: "una configurazione salvata e un utente ADMIN non root, oltre al root admin"
      when: "il root admin invia PATCH con {redirectUri: 'ftp://x'} e l'ADMIN non root invia una PATCH valida"
      then: "la PATCH del root admin riceve 400, quella dell'ADMIN non root riceve 403 e nessuna riga di app_settings ha updated_at modificato"
    - id: AC-908-3
      given: "GoogleSheetsApiConfigCard renderizzata con clientId di fonte db e fetch mock che risponde 200 alla PATCH"
      when: "l'utente salva la configurazione e poi clicca 'Rimuovi override' sul campo Client ID"
      then: "dopo il salvataggio router.refresh è chiamato esattamente 1 volta e un elemento con role status contiene il messaggio di esito; il secondo corpo inviato vale {clientId: null}"
    - id: AC-908-4
      given: "un client secret salvato con valore 'SHEETS-SECRET-1' e il repository dopo il task"
      when: "il root admin chiama GET /api/integrations/google-sheets/config e il test elenca i file sotto app/api"
      then: "il corpo della risposta non contiene 'SHEETS-SECRET-1' e ha data.hasClientSecret true; nessun percorso sotto app/api contiene 'dataforseo'"

  target_tests:
    - file: "tests/integration/integration-config.test.ts"
      covers: [AC-908-1, AC-908-2, AC-908-4]
    - file: "tests/component/google-sheets-config-card.test.tsx"
      covers: [AC-908-3]

  security_notes:
    - "A02 Security Misconfiguration / CWE-1188 (default insicuro persistente): un override DB non più valido si può rimuovere e non vince per sempre sulla configurazione d'ambiente"
    - "A01 Broken Access Control / CWE-285: la rotta di configurazione resta riservata al root admin (requireRootAdminUserFromRequest), verificato con un ADMIN non root"
    - "A01 Broken Access Control / CWE-200 (esposizione di informazioni): il client secret non è mai restituito dalle API, solo hasClientSecret e fonte; le credenziali del fornitore non hanno alcuna rotta"
    - "A04 Cryptographic Failures / CWE-311: i valori restano cifrati in app_settings con encryptSecret; la rimozione di un override cancella la riga cifrata invece di salvare un valore vuoto"

  out_of_scope:
    - "Errori del flusso OAuth: T-906"
    - "Credenziali e limiti del fornitore di metriche: T-902 e T-903"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0 (in isolamento i soli riferimenti non risolti sono T-304, T-702, T-707 e T-503, di altri moduli).
- Semantico: `self-check-checklist.md` punti 6-10 applicati a T-901..T-908; rilievo di atomicità aperto su T-901 (contratto + rimozione + migrazione dell'enum) e T-905, da confermare o dividere con l'utente.
- **Emendamento 2026-10-06** (all'avvio del BUILD, decisione dell'utente del 2026-10-05 sui rilievi di atomicità): T-902 diviso in T-902 (richiesta, lotti, filtro, mappe, parsing, costo, credenziali; AC-902-1…3) e T-909 (limitatore, timeout e retry; l'AC-902-4 diventa AC-909-1 con lo stesso testo, target test `tests/unit/dataforseo-limiter.test.ts`); T-905 diviso in T-905 (parser e fixture; AC-905-1, AC-905-2) e T-910 (migrazione PLANNER_CSV, servizio, upload e CLI; gli AC-905-3 e AC-905-4 diventano AC-910-1 e AC-910-2 con lo stesso testo). Le voci di DoD sono le stesse, ripartite; in più T-909 esplicita l'esito del lotto che esaurisce i tentativi (metrics_status failed, gli altri lotti proseguono). T-903 dipende anche da T-909. I riferimenti a T-905 negli altri moduli per servizio, upload e ricalcolo del punteggio valgono per T-910.
