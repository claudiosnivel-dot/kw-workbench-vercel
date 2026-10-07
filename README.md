# Seo God Mode

`Seo God Mode` e una web app Next.js + Prisma deployabile su Vercel. La logica applicativa e invariata.

## Stack

- Next.js (App Router) + TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS

## Requisiti

- Node.js 24 (`.nvmrc`, `engines.node` = `24.x`): è la major usata in CI e su Vercel, dove il build si ferma se la major è diversa (T-407). Con un'altra versione installata in locale usare `nvm use`.

## Setup locale (DB separato da Docker)

### 1) Prepara PostgreSQL locale

- Installa PostgreSQL sul PC (servizio locale)
- Crea database `kw_workbench`
- Verifica ascolto su `localhost:5432`

### 2) Configura env app

```powershell
Copy-Item .env.example .env
```

Valori minimi:

- `DATABASE_URL` (runtime app)
- `DIRECT_URL` (usato da `prisma migrate deploy` e `prisma db seed`)
- `APP_SESSION_SECRET`
- `APP_ENCRYPTION_KEY`

Note autenticazione multi-account:

- Si accede con email e password. `APP_ADMIN_EMAIL` e l'email del root admin: con il DB utenti vuoto il primo accesso
  crea il root admin con una password casuale, da impostare con "Password dimenticata?" (in sviluppo l'email finisce
  nella tabella `email_outbox`).
- Poi puoi creare nuovi account da `/register`: la registrazione chiede l'accettazione dei termini e invia l'email di
  verifica, necessaria per avviare le estrazioni.
- Ogni account vede solo i propri dati (progetti, risultati, job, integrazioni utente).

### 3) Avvio

```powershell
npm install
npm run db:deploy
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

## Deploy su Vercel

1. Push su repo Git
2. Import progetto in Vercel
3. Imposta env:
   - `DATABASE_URL`: Supabase transaction pooler (porta `6543`) con `sslmode=require&pgbouncer=true&connection_limit=1`
   - `DIRECT_URL`: Supabase session/direct (porta `5432`) con `sslmode=require`
   - altre variabili app (`APP_*`, `GOOGLE_*`, ecc.)
4. Deploy

Build command configurato:

- `npm run vercel-build` -> `npm run db:deploy && npm run build`

## Note runtime

- Prisma 7 usa il pool di `pg` (adapter `@prisma/adapter-pg`): dimensione e attesa arrivano da `PRISMA_CONNECTION_LIMIT` e `PRISMA_POOL_TIMEOUT`; `connection_limit`, `pgbouncer`, `pool_timeout` e `sslmode` nell'URL sono ignorati. Verso gli host Supabase il TLS è verificato con la CA di Supabase (`lib/db/ssl.ts`).
- Cookie auth/OAuth: `APP_COOKIE_SECURE=auto`
- Route lunghe serverless:
  - `POST /api/projects/:id/run` -> `maxDuration = 300`
  - `GET /api/projects/:id/export` -> `maxDuration = 120`

## Compatibilita Electron

La web app resta pronta per wrapping Electron: puoi puntare al dominio deployato o all'istanza locale.

## Ruoli e dashboard admin

- Ruoli supportati: `ADMIN` e `SUBSCRIBER`
- L'utente `admin` e root admin (se assente, fallback al primo utente per anti-lockout)
- Solo il root admin puo creare/promuovere altri admin
- La registrazione classica crea sempre utenti `SUBSCRIBER`
- `APP_PUBLIC_SIGNUP_ENABLED=true|false` per aprire/chiudere signup pubblico
- Dashboard admin su `/admin` per gestione utenti (monitoraggio, ruolo, sospensione, reset password, hard delete)
- Privacy: la dashboard admin non espone i progetti personali degli utenti
- Volumi di ricerca: file di Keyword Planner del cliente (`docs/PLANNER-ROUNDTRIP.md`) o fornitore DataForSEO (`docs/METRICS-PROVIDERS.md`); l'API Google Ads non si usa (D-09).

