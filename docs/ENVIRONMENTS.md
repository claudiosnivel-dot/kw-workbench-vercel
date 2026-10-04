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
| `APP_AUTH_PASSWORD` | obbl. solo per il bootstrap del primo utente (tabella `users` vuota): almeno 12 caratteri, diversa da `changeme` | come Production, sul DB di staging | facolt. (default `changeme`) | sì | Vercel (Sensitive) / locale |
| `APP_PUBLIC_SIGNUP_ENABLED` | facolt. (default `true`) | facolt. | facolt. | no | Vercel / locale |
| `APP_SESSION_SECRET` | obbl.: almeno 32 caratteri, non un segnaposto | obbl., diversa da Production | facolt. (default di sviluppo) | sì | Vercel (Sensitive), generata con `openssl rand -hex 32` / locale |
| `APP_SESSION_MAX_AGE_SECONDS` | facolt. (intero 60…31536000, default 604800) | facolt. | facolt. | no | Vercel / locale |
| `APP_ENCRYPTION_KEY` | obbl.: almeno 32 caratteri, non un segnaposto; se cambia, le credenziali Google cifrate a DB non si leggono più | obbl., diversa da Production | facolt. (default di sviluppo) | sì | Vercel (Sensitive), generata con `openssl rand -hex 32` / locale |
| `APP_COOKIE_SECURE` | facolt. (`auto`: secure in produzione) | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_NAME` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL_DARK` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `APP_BRAND_LOGO_URL_LIGHT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `DATABASE_URL` | obbl.: pooler del progetto Supabase di produzione (porta 6543) | obbl.: pooler del progetto Supabase di **staging** (porta 6543) | obbl.: Postgres locale | sì (contiene la password) | Vercel (Sensitive) / locale |
| `DIRECT_URL` | obbl.: produzione, porta 5432 (migrate e seed) | obbl.: **staging**, porta 5432 | obbl.: Postgres locale | sì (contiene la password) | Vercel (Sensitive) / locale |
| `PRODUCTION_DB_HOST` | no | obbl. per migrare: identità del DB di produzione, `postgres.<ref-produzione>@<host del pooler>` | no | no | Vercel (solo Preview) |
| `PRISMA_CONNECTION_LIMIT` | facolt. (intero 1…50, default 3) | facolt. | facolt. (default 1) | no | Vercel / locale |
| `PRISMA_POOL_TIMEOUT` | facolt. (intero 1…120, default 15) | facolt. | facolt. | no | Vercel / locale |
| `MAX_EXPANSION_QUERIES` | facolt. (intero 50…5000, default 250) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_TIMEOUT_MS` | facolt. (intero 1000…30000, default 4500) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_MAX_RETRIES` | facolt. (intero 0…5, default 2) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_RATE_LIMIT_MS` | facolt. (intero 50…10000, default 180) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_CACHE_TTL_MS` | facolt. (intero 30000…86400000, default 300000) | facolt. | facolt. | no | Vercel / locale |
| `AUTOCOMPLETE_CONCURRENCY` | facolt. (intero 1…20, default 6) | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_AUTOCOMPLETE_ENDPOINT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_AUTOCOMPLETE_CLIENT` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | facolt. (API Google Ads dismessa per le metriche, D-09) | facolt. | facolt. | sì | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_CLIENT_ID` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_CLIENT_SECRET` | facolt. | facolt. | facolt. | sì | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_CUSTOMER_ID` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_REFRESH_TOKEN` | facolt. | facolt. | facolt. | sì | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_REDIRECT_URI` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_API_VERSION` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_BATCH_SIZE` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_ADS_METRICS_FILE` | facolt. | facolt. | facolt. | no | Vercel / locale |
| `GOOGLE_SHEETS_OAUTH_CLIENT_ID` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |
| `GOOGLE_SHEETS_OAUTH_CLIENT_SECRET` | facolt. | facolt. | facolt. | sì | Vercel / locale / dashboard admin |
| `GOOGLE_SHEETS_OAUTH_REDIRECT_URI` | facolt. | facolt. | facolt. | no | Vercel / locale / dashboard admin |

## Production

- DB: il progetto Supabase di produzione, con `DATABASE_URL` sul pooler (6543) e `DIRECT_URL`
  sulla porta 5432.
- Build (`npm run vercel-build` → `scripts/vercel-build.mjs`, T-202): con `VERCEL_ENV=production`
  applica `prisma migrate deploy`, poi `prisma db seed`, poi `next build`; un comando fallito ferma
  il build con lo stesso exit code.
- Un progetto Supabase in pausa (piano gratuito, dopo un periodo di inattività) fa fallire il build
  al primo passo: `prisma migrate deploy` non raggiunge il DB. Si riattiva dal pannello Supabase.

## Preview

- DB: un progetto Supabase di **staging**, separato da quello di produzione; i deploy Preview
  eseguono codice di branch non revisionato.
- `PRODUCTION_DB_HOST` è impostata solo qui. Il build applica migrazioni e seed solo se
  l'identità del DB di `DIRECT_URL` è diversa da quella indicata (utente e host per il pooler
  Supabase, solo host altrimenti); se la variabile manca, o `DIRECT_URL` non è valida, le salta e
  lo scrive nel log con il prefisso `[vercel-build]`.
- `NODE_ENV` vale `production` anche qui: valgono gli stessi vincoli di Production su
  autenticazione e segreti.

## Development

- DB: Postgres locale indicato nel `.env` (vedi `.env.example`).
- Test: Postgres di test in Docker (`docker compose -f docker-compose.test.yml up -d`) con
  `TEST_DATABASE_URL`, accettato solo se locale (guardia di T-101).
- Il file `.env.development.local` scritto da `vercel env pull --environment=development` è
  facoltativo per `env:check`.

## Passi manuali per l'utente (staging)

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
6. Comunicare l'esito: la conferma viene registrata in `docs/blueprint/SESSION-STATE.md`.

I file `.env*.local` contengono segreti reali e sono esclusi da git (`.gitignore`).
