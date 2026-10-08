# Ambienti di Seo God Mode

> Matrice delle variabili d'ambiente per Production, Preview e Development (T-203, D-04).
> Le variabili sono dichiarate in `ENV_KEYS` di `lib/env.ts` e validate all'avvio (T-201):
> con un valore non ammesso il server non parte e l'errore nomina la variabile, mai il valore.
> Vincoli e default di ogni variabile: `.env.example`.

Legenda: **obbl.** = obbligatoria · **facolt.** = facoltativa (vale il default) · **no** = non impostare.
Provenienza: *Vercel* = Settings → Environment Variables del progetto, per ambiente;
*piattaforma* = impostata da Vercel o da Next; *locale* = file `.env` della macchina di sviluppo.

## Matrice delle variabili

| Variabile | Production | Preview | Development | Segreta | Provenienza |
|---|---|---|---|---|---|
| `NODE_ENV` | `production` | `production` | `development` | no | piattaforma (Next: `next build`/`next start` in production, `next dev` in development) |
| `APP_AUTH_ENABLED` | facolt. (attiva; disattivarla è un errore) | facolt. (come Production) | facolt. | no | Vercel / locale |
| `APP_ADMIN_EMAIL` | obbl.: email del root admin (T-1401); il seed la assegna, già verificata, al root admin senza email | obbl., come Production (stesse variabili) | obbl. solo per il bootstrap con la tabella `users` vuota | no | Vercel / locale |
| `APP_PUBLIC_SIGNUP_ENABLED` | facolt. (default `true`) | facolt. | facolt. | no | Vercel / locale |
| `APP_SESSION_SECRET` | obbl.: almeno 32 caratteri, non un segnaposto | obbl., stessi vincoli di Production | obbl. (nessun default; fuori produzione sono ammessi i segnaposto di `.env.example`) | sì | Vercel (Sensitive), generata con `openssl rand -hex 32` / locale |
| `APP_SESSION_MAX_AGE_SECONDS` | facolt. (intero 60…31536000, default 604800) | facolt. | facolt. | no | Vercel / locale |
| `APP_ENCRYPTION_KEY` | obbl.: almeno 32 caratteri, non un segnaposto; se cambia, le credenziali Google cifrate a DB non si leggono più | obbl., uguale a Production (stesso DB, stesse credenziali cifrate) | obbl. (nessun default; fuori produzione sono ammessi i segnaposto di `.env.example`) | sì | Vercel (Sensitive), generata con `openssl rand -hex 32` / locale |
| `APP_COOKIE_SECURE` | facolt. (`auto`: secure in produzione) | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_NAME` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL_DARK` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL_LIGHT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `DATABASE_URL` | obbl.: pooler del progetto Supabase di produzione (porta 6543) | obbl.: lo stesso di Production (nessuno staging, D-04) | obbl.: Postgres locale | sì (contiene la password) | Vercel (Sensitive) / locale |
| `DIRECT_URL` | obbl.: produzione, porta 5432 (migrate e seed) | obbl.: lo stesso di Production (nessuno staging, D-04) | obbl.: Postgres locale | sì (contiene la password) | Vercel (Sensitive) / locale |
| `PRODUCTION_DB_HOST` | no | no finché non c'è uno staging: senza, le Preview non migrano né fanno il seed | no | no | Vercel (solo Preview, se si introduce uno staging) |
| `PRISMA_CONNECTION_LIMIT` | facolt. (intero 1…50, default 3) | facolt. | facolt. (default 1) | no | Vercel / locale |
| `PRISMA_POOL_TIMEOUT` | facolt. (intero 1…120, default 15) | facolt. | facolt. | no | Vercel / locale |
| `MAX_EXPANSION_QUERIES` | facolt. (intero 50…5000, default 250) | facolt. | facolt. | no | Vercel / locale |
| `EXTRACTION_TX_TIMEOUT_MS` | facolt. (intero 5000…300000, default 60000) | facolt. | facolt. | no | Vercel / locale |
| `JOB_AUTOCOMPLETE_BATCH` | facolt. (intero 1…500, default 24: query di autocomplete per batch di un job, T-1202) | facolt. | facolt. | no | Vercel / locale |
| `JOB_STEP_BUDGET_MS` | facolt. (intero 5000…240000, default 60000: durata di un passo del job; ogni passo resta sotto i 300 s di `maxDuration`) | facolt. | facolt. | no | Vercel / locale |
| `JOB_STALE_AFTER_MS` | facolt. (intero 35000…3600000, default 180000: heartbeat fermo oltre il quale il reaper riprende il job; rifiutata se non supera `JOB_STEP_BUDGET_MS` di almeno 30000) | facolt. | facolt. | no | Vercel / locale |
| `JOB_MAX_ATTEMPTS` | facolt. (intero 1…20, default 5: tentativi di un job prima del fallimento definitivo) | facolt. | facolt. | no | Vercel / locale |
| `JOB_SIGNING_SECRET` | obbl.: almeno 32 caratteri, non un segnaposto, diversa da `APP_SESSION_SECRET` (firma HMAC dei passi dei job, T-1203) | obbl., come Production (stesse variabili) | facolt. (senza, i job non proseguono oltre il primo passo) | sì | Vercel (Sensitive), generata con `openssl rand -hex 32` / locale |
| `CRON_SECRET` | facolt. ma necessaria al cron dei job (almeno 16 caratteri; Vercel la invia come `Authorization: Bearer`; senza, `/api/cron/reap-jobs` risponde 401) | facolt. | facolt. | sì | Vercel (Sensitive) / locale |
| `APP_PUBLIC_URL` | obbl. (T-1402): URL https dell'app, unica base dei link nelle email (mai l'header Host) e delle chiamate interne fuori da Vercel; su Vercel le chiamate interne usano `VERCEL_URL` | obbl., come Production | facolt. (`http://localhost:3000`; http ammesso solo per localhost; senza, l'invio delle email fallisce) | no | Vercel / locale |
| `EMAIL_TRANSPORT` | obbl.: `resend` (T-1402, D-11; `outbox` è rifiutato all'avvio) | obbl., come Production | facolt. (default `outbox`: le email finiscono nella tabella `email_outbox`) | no | Vercel / locale |
| `RESEND_API_KEY` | facolt. finché Resend non è configurato (D-11 emendata il 2026-10-07: si configura alla fine del blueprint), poi obbl.: chiave API di Resend con permesso di invio, insieme a `EMAIL_FROM`; senza, nessuna email parte; mai nel sorgente né nei log | come Production | no (con `outbox` non serve) | sì | Vercel (Sensitive) / locale |
| `EMAIL_FROM` | come `RESEND_API_KEY` (insieme o nessuna): mittente su un dominio verificato in Resend, `indirizzo` oppure `Nome <indirizzo>` | come Production | facolt. | no | Vercel / locale |
| `VERCEL_URL` | no (di sistema: dominio della deployment corrente, base delle chiamate interne dei job) | no (di sistema) | no | no | piattaforma (Vercel) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | no (di sistema: presente se è attivo Protection Bypass for Automation; serve alle chiamate interne verso deployment protette) | no (di sistema) | no | sì | piattaforma (Vercel, Settings → Deployment Protection) |
| `AUTOCOMPLETE_TIMEOUT_MS` | facolt. (intero 1000…30000, default 4500) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_MAX_RETRIES` | facolt. (intero 0…5, default 2) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_RATE_LIMIT_MS` | facolt. (intero 50…10000, default 180) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_CACHE_TTL_MS` | facolt. (intero 30000…86400000, default 300000) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_CONCURRENCY` | facolt. (intero 1…20, default 6) | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_AUTOCOMPLETE_ENDPOINT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_AUTOCOMPLETE_CLIENT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `DATAFORSEO_LOGIN` | facolt. (login dell'account API DataForSEO, D-30; senza login o password il provider DATAFORSEO non chiama il fornitore e dichiara `PROVIDER_NOT_CONFIGURED`) | facolt. (come Production: stesse variabili) | facolt. (di norma vuota) | no | Vercel / locale |
| `DATAFORSEO_PASSWORD` | facolt. (password dell'account API DataForSEO; mai in DB né nei log) | facolt. | facolt. (di norma vuota) | sì | Vercel (Sensitive) / locale |
| `DATAFORSEO_TIMEOUT_MS` | facolt. (intero 1000…120000, default 30000: timeout di ogni richiesta a DataForSEO) | facolt. | facolt. | no | Vercel / locale |
| `DATAFORSEO_MAX_ATTEMPTS` | facolt. (intero 1…6, default 3: tentativi per lotto, ripetuti solo su 429, 5xx, timeout e codici 40202, 40209, 5xxxx) | facolt. | facolt. | no | Vercel / locale |
| `METRICS_MONTHLY_BUDGET_USD` | facolt. (importo decimale >= 0, default 0: tetto mensile globale della spesa del fornitore di metriche, mese UTC; con 0 nessuna richiesta e `METRICS_BUDGET_EXCEEDED`) | facolt. (come Production: stesse variabili) | facolt. | no | Vercel / locale |
| `METRICS_RUN_BUDGET_USD` | facolt. (importo decimale >= 0, default 0: tetto di spesa per singola estrazione; oltre, `RUN_BUDGET_EXCEEDED`) | facolt. | facolt. | no | Vercel / locale |
| `METRICS_COST_PER_REQUEST_USD` | facolt. (importo decimale >= 0, default 0.09: costo stimato di una richiesta live, prenotato prima dell'invio) | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_SHEETS_OAUTH_CLIENT_ID` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_SHEETS_OAUTH_CLIENT_SECRET` | facolt. | facolt. | facolt. | sì | Vercel / locale / dashboard admin |
| `GOOGLE_SHEETS_OAUTH_REDIRECT_URI` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `SENTRY_DSN` | facolt. (senza DSN Sentry resta spento sul server; DSN https del progetto Sentry) | facolt. (come Production: stesse variabili) | facolt. (di norma vuota) | no (configurazione, non segreto) | Vercel / locale |
| `NEXT_PUBLIC_SENTRY_DSN` | facolt. (stesso DSN, per il browser; letta in build, aggiunge l'host di ingest a `connect-src` della CSP) | facolt. | facolt. (di norma vuota) | no (finisce nel bundle client) | Vercel / locale |
| `SENTRY_AUTH_TOKEN` | facolt. (solo build: caricamento delle source map; senza token il caricamento si salta e la build prosegue; mai con prefisso `NEXT_PUBLIC_`) | facolt. | no | sì | Vercel (Sensitive) / CI |
| `SENTRY_ORG` | facolt. (slug dell'organizzazione Sentry, solo build) | facolt. | no | no | Vercel |
| `SENTRY_PROJECT` | facolt. (slug del progetto Sentry, solo build) | facolt. | no | no | Vercel |
| `LOG_LEVEL` | facolt. (`debug`, `info`, `warn` o `error`; default `info`) | facolt. | facolt. | no | Vercel / locale |
| `PADDLE_ENV` | facolt. finché il lancio commerciale è in pausa (D-32), poi obbl. (checklist di T-1606): `sandbox` o `production`; obbligatoria se è impostata un'altra variabile di Paddle; con un valore, la CSP ammette l'iframe e gli stili del checkout di quell'ambiente | come Production (stesse variabili: `sandbox` per provare) | facolt. (`sandbox`) | no | Vercel / locale |
| `PADDLE_API_KEY` | come `PADDLE_ENV`: chiave API di Paddle Billing; con `PADDLE_ENV=sandbox` deve contenere `sdbx`, con `production` no (errore all'avvio, senza mostrare il valore); mai nel sorgente né nei log | come Production | facolt. (chiave sandbox) | sì | Vercel (Sensitive) / locale |
| `PADDLE_WEBHOOK_SECRET` | come `PADDLE_ENV`: segreto della notification destination (`pdl_ntfset_...`) che firma i webhook su `/api/billing/webhook`; senza, ogni webhook risponde 401 | come Production | facolt. | sì | Vercel (Sensitive) / locale |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | come `PADDLE_ENV`: client token di Paddle.js (pubblico); con `PADDLE_ENV=sandbox` inizia con `test_`, con `production` no | come Production | facolt. (`test_...`) | no | Vercel / locale |
| `PADDLE_API_BASE_URL` | no (rifiutata all'avvio in produzione) | no | facolt. (solo test: base URL di un fake HTTP dell'API di Paddle) | no | locale |
| `PADDLE_WEBHOOK_TOLERANCE_SECONDS` | facolt. (intero 1…300, default 5: tolleranza sul timestamp della firma dei webhook) | facolt. | facolt. | no | Vercel / locale |
| `PADDLE_PRICE_*` | come `PADDLE_ENV`: price id di Paddle (`pri_...`) dei piani pubblici a pagamento, una variabile per piano e intervallo, con i nomi dichiarati da `priceEnv` in `lib/billing/plans.ts` (D-14); un valore malformato è un errore all'avvio | come Production | facolt. | no | Vercel / locale |
| `RATE_LIMIT_LOGIN_IP_EMAIL_MAX` | facolt. (intero 1…10000, default 5: tentativi di login per IP+email nella finestra (T-1701, valore PROPOSTO)) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_LOGIN_IP_MAX` | facolt. (intero 1…100000, default 50: tentativi di login per IP nella finestra) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_LOGIN_WINDOW_SECONDS` | facolt. (intero 1…86400, default 900: finestra scorrevole del login) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_REGISTER_IP_MAX` | facolt. (intero 1…10000, default 5: registrazioni per IP nella finestra) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_REGISTER_WINDOW_SECONDS` | facolt. (intero 1…86400, default 3600: finestra della registrazione) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_RESET_EMAIL_MAX` | facolt. (intero 1…10000, default 3: richieste di reset password per email nella finestra) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_RESET_IP_MAX` | facolt. (intero 1…100000, default 20: richieste di reset password per IP nella finestra) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_RESET_WINDOW_SECONDS` | facolt. (intero 1…86400, default 3600: finestra della richiesta di reset) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_RUN_START_MAX` | facolt. (intero 1…10000, default 30: avvii di estrazione per workspace nella finestra, solo con il lancio commerciale attivo (D-27 emendata)) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_RUN_START_WINDOW_SECONDS` | facolt. (intero 1…86400, default 3600: finestra degli avvii di estrazione) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_CONTACT_IP_MAX` | facolt. (intero 1…10000, default 5: invii del modulo contatti per IP nella finestra, T-1805) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_CONTACT_EMAIL_MAX` | facolt. (intero 1…10000, default 3: invii del modulo contatti per email del mittente nella finestra) | facolt. | facolt. | no | Vercel / locale |
| `RATE_LIMIT_CONTACT_WINDOW_SECONDS` | facolt. (intero 1…86400, default 3600: finestra del modulo contatti) | facolt. | facolt. | no | Vercel / locale |
| `SUPPORT_EMAIL` | facolt. (email valida: destinatario del modulo contatti, T-1805; senza, `APP_ADMIN_EMAIL`) | come Production | facolt. (senza entrambe il modulo risponde 503 `CONTACT_UNAVAILABLE`) | no | Vercel / locale |
| `VERCEL` | no (di sistema: `1` sulle deployment; solo lì `x-forwarded-for` è l'IP del client nelle chiavi del rate limit e nel `remoteip` del CAPTCHA, T-1701) | no (di sistema) | no (fuori da Vercel l'IP vale `unknown`) | no | piattaforma (Vercel) |
| `TURNSTILE_SECRET_KEY` | facolt. finché il lancio commerciale è in pausa (D-32), poi obbl. (voce captcha della checklist di T-1606): secret di Cloudflare Turnstile, insieme a `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; le chiavi di test di Cloudflare (`1x00000…`, `2x00000…`, `3x00000…`) sono rifiutate all'avvio; mai nel sorgente né nei log | come Production | facolt. (chiavi di test di Cloudflare che passano sempre) | sì | Vercel (Sensitive) / locale |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | come `TURNSTILE_SECRET_KEY` (insieme o nessuna): site key del widget; letta in build, accende il widget su registrazione e recupero password e aggiunge `challenges.cloudflare.com` a `script-src` e `frame-src` della CSP | come Production | facolt. | no (finisce nel bundle client) | Vercel / locale |

## Production

- DB: il progetto Supabase di produzione, con `DATABASE_URL` sul pooler (6543) e `DIRECT_URL`
  sulla porta 5432.
- Build (`npm run vercel-build` → `scripts/vercel-build.mjs`, T-202): con `VERCEL_ENV=production`
  applica `prisma migrate deploy`, poi `prisma db seed`, poi `next build`; un comando fallito ferma
  il build con lo stesso exit code.
- Un progetto Supabase in pausa (piano gratuito, dopo un periodo di inattività) fa fallire il build
  al primo passo: `prisma migrate deploy` non raggiunge il DB. Si riattiva dal pannello Supabase.

### Account ed email (T-1401…T-1405)

- L'identità di accesso è l'email. Gli utenti creati prima della migrazione `0027_email_identity` restano nel DB con
  email nulla (utenti legacy, solo dati di prova per D-05) e non possono più accedere; il loro username è diventato
  il nome mostrato. Il root admin riceve `APP_ADMIN_EMAIL` dal seed del deploy di produzione e continua ad accedere
  con la sua password.
- Con la tabella `users` vuota il primo login o la prima registrazione creano il root admin di `APP_ADMIN_EMAIL` con
  una password casuale mai comunicata: il primo accesso passa da «Password dimenticata?» (`/forgot-password`).
  `APP_AUTH_USERNAME` e `APP_AUTH_PASSWORD` non esistono più.
- Email transazionali con Resend (D-11): verifica dell'email, recupero password, avviso di account esistente. Fino alla
  configurazione di Resend (D-11 emendata il 2026-10-07, a fine blueprint) `RESEND_API_KEY` ed `EMAIL_FROM` mancano:
  l'app parte, ogni invio fallisce come «resend non configurato» nei log, i nuovi utenti non ricevono la verifica e il
  nuovo invio risponde 503 `EMAIL_UNAVAILABLE`. Prima del primo invio va verificato su Resend il dominio di `EMAIL_FROM` (record DNS SPF e DKIM indicati da Resend;
  DMARC consigliato): azione dell'utente, fuori dal codice. Un invio fallito è registrato nei log con template, id del
  messaggio e dominio del destinatario, mai l'indirizzo completo.
- I link delle email (verifica 24 h, recupero password 1 h, monouso) usano solo `APP_PUBLIC_URL`.

### Job in background (T-1203)

- L'estrazione avanza a passi brevi: dopo ogni passo la funzione pianifica il successivo con una POST firmata
  (`JOB_SIGNING_SECRET`) verso `/api/internal/jobs/{id}/advance` della stessa deployment (`https://` +
  `VERCEL_URL`). Le URL delle deployment sono protette da Vercel Authentication: va attivato **Protection Bypass
  for Automation** (Settings → Deployment Protection), che fornisce `VERCEL_AUTOMATION_BYPASS_SECRET`; senza, le
  continuazioni ricevono la pagina di login di Vercel e i job restano fermi fino al recupero.
- Recupero principale al polling di stato (`GET /api/jobs/{id}`, collegato da T-1204): un job con heartbeat fermo
  da più di `JOB_STALE_AFTER_MS` riparte, fino a `JOB_MAX_ATTEMPTS` tentativi.
- Cron di sicurezza in `vercel.json`: `GET /api/cron/reap-jobs` ogni giorno alle 04:00 UTC, l'unica frequenza
  ammessa sul piano Hobby (precisione oraria); su Pro la frequenza può salire fino a una volta al minuto. Vercel
  invia `CRON_SECRET` come `Authorization: Bearer`; senza `CRON_SECRET` la rotta risponde 401.

## Preview

- DB: lo stesso di Production. Niente staging, per decisione dell'utente del 2026-10-04
  (emendamento di D-04): le variabili sono condivise tra Production, Preview e Development.
- `PRODUCTION_DB_HOST` non è impostata, quindi il build di Preview salta migrazioni e seed e lo
  scrive nel log con il prefisso `[vercel-build]` (T-202). Le migrazioni arrivano sul DB solo con
  il deploy di Production, cioè dopo il merge su `master`.
- Il codice di un branch in Preview legge e scrive il DB di produzione (rischio accettato con D-05:
  in produzione ci sono solo dati di prova). Se il branch contiene una migrazione nuova, in Preview
  gira sullo schema vecchio finché non viene mergiato.
- `NODE_ENV` vale `production` anche qui: valgono gli stessi vincoli di Production su
  autenticazione e segreti.

## Development

- DB: Postgres locale indicato nel `.env` (vedi `.env.example`).
- Test: Postgres di test in Docker (`docker compose -f docker-compose.test.yml up -d`) con
  `TEST_DATABASE_URL`, accettato solo se locale (guardia di T-101).
- Il file `.env.development.local` scritto da `vercel env pull --environment=development` è
  facoltativo per `env:check`.

## Staging

Non previsto: decisione dell'utente del 2026-10-04 (emendamento di D-04). Con la configurazione
attuale `npm run env:check` esce con 1 e stampa `PREVIEW USA IL DB DI PRODUZIONE`: è l'esito
atteso. Se in futuro serve uno staging, i passi sono questi.

1. Creare il progetto Supabase di staging (stessa regione della produzione).
2. Copiare le stringhe di connessione dello staging nelle variabili dell'ambiente **Preview** di
   Vercel: pooler in transaction mode (porta 6543) in `DATABASE_URL`, porta 5432 in `DIRECT_URL`.
3. Sempre in Preview: `PRODUCTION_DB_HOST` con l'identità del DB di produzione
   (`postgres.<ref-produzione>@<host del pooler>`), `APP_SESSION_SECRET` e `APP_ENCRYPTION_KEY`
   generate apposta (diverse da Production) e `APP_ADMIN_EMAIL` per il root admin dello staging.
4. Eseguire un deploy Preview (push di un branch): il log del build deve contenere
   `[vercel-build] migrazioni applicate: DB di Preview distinto da quello di produzione`.
5. Scaricare le variabili e verificare:

   ```bash
   vercel env pull --environment=production .env.production.local
   vercel env pull --environment=preview .env.preview.local
   npm run env:check
   ```

   `env:check` stampa host, porta, database e utente di `DATABASE_URL` e `DIRECT_URL` per ogni
   ambiente, con la password sostituita da `***`; esce con 1 e stampa
   `PREVIEW USA IL DB DI PRODUZIONE` se Preview e Production condividono il DB, oppure se manca
   il file di uno dei due ambienti (indicando il comando `vercel env pull` da eseguire).
6. Registrare la decisione con un emendamento di D-04 e l'esito in `docs/blueprint/SESSION-STATE.md`.

I file `.env*.local` contengono segreti reali e sono esclusi da git (`.gitignore`).
