# Seo God Mode

`Seo God Mode` e una web app Next.js + Prisma deployabile su Vercel. La logica applicativa e invariata.

## Stack

- Next.js (App Router) + TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS

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

- `DATABASE_URL` (default example gia punta a `localhost`)
- `APP_SESSION_SECRET`
- `APP_ENCRYPTION_KEY`

Note autenticazione multi-account:

- `APP_AUTH_USERNAME` e `APP_AUTH_PASSWORD` servono solo a bootstrap del primo account se il DB utenti e vuoto.
- Poi puoi creare nuovi account da `/register`.
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
3. Imposta env (soprattutto `DATABASE_URL` con DB esterno SSL)
4. Deploy

Build command configurato:

- `npm run vercel-build` -> `npm run db:deploy && npm run build`

## Note runtime

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
