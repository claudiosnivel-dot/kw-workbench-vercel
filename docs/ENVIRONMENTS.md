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
| `APP_AUTH_USERNAME` | facolt. (default `admin`) | facolt. | facolt. | no | Vercel / locale |
| `APP_AUTH_PASSWORD` | obbl. solo per il bootstrap del primo utente (tabella `users` vuota): almeno 12 caratteri, diversa da `changeme` | come Production (stesso DB) | facolt. (default `changeme`) | sì | Vercel (Sensitive) / locale |
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

## Production

- DB: il progetto Supabase di produzione, con `DATABASE_URL` sul pooler (6543) e `DIRECT_URL`
  sulla porta 5432.
- Build (`npm run vercel-build` → `scripts/vercel-build.mjs`, T-202): con `VERCEL_ENV=production`
  applica `prisma migrate deploy`, poi `prisma db seed`, poi `next build`; un comando fallito ferma
  il build con lo stesso exit code.
- Un progetto Supabase in pausa (piano gratuito, dopo un periodo di inattività) fa fallire il build
  al primo passo: `prisma migrate deploy` non raggiunge il DB. Si riattiva dal pannello Supabase.

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
   generate apposta (diverse da Production) e `APP_AUTH_PASSWORD` per il primo utente dello staging.
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
