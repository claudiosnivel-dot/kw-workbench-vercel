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
    - "Pulizia globale: pruneRateLimitHits(now) elimina le righe più vecchie della finestra massima configurata; esposta come npm run ratelimit:prune e collegata al cron di manutenzione se esiste (T-1203)."
    - "Regole in lib/security/rate-limit-config.ts con valori iniziali PROPOSTI e sovrascrivibili da env validata (T-201): login per IP+email 5 ogni 15 minuti e per IP 50 ogni 15 minuti; registrazione per IP 5 ogni ora; richiesta di reset per email 3 ogni ora e per IP 20 ogni ora. I test iniettano soglie basse."
    - "lib/security/client-ip.ts: primo valore di x-forwarded-for (su Vercel l'header è sovrascritto dalla piattaforma con l'IP pubblico del client); fuori da Vercel o con header assente la parte IP della chiave vale 'unknown'."
    - "Rotte: app/api/auth/login/route.ts (prima di verifyLoginCredentials, email normalizzata lowercase), app/api/auth/register/route.ts e la rotta di richiesta reset di T-1404; oltre soglia → 429 con error, code RATE_LIMITED, retryAfter e header Retry-After in secondi; la risposta non cambia tra email esistenti e inesistenti."
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

  target_tests:
    - file: "tests/integration/rate-limit-auth.test.ts"
      covers: [AC-1701-1, AC-1701-2, AC-1701-3, AC-1701-4]

  security_notes:
    - "A07 Authentication Failures / CWE-307 (Improper Restriction of Excessive Authentication Attempts): limiti per IP+email e per IP sul login, per IP sulla registrazione, per email e IP sul reset."
    - "A07 / CWE-204 (Observable Response Discrepancy): 429 e risposte del reset identiche per account esistenti e inesistenti."
    - "A02 Security Misconfiguration / CWE-348 (Use of Less Trusted Source): x-forwarded-for è considerato affidabile solo su Vercel, che lo sovrascrive; altrove la chiave degrada a 'unknown' invece di fidarsi di un header del client."
    - "A06 Insecure Design / CWE-362 (Race Condition): advisory lock per chiave, così richieste concorrenti non superano la soglia."

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
    - "lib/security/turnstile.ts: verifyTurnstile(token, remoteIp, expectedAction) invia POST a https://challenges.cloudflare.com/turnstile/v0/siteverify (form-urlencoded con secret, response, remoteip) con timeout di 5 secondi (AbortSignal.timeout); esito valido solo se success è true, hostname coincide con l'host di APP_PUBLIC_URL e action coincide con expectedAction."
    - "Esiti: token assente → 400 code CAPTCHA_REQUIRED; token più lungo di 2048 caratteri → 400 code CAPTCHA_INVALID senza chiamare siteverify; success false (ad esempio invalid-input-response o timeout-or-duplicate) oppure hostname o action diversi → 400 CAPTCHA_INVALID; errore di rete, timeout o internal-error → 503 code CAPTCHA_UNAVAILABLE."
    - "Rotte protette: app/api/auth/register/route.ts (action 'register') e rotta di richiesta reset di T-1404 (action 'password-reset'); ordine: rate limit (T-1701), poi CAPTCHA, poi logica."
    - "Client: components/register-form.tsx e il form di reset caricano https://challenges.cloudflare.com/turnstile/v0/api.js con data-action coerente e inviano il token (campo cf-turnstile-response) nel body come turnstileToken; la CSP di T-505, se già presente, consente challenges.cloudflare.com in script-src e frame-src."
    - "Env validata (T-201): TURNSTILE_SECRET_KEY e NEXT_PUBLIC_TURNSTILE_SITE_KEY obbligatorie quando la registrazione pubblica è attiva (APP_PUBLIC_SIGNUP_ENABLED, oggi default true in lib/auth/config.ts); in production le chiavi di test Cloudflare (sitekey e secret che iniziano con 1x00000, 2x00000 o 3x00000) sono rifiutate; dev ed e2e usano proprio le chiavi di test che passano sempre."
    - "Nei test di integrazione siteverify è sempre mockato con fetch mock; nessuna chiamata di rete reale."

  acceptance_criteria:
    - id: AC-1702-1
      given: "registrazione pubblica attiva e siteverify mockato"
      when: "si invia POST /api/auth/register senza turnstileToken"
      then: "la risposta è 400 con code CAPTCHA_REQUIRED; users ha lo stesso numero di righe e il mock ha ricevuto 0 chiamate"
    - id: AC-1702-2
      given: "siteverify mockato che risponde nell'ordine success false con error-codes invalid-input-response, success true con hostname 'evil.example', success true con hostname di APP_PUBLIC_URL e action 'register'"
      when: "si inviano tre registrazioni con token e username diversi da x-forwarded-for 203.0.113.9"
      then: "le prime due ricevono 400 CAPTCHA_INVALID senza nuovi utenti; la terza crea 1 utente; ogni chiamata al mock contiene secret uguale a TURNSTILE_SECRET_KEY e remoteip 203.0.113.9"
    - id: AC-1702-3
      given: "siteverify mockato e l'outbox email di test vuota"
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
  depends_on: [T-1605, T-1204, T-1604]

  objective: >
    Contare per ogni workspace le estrazioni al giorno e le keyword salvate nel mese,
    bloccare l'avvio oltre quota con 429 QUOTA_EXCEEDED e la data di azzeramento, troncare
    lo store quando la quota mensile si esaurisce a metà job e mostrare l'uso nella pagina
    di fatturazione.

  definition_of_done:
    - "prisma/schema.prisma: enum UsageMetric (runs_day, keywords_month); model UsageCounter (workspace_id, metric, period_start DateTime, count Int default 0, @@unique([workspace_id, metric, period_start])) mappato su usage_counters, con RLS abilitata senza policy (T-205)."
    - "Periodi in UTC: runs_day parte alle 00:00Z del giorno, keywords_month alle 00:00Z del primo giorno del mese; resetAt è l'inizio del periodo successivo."
    - "lib/billing/usage.ts: reserveRun(tx, workspaceId, now) esegue un incremento condizionale atomico di runs_day (INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 WHERE count è minore di runsPerDay); 0 righe → QuotaExceededError; con runsPerDay = 0 rifiuta senza eseguire l'insert; richiede anche keywords_month minore di keywordsPerMonth; è chiamata nella stessa transazione che crea il job (avvio di T-1204 per progetto e per sezione)."
    - "Oltre quota: 429 con error, code QUOTA_EXCEEDED, metric, limit e resetAt (ISO 8601); nessun job creato."
    - "Quota mensile di keyword: lo store finale della pipeline (T-1202) salva al massimo il minimo tra maxKeywordsPerRun e keywordsPerMonth meno le keyword già contate; keywords_month aumenta del numero di keyword effettivamente salvate; se si tronca per la quota, result.truncated = true e result.truncatedReason = 'monthly_quota'."
    - "Un'estrazione conta all'avvio e i job falliti non vengono stornati (scelta da confermare con D-14)."
    - "GET /api/billing/usage?workspaceId= (qualsiasi membro, non membro 404) → runsToday, runsPerDay, keywordsThisMonth, keywordsPerMonth, resetAt per metrica; components/usage-summary.tsx lo mostra ed è montato in /billing se T-1604 è già costruito, altrimenti lo monta T-1604."

  acceptance_criteria:
    - id: AC-1703-1
      given: "W su un piano di prova con runsPerDay = 2 e 2 estrazioni avviate oggi"
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

  target_tests:
    - file: "tests/integration/usage-quotas.test.ts"
      covers: [AC-1703-1, AC-1703-2, AC-1703-3, AC-1703-4]

  security_notes:
    - "A06 Insecure Design / CWE-770 (Allocation of Resources Without Limits or Throttling): quote per workspace sulle operazioni costose (autocomplete Google e metriche Ads), lette solo dai diritti lato server."
    - "A06 / CWE-362 (Race Condition): incremento condizionale atomico in SQL, nessun check-then-increment in memoria."
    - "A01 Broken Access Control / CWE-639: GET /api/billing/usage filtra per membership; un non membro riceve 404."

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
    - "Avviso: email via EmailSender (T-1402) con nuovo template admin_password_reset in it ed en, inviata all'email dell'utente dopo il commit della transazione."
    - "Lettura: GET /api/admin/audit-log?cursor= solo root admin (requireRootAdminUserFromRequest), 50 righe per pagina ordinate per created_at e id decrescenti; sezione in app/admin/page.tsx resa solo se user.isRootAdmin."

  acceptance_criteria:
    - id: AC-1704-1
      given: "un admin non root e un abbonato U"
      when: "l'admin invia PATCH /api/admin/users/{U} con newPassword 'Temp-Pass-123' e confirmPassword uguale"
      then: "la risposta è 200; admin_audit_log ha 1 riga con action 'user.password_reset', actor_user_id dell'admin e target_id U; la riga serializzata non contiene 'Temp-Pass-123'"
    - id: AC-1704-2
      given: "U dopo il reset di AC-1704-1, con un cookie di sessione emesso prima del reset"
      when: "U usa il vecchio cookie su GET /api/projects, poi fa login con la nuova password e invia GET /api/projects con il nuovo cookie"
      then: "il vecchio cookie riceve 401; il login risponde con code PASSWORD_CHANGE_REQUIRED e redirect a /account/password; la GET con il nuovo cookie riceve 403 PASSWORD_CHANGE_REQUIRED; l'outbox contiene 1 email a U con template admin_password_reset"
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
