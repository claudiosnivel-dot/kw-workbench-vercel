# 17-abuse-quotas — Macrotask `abuse-quotas`

> Protezione dagli abusi (rate limiting su Postgres, CAPTCHA Turnstile, D-12), quote d'uso per workspace, registro delle azioni amministrative e KPI per il root admin; nasce dai rilievi dell'audit 2026-10-02: nessun throttling su login/registrazione, registrazione pubblica attiva di default (`APP_PUBLIC_SIGNUP_ENABLED` default true in `lib/auth/config.ts`), reset password da admin senza traccia né avviso.

## Obiettivo del macrotask
Oggi `app/api/auth/login/route.ts` e `app/api/auth/register/route.ts` accettano tentativi illimitati, un admin non root può reimpostare la password di un abbonato (`updateUserFromAdmin` in `lib/admin/users.ts`) ed entrare al suo posto senza lasciare traccia, e nessun limite impedisce a un workspace di avviare estrazioni costose senza fine. Il macrotask aggiunge un rate limiter a finestra scorrevole su Postgres (niente Redis), Cloudflare Turnstile verificato lato server su registrazione e recupero password, contatori d'uso per workspace legati ai diritti del piano (T-1605), un registro immutabile delle azioni amministrative con cambio password obbligato dopo un reset da admin, e un cruscotto KPI aggregato visibile solo al root admin, senza dati di progetto degli utenti.

## Fonti verificate (2026-10-02)
- Turnstile siteverify: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, form-urlencoded o JSON, parametri `secret`, `response`, opzionali `remoteip` e `idempotency_key`; token valido 300 secondi, monouso, massimo 2048 caratteri; risposta `success`, `challenge_ts`, `hostname`, `error-codes`, `action`, `cdata`; codici `missing-input-secret`, `invalid-input-secret`, `missing-input-response`, `invalid-input-response`, `timeout-or-duplicate`, `internal-error`, `bad-request`; si raccomanda di validare `hostname` e `action` — https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Chiavi di test Turnstile: sitekey `1x00000000000000000000AA` (passa sempre, visibile), `2x00000000000000000000AB` (fallisce sempre); secret `1x0000000000000000000000000000000AA` (passa sempre), `2x0000000000000000000000000000000AA` (fallisce sempre), `3x0000000000000000000000000000000AA` (token già speso); token fittizio `XXXX.DUMMY.TOKEN.XXXX`; le secret di produzione rifiutano il token fittizio — https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- Widget: script `https://challenges.cloudflare.com/turnstile/v0/api.js`, campo nascosto `cf-turnstile-response`, attributo `data-action`; la CSP deve consentire `challenges.cloudflare.com` in `script-src` e `frame-src` — https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Vercel: `x-forwarded-for` contiene l'IP pubblico del client e Vercel lo sovrascrive per prevenire lo spoofing (`x-real-ip` e `x-vercel-forwarded-for` identici) — https://vercel.com/docs/headers/request-headers
- Importi Paddle per l'MRR: `items[].price.unit_price.amount` è una stringa intera in unità minima, con `currency_code` e `billing_cycle` (`interval`, `frequency`) nell'entità subscription — https://developer.paddle.com/webhooks/subscriptions/subscription-created/

## Task atomici

```yaml
- id: T-1701
  title: "Rate limiting su autenticazione"
  macrotask: "abuse-quotas"
  depends_on: [T-1404]

  objective: >
    Limitare i tentativi su login, registrazione e richiesta di reset password con un rate
    limiter a finestra scorrevole su Postgres, che risponde 429 con Retry-After, non
    rivela l'esistenza degli account e regge richieste concorrenti sulla stessa chiave.

  definition_of_done:
    - "prisma/schema.prisma: model RateLimitHit (id BigInt autoincrement, key String, created_at DateTime default now, @@index([key, created_at])) mappato su rate_limit_hits, con RLS abilitata senza policy (T-205)."
    - "lib/security/rate-limit.ts: consumeRateLimit(key, regola, now) a finestra scorrevole (sliding log): in una transazione pg_advisory_xact_lock(hashtext(key)), DELETE delle righe della chiave più vecchie della finestra, COUNT, INSERT solo se il conteggio è sotto la soglia; restituisce allowed e retryAfterSeconds (secondi finché la riga più vecchia esce dalla finestra, arrotondati per eccesso, minimo 1)."
    - "Pulizia globale: pruneRateLimitHits(now) elimina le righe più vecchie della finestra massima configurata; esposta come npm run ratelimit:prune (scripts/ratelimit-prune.ts) e chiamata dal cron di manutenzione /api/cron/reap-jobs (T-1203)."
    - "Regole in lib/security/rate-limit-config.ts con valori iniziali PROPOSTI e sovrascrivibili da env validata (T-201, interi di INT_ENV in lib/env.ts): login per IP+email 5 ogni 15 minuti e per IP 50 ogni 15 minuti (RATE_LIMIT_LOGIN_IP_EMAIL_MAX, RATE_LIMIT_LOGIN_IP_MAX, RATE_LIMIT_LOGIN_WINDOW_SECONDS); registrazione per IP 5 ogni ora (RATE_LIMIT_REGISTER_IP_MAX, RATE_LIMIT_REGISTER_WINDOW_SECONDS); richiesta di reset per email 3 ogni ora e per IP 20 ogni ora (RATE_LIMIT_RESET_EMAIL_MAX, RATE_LIMIT_RESET_IP_MAX, RATE_LIMIT_RESET_WINDOW_SECONDS); avvii di estrazione per workspace 30 ogni ora (RATE_LIMIT_RUN_START_MAX, RATE_LIMIT_RUN_START_WINDOW_SECONDS, D-27 emendata). I test iniettano soglie basse."
    - "lib/security/client-ip.ts: su Vercel (VERCEL=1) il primo valore di x-forwarded-for (l'header è sovrascritto dalla piattaforma con l'IP pubblico del client); fuori da Vercel o con header assente la parte IP della chiave vale 'unknown'."
    - "Rotte: app/api/auth/login/route.ts (prima di verifyLoginCredentials, email normalizzata lowercase), app/api/auth/register/route.ts (dopo il 403 SIGNUP_DISABLED della registrazione chiusa, T-1606) e la rotta di richiesta reset di T-1404; oltre soglia → 429 con error, code RATE_LIMITED, retryAfter e header Retry-After in secondi; la risposta non cambia tra email esistenti e inesistenti."
    - "Avvii di estrazione (D-27 emendata, rate limit sugli avvii): con il lancio commerciale attivo (D-32) le rotte di avvio di T-1204 consumano la regola per workspace prima della riserva della quota (T-1703); oltre soglia → 429 RATE_LIMITED con Retry-After e nessun job; con il lancio in pausa la regola non si applica."
    - "Ordine dei controlli: rate limit prima della verifica credenziali e del CAPTCHA (T-1702), così i tentativi bloccati non consumano hash password né chiamate esterne."

  acceptance_criteria:
    - id: AC-1701-1
      given: "soglia di test login per IP+email = 3 e 3 tentativi falliti da 203.0.113.5 per a@example.com"
      when: "si invia il quarto POST /api/auth/login con le credenziali giuste"
      then: "la risposta è 429 con code RATE_LIMITED e header Retry-After intero maggiore di 0; last_login_at dell'utente non cambia e la verifica password ha 0 chiamate (spy)"
    - id: AC-1701-2
      given: "la situazione bloccata di AC-1701-1"
      when: "si invia lo stesso login da 198.51.100.7 e poi da 203.0.113.5 dopo aver avanzato l'orologio oltre la finestra"
      then: "entrambe le risposte sono 200 con cookie di sessione"
    - id: AC-1701-3
      given: "soglie di test pari a 2 per la registrazione (per IP) e per il reset (per email)"
      when: "si inviano 3 registrazioni dallo stesso IP e 3 richieste di reset per un'email esistente e 3 per un'email inesistente"
      then: "la terza richiesta di ogni serie riceve 429 con Retry-After; le prime due richieste di reset hanno status e body identici per email esistente e inesistente"
    - id: AC-1701-4
      given: "x-forwarded-for '203.0.113.5, 10.0.0.1' e una regola con soglia 1"
      when: "si eseguono 2 chiamate concorrenti a consumeRateLimit sulla stessa chiave e poi pruneRateLimitHits con l'orologio oltre la finestra"
      then: "la chiave calcolata contiene 203.0.113.5; esattamente 1 chiamata restituisce allowed true; dopo la pulizia rate_limit_hits ha 0 righe"
    - id: AC-1701-5
      given: "lancio commerciale attivo, soglia di test degli avvii per workspace pari a 1 e un workspace W con due sezioni con seed"
      when: "un membro avvia l'estrazione della prima sezione e poi della seconda; poi, con il lancio in pausa, avvia la seconda"
      then: "il primo avvio è 202, il secondo 429 con code RATE_LIMITED e header Retry-After intero maggiore di 0 e jobs di W ha 1 riga; l'avvio in pausa è 202"

  target_tests:
    - file: "tests/integration/rate-limit-auth.test.ts"
      covers: [AC-1701-1, AC-1701-2, AC-1701-3, AC-1701-4, AC-1701-5]

  security_notes:
    - "A07 Authentication Failures / CWE-307 (Improper Restriction of Excessive Authentication Attempts): limiti per IP+email e per IP sul login, per IP sulla registrazione, per email e IP sul reset."
    - "A07 / CWE-204 (Observable Response Discrepancy): 429 e risposte del reset identiche per account esistenti e inesistenti."
    - "A02 Security Misconfiguration / CWE-348 (Use of Less Trusted Source): x-forwarded-for è considerato affidabile solo su Vercel, che lo sovrascrive; altrove la chiave degrada a 'unknown' invece di fidarsi di un header del client."
    - "A06 Insecure Design / CWE-362 (Race Condition): advisory lock per chiave, così richieste concorrenti non superano la soglia."
    - "A06 / CWE-770 (Allocation of Resources Without Limits or Throttling): con il lancio attivo gli avvii di estrazione per workspace hanno un tetto per finestra (D-27 emendata)."

  out_of_scope:
    - "CAPTCHA: T-1702."
    - "Quote d'uso del piano: T-1703."
    - "WAF o rate limit a livello CDN: non previsti (D-12)."

- id: T-1702
  title: "CAPTCHA su registrazione e recupero password"
  macrotask: "abuse-quotas"
  depends_on: [T-1701]

  objective: >
    Richiedere un token Cloudflare Turnstile verificato lato server (siteverify) sulla
    registrazione e sulla richiesta di reset password, con esito negativo in caso di
    token mancante, non valido, emesso per un altro host o azione, o di servizio
    irraggiungibile; chiavi da env validata e chiavi di test vietate in produzione.

  definition_of_done:
    - "lib/security/turnstile.ts: verifyTurnstile(token, remoteIp, expectedAction) invia POST a https://challenges.cloudflare.com/turnstile/v0/siteverify (form-urlencoded con secret, response, remoteip) con timeout di 5 secondi (AbortSignal.timeout); esito valido solo se success è true, hostname coincide con l'host di APP_PUBLIC_URL e action coincide con expectedAction. Senza APP_PUBLIC_URL l'host atteso manca e l'esito è 503 CAPTCHA_UNAVAILABLE."
    - "Esiti: token assente → 400 code CAPTCHA_REQUIRED; token più lungo di 2048 caratteri → 400 code CAPTCHA_INVALID senza chiamare siteverify; success false (ad esempio invalid-input-response o timeout-or-duplicate) oppure hostname o action diversi → 400 CAPTCHA_INVALID; errore di rete, timeout o internal-error → 503 code CAPTCHA_UNAVAILABLE."
    - "Rotte protette: app/api/auth/register/route.ts (action 'register') e rotta di richiesta reset di T-1404 (action 'password-reset'); ordine: rate limit (T-1701), poi CAPTCHA, poi logica. Il CAPTCHA è obbligatorio quando Turnstile è configurato (entrambe le chiavi) o il lancio commerciale è attivo: la registrazione, aperta solo con il lancio attivo (T-1606), lo richiede sempre e senza chiavi risponde 503 CAPTCHA_UNAVAILABLE (fail-closed); il recupero password con il lancio in pausa e senza chiavi resta senza CAPTCHA, protetto dai limiti di T-1701."
    - "Client: components/register-form.tsx (tramite il form delle credenziali) e il form di reset, solo con NEXT_PUBLIC_TURNSTILE_SITE_KEY impostata, inseriscono dal bundle lo script https://challenges.cloudflare.com/turnstile/v0/api.js (rendering esplicito con action coerente) e inviano il token (campo cf-turnstile-response) nel body come turnstileToken; con la site key la CSP di T-505 consente challenges.cloudflare.com in script-src e frame-src (senza, la CSP non cambia)."
    - "Env validata (T-201): TURNSTILE_SECRET_KEY e NEXT_PUBLIC_TURNSTILE_SITE_KEY vanno impostate insieme; sono facoltative all'avvio perché il lancio commerciale è uno stato del DB (D-32): la loro presenza è la voce captcha della checklist di T-1606 (isTurnstileReady), quindi il lancio non si attiva senza chiavi; in production le chiavi di test Cloudflare (sitekey e secret che iniziano con 1x00000, 2x00000 o 3x00000) sono rifiutate; dev ed e2e usano proprio le chiavi di test che passano sempre (gli E2E girano senza chiavi: nessun widget, baseline visive invariate)."
    - "Nei test di integrazione siteverify è sempre mockato con fetch mock; nessuna chiamata di rete reale."

  acceptance_criteria:
    - id: AC-1702-1
      given: "registrazione pubblica attiva e siteverify mockato"
      when: "si invia POST /api/auth/register senza turnstileToken"
      then: "la risposta è 400 con code CAPTCHA_REQUIRED; users ha lo stesso numero di righe e il mock ha ricevuto 0 chiamate"
    - id: AC-1702-2
      given: "siteverify mockato che risponde nell'ordine success false con error-codes invalid-input-response, success true con hostname 'evil.example', success true con hostname di APP_PUBLIC_URL e action 'register'"
      when: "si inviano tre registrazioni con token ed email diversi da x-forwarded-for 203.0.113.9 (su Vercel)"
      then: "le prime due ricevono 400 CAPTCHA_INVALID senza nuovi utenti; la terza riceve 202 e crea 1 utente; ogni chiamata al mock contiene secret uguale a TURNSTILE_SECRET_KEY e remoteip 203.0.113.9"
    - id: AC-1702-3
      given: "Turnstile configurato, siteverify mockato e l'outbox email di test vuota"
      when: "si invia la richiesta di reset password senza token e poi con un token mentre il mock va in timeout"
      then: "la prima risposta è 400 CAPTCHA_REQUIRED, la seconda 503 CAPTCHA_UNAVAILABLE, e l'outbox contiene 0 email"
    - id: AC-1702-4
      given: "NODE_ENV=production e TURNSTILE_SECRET_KEY = 1x0000000000000000000000000000000AA"
      when: "si esegue la validazione env"
      then: "la validazione fallisce con un messaggio che nomina TURNSTILE_SECRET_KEY"

  target_tests:
    - file: "tests/integration/captcha.test.ts"
      covers: [AC-1702-1, AC-1702-2, AC-1702-3, AC-1702-4]

  security_notes:
    - "A07 Authentication Failures / CWE-799 (Improper Control of Interaction Frequency): CAPTCHA verificato lato server su registrazione e reset contro account creati in massa ed email bombing."
    - "A10 Mishandling of Exceptional Conditions / CWE-636 (Not Failing Securely): siteverify irraggiungibile produce 503, mai un'accettazione silenziosa."
    - "A02 Security Misconfiguration / CWE-798 (Use of Hard-coded Credentials): secret Turnstile solo da env validata; chiavi di test rifiutate in production."
    - "A08 Software or Data Integrity Failures / CWE-345 (Insufficient Verification of Data Authenticity): hostname e action del token confrontati con i valori attesi, così un token emesso per un altro sito o form non vale."

  out_of_scope:
    - "CAPTCHA sul login: non previsto (bastano i limiti di T-1701)."
    - "Modulo contatti: T-1805."

- id: T-1703
  title: "Quote d'uso per workspace"
  macrotask: "abuse-quotas"
  depends_on: [T-1605, T-1204, T-1604, T-903, T-1606]

  objective: >
    Contare per ogni workspace le estrazioni al giorno e le keyword salvate nel mese,
    bloccare l'avvio oltre quota con 429 QUOTA_EXCEEDED e la data di azzeramento, troncare
    lo store quando la quota mensile si esaurisce a metà job e mostrare l'uso nella pagina
    di fatturazione.

  definition_of_done:
    - "prisma/schema.prisma: enum UsageMetric (runs_day, keywords_month, licensed_keywords_month, run_refunds_month); model UsageCounter (id BigInt autoincrement, workspace_id, metric, period_start DateTime, count Int default 0, @@unique([workspace_id, metric, period_start])) mappato su usage_counters, con RLS abilitata senza policy (T-205); su jobs l'enum JobFailureCause (INTERNAL, USER) nella colonna failure_cause e quota_refunded Boolean default false."
    - "Periodi in UTC: runs_day parte alle 00:00Z del giorno, keywords_month e run_refunds_month alle 00:00Z del primo giorno del mese; resetAt è l'inizio del periodo successivo."
    - "lib/billing/usage.ts: reserveRun(tx, workspaceId, limits, now) esegue un incremento condizionale atomico di runs_day (INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 WHERE count è minore di runsPerDay); 0 righe → QuotaExceededError; con runsPerDay = 0 rifiuta senza eseguire l'insert; richiede anche keywords_month minore di keywordsPerMonth; è chiamata nella stessa transazione che crea il job (avvio di T-1204 per progetto e per sezione), sotto il lock della riga del workspace, e la riserva (workspace e giorno) va nel payload del job."
    - "Al massimo un job attivo per workspace (D-27 emendata): con il lancio attivo, dopo la riserva, un job pending o running in un altro progetto o sezione del workspace → 409 JOB_ALREADY_ACTIVE con il suo jobId e la riserva annullata con la transazione; con il lancio in pausa resta il solo vincolo di un job attivo per sezione (T-1201)."
    - "Oltre quota: 429 con error, code QUOTA_EXCEEDED, metric, limit e resetAt (ISO 8601); nessun job creato."
    - "Quota mensile di keyword: lo store finale della pipeline (T-1202) salva al massimo il minimo tra maxKeywordsPerRun e keywordsPerMonth meno le keyword già contate; keywords_month aumenta del numero di keyword effettivamente salvate; se si tronca per la quota, result.truncated = true e result.truncatedReason = 'monthly_quota'."
    - "Un'estrazione conta all'avvio (D-27). Causa del fallimento classificata dal codice in jobs.failure_cause (D-27 emendata): INTERNAL per eccezione non prevista, errore del DB, tentativi esauriti dal recupero (T-1203) e autocomplete non disponibile (fornitore esterno, T-306); USER per sezione senza seed; l'annullamento dell'utente porta il job a canceled e consuma la quota."
    - "Rimborso (D-27 emendata): nella transazione che porta a failed un job con causa INTERNAL e una riserva, un incremento condizionale atomico di run_refunds_month del workspace entro il tetto runRefundsPerMonth della politica di D-14 (lib/billing/plans.ts, segnaposto 0); se riesce, runs_day del giorno della riserva scende di 1 (mai sotto 0) e jobs.quota_refunded diventa true; oltre il tetto nessun rimborso, un messaggio a Sentry, la riga di log quota_refund_cap_reached e una riga quota.refund_cap_reached nel registro di T-1704 (actor null, target workspace). Un fallimento USER non rimborsa."
    - "Con il lancio commerciale in pausa (D-32, T-1606) le quote non si applicano: nessun 429 QUOTA_EXCEEDED né troncamento per quota, nessuna riserva né rimborso; i contatori non si scrivono (nessun consumatore in pausa: la pagina di fatturazione mostra solo la pausa e il cruscotto di T-1705 legge i job)."
    - "Quota del fornitore con licenza (D-30): prima di ogni richiesta al fornitore (T-902) la pipeline riserva in modo atomico, su licensed_keywords_month, il numero di keyword del batch entro licensedMetricsKeywordsPerMonth; le keyword oltre quota restano con metrics_status missing e result.metricsNotice = LICENSED_METRICS_QUOTA_EXCEEDED, senza far fallire il job. Si somma al tetto di spesa globale di T-903, che resta il limite di sicurezza dell'intero servizio."
    - "GET /api/billing/usage?workspaceId= (qualsiasi membro, non membro 404) → runsToday, runsPerDay, keywordsThisMonth, keywordsPerMonth, resetAt per metrica; components/usage-summary.tsx lo mostra ed è montato in /billing se T-1604 è già costruito, altrimenti lo monta T-1604."

  acceptance_criteria:
    - id: AC-1703-1
      given: "lancio commerciale attivo, W su un piano di prova con runsPerDay = 2 e 2 estrazioni avviate oggi e concluse"
      when: "un membro invia una terza richiesta di avvio estrazione"
      then: "la risposta è 429 con code QUOTA_EXCEEDED, metric 'runs_day' e resetAt uguale alla mezzanotte UTC successiva; jobs di W ha ancora 2 righe"
    - id: AC-1703-2
      given: "la situazione di AC-1703-1"
      when: "l'orologio avanza al giorno successivo e il membro avvia un'estrazione"
      then: "la risposta è 202 e usage_counters ha una riga runs_day per il nuovo giorno con count 1"
    - id: AC-1703-3
      given: "keywordsPerMonth = 100, 90 keyword già contate nel mese e una pipeline mock che produce 30 keyword"
      when: "il job arriva allo store finale e poi si richiede un nuovo avvio"
      then: "il job ha 10 keyword salvate, result.truncated true e truncatedReason 'monthly_quota', il contatore keywords_month vale 100; il nuovo avvio riceve 429 con metric 'keywords_month' e resetAt al primo giorno del mese successivo alle 00:00Z"
    - id: AC-1703-4
      given: "W con 1 estrazione residua nel giorno e due sezioni diverse"
      when: "si inviano 2 richieste di avvio concorrenti, una per sezione, e poi GET /api/billing/usage"
      then: "esattamente una risposta è 202 e una è 429; la GET restituisce runsToday uguale a runsPerDay; la stessa GET da un non membro riceve 404"
    - id: AC-1703-5
      given: "W con licensedMetrics = true, licensedMetricsKeywordsPerMonth = 1500, 1000 keyword già arricchite nel mese e una pipeline che produce 800 keyword con il fetch del fornitore mockato"
      when: "il job arriva alla fase delle metriche"
      then: "il mock del fornitore riceve in totale 500 keyword, 300 candidate restano con metrics_status missing, il contatore licensed_keywords_month vale 1500 e il result del job contiene metricsNotice uguale a LICENSED_METRICS_QUOTA_EXCEEDED con status del job completed"
    - id: AC-1703-6
      given: "lancio commerciale attivo, runsPerDay = 2, tetto di rimborsi runRefundsPerMonth = 1 e una sezione con seed in cui l'autocomplete è sempre non disponibile"
      when: "un membro avvia due estrazioni che falliscono una dopo l'altra, poi toglie le seed della sezione, ne avvia una terza e infine richiede una quarta"
      then: "il primo job è failed con failure_cause INTERNAL e quota_refunded true; il secondo è failed INTERNAL con quota_refunded false e admin_audit_log ha 1 riga quota.refund_cap_reached con target_id W; il terzo è failed con failure_cause USER e quota_refunded false; la quarta richiesta riceve 429 QUOTA_EXCEEDED con metric 'runs_day'"
    - id: AC-1703-7
      given: "lancio commerciale attivo, W con due sezioni con seed e un job pending sulla prima"
      when: "un membro avvia l'estrazione della seconda sezione; poi, con il lancio in pausa, la avvia di nuovo"
      then: "con il lancio attivo la risposta è 409 JOB_ALREADY_ACTIVE con il jobId del job pending e il contatore runs_day del giorno resta invariato; in pausa la risposta è 202"

  target_tests:
    - file: "tests/integration/usage-quotas.test.ts"
      covers: [AC-1703-1, AC-1703-2, AC-1703-3, AC-1703-4, AC-1703-5, AC-1703-6, AC-1703-7]

  security_notes:
    - "A06 Insecure Design / CWE-770 (Allocation of Resources Without Limits or Throttling): quote per workspace sulle operazioni costose (autocomplete Google e metriche del fornitore con licenza), lette solo dai diritti lato server."
    - "A06 / CWE-362 (Race Condition): incremento condizionale atomico in SQL, nessun check-then-increment in memoria."
    - "A01 Broken Access Control / CWE-639: GET /api/billing/usage filtra per membership; un non membro riceve 404."
    - "A06 / CWE-841 (Improper Enforcement of Behavioral Workflow): i rimborsi automatici hanno un tetto per workspace e mese, oltre il quale decide l'admin (D-27 emendata); un job attivo per workspace con il lancio attivo."

  out_of_scope:
    - "Limiti di conteggio non periodici (progetti, sezioni, seed): T-1605."
    - "Valori delle quote: D-14."

- id: T-1704
  title: "Registro delle azioni amministrative"
  macrotask: "abuse-quotas"
  depends_on: [T-507, T-1402]

  objective: >
    Registrare in modo atomico e non modificabile ogni azione amministrativa su utenti e
    branding, e rendere visibile all'utente un reset password fatto da un admin: sessioni
    revocate, cambio password obbligato al primo accesso e avviso via email.

  definition_of_done:
    - "prisma/schema.prisma: model AdminAuditLog (id, actor_user_id String?, action String, target_type String, target_id String?, metadata Json, ip String?, created_at, @@index([created_at]), @@index([target_type, target_id])) mappato su admin_audit_log, con RLS abilitata senza policy (T-205); nessuna API di modifica o cancellazione."
    - "Azioni registrate nella stessa transazione dell'azione: user.create, user.password_reset, user.suspend, user.reactivate, user.role_change, user.delete (createUserFromAdmin, updateUserFromAdmin, deleteUserFromAdmin in lib/admin/users.ts) e branding.update (app/api/settings/branding/route.ts e lib/integrations/branding.ts); un'azione rifiutata (400, 403, 404) non scrive righe."
    - "metadata: solo i campi cambiati con valore prima e dopo (ruolo, stato, nome app; per il logo l'hash SHA-256 al posto del data URL); mai password, hash, token o data URL."
    - "Reset da admin: nuova colonna users.must_change_password Boolean default false impostata a true; session_version incrementata (T-501) così le sessioni esistenti decadono; al login con must_change_password la risposta porta code PASSWORD_CHANGE_REQUIRED e redirect a /account/password; ogni API diversa da cambio password e logout risponde 403 con code PASSWORD_CHANGE_REQUIRED finché il cambio non azzera il flag."
    - "Avviso: email via EmailSender (T-1402) con nuovo template admin_password_reset (nome admin-password-reset, come gli altri template del repo) in it ed en, inviata all'email dell'utente dopo il commit della transazione."
    - "Cambio password obbligato: la pagina /account/password contiene la card dell'account di Personalizza (PATCH /api/auth/config è la rotta di cambio password, che azzera il flag); restano ammesse anche POST /api/auth/logout e /api/auth/logout-all, e /api/locale (solo la lingua dell'interfaccia) e /api/auth/session-ended (solo un reindirizzamento), che non leggono dati; ogni pagina diversa da /account/password reindirizza lì. Il login risponde 200 con il cookie di sessione, code PASSWORD_CHANGE_REQUIRED e redirect '/account/password'."
    - "Registrate anche, fuori dalle azioni su utenti e branding: il cambio del lancio commerciale (launch.update, T-1606, al posto della sola riga di log) e il tetto dei rimborsi raggiunto (quota.refund_cap_reached di T-1703, actor null)."
    - "Lettura: GET /api/admin/audit-log?cursor= solo root admin (requireRootAdminUserFromRequest), 50 righe per pagina ordinate per created_at e id decrescenti; sezione in app/admin/page.tsx resa solo se user.isRootAdmin."

  acceptance_criteria:
    - id: AC-1704-1
      given: "un admin non root e un abbonato U"
      when: "l'admin invia PATCH /api/admin/users/{U} con newPassword 'Temp-Pass-123' e confirmPassword uguale"
      then: "la risposta è 200; admin_audit_log ha 1 riga con action 'user.password_reset', actor_user_id dell'admin e target_id U; la riga serializzata non contiene 'Temp-Pass-123'"
    - id: AC-1704-2
      given: "U dopo il reset di AC-1704-1, con un cookie di sessione emesso prima del reset"
      when: "U usa il vecchio cookie su POST /api/projects, poi fa login con la nuova password e invia POST /api/projects con il nuovo cookie"
      then: "il vecchio cookie riceve 401; il login risponde con code PASSWORD_CHANGE_REQUIRED e redirect a /account/password; la POST con il nuovo cookie riceve 403 PASSWORD_CHANGE_REQUIRED; l'outbox contiene 1 email a U con template admin_password_reset"
    - id: AC-1704-3
      given: "un root admin, utenti di prova e un admin non root"
      when: "il root admin sospende un utente, cambia il ruolo di un altro, ne elimina un terzo e aggiorna il branding, poi l'admin non root tenta di modificare un admin"
      then: "admin_audit_log contiene esattamente 4 nuove righe con action user.suspend, user.role_change, user.delete e branding.update; il tentativo dell'admin non root riceve 403 e non aggiunge righe"
    - id: AC-1704-4
      given: "60 righe di audit presenti"
      when: "un admin non root e il root admin chiamano GET /api/admin/audit-log"
      then: "l'admin non root riceve 403; il root admin riceve 200 con 50 righe ordinate per created_at decrescente e un cursore per la pagina successiva"

  target_tests:
    - file: "tests/integration/admin-audit-log.test.ts"
      covers: [AC-1704-1, AC-1704-2, AC-1704-3, AC-1704-4]

  security_notes:
    - "A09 Security Logging and Alerting Failures / CWE-778 (Insufficient Logging): ogni azione amministrativa su utenti e branding lascia una traccia atomica con autore, bersaglio e data."
    - "A09 / CWE-532 (Insertion of Sensitive Information into Log File): metadata privi di password, hash, token e data URL."
    - "A01 Broken Access Control / CWE-269 (Improper Privilege Management): il reset da admin non consente di usare l'account in silenzio: cambio password obbligato, sessioni revocate, email all'utente."
    - "A01 / CWE-284: registro leggibile solo dal root admin; nessuna rotta di update o delete."

  out_of_scope:
    - "Anonimizzazione del registro alla cancellazione dell'account: T-1804."
    - "Alerting esterno sugli eventi: T-601 e T-602."

- id: T-1705
  title: "Cruscotto KPI per il root admin"
  macrotask: "abuse-quotas"
  depends_on: [T-1603, T-1703]

  objective: >
    Mostrare al solo root admin indicatori aggregati di piattaforma: utenti, workspace,
    abbonamenti per piano e stato, MRR stimato dai dati del provider, estrazioni al giorno
    e tasso di job falliti, senza esporre dati di progetto degli utenti.

  definition_of_done:
    - "GET /api/admin/kpi solo root admin (requireRootAdminUserFromRequest: admin non root e abbonati 403, anonimi 401); sezione KPI in app/admin/page.tsx resa solo se user.isRootAdmin."
    - "Metriche calcolate con sole query aggregate (count, groupBy): utenti totali, attivi e sospesi; workspace totali; abbonamenti per piano e per status (trialing, active, past_due, paused); estrazioni per giorno negli ultimi 30 giorni (jobs.created_at in UTC); tasso di job falliti negli ultimi 7 giorni = failed diviso (completed + failed), null se il denominatore è 0."
    - "MRR stimato per valuta: somma, sugli abbonamenti active e past_due, di recurring_amount_minor per quantity diviso i mesi del ciclo (month: frequency; year: 12 per frequency; week: frequency per 12/52; day: frequency per 12/365), arrotondato all'intero, in unità minima e senza conversione di valuta; i campi sono quelli salvati da T-1603 dal payload Paddle; nessuna chiamata a Paddle dal cruscotto."
    - "Privacy: risposta con chiavi di primo livello in whitelist (users, workspaces, subscriptions, mrr, extractionsPerDay, failedJobRate7d) e solo numeri; nessun nome di progetto, keyword, seed, email o username, coerente con la promessa di app/admin/page.tsx che i dati progetto degli utenti restano privati."
    - "Forma: users {total, active, suspended}; workspaces {total}; subscriptions {byPlan, byStatus} (conteggi per id di piano e per status); mrr {<codice valuta>: importo in unità minima}; extractionsPerDay array di 30 {date YYYY-MM-DD, count} dal giorno più vecchio a oggi (UTC); failedJobRate7d numero o null sui job creati negli ultimi 7 giorni."

  acceptance_criteria:
    - id: AC-1705-1
      given: "una fixture con 1 abbonamento active mensile da 1000 centesimi EUR quantity 1, 1 active annuale da 12000 centesimi EUR e 1 canceled"
      when: "il root admin chiama GET /api/admin/kpi"
      then: "subscriptions riporta 2 abbonamenti active e mrr.EUR vale 2000"
    - id: AC-1705-2
      given: "4 job completed e 1 failed negli ultimi 7 giorni più 3 job creati 40 giorni fa"
      when: "il root admin chiama GET /api/admin/kpi"
      then: "failedJobRate7d vale 0.2 ed extractionsPerDay ha 30 elementi la cui somma è 5"
    - id: AC-1705-3
      given: "una fixture con un progetto 'Progetto-Segreto-XYZ', una keyword 'keyword-privata-123' e utenti con email note"
      when: "si serializza la risposta di GET /api/admin/kpi"
      then: "la stringa JSON non contiene 'Progetto-Segreto-XYZ', 'keyword-privata-123' né alcuna email o username della fixture, e le chiavi di primo livello coincidono con la whitelist"
    - id: AC-1705-4
      given: "un admin non root, un abbonato e un visitatore anonimo"
      when: "ciascuno chiama GET /api/admin/kpi"
      then: "le risposte sono rispettivamente 403, 403 e 401"

  target_tests:
    - file: "tests/integration/admin-kpi.test.ts"
      covers: [AC-1705-1, AC-1705-2, AC-1705-3, AC-1705-4]

  security_notes:
    - "A01 Broken Access Control / CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor): endpoint e sezione solo per il root admin."
    - "A01 / CWE-359 (Exposure of Private Personal Information to an Unauthorized Actor): whitelist di chiavi aggregate, nessun dato di progetto né identificativo personale."

  out_of_scope:
    - "Analytics di prodotto o tracciamento degli utenti: esclusi da D-13."
    - "Conversione di valuta dell'MRR: non prevista."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
- Rilievi da confermare: soglie di rate limit di T-1701 sono valori iniziali PROPOSTI (configurabili), non decisioni del ledger; il conteggio delle estrazioni fallite (T-1703) va confermato con D-14.
- Emendamento del 2026-10-08 allo stato dei macrotask 01-16 (il design non cambia):
  - D-27 emendata il 2026-10-05 (meccanismo deciso dall'utente) entra nel modulo: rate limit sugli avvii (T-1701, AC-1701-5), causa del fallimento INTERNAL o USER, rimborso della quota per INTERNAL entro un tetto mensile per workspace con avviso oltre il tetto, un job attivo per workspace (T-1703, AC-1703-6 e AC-1703-7). Valori PROPOSTI o segnaposto di D-14: avvii 30 ogni ora per workspace, `runRefundsPerMonth` 0 nella politica dei piani; tutto vale solo con il lancio attivo (D-32).
  - D-32 (T-1606): le quote si riservano solo con il lancio attivo; il CAPTCHA della registrazione (aperta solo col lancio attivo) è sempre obbligatorio, quello del recupero password solo con Turnstile configurato o lancio attivo; le chiavi di Turnstile sono la voce captcha della checklist del lancio.
  - T-1401: la registrazione usa l'email (AC-1702-2) e risponde 202 CHECK_EMAIL (T-1403); l'IP del client si legge da x-forwarded-for solo su Vercel (VERCEL=1).
  - T-1704: template `admin-password-reset` (nomi kebab-case dei template del repo), pagina `/account/password` con la card dell'account e rotte ammesse durante il cambio obbligato; registro anche del cambio del lancio (T-1606) e del tetto dei rimborsi (T-1703).
- Rilievi della costruzione (2026-10-08, il design non cambia):
  - T-1701: chiavi `login:ip-email:<ip>:<email>`, `login:ip:<ip>`, `register:ip:<ip>`, `reset:email:<email>`, `reset:ip:<ip>` e `run:workspace:<id>`; la pulizia gira nel cron giornaliero `/api/cron/reap-jobs` con il solo conteggio nel log (`rate_limit_hits_pruned`), così il corpo della risposta del cron (AC-1203-3) non cambia. Gli E2E girano con soglie alte del login (stesso utente e IP `unknown` in ogni spec), le soglie basse sono provate dai test d'integrazione. La registrazione legge il body prima del rate limit (serve il token del CAPTCHA): l'ordine rate limit, CAPTCHA, logica resta.
  - T-1702: con una secret di test di Cloudflare (solo fuori produzione) siteverify restituisce hostname e action fittizi e conta solo success; registrazione e richiesta di reset passano dalla stessa guardia (`guardPublicForm`: rate limit poi CAPTCHA). Senza la site key nessun widget e la CSP resta com'era (baseline visive invariate).
  - T-1703: il valore dell'enum per il fornitore con licenza è `licensed_keywords_month` (il nome più lungo era un falso positivo della regola gitleaks `trueline-generic-assigned-secret` nel client generato da Prisma); la concessione della quota del fornitore si registra nel cursore del job prima della richiesta, così un passo ripreso non la consuma due volte; la quota mensile di keyword si riserva nella transazione dello store; i contatori non si scrivono in pausa. Il tetto dei rimborsi è `runRefundsPerMonth` nella politica dei piani (segnaposto 0 di D-14). Il riepilogo d'uso compare in `/billing` solo con il lancio attivo.
  - T-1704: AC-1704-2 usa POST /api/projects (la GET è stata rimossa da T-1101); una modifica che non cambia ruolo o stato non scrive righe; il cambio del lancio scrive `launch.update` al posto della riga di log; durante il cambio obbligato l'OAuth di Google Sheets risponde come una sessione scaduta; la pagina del cambio password viene prima del gate dei termini (l'accettazione è un'API).
  - T-1705: la risposta ha le sole chiavi della whitelist al primo livello (nessun involucro `data`); `subscriptions.byStatus` elenca tutti gli stati, anche a zero; i tipi condivisi con i componenti stanno in `lib/admin/kpi-types.ts` e `lib/billing/usage-types.ts` (contratto D-22: i componenti non raggiungono Prisma).
