# 09-google-integrations — Macrotask `google-integrations`

> Keyword Planner (API ufficiale, CLI di diagnosi, round-trip CSV), OAuth Google per Ads e Sheets e configurazione delle integrazioni: nasce dai rilievi dell'audit 2026-10-02 su `lib/modules/providers/metrics/google-keyword-planner.ts`, sulle rotte `app/api/integrations/**`, su `lib/modules/google-sheets-export.ts` e sulle card di configurazione.

## Obiettivo del macrotask

Rendere affidabili i volumi di ricerca e le integrazioni Google. Oggi il provider Keyword Planner usa
`generateKeywordIdeas` (idee correlate, non metriche delle keyword richieste), non converte i campi int64
che l'API REST restituisce come stringhe, scarta tutti i batch se uno fallisce e non ha timeout né retry;
l'OAuth risponde con JSON grezzo, non verifica gli scope concessi, non revoca i token e non gestisce
`invalid_grant`; la configurazione salvata in DB non si può azzerare. Il macrotask porta il provider su
`generateKeywordHistoricalMetrics`, aggiunge una CLI di diagnosi e il round-trip CSV con Keyword Planner
(D-09: API ufficiale + CSV; niente fornitori terzi, niente scraping), riduce lo scope Sheets a `drive.file`
e rende la configurazione azzerabile e con feedback.

## Fatti verificati sulla documentazione Google (consultata il 2026-10-02)

I DoD citano solo questi fatti; ciò che non è stato possibile verificare è marcato «da verificare nel task».

| Fatto | Fonte |
|---|---|
| Endpoint REST: `POST https://googleads.googleapis.com/v25/customers/{customerId}:generateKeywordHistoricalMetrics`; `GET .../v25/customers:listAccessibleCustomers` | Documento discovery REST `https://googleads.googleapis.com/$discovery/rest?version=v25` |
| Richiesta storica: massimo 10.000 keyword, massimo 10 `geoTargetConstants`, `language` facoltativa; deduplica quasi-esatta («car»/«cars» restituiti come una sola voce); risultato = `text` + `closeVariants` + `keywordMetrics` | https://developers.google.com/google-ads/api/reference/rpc/v25/GenerateKeywordHistoricalMetricsRequest e .../GenerateKeywordHistoricalMetricsResult |
| `avgMonthlySearches`, `competitionIndex`, `lowTopOfPageBidMicros`, `highTopOfPageBidMicros` sono int64 serializzati come stringa JSON; `competition` è un enum `UNSPECIFIED/UNKNOWN/LOW/MEDIUM/HIGH`; `competitionIndex` in [0, 100] | discovery v25 (type string, format int64); https://protobuf.dev/programming-guides/json/ ; https://developers.google.com/google-ads/api/reference/rpc/v25/KeywordPlanHistoricalMetrics |
| `KeywordSeed`/`KeywordAndUrlSeed` di `generateKeywordIdeas`: da 1 a 20 keyword | https://developers.google.com/google-ads/api/reference/rpc/v25/KeywordSeed |
| `GenerateKeywordIdeas`, `GenerateKeywordHistoricalMetrics`, `GenerateKeywordForecastMetrics`: 1 richiesta al secondo per CID, violazione = `RESOURCE_EXHAUSTED`; quote giornaliere: Test 15.000 (solo account di test), Explorer 2.880 su produzione, Basic 15.000 | https://developers.google.com/google-ads/api/docs/best-practices/quotas |
| Livelli d'accesso Test / Explorer / Basic / Standard; Explorer **esclude** `KeywordPlanIdeaService` (serve Basic o Standard); Basic richiede la verifica del brand del progetto Google Cloud | https://developers.google.com/google-ads/api/docs/api-policy/access-levels |
| Developer token dismessi il 9 settembre 2026: il livello d'accesso appartiene al progetto Google Cloud che possiede il client OAuth; l'header `developer-token` è facoltativo e ignorato | https://developers.google.com/google-ads/api/docs/api-policy/developer-token |
| v25: progetto con accesso Test su account di produzione = `AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (v24 e precedenti: `ACTION_NOT_PERMITTED`); `DEVELOPER_TOKEN_NOT_APPROVED` è deprecato | stessa pagina + https://developers.google.com/google-ads/api/reference/rpc/v25/AuthorizationErrorEnum.AuthorizationError |
| `USER_PERMISSION_DENIED` = manca `login-customer-id` (ID manager senza trattini); `CLIENT_CUSTOMER_ID_INVALID` = «123-456-7890 should be 1234567890»; `invalid_grant` frequente se il progetto OAuth è in stato Testing (refresh token scade dopo 7 giorni) | https://developers.google.com/google-ads/api/docs/get-started/common-errors |
| Errori REST: `details[]` con `@type ...GoogleAdsFailure`, `errors[].errorCode.{tipoErrore}`, `requestId`; retry con backoff esponenziale e jitter per `TRANSIENT_ERROR`/`INTERNAL_ERROR` | https://developers.google.com/google-ads/api/docs/get-started/handle-errors ; https://developers.google.com/google-ads/api/docs/best-practices/error-types |
| Versioni: v25 è l'ultima (v25.2 del 23/09/2026); v22 sunset ottobre 2026 (tentativo); dopo il sunset le richieste falliscono | https://developers.google.com/google-ads/api/docs/sunset-dates |
| Lingue Google Ads: `it` 1004, `en` 1000, ...; codici diversi dall'app: ebraico `iw` (1027), cinese `zh_CN` (1017) / `zh_TW` (1018), filippino `tl` (1042); assenti: `si`, `eu`, `gl`, `af`, `sw`, `am` | https://developers.google.com/google-ads/api/data/codes-formats (sezione Languages) |
| Geo target: CSV zippato (2026-08-12) con colonne Criteria ID, Name, Canonical Name, Parent ID, Country Code, Target Type, Status. Voci di primo livello (Parent ID vuoto): 219 `Country` + 27 `Region` (es. HK 2344, TW 2158, PR 2630) = 245 dei 249 codici di `COUNTRY_CODES`; senza geo target: AX, CU, IR, KP. Esempi: IT 2380, US 2840, IL 2376 | https://developers.google.com/google-ads/api/data/geotargets |
| Keyword Planner «Get search volume and forecasts»: caricamento CSV con una sola colonna con intestazione `Keyword`; ogni keyword al massimo 80 caratteri e 10 parole. **Numero massimo di keyword per caricamento: non documentato → da verificare nel task** | https://support.google.com/google-ads/answer/7337243 |
| Colonne UI: «Avg. monthly searches», «Competition» (low/medium/high), «Top of page bid (low range)», «Top of page bid (high range)». **Encoding, separatore, righe prima dei nomi colonna del file scaricato, nomi IT, «Competition (indexed value)» e volumi a range: non documentati → da verificare nel task su un file reale** | https://support.google.com/google-ads/answer/3022575 ; https://support.google.com/google-ads/answer/6325025 |
| OAuth: revoca con `POST https://oauth2.googleapis.com/revoke` (parametro `token`, `Content-Type: application/x-www-form-urlencoded`, 200 = revocato); il campo `scope` della risposta token elenca gli scope concessi (separati da spazio); permessi granulari sempre attivi per i client recenti; significato di `invalid_grant` | https://developers.google.com/identity/protocols/oauth2/web-server |
| Scope Sheets: `spreadsheets` = Sensitive; `drive.file` = Recommended, Non-sensitive («only the specific Google Drive files you use with this app»); app non verificata con scope sensibili: schermata «unverified app» e limite di 100 nuovi utenti | https://developers.google.com/workspace/sheets/api/scopes ; https://support.google.com/cloud/answer/7454865 |
| Scope OAuth richiesto da Google Ads API: `https://www.googleapis.com/auth/adwords` | https://developers.google.com/google-ads/api/reference/rpc/v25/KeywordPlanIdeaService/GenerateKeywordHistoricalMetrics |

## Task atomici

```yaml
- id: T-901
  title: "Keyword Planner: parsing numerico, batch parziali, retry e timeout"
  macrotask: "google-integrations"
  depends_on: [T-304]

  objective: >
    Rendere il provider GoogleKeywordPlannerMetricsProvider corretto sui dati che riceve e tollerante
    ai guasti parziali: conversione esplicita dei campi int64 che l'API REST serializza come stringhe,
    uso di competitionIndex, esito indipendente per batch, timeout e retry limitati con rispetto del
    limite di 1 richiesta al secondo per customer, customer id normalizzato e cache del token legata
    alla credenziale. Resta su generateKeywordIdeas: il passaggio alle metriche storiche è T-902.

  definition_of_done:
    - "In lib/modules/providers/metrics/google-keyword-planner.ts un parser unico converte avgMonthlySearches, competitionIndex, lowTopOfPageBidMicros e highTopOfPageBidMicros (stringhe decimali int64 nel JSON REST, verificato sul discovery v25): avg_monthly_searches diventa un intero finito maggiore o uguale a 0 (stringa non numerica o negativa -> undefined), i micros diventano BigInt; nessun cast 'as number' sul payload"
    - "competition calcolata da competitionIndex (0-100 -> 0..1) quando presente, altrimenti dall'enum LOW/MEDIUM/HIGH (0.2/0.5/0.8 come oggi); UNSPECIFIED e UNKNOWN -> undefined"
    - "Esito per batch: un batch fallito marca metrics_status failed solo per le proprie keyword; le keyword dei batch riusciti restano fetched (oggi il catch esterno di enrichKeywords restituisce buildMissingMetrics(keywords, failed) per tutte)"
    - "Ogni fetch (token OAuth e chiamata Google Ads) usa AbortSignal.timeout con valore letto da env validata (T-201, helper envInt), default dichiarato nel codice"
    - "Retry con backoff esponenziale e jitter solo su HTTP 429, 5xx, timeout e codici RESOURCE_EXHAUSTED, TRANSIENT_ERROR, INTERNAL_ERROR letti da error.details[].errors[].errorCode; nessun retry sugli altri 4xx; numero massimo di tentativi da env validata; nessuna attesa dopo l'ultimo tentativo"
    - "Pacing: tra due richieste KeywordPlanIdeaService verso lo stesso customer intercorre almeno 1 secondo (limite ufficiale 1 richiesta al secondo per CID)"
    - "batchSize effettivo limitato a 20 (KeywordSeed accetta da 1 a 20 keyword); un valore di configurazione maggiore viene ridotto a 20 con console.warn che riporta solo i due numeri"
    - "Funzione pura normalizeGoogleAdsCustomerId: rimuove trattini e spazi, accetta solo 10 cifre (altrimenti errore di validazione); usata in PATCH /api/integrations/google-ads (valore non valido -> 400 con code) e prima di comporre URL e header login-customer-id"
    - "authCache indicizzata dall'impronta SHA-256 di clientId + refresh token: un cambio di credenziale ottiene un nuovo access token; la cache non conserva il refresh token in chiaro"
    - "Rimosso il fallback a process.env.GOOGLE_ADS_REFRESH_TOKEN in resolveRuntimeConfig: il refresh token arriva solo dal record google_ads_credentials, così la disconnessione ha effetto; variabile tolta da .env.example"
    - "developerToken non è più requisito per considerare completa la configurazione (developer token dismessi da Google il 9 settembre 2026, header facoltativo e ignorato): l'header developer-token è inviato solo se configurato"
    - "Ogni fallimento di batch è loggato con status HTTP, requestId e codice errore Google, mai con access token, refresh token, client secret o header Authorization"

  acceptance_criteria:
    - id: AC-901-1
      given: "una risposta mock di generateKeywordIdeas con avgMonthlySearches '1900', competitionIndex '37' e lowTopOfPageBidMicros '1250000' come stringhe"
      when: "si chiama enrichKeywords per la keyword corrispondente"
      then: "la metrica restituita ha avg_monthly_searches === 1900 di tipo number, competition === 0.37, low_top_of_page_bid_micros === 1250000n e metrics_status 'fetched'"
    - id: AC-901-2
      given: "45 keyword (3 batch da 20, 20 e 5) e un mock che risponde 500 a ogni tentativo del secondo batch e 200 agli altri"
      when: "si chiama enrichKeywords"
      then: "le 25 keyword dei batch 1 e 3 hanno metrics_status 'fetched', le 20 del batch 2 hanno 'failed' e il mock registra 1 + maxRetries chiamate per il batch 2"
    - id: AC-901-3
      given: "un mock che risponde 429 alla prima chiamata e 200 alla seconda, e un secondo scenario che risponde 400 con errorCode requestError INVALID_ARGUMENT"
      when: "si chiama enrichKeywords con timer finti"
      then: "nel primo scenario fetch è chiamata 2 volte a distanza di almeno 1000 ms e le keyword risultano fetched; nel secondo fetch è chiamata 1 sola volta e le keyword risultano failed"
    - id: AC-901-4
      given: "customerId configurato come '123-456-7890' e loginCustomerId '987-654-3210'"
      when: "il provider costruisce la richiesta e normalizeGoogleAdsCustomerId riceve anche il valore '12345'"
      then: "l'URL contiene '/customers/1234567890:', l'header login-customer-id vale '9876543210' e il valore '12345' produce un errore di validazione"

  target_tests:
    - file: "tests/unit/keyword-planner-provider.test.ts"
      covers: [AC-901-1, AC-901-2, AC-901-3, AC-901-4]

  security_notes:
    - "A09 Security Logging and Alerting Failures / CWE-532 (dati sensibili nei log): i log di errore Google riportano solo status, requestId ed errorCode, mai token, client secret o header Authorization"
    - "A07 Authentication Failures / CWE-613 (scadenza insufficiente): niente fallback a GOOGLE_ADS_REFRESH_TOKEN e cache del token legata all'impronta della credenziale, così una credenziale disconnessa o sostituita non viene più usata"
    - "A05 Injection / CWE-93 (CRLF injection): customerId e loginCustomerId ridotti a 10 cifre prima di comporre URL e header"
    - "A10 Mishandling of Exceptional Conditions / CWE-755: timeout, retry limitati ed esito per batch; un errore non produce metriche inventate né cancella quelle valide"

  out_of_scope:
    - "Passaggio a generateKeywordHistoricalMetrics, match canonico e tabelle geo/lingua complete: T-902"
    - "Rimozione del provider da file GOOGLE_ADS_METRICS_FILE: T-1101"
    - "Versione API supportata: T-304"
    - "Gestione di invalid_grant e stato 'da ricollegare' in UI: T-906"

- id: T-902
  title: "Metriche esatte (generateKeywordHistoricalMetrics) e match canonico"
  macrotask: "google-integrations"
  depends_on: [T-901, T-702]

  objective: >
    Ottenere le metriche delle keyword effettivamente estratte invece di idee correlate: il provider
    chiama generateKeywordHistoricalMetrics, invia la forma di visualizzazione delle keyword (con accenti),
    ricollega i risultati alle candidate tramite il canonical di T-702 anche quando Google deduplica le
    varianti vicine, e usa tabelle complete di lingue e paesi derivate dai dati ufficiali. Dove manca una
    corrispondenza Google la keyword resta missing, mai con volumi globali marcati fetched.

  definition_of_done:
    - "Il provider chiama POST https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}/customers/{customerId}:generateKeywordHistoricalMetrics (costante di lib/integrations/google-ads-version.ts, T-304; percorso verificato sul discovery REST v25) al posto di generateKeywordIdeas"
    - "Corpo: keywords (lotto configurabile con tetto 10.000, limite ufficiale per richiesta), language 'languageConstants/ID', geoTargetConstants con un solo elemento (limite ufficiale 10), keywordPlanNetwork GOOGLE_SEARCH_AND_PARTNERS, includeAdultKeywords false; pacing e retry di T-901 invariati"
    - "lib/modules/pipeline/extraction.ts passa a enrichKeywords la keyword di visualizzazione (candidate.keyword) di ciascun canonical e legge la mappa per canonical_keyword; MockMetricsProvider e NoMetricsProvider adeguati al contratto"
    - "Match: per ogni result si calcola canonicalizeKeyword(valore, languageCode effettivo) (lib/modules/normalization.ts, firma di T-702) di text e di ciascun closeVariants; la metrica è assegnata a ogni keyword richiesta con canonical uguale (Google può restituire una sola voce per varianti come 'car' e 'cars')"
    - "Nuovo file lib/modules/providers/metrics/google-ads-targets.ts generato dai dati ufficiali con commento di provenienza (URL e data): lingue di LANGUAGE_OPTIONS mappate sulla tabella Languages di codes-formats, con he -> iw (1027), zh -> zh_CN (1017, scelta da confermare in revisione), fil -> tl (1042); paesi di COUNTRY_CODES mappati sulle voci di primo livello del CSV geotargets 2026-08-12 (Target Type Country o Region): 245 su 249"
    - "Lingua senza equivalente Google (si, eu, gl, af, sw, am) o paese senza geo target (AX, CU, IR, KP): nessuna chiamata a Google, tutte le keyword metrics_status missing e motivo registrato nel risultato del job (metricsSkippedReason)"
    - "Golden master di T-106 aggiornato solo se cambia, con gate umano sulle asserzioni impattate"

  acceptance_criteria:
    - id: AC-902-1
      given: "una candidata con keyword 'caffè espresso' (canonical 'caffe espresso') e un mock che risponde con text 'caffè espresso' e avgMonthlySearches '1200'"
      when: "la pipeline arricchisce le metriche"
      then: "il corpo inviato contiene keywords ['caffè espresso'] e la candidata ha metrics_status 'fetched' con avg_monthly_searches 1200"
    - id: AC-902-2
      given: "keyword richieste 'scarpe running' e 'scarpa running' e un mock che restituisce un solo result con text 'scarpe running' e closeVariants ['scarpa running']"
      when: "si chiama enrichKeywords"
      then: "entrambe le keyword risultano 'fetched' con lo stesso avg_monthly_searches del result"
    - id: AC-902-3
      given: "un progetto con language_code 'sw' oppure country_code 'CU'"
      when: "la pipeline arricchisce le metriche con il provider GOOGLE_KEYWORD_PLANNER"
      then: "il mock registra 0 richieste verso googleads.googleapis.com, tutte le keyword hanno metrics_status 'missing' e il risultato del job contiene metricsSkippedReason"
    - id: AC-902-4
      given: "un progetto con language_code 'he' e country_code 'IL'"
      when: "il provider costruisce la richiesta"
      then: "il corpo contiene language 'languageConstants/1027' e geoTargetConstants ['geoTargetConstants/2376']"

  target_tests:
    - file: "tests/unit/keyword-planner-historical.test.ts"
      covers: [AC-902-1, AC-902-2, AC-902-3, AC-902-4]

  security_notes:
    - "A08 Software or Data Integrity Failures / CWE-345 (verifica insufficiente dell'autenticità dei dati): le metriche sono attribuite solo per corrispondenza di canonical; nessun volume globale viene salvato come metrica del paese richiesto"
    - "A10 Mishandling of Exceptional Conditions / CWE-754: lingua o paese non mappati producono uno stato missing esplicito con motivo, non parametri omessi in silenzio"

  out_of_scope:
    - "Previsioni (generateKeywordForecastMetrics) e serie mensili: non pianificate"
    - "Import da CSV di Keyword Planner: T-905"

- id: T-903
  title: "CLI di diagnosi dell'API Google Ads"
  macrotask: "google-integrations"
  depends_on: [T-901]

  objective: >
    Dare all'operatore un comando (npm run ads:diagnose) che verifica passo per passo la catena
    configurazione, rinnovo del token, accesso ai customer e una richiesta minima di metriche storiche,
    traducendo gli errori Google in azioni concrete (per esempio richiedere l'accesso Basic) senza mai
    stampare segreti. La CLI chiarisce che anche da riga di comando i dati passano dalla stessa API e dallo
    stesso progetto Google Cloud (D-09).

  definition_of_done:
    - "Logica in lib/modules/google-ads/diagnose.ts con dipendenze iniettabili (loader della configurazione da DB/env, fetch, output); script sottile scripts/ads-diagnose.ts eseguito con tsx e registrato in package.json come ads:diagnose"
    - "Passi in ordine, ciascuno stampato come riga PASS o FAIL con codice: (1) configurazione completa (client id, client secret, refresh token dal record google_ads_credentials, customer id) con fonte db/env per campo; (2) rinnovo token su https://oauth2.googleapis.com/token; (3) GET https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers e controllo che il customer configurato sia accessibile direttamente o via login-customer-id; (4) una richiesta generateKeywordHistoricalMetrics con 1 keyword fissa"
    - "Il codice errore Google è letto da error.details[].errors[].errorCode (struttura GoogleAdsFailure) e stampato con il requestId"
    - "Traduzioni: invalid_grant -> refresh token scaduto o revocato, ricollega Google Ads (in stato Testing del progetto OAuth scade dopo 7 giorni); CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION (v25+), ACTION_NOT_PERMITTED (v24 e precedenti) o DEVELOPER_TOKEN_NOT_APPROVED (deprecato) -> il progetto Google Cloud ha accesso Test, richiedi l'accesso Basic (Explorer non include KeywordPlanIdeaService; Basic richiede la verifica del brand)"
    - "Traduzioni: USER_PERMISSION_DENIED -> imposta login-customer-id con l'ID del manager senza trattini; CLIENT_CUSTOMER_ID_INVALID -> customer id di 10 cifre senza trattini; RESOURCE_EXHAUSTED -> limite di 1 richiesta al secondo per CID o quota giornaliera del livello d'accesso; versione dismessa -> aggiorna la versione (T-304), con codice HTTP esatto della risposta da verificare nel task"
    - "Exit code 0 solo se tutti i passi sono PASS, altrimenti 1; nessun passo successivo eseguito dopo un FAIL bloccante"
    - "Client secret, refresh token, access token e developer token mai stampati: al loro posto 'presente' o 'assente'"
    - "Messaggio finale e docs/GOOGLE-ADS.md: dal 9 settembre 2026 il livello d'accesso è del progetto Google Cloud che possiede il client OAuth (developer token dismesso); la CLI usa la stessa API e lo stesso progetto e non aggira i limiti; passi per chiedere l'accesso Basic dalla pagina Google Ads API Overview della Google Cloud Console (azione dell'utente)"

  acceptance_criteria:
    - id: AC-903-1
      given: "una configurazione completa e un fetch mock che risponde 200 al token, a listAccessibleCustomers (con il customer configurato) e a generateKeywordHistoricalMetrics"
      when: "si esegue runDiagnose()"
      then: "il valore restituito (exit code) è 0 e l'output contiene 4 righe che iniziano con 'PASS'"
    - id: AC-903-2
      given: "un mock che risponde 403 a generateKeywordHistoricalMetrics con errorCode authorizationError CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION e requestId 'req-1'"
      when: "si esegue runDiagnose()"
      then: "l'exit code è 1 e l'output contiene 'accesso Basic' e 'req-1'"
    - id: AC-903-3
      given: "un endpoint token che risponde 400 con error invalid_grant, e un secondo scenario in cui listAccessibleCustomers risponde con authorizationError USER_PERMISSION_DENIED"
      when: "si esegue runDiagnose() in ciascuno scenario"
      then: "entrambi terminano con exit code 1; il primo output contiene 'ricollega Google Ads', il secondo contiene 'login-customer-id'"
    - id: AC-903-4
      given: "una configurazione con client secret 'CS-SECRET-123', refresh token 'RT-SECRET-456' e un access token mock 'AT-SECRET-789'"
      when: "si esegue runDiagnose() sia nello scenario di successo sia in quello di errore"
      then: "stdout e stderr catturati non contengono nessuna delle tre stringhe"

  target_tests:
    - file: "tests/unit/ads-diagnose-cli.test.ts"
      covers: [AC-903-1, AC-903-2, AC-903-3, AC-903-4]

  security_notes:
    - "A09 Security Logging and Alerting Failures / CWE-532: nessun segreto in output o log; i campi sensibili sono riportati solo come presente/assente"
    - "A07 Authentication Failures / CWE-522 (credenziali protette in modo insufficiente): il refresh token decifrato vive solo in memoria per la durata del comando, mai scritto su disco"
    - "A02 Security Misconfiguration / CWE-16: la CLI è uno strumento dell'operatore che richiede DATABASE_URL e la chiave di cifratura da env validata; non è esposta via HTTP"

  out_of_scope:
    - "Richiesta dell'accesso Basic a Google: azione esterna dell'utente (D-09)"
    - "Fornitori terzi di volumi o scraping dell'interfaccia: esclusi da D-09"

- id: T-904
  title: "CLI di export keyword per Keyword Planner"
  macrotask: "google-integrations"
  depends_on: [T-702]

  objective: >
    Permettere il round-trip manuale con Keyword Planner quando l'API non è disponibile: un comando
    esporta le keyword di un progetto o di una sezione, uniche per canonical, in file CSV pronti per
    «Ottieni volume di ricerca e previsioni», suddivisi in blocchi di dimensione configurabile.

  definition_of_done:
    - "Logica pura in lib/modules/planner/export-keywords.ts (input: righe candidate, opzioni; output: blocchi e riepilogo); script scripts/planner-export.ts eseguito con tsx e registrato come planner:export"
    - "Argomenti: --project <id> obbligatorio; --section <id> facoltativo e appartenente al progetto (altrimenti exit 1 senza file); --chunk <n> intero da 1 a 10.000, default prudente 1000; --out <cartella> default ./planner-exports/ aggiunta a .gitignore"
    - "Una keyword per canonical (canonicalizeKeyword con il languageCode effettivo della sezione, firma di T-702): come testo la keyword di visualizzazione della prima candidata in ordine keyword asc, id asc; output deterministico"
    - "Keyword oltre i limiti di Keyword Planner (più di 80 caratteri o più di 10 parole, limiti della guida Google Ads) e keyword che iniziano con = + - @ sono saltate e conteggiate per motivo"
    - "Ogni file: UTF-8, prima riga 'Keyword' (modello di caricamento a una colonna della guida Google Ads), poi una keyword per riga; nome <projectId>-<sectionId o all>-partNN.csv"
    - "Limite massimo di keyword per singolo caricamento in Keyword Planner: non documentato da Google, da verificare nel task con un caricamento reale e annotare in docs/PLANNER-ROUNDTRIP.md insieme alla procedura completa export -> Keyword Planner -> import (T-905)"
    - "Riepilogo su stdout: canonical esportati, file scritti, keyword saltate per motivo"

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
      given: "un --section che appartiene a un altro progetto"
      when: "si esegue l'export"
      then: "l'exit code è 1 e la cartella di output non contiene file nuovi"
    - id: AC-904-4
      given: "il parametro --chunk con valore 0 oppure 'abc'"
      when: "si esegue l'export"
      then: "l'exit code è 1 e l'output contiene il messaggio d'uso con il parametro --chunk"

  target_tests:
    - file: "tests/unit/planner-export-cli.test.ts"
      covers: [AC-904-1, AC-904-2, AC-904-3, AC-904-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639: la sezione indicata è verificata contro il progetto prima di leggere le keyword; la CLI è riservata all'operatore e non è esposta via HTTP"
    - "A05 Injection / CWE-1236 (CSV formula injection): le keyword che iniziano con = + - @ non vengono scritte nei file"
    - "A02 Security Misconfiguration / CWE-538 (informazioni in file accessibili): la cartella di output predefinita è in .gitignore, i dati di keyword dei clienti non finiscono nel repository"

  out_of_scope:
    - "Import dei volumi dal CSV di Keyword Planner: T-905"
    - "Export dei risultati in CSV/XLSX per l'utente: T-804 e T-805"

- id: T-905
  title: "Import dei volumi da CSV di Keyword Planner (CLI e upload)"
  macrotask: "google-integrations"
  depends_on: [T-904, T-707]

  objective: >
    Chiudere il round-trip: leggere il file scaricato da Keyword Planner (anche localizzato e con volumi a
    range), abbinare le righe alle candidate per canonical, aggiornare metriche, provider e punteggio in
    transazione, sia da CLI sia da un upload nella pagina risultati con dimensione massima dichiarata.

  definition_of_done:
    - "Parser in lib/modules/planner/csv-parser.ts: rileva l'encoding dal BOM (UTF-16LE, UTF-16BE, UTF-8 con o senza BOM), il separatore (tab, virgola, punto e virgola) e la riga dei nomi colonna come prima riga che contiene una colonna keyword riconosciuta, saltando le righe di titolo precedenti; encoding, separatore e numero di righe iniziali del file reale da verificare nel task e fissati in una fixture"
    - "Colonne riconosciute per nome, case-insensitive, EN e IT: Keyword, Avg. monthly searches, Competition, Top of page bid (low range), Top of page bid (high range) (nomi EN verificati sulla guida Google Ads); nomi IT e Competition (indexed value) da verificare nel task sul file reale"
    - "Volumi: intero -> metrics_precision exact; range (es. '1K – 10K', trattino lungo o corto, suffissi K/M, decimali localizzati) -> punto medio arrotondato e metrics_precision range (D-17); vuoto o '--' -> nessuna metrica; separatori delle migliaia punto, virgola, spazio e NBSP gestiti"
    - "Offerte convertite in micros (valore x 1.000.000) come BigInt; Competition low/medium/high (anche IT) mappata come in T-901"
    - "Migrazione: valore PLANNER_CSV nell'enum MetricsProvider; colonna keyword_candidates.metrics_precision (enum exact o range, nullable); metrics_status 'imported' già esistente"
    - "Servizio applyPlannerImport(projectId, sectionId opzionale, righe) in lib/modules/planner/import.ts: match tramite canonicalizeKeyword(keyword, languageCode effettivo della sezione) (T-702) sul canonical_keyword delle candidate del perimetro; aggiorna avg_monthly_searches, competition, offerte, metrics_provider PLANNER_CSV, metrics_status imported, metrics_precision, metrics_updated_at e ricalcola score e score_source con scoreKeyword (che restituisce {score, score_source}, T-707); tutto in una transazione; ritorna {matched, unmatched, updated, rangeRows}"
    - "CLI scripts/planner-import.ts registrata come planner:import (npm run planner:import -- --project <id> [--section <id>] <file>)"
    - "Upload: rotta POST /api/projects/[id]/planner-import (multipart, campo file, sectionId facoltativo) e componente components/planner-import-upload.tsx nella pagina app/projects/[id]/results/page.tsx; dimensione massima 5 MB come costante esportata e mostrata in UI; estensioni .csv e .tsv; il file non viene salvato su disco"
    - "Nessuna nuova dipendenza: multipart letto con request.formData() nativo, decodifica con TextDecoder (utf-16le, utf-16be, utf-8)"
    - "Fixture in tests/fixtures/planner/: file UTF-16LE con tabulazioni e righe d'intestazione (EN), file con colonne IT, file con volumi a range; appena disponibile un file reale scaricato da Keyword Planner, la fixture principale ne riproduce la struttura (dati anonimizzati)"

  acceptance_criteria:
    - id: AC-905-1
      given: "la fixture UTF-16LE con tabulazioni e righe di titolo prima dei nomi colonna"
      when: "si chiama parsePlannerCsv"
      then: "il numero di righe restituite è uguale alle righe dati della fixture e ogni avgMonthlySearches è un numero uguale al valore atteso dichiarato nel test"
    - id: AC-905-2
      given: "una riga con volume '1K – 10K' e una con '1.200'"
      when: "si chiama parsePlannerCsv"
      then: "la prima ha avgMonthlySearches 5500 e precision 'range', la seconda ha 1200 e precision 'exact'"
    - id: AC-905-3
      given: "un progetto con la candidata 'caffè espresso' (canonical 'caffe espresso', score precedente S0) e un CSV con la riga 'Caffe Espresso' e volume 1200"
      when: "il proprietario invia il file a POST /api/projects/[id]/planner-import"
      then: "la risposta è 200 con matched 1, e la riga in DB ha avg_monthly_searches 1200, metrics_provider PLANNER_CSV, metrics_status imported, score_source metrics e score diverso da S0"
    - id: AC-905-4
      given: "un utente B autenticato e un progetto dell'utente A, e separatamente un file da 6 MB inviato dal proprietario"
      when: "si invia l'upload a POST /api/projects/[id]/planner-import"
      then: "l'utente B riceve 404, il file da 6 MB riceve 413 e in entrambi i casi 0 righe di keyword_candidates hanno metrics_updated_at modificato"

  target_tests:
    - file: "tests/unit/planner-csv-parser.test.ts"
      covers: [AC-905-1, AC-905-2]
    - file: "tests/integration/planner-import.test.ts"
      covers: [AC-905-3, AC-905-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (IDOR): progetto e sezione filtrati per owner_user_id della sessione (poi membership di workspace con T-1502); gli update usano un where che include project_id"
    - "A06 Insecure Design / CWE-400 (consumo di risorse non controllato): limite di 5 MB verificato sul Content-Length e sui byte letti, tetto di righe, parsing in memoria senza file temporanei"
    - "A05 Injection / CWE-89: valori del CSV scritti solo tramite query parametrizzate di Prisma; nessun SQL composto a mano"
    - "A08 Software or Data Integrity Failures / CWE-20 (validazione dell'input): numeri e range validati, righe non interpretabili scartate e conteggiate, nessun aggiornamento parziale fuori transazione"

  out_of_scope:
    - "Export delle keyword verso Keyword Planner: T-904"
    - "Diritti di piano per l'import (plannerImport): T-1601 e T-1605"

- id: T-906
  title: "OAuth Google: errori in UI, scope verificati, token revocati"
  macrotask: "google-integrations"
  depends_on: [T-503]

  objective: >
    Rendere il flusso OAuth di Google Ads e Google Sheets leggibile e coerente: errori mostrati nelle pagine
    invece di JSON grezzo, scope concessi verificati al callback, cookie di state sempre cancellato, motivo
    d'errore ridotto a codici noti, invalid_grant riconosciuto e mostrato come 'da ricollegare', revoca del
    token alla disconnessione e fallimenti di decifratura registrati.

  definition_of_done:
    - "connect di Ads e Sheets: configurazione OAuth mancante o sessione scaduta -> redirect 302 alla pagina d'origine (/admin o /personalizza) con google_ads o google_sheets = error e reason = config_oauth_mancante o sessione_scaduta, invece di JSON"
    - "Callback: il campo scope della risposta token (scope concessi, separati da spazio) deve contenere https://www.googleapis.com/auth/adwords per Ads e, per Sheets, lo scope richiesto da connect (oggi auth/spreadsheets, auth/drive.file dopo T-907), letto da una costante condivisa tra connect e callback; se manca, nessuna credenziale salvata e reason = scope_mancante"
    - "Il cookie di state (kwb_google_ads_oauth_state, kwb_google_sheets_oauth_state) è cancellato con maxAge 0 su tutti i return della callback, inclusi errore Google, state non valido e configurazione mancante"
    - "reason nell'URL è sempre un codice di una whitelist condivisa (accesso_negato, stato_non_valido, config_oauth_mancante, scope_mancante, scambio_token_fallito, sessione_scaduta), mai error.message né error_description di Google; GoogleAdsIntegrationCard e GoogleSheetsPersonalCard mostrano il testo italiano del codice e un testo generico per codici sconosciuti"
    - "invalid_grant al rinnovo del token (provider Keyword Planner e refreshUserAccessToken in lib/modules/google-sheets-export.ts) -> errore tipizzato GoogleReauthRequiredError e valorizzazione di reauth_required_at (nuova colonna su google_ads_credentials e google_sheets_credentials, migrazione); un nuovo consenso la azzera"
    - "Gli snapshot (getGoogleAdsCredentialSnapshot, getGoogleSheetsCredentialSnapshot) espongono status connected, reauth_required o disconnected; le card mostrano 'Da ricollegare' con il link di connessione quando status è reauth_required; l'export Sheets risponde 409 con code GOOGLE_REAUTH_REQUIRED"
    - "disconnect di Ads e Sheets: POST https://oauth2.googleapis.com/revoke con il refresh token decifrato (application/x-www-form-urlencoded) prima della cancellazione; revoca fallita o in timeout -> credenziale eliminata comunque e risposta {success: true, revoked: false}"
    - "Decifratura fallita in lib/integrations/app-settings.ts (getManySettingValues, getSettingValue), google-ads.ts e google-sheets.ts: console.error con chiave o id del record e nome dell'errore, mai il valore cifrato; la credenziale illeggibile è riportata come reauth_required invece che come assente"

  acceptance_criteria:
    - id: AC-906-1
      given: "configurazione OAuth Google Sheets assente in DB ed env e un utente autenticato"
      when: "si chiama GET /api/integrations/google-sheets/connect"
      then: "la risposta è 302 con Location '/personalizza?google_sheets=error&reason=config_oauth_mancante' e Content-Type non è application/json"
    - id: AC-906-2
      given: "una callback Ads con state valido che riceve error='<b>x</b>' oppure, in un secondo caso, una risposta token con scope 'openid email' senza adwords"
      when: "il root admin arriva su GET /api/integrations/google-ads/callback"
      then: "la risposta è 302 con reason 'accesso_negato' nel primo caso e 'scope_mancante' nel secondo, la Location non contiene '<b>', google_ads_credentials ha 0 righe e Set-Cookie riporta kwb_google_ads_oauth_state con Max-Age=0"
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
    - "A01 Broken Access Control / CWE-352 (CSRF sul callback OAuth): state casuale confrontato con il cookie e cookie cancellato su ogni uscita; rotte Ads riservate al root admin (requireRootAdminUserFromRequest), rotte Sheets limitate all'utente di sessione"
    - "A06 Insecure Design / CWE-863 (autorizzazione errata): gli scope realmente concessi sono verificati, il consenso granulare non produce credenziali parziali"
    - "A05 Injection / CWE-79 (contenuto riflesso): reason limitato a una whitelist di codici, mai testo proveniente da Google o da eccezioni"
    - "A09 Security Logging and Alerting Failures / CWE-778 e CWE-532: i fallimenti di decifratura sono registrati senza valori cifrati né token"

  out_of_scope:
    - "Riduzione dello scope Sheets a drive.file: T-907"
    - "Azzeramento della configurazione OAuth salvata: T-908"

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
  title: "Configurazione integrazioni: valori azzerabili e feedback"
  macrotask: "google-integrations"
  depends_on: [T-906]

  objective: >
    Rendere gestibile la configurazione globale di Google Ads e Google Sheets: un override salvato in DB
    si può rimuovere per tornare al valore di ambiente, gli input sono validati lato server in modo
    atomico, e le card danno feedback dopo il salvataggio senza riscrivere i campi mentre si digita.

  definition_of_done:
    - "PATCH /api/integrations/google-ads/config e /api/integrations/google-sheets/config: campo assente o stringa vuota = invariato; campo null = eliminazione dell'override (deleteSettingValue) e ritorno al valore env"
    - "Le scritture di una PATCH avvengono in una sola prisma.$transaction (oggi Promise.all di upsert indipendenti in updateGoogleAdsApiConfig e updateGoogleSheetsApiConfig)"
    - "Validazione server prima di ogni scrittura: batchSize intero da 1 al tetto unico esportato dal provider (20 con generateKeywordIdeas, valore di T-902 dopo il passaggio alle metriche storiche); redirectUri URL https (http ammesso solo per localhost); valore non valido -> 400 con code e nessuna scrittura"
    - "Gli snapshot di configurazione riportano per ogni campo la fonte (db, env, none); per i segreti solo has* e fonte, mai il valore"
    - "components/google-ads-integration-card.tsx: batchSize tenuto come stringa durante la digitazione e convertito solo al salvataggio (niente Number(...) || 20 su onChange); dopo una PATCH riuscita testo 'Configurazione salvata' in un elemento role=status; pulsante 'Rimuovi override' per i campi con fonte db che invia null; developer token indicato come facoltativo (dismesso da Google il 9 settembre 2026)"
    - "components/google-sheets-api-config-card.tsx: router.refresh() dopo il salvataggio riuscito, così hasClientSecret e il placeholder si aggiornano; stesso pulsante 'Rimuovi override'"

  acceptance_criteria:
    - id: AC-908-1
      given: "un override in app_settings GOOGLE_ADS_CLIENT_ID = 'db-id' e la variabile d'ambiente GOOGLE_ADS_CLIENT_ID = 'env-id'"
      when: "il root admin invia PATCH /api/integrations/google-ads/config con {clientId: null}"
      then: "la risposta è 200, app_settings non contiene la chiave GOOGLE_ADS_CLIENT_ID e lo snapshot riporta clientId 'env-id' con fonte 'env'"
    - id: AC-908-2
      given: "una configurazione salvata e un utente ADMIN non root, oltre al root admin"
      when: "il root admin invia PATCH con {batchSize: 0} o con {redirectUri: 'ftp://x'} e l'ADMIN non root invia una PATCH valida"
      then: "le PATCH del root admin ricevono 400, quella dell'ADMIN non root riceve 403 e nessuna riga di app_settings ha updated_at modificato"
    - id: AC-908-3
      given: "GoogleAdsIntegrationCard renderizzata con batchSize 20"
      when: "l'utente svuota il campo Dimensione batch e digita '1' e poi '5'"
      then: "il valore dell'input è '15' dopo ogni passaggio senza mai tornare a '20'"
    - id: AC-908-4
      given: "le due card renderizzate con fetch mock che risponde 200 alla PATCH"
      when: "l'utente salva la configurazione in ciascuna card"
      then: "la card Ads mostra 'Configurazione salvata' in un elemento con role status e la card Sheets chiama router.refresh esattamente 1 volta"

  target_tests:
    - file: "tests/integration/integration-config.test.ts"
      covers: [AC-908-1, AC-908-2]
    - file: "tests/component/google-ads-config-card.test.tsx"
      covers: [AC-908-3, AC-908-4]
    - file: "tests/component/google-sheets-config-card.test.tsx"
      covers: [AC-908-4]

  security_notes:
    - "A02 Security Misconfiguration / CWE-1188 (default insicuro persistente): un override DB non più valido si può rimuovere e non vince per sempre sulla configurazione d'ambiente"
    - "A01 Broken Access Control / CWE-285: le rotte di configurazione restano riservate al root admin (requireRootAdminUserFromRequest), verificato con un ADMIN non root"
    - "A01 Broken Access Control / CWE-200 (esposizione di informazioni): client secret e developer token mai restituiti dalle API di configurazione, solo has* e fonte"
    - "A04 Cryptographic Failures / CWE-311: i valori restano cifrati in app_settings con encryptSecret; la rimozione di un override cancella la riga cifrata invece di salvare un valore vuoto"

  out_of_scope:
    - "Versione API Google Ads (campo apiVersion): T-304"
    - "Errori del flusso OAuth: T-906"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0 (in isolamento i soli riferimenti non risolti sono T-304, T-702, T-707, T-503, che appartengono ad altri moduli).
- Semantico: `self-check-checklist.md` punti 6-10 applicati a T-901..T-908.
