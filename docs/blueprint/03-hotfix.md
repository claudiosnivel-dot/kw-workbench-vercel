# 03-hotfix — Macrotask `hotfix`

> Difetti già visibili in produzione da correggere prima dei major di stack: 500 da cookie malformato, file pubblici dietro login, open redirect, Google Ads v18 dismessa, job falliti che rispondono 200, keyword fittizie quando l'autocomplete fallisce (audit 2026-10-02).

## Obiettivo del macrotask

Correggere, prima degli aggiornamenti di stack di D-03, i difetti che gli utenti vedono già in produzione,
ciascuno con un test che lo riproduce e poi lo blocca come regressione. Il macrotask rende la verifica del
cookie di sessione tollerante a input malformati, apre senza login solo i file pubblici previsti, centralizza
la validazione del redirect post-login, porta Google Ads su una versione supportata dell'API e fa sì che
un'estrazione fallita, o alimentata da un autocomplete in errore, risulti fallita invece di produrre una
risposta 200 o keyword fittizie. Ogni task aggiorna con gate umano le asserzioni impacted-by delle
caratterizzazioni di 01-foundation.

## Task atomici

```yaml
- id: T-301
  title: "Cookie di sessione malformato: niente errore 500"
  macrotask: "hotfix"
  depends_on: [T-104]

  objective: >
    Eliminare l'errore 500 globale causato da un cookie di sessione malformato.
    In lib/auth/session.ts verifySessionToken chiama verifyPayload fuori dal try e
    fromBase64Url di lib/auth/crypto.ts usa atob, che lancia su input non base64:
    con un cookie come kwb_session=abc.!!! sia middleware.ts sia app/layout.tsx
    (tramite getOptionalAuthenticatedUserFromCookies) lanciano e ogni pagina,
    /login compresa, risponde 500 (riprodotto in produzione).

  definition_of_done:
    - "verifySessionToken restituisce null, senza lanciare, per qualunque input: token vuoto, senza punto, con parti non base64url, con firma di lunghezza errata, con payload non JSON o JSON senza userId o exp"
    - "fromBase64Url valida l'alfabeto base64url (lettere, cifre, trattino, underscore) prima di decodificare; verifyPayload e decodeJson sono eseguiti dentro il try di verifySessionToken"
    - "La verifica della firma resta crypto.subtle.verify; nessun ramo d'errore accetta un token la cui firma non è stata verificata"
    - "middleware.ts tratta un token non valido come assenza di sessione: pagine -> redirect a /login, API -> 401 JSON, percorsi pubblici -> pass-through"
    - "Asserzione impacted-by T-301 di tests/integration/characterization/auth.char.test.ts aggiornata al nuovo comportamento con gate umano"

  acceptance_criteria:
    - id: AC-301-1
      given: "i token abc.!!!, stringa vuota, abc, un payload base64url valido con firma !!! e un token firmato con payload non JSON"
      when: "si chiama verifySessionToken per ciascuno"
      then: "ogni chiamata si risolve con null e nessuna rigetta la promessa"
    - id: AC-301-2
      given: "un token creato con createSessionToken e lo stesso token con l'ultimo carattere della firma alterato"
      when: "si chiama verifySessionToken su entrambi"
      then: "il primo restituisce un payload con userId uguale a quello di partenza, il secondo restituisce null"
    - id: AC-301-3
      given: "una richiesta con header Cookie kwb_session=abc.!!!"
      when: "si invoca middleware su /login, /projects e /api/projects"
      then: "/login risponde pass-through (header x-middleware-next uguale a 1, nessun header location); /projects risponde 307 con location di pathname /login e parametro next uguale a /projects; /api/projects risponde 401 con body {error: 'Unauthorized'}"
    - id: AC-301-4
      given: "next/headers mockato con il cookie kwb_session=abc.!!!"
      when: "si chiama getOptionalAuthenticatedUserFromCookies come fa app/layout.tsx"
      then: "la promessa si risolve con null"

  target_tests:
    - file: "tests/unit/session-token.test.ts"
      covers: [AC-301-1, AC-301-2]
    - file: "tests/integration/proxy-auth.test.ts"
      covers: [AC-301-3, AC-301-4]

  security_notes:
    - "A10:2025 Mishandling of Exceptional Conditions, CWE-248 (Uncaught Exception): un input controllato dal client, il cookie, non può più causare un'eccezione non gestita che rende indisponibili tutte le pagine"
    - "A07:2025 Authentication Failures, CWE-347 (Improper Verification of Cryptographic Signature): ogni ramo d'errore restituisce null, cioè utente anonimo; nessun fallback considera valido un token non verificato"

  out_of_scope:
    - "Token minimale, versione di sessione e revoca (T-501)"
    - "Utenti sospesi o eliminati con token valido e pagine di errore (T-502)"
    - "Rinomina di middleware.ts in proxy.ts (T-404)"

- id: T-302
  title: "File pubblici e /.well-known raggiungibili senza login; redirect con query"
  macrotask: "hotfix"
  depends_on: [T-104]

  objective: >
    Rendere raggiungibili senza login i file pubblici: oggi
    public/.well-known/bastione-ownership.txt redirige a /login in produzione
    perché il matcher di middleware.ts esclude solo _next/static, _next/image e
    favicon.ico e isPublicPath non conosce i file statici. Inoltre il redirect a
    /login perde la query (usa solo pathname) e /login e /register non rimandano
    alla dashboard chi è già autenticato.

  definition_of_done:
    - "isPublicPath di middleware.ts considera pubblici, oltre a PUBLIC_PATHS, ogni percorso sotto /.well-known/ e i file nella radice di public con estensione in allowlist (txt, xml, ico, png, jpg, jpeg, svg, webp, webmanifest), solo se il percorso ha un unico segmento"
    - "Nessun percorso sotto /api/ diventa pubblico per estensione e i percorsi con più segmenti (es. /projects/abc.png) restano protetti"
    - "Il redirect a /login imposta next = pathname + search della richiesta tramite searchParams.set (che ne fa l'encoding)"
    - "app/login/page.tsx e app/register/page.tsx chiamano redirect('/') se getOptionalAuthenticatedUserFromCookies restituisce un utente (lettura da DB: esistente e ACTIVE); il controllo non sta nel middleware perché la sola firma manderebbe a / anche utenti sospesi o eliminati con token valido, che su / ricevono oggi un errore (T-502) e non potrebbero più raggiungere /login"
    - "Asserzione impacted-by T-302 di auth.char.test.ts aggiornata al nuovo comportamento con gate umano"

  acceptance_criteria:
    - id: AC-302-1
      given: "nessun cookie di sessione"
      when: "si invoca middleware su /.well-known/bastione-ownership.txt, /.well-known/security.txt e /robots.txt"
      then: "ogni risposta è pass-through: header x-middleware-next uguale a 1 e nessun header location"
    - id: AC-302-2
      given: "nessun cookie di sessione"
      when: "si invoca middleware su /api/projects.json, /api/projects e /projects/abc.png"
      then: "le due rotte API rispondono 401 con body {error: 'Unauthorized'} e /projects/abc.png risponde 307 con location di pathname /login"
    - id: AC-302-3
      given: "nessun cookie di sessione"
      when: "si invoca middleware su /projects/abc/results?view=all&page=2"
      then: "risposta 307 con location di pathname /login il cui parametro next, decodificato, è /projects/abc/results?view=all&page=2"
    - id: AC-302-4
      given: "un utente ACTIVE con cookie valido e un utente SUSPENDED con token ancora valido (next/headers mockato)"
      when: "si eseguono le pagine di app/login/page.tsx e app/register/page.tsx"
      then: "per l'utente attivo entrambe lanciano l'errore NEXT_REDIRECT con destinazione /; per l'utente sospeso entrambe si risolvono senza lanciare e l'elemento restituito contiene rispettivamente LoginForm e RegisterForm"

  target_tests:
    - file: "tests/integration/proxy-public-paths.test.ts"
      covers: [AC-302-1, AC-302-2, AC-302-3, AC-302-4]

  security_notes:
    - "A01:2025 Broken Access Control, CWE-862 (Missing Authorization): l'allowlist pubblica è esplicita e minima (prefisso /.well-known/ e file di un solo segmento con estensione ammessa); /api/** resta sempre autenticata anche con un'estensione nel percorso"
    - "A01:2025, CWE-601: next contiene solo percorso e query della richiesta sulla stessa origine; la validazione al momento dell'uso resta a safeNextPath (T-303)"
    - "A07:2025 Authentication Failures, CWE-613: il rimando da /login dipende dallo stato reale dell'utente letto dal DB (esistente e ACTIVE), non dalla sola firma di un token che può sopravvivere a sospensione o eliminazione"

  out_of_scope:
    - "Validazione di next al login (T-303)"
    - "Landing pubblica, sitemap.xml e robots.txt reali (T-1801)"
    - "Redirect pulito per utenti sospesi sulle pagine protette (T-502)"

- id: T-303
  title: "Redirect post-login sicuro (niente open redirect)"
  macrotask: "hotfix"
  depends_on: [T-104]

  objective: >
    Chiudere l'open redirect dopo login e registrazione. app/login/page.tsx,
    app/register/page.tsx, components/login-form.tsx e components/register-form.tsx
    controllano solo startsWith('/'), quindi //evil.com e /\evil.com passano e
    window.location.assign porta l'utente su un'origine esterna. Un helper unico
    safeNextPath sostituisce i quattro controlli.

  definition_of_done:
    - "lib/auth/safe-next-path.ts esporta safeNextPath(value: unknown): string senza import, utilizzabile da server e client component"
    - "Regole: restituisce il valore solo se è una stringa di al massimo 2048 caratteri, inizia con una sola barra, non contiene barre rovesciate né caratteri di controllo (codici 0-31 e 127) e new URL(value, 'http://n.invalid') mantiene l'origine http://n.invalid; altrimenti restituisce /"
    - "app/login/page.tsx, app/register/page.tsx, components/login-form.tsx e components/register-form.tsx usano solo safeNextPath; i controlli startsWith locali sono rimossi"
    - "Nel test delle pagine il modulo lib/auth/current-user è mockato con utente anonimo (le pagine leggono l'utente dopo T-302)"
    - "Asserzione impacted-by T-303 di auth.char.test.ts aggiornata al nuovo comportamento con gate umano"

  acceptance_criteria:
    - id: AC-303-1
      given: "gli input //evil.com, la stringa formata da barra, barra rovesciata ed evil.com, la stringa formata da barra, TAB e /evil.com, https://evil.com, javascript:alert(1), stringa vuota, undefined, il numero 42 e una stringa di 2049 caratteri che inizia con /"
      when: "si chiama safeNextPath su ciascuno"
      then: "il risultato è / per ogni input"
    - id: AC-303-2
      given: "gli input /, /projects/abc/results?view=all&page=2 e /onboarding/run"
      when: "si chiama safeNextPath su ciascuno"
      then: "ogni input è restituito identico"
    - id: AC-303-3
      given: "searchParams con next=//evil.com e utente anonimo"
      when: "si eseguono LoginPage e RegisterPage e si leggono i sorgenti dei quattro file"
      then: "il prop nextPath passato a LoginForm e a RegisterForm vale /; ognuno dei quattro file importa safeNextPath e non contiene la sottostringa startsWith("

  target_tests:
    - file: "tests/unit/safe-next-path.test.ts"
      covers: [AC-303-1, AC-303-2, AC-303-3]

  security_notes:
    - "A01:2025 Broken Access Control, CWE-601 (URL Redirection to Untrusted Site): dopo login o registrazione l'utente va solo su percorsi della stessa origine; //evil.com, la variante con barra rovesciata e quelle con TAB o a capo, che i browser normalizzano in //, tornano a /"
    - "A01:2025, CWE-601: validazione centralizzata in un solo helper usato da server e client component, così non restano copie divergenti del controllo nei quattro file"

  out_of_scope:
    - "Rimando a / degli utenti già autenticati su /login e /register (T-302)"

- id: T-304
  title: "Google Ads API su una versione supportata"
  macrotask: "hotfix"
  depends_on: [T-106]

  objective: >
    Portare l'integrazione Google Ads su una versione supportata dell'API. Oggi il
    default è v18 (sunset 20/08/2025) in lib/integrations/google-ads-config.ts e in
    lib/modules/providers/metrics/google-keyword-planner.ts, e
    components/google-ads-integration-card.tsx invia sempre apiVersion, così il
    valore v18 viene riscritto nel DB a ogni salvataggio e il provider marca come
    failed tutte le metriche.

  definition_of_done:
    - "lib/integrations/google-ads-version.ts, senza import, esporta GOOGLE_ADS_API_VERSION (unica fonte) e SUPPORTED_GOOGLE_ADS_API_VERSIONS con i valori indicati come supportati nella pagina ufficiale https://developers.google.com/google-ads/api/docs/sunset-dates alla data del task, annotata in un commento con la data di verifica; il modulo è separato da google-ads-config.ts perché la card client non può importare un modulo che arriva a lib/prisma.ts (D-22, T-109)"
    - "getGoogleAdsApiConfig usa il valore di DB o di env solo se è in SUPPORTED_GOOGLE_ADS_API_VERSIONS; altrimenti lo ignora, usa GOOGLE_ADS_API_VERSION e registra un console.warn con il valore scartato"
    - "google-keyword-planner.ts non ha più il fallback v18 e costruisce l'endpoint con la versione già validata"
    - "PATCH di app/api/integrations/google-ads/config/route.ts: apiVersion non supportata -> 400 con error che elenca le versioni ammesse e nessuna scrittura in app_settings; la rotta resta riservata al root admin (requireRootAdminUserFromRequest)"
    - "google-ads-integration-card.tsx: select con le versioni supportate (default GOOGLE_ADS_API_VERSION); apiVersion inviata solo se modificata dall'utente"
    - ".env.example con GOOGLE_ADS_API_VERSION allineata alla costante"

  acceptance_criteria:
    - id: AC-304-1
      given: "getManySettingValues mockato con GOOGLE_ADS_API_VERSION=v18 e env GOOGLE_ADS_API_VERSION=v18"
      when: "si chiama getGoogleAdsApiConfig"
      then: "apiVersion è uguale a GOOGLE_ADS_API_VERSION, è contenuta in SUPPORTED_GOOGLE_ADS_API_VERSIONS e almeno una chiamata a console.warn ha un messaggio che contiene v18"
    - id: AC-304-2
      given: "configurazione Ads completa con v18 nel DB e fetch mockato per il token OAuth e per generateKeywordIdeas"
      when: "GoogleKeywordPlannerMetricsProvider.enrichKeywords esegue la richiesta di metriche"
      then: "l'URL chiamato inizia con https://googleads.googleapis.com/ seguito da GOOGLE_ADS_API_VERSION e /customers/ e nessuna URL chiamata contiene /v18/"
    - id: AC-304-3
      given: "un root admin, un admin non root e app_settings senza la chiave GOOGLE_ADS_API_VERSION"
      when: "il root admin invia PATCH /api/integrations/google-ads/config con apiVersion v18 e poi con GOOGLE_ADS_API_VERSION; l'admin non root invia la PATCH con la versione supportata"
      then: "la prima risponde 400 con error che contiene GOOGLE_ADS_API_VERSION e app_settings resta senza la chiave; la seconda risponde 200 con data.apiVersion uguale alla costante; l'admin non root riceve 403"
    - id: AC-304-4
      given: "il repository dopo la modifica"
      when: "google-ads-config.test.ts cerca il letterale v18 nei file di lib/, components/ e in .env.example"
      then: "le occorrenze trovate sono 0"

  target_tests:
    - file: "tests/unit/google-ads-config.test.ts"
      covers: [AC-304-1, AC-304-2, AC-304-4]
    - file: "tests/integration/google-ads-config-api.test.ts"
      covers: [AC-304-3]

  security_notes:
    - "A05:2025 Injection, CWE-20 (Improper Input Validation): apiVersion è interpolata nel percorso dell'URL di googleads.googleapis.com, chiamato con le credenziali OAuth del progetto; l'allowlist SUPPORTED_GOOGLE_ADS_API_VERSIONS impedisce valori arbitrari, come segmenti ../, nel percorso"
    - "A01:2025 Broken Access Control, CWE-285: la PATCH resta riservata al root admin; un admin non root riceve 403 senza scritture"
    - "A03:2025 Software Supply Chain Failures, CWE-1104 (Use of Unmaintained Third Party Components): una versione dell'API dismessa non viene più usata né riscritta nel DB, quindi le metriche non falliscono più in silenzio"

  out_of_scope:
    - "Parsing numerico, batch parziali, retry, timeout e customerId (T-901)"
    - "generateKeywordHistoricalMetrics e match canonico (T-902)"
    - "CLI di diagnosi dell'API (T-903)"

- id: T-305
  title: "Esito reale dell'estrazione: un job fallito non risponde 200"
  macrotask: "hotfix"
  depends_on: [T-106]

  objective: >
    Far sì che un'estrazione fallita non risponda più 200. runJobById
    (lib/modules/jobs/job-runner.ts) cattura l'errore e salva status failed, ma
    app/api/projects/[id]/run/route.ts e
    app/api/projects/[id]/subprojects/[subprojectId]/run/route.ts rispondono
    sempre 200; RunExtractionButton e OnboardingRunStep controllano solo
    response.ok, così l'onboarding scrive «Estrazione completata» anche se il job
    è fallito. Inoltre nel try c'è return prisma.job.update senza await, quindi un
    errore di quell'update sfugge al catch e il job resta running.

  definition_of_done:
    - "runJobById usa return await prisma.job.update nel ramo di successo: un errore dell'update finale passa dal catch e il job termina failed con completed_at valorizzato"
    - "Le due rotte run: job con status failed -> HTTP 500 con body {error: 'Estrazione non riuscita', code: 'JOB_FAILED', jobId}, senza error_message grezzo (la sanificazione del messaggio è T-706); job completed -> 200 con il formato attuale"
    - "components/run-extraction-button.tsx e components/onboarding-run-step.tsx considerano riuscita l'estrazione solo con response.ok e data.status uguale a completed; altrimenti mostrano il messaggio d'errore e non avanzano"
    - "OnboardingRunStep non chiama PATCH /api/onboarding/state se l'estrazione non è completed"
    - "Il controllo di proprietà (owner_user_id) nelle due rotte resta invariato; le suite di caratterizzazione già presenti (T-105, T-106) restano verdi"
    - "Senza payload.error il messaggio mostrato dai due componenti è il fallback Estrazione non riuscita"
    - "tests/component/run-extraction-button.test.tsx copre sia RunExtractionButton sia OnboardingRunStep"

  acceptance_criteria:
    - id: AC-305-1
      given: "un progetto del richiedente e runExtractionPipeline mockata perché lanci un errore con messaggio contenente dettaglio-interno"
      when: "si chiamano POST /api/projects/{id}/run e POST /api/projects/{id}/subprojects/{subprojectId}/run"
      then: "entrambe rispondono 500 con code JOB_FAILED e jobId valorizzato, il body non contiene dettaglio-interno e la riga jobs corrispondente ha status failed e completed_at non nullo"
    - id: AC-305-2
      given: "una pipeline che termina e prisma.job.update che rigetta una sola volta (mockRejectedValueOnce) sull'aggiornamento a completed"
      when: "si chiama runJobById"
      then: "la promessa si risolve con un job con status failed e la riga in jobs ha status failed, non running"
    - id: AC-305-3
      given: "OnboardingRunStep renderizzato con fetch mockato che risponde 500 con {error: 'Estrazione non riuscita', code: 'JOB_FAILED'}"
      when: "si clicca Avvia prima estrazione"
      then: "il testo Estrazione non riuscita è visibile, il testo Estrazione completata è assente e fetch non è chiamato su /api/onboarding/state"
    - id: AC-305-4
      given: "RunExtractionButton renderizzato con fetch mockato che risponde 200 con data.status failed"
      when: "si clicca Avvia estrazione"
      then: "il testo Estrazione non riuscita è visibile e router.refresh non è chiamato"

  target_tests:
    - file: "tests/integration/run-route.test.ts"
      covers: [AC-305-1, AC-305-2]
    - file: "tests/component/run-extraction-button.test.tsx"
      covers: [AC-305-3, AC-305-4]

  security_notes:
    - "A10:2025 Mishandling of Exceptional Conditions, CWE-755 e CWE-252 (Unchecked Return Value): l'esito del job non viene più ignorato e una promessa non attesa non sfugge al catch; il client riceve lo stato reale"
    - "A10:2025, CWE-209 (Error Message Containing Sensitive Information): la risposta di errore non include error_message grezzo, che oggi può contenere dettagli Prisma o l'host del DB"
    - "A01:2025 Broken Access Control, CWE-639: le rotte continuano a filtrare per owner_user_id prima di creare il job"

  out_of_scope:
    - "Job in background con risposta 202 e polling (T-1204, T-1205)"
    - "Sanificazione e troncamento di error_message, job a zero seed (T-706)"
    - "Precondizioni dei passi di onboarding (T-1003)"

- id: T-306
  title: "Autocomplete: nessuna keyword fittizia quando Google fallisce"
  macrotask: "hotfix"
  depends_on: [T-106]

  objective: >
    Eliminare le keyword fittizie quando Google Autocomplete fallisce. Dopo i
    retry GoogleDirectAutocompleteProvider (lib/modules/providers/autocomplete/google-direct.ts)
    restituisce la query stessa come suggerimento con source
    google-direct-fallback, mentre il commento dice il contrario: con il servizio
    in errore si salvano fino a 250 keyword spazzatura e il job risulta completed.
    Inoltre il backoff dorme anche dopo l'ultimo tentativo e i 4xx non transitori
    vengono ritentati.

  definition_of_done:
    - "Dopo l'ultimo tentativo suggest() lancia AutocompleteQueryFailedError (con lo status HTTP quando disponibile); il ramo che restituiva la query con source google-direct-fallback e il relativo commento sono rimossi"
    - "Retry solo su errori di rete, timeout (AbortError), 429 e 5xx; 400, 401, 403 e 404 falliscono al primo tentativo; nessuna attesa dopo l'ultimo tentativo; funzione di attesa iniettabile per i test; i fallimenti non entrano nella cache"
    - "runExtractionPipeline (lib/modules/pipeline/extraction.ts) cattura AutocompleteQueryFailedError per singola query, la tratta come lista vuota e conta failedQueries"
    - "Soglia AUTOCOMPLETE_FAILURE_THRESHOLD = 0.3 esportata da extraction.ts: se failedQueries diviso le query selezionate supera la soglia la pipeline lancia un errore con messaggio Autocomplete non disponibile: N query su M fallite, prima di toccare keyword_candidates, così i risultati precedenti restano"
    - "Sotto soglia il riepilogo del job include partial (true se failedQueries è maggiore di 0) e failedQueries; con 0 fallimenti partial vale false e failedQueries 0; lo snapshot del riepilogo di T-106 è aggiornato per i nuovi campi con gate umano"
    - "Il test d'integrazione imposta AUTOCOMPLETE_MAX_RETRIES=0 e azzera la cache del provider tra i casi (export resetAutocompleteCacheForTests)"

  acceptance_criteria:
    - id: AC-306-1
      given: "AUTOCOMPLETE_MAX_RETRIES=2 e fetch mockato che risponde sempre 503"
      when: "si chiama suggest di GoogleDirectAutocompleteProvider"
      then: "la promessa rigetta con AutocompleteQueryFailedError, fetch è chiamato 3 volte, la funzione di attesa è invocata 2 volte e nessun valore restituito ha source google-direct-fallback"
    - id: AC-306-2
      given: "fetch mockato che risponde 404, poi in casi separati 403 e 400, e in un ultimo caso 429 seguito da 200 con suggerimenti"
      when: "si chiama suggest per ciascun caso"
      then: "per 404, 403 e 400 fetch è chiamato 1 volta e la promessa rigetta; per 429 seguito da 200 fetch è chiamato 2 volte e la promessa si risolve con i suggerimenti della risposta 200"
    - id: AC-306-3
      given: "una sezione GOOGLE_DIRECT configurata per 10 query (1 seed, expand_alpha ed expand_numeric false, 9 pattern), 4 keyword_candidates di un'esecuzione precedente e fetch che fallisce per 4 delle 10 query"
      when: "si esegue runJobById sul job di estrazione della sezione"
      then: "il job ha status failed, error_message contiene 4 query su 10 e la sezione ha ancora le stesse 4 righe in keyword_candidates"
    - id: AC-306-4
      given: "la stessa sezione con fetch che fallisce per 2 delle 10 query"
      when: "si esegue runJobById"
      then: "il job ha status completed, result.partial vale true, result.failedQueries vale 2 e nessuna riga di keyword_candidates ha source google-direct-fallback"

  target_tests:
    - file: "tests/unit/google-direct-provider.test.ts"
      covers: [AC-306-1, AC-306-2]
    - file: "tests/integration/pipeline-autocomplete-failures.test.ts"
      covers: [AC-306-3, AC-306-4]

  security_notes:
    - "A10:2025 Mishandling of Exceptional Conditions, CWE-390 (Detection of Error Condition Without Action): un errore del provider non produce più dati fittizi presentati come risultati reali; sopra soglia il job fallisce in modo esplicito e, poiché la pipeline lancia prima della transazione di scrittura, i risultati salvati in precedenza restano (A08:2025, integrità dei dati)"
    - "A09:2025 Security Logging and Alerting Failures, CWE-532: il log del fallimento riporta query, lingua, paese e messaggio d'errore, nessun header né dato dell'utente"

  out_of_scope:
    - "Budget di query equo tra le seed (T-701)"
    - "Soglia configurabile da env (envInt di T-201 la renderebbe possibile, non richiesto)"
    - "Job a passi con ripresa (T-1202)"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Osservabilità: `ac_observability_check.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
