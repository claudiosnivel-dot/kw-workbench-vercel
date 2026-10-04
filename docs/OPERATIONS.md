# Operazioni di Seo God Mode

> Procedure operative per il servizio in produzione (macrotask 06, D-04, D-13, D-31). Niente staging:
> c'è un solo ambiente da sorvegliare, la produzione su Vercel con il DB Supabase di produzione.

## Monitoraggio uptime

L'app espone `GET /api/health` (e `HEAD`), pubblico e senza segreti (T-603):

- **200** `{"status":"ok","db":"ok","version":"<sha>"}` quando il DB risponde a `SELECT 1` entro 2 s;
- **503** `{"status":"degraded","db":"error","version":"<sha>"}` quando il DB non risponde o va in errore
  (il motivo finisce solo nel log del server, riga `health_db_failed`);
- `version` sono i primi 7 caratteri del commit deployato (`VERCEL_GIT_COMMIT_SHA`), altrimenti la
  versione di `package.json`; header `Cache-Control: no-store`.

Monitor esterno (lo configura l'utente su un servizio a scelta, per esempio UptimeRobot o Better Stack):

| Voce | Valore |
|---|---|
| URL da monitorare | `https://titanseo.vercel.app/api/health` (produzione; niente staging, D-04) |
| Metodo | `GET` (oppure `HEAD`, stessa risposta senza body) |
| Intervallo consigliato | 5 minuti |
| Condizione di allarme | status diverso da 200 per 2 controlli consecutivi (un 503 o un timeout) |
| Destinatario | l'utente proprietario del progetto (email dell'account del servizio di monitoraggio) |

Un 503 indica il DB irraggiungibile: per prima cosa controllare nel pannello Supabase che il progetto
non sia in pausa (piano Free, D-31) e poi i log del deploy su Vercel. La configurazione del monitor e la
sua conferma vanno registrate in `docs/blueprint/SESSION-STATE.md`.

## Backup e ripristino

### Cosa offre Supabase (documentazione Supabase, verificata il 2026-10-02 e riletta il 2026-10-05)

- **Free** (piano di produzione scelto dall'utente, D-31): nessun backup giornaliero automatico. Supabase
  raccomanda di esportare regolarmente i dati con `supabase db dump` (o `pg_dump`) e di tenerne copie fuori
  da Supabase. Il backup logico di questo documento è quindi l'**unica** copia del database.
- **Pro**: 7 giorni di backup giornalieri. **Team**: 14 giorni. **Enterprise**: fino a 30 giorni.
- **Point-in-Time Recovery**: add-on per Pro, Team ed Enterprise; richiede almeno l'add-on di compute Small
  (acquisto e attivazione sono decisioni dell'utente).
- I backup del database non contengono gli oggetti dello Storage di Supabase (l'app non lo usa).

### Script (T-604)

| Comando | Cosa fa |
|---|---|
| `npm run db:backup -- --url "<DIRECT_URL>"` | `pg_dump --format=custom --no-owner --no-privileges` verso `backups/<db>-<timestamp>.dump` (cartella ignorata da git; `--out-dir` per sceglierne un'altra) |
| `npm run db:backup -- --container <nome> --db <database>` | lo stesso con il `pg_dump` dentro un container Docker (`docker exec`), per esempio il Postgres di test |
| `npm run db:restore -- --file <file.dump> --container <nome> --db <database>` | `pg_restore --clean --if-exists --no-owner` nel database indicato (che deve esistere) |
| `npm run db:restore -- --file <file.dump> --url "<url>"` | lo stesso verso una URL; se l'host coincide con `PRODUCTION_DB_HOST` esce con codice 2, salvo `--confirm-production` |

- Per il backup di produzione usare `DIRECT_URL` (porta 5432), non il transaction pooler (6543).
- La password della URL passa a `pg_dump` e `psql` in `PGPASSWORD`: non compare negli argomenti dei
  processi né in stdout e stderr.
- Lo script stampa le versioni di `pg_dump` e del server e si ferma con un errore esplicito se il server ha
  una major più recente di `pg_dump` (pg_dump non esporta da server più nuovi). Su Windows senza client
  PostgreSQL si può lanciare lo script in un container con `postgresql-client` della stessa major del server.
- I file `.dump` contengono gli hash delle password e i token OAuth cifrati: si conservano **fuori dal
  repo e fuori da Supabase**, in una cartella con accesso ristretto al solo proprietario (per esempio un
  disco cifrato o uno storage privato), mai come artifact della CI.

### Frequenza e conservazione (PROPOSTA, da confermare dall'utente, D-31)

- Backup logico **giornaliero** di produzione e, in più, uno subito prima di ogni deploy che contiene una
  migrazione.
- Conservazione: gli ultimi **14** backup giornalieri più il primo backup di ogni mese per **6 mesi**.
- Prova di ripristino **mensile** (e dopo ogni cambio di major di PostgreSQL), descritta sotto.

### Prova di ripristino periodica (Postgres locale in Docker, niente staging, D-04)

Un backup vale solo dopo un ripristino con conteggi e hash identici (stessi controlli di AC-604-1 e
AC-604-2, eseguiti in automatico da `tests/integration/backup-restore.test.ts` sul DB di test):

1. `docker compose -f docker-compose.test.yml up -d` (Postgres 16 su `localhost:54329`; per un server di
   major diversa usare un'immagine `postgres:<major>` dedicata).
2. Creare il database vuoto: `docker exec <container> psql -U postgres -c "CREATE DATABASE kwb_restore_check"`.
3. `npm run db:restore -- --file backups/<file>.dump --container <container> --db kwb_restore_check`.
4. Su origine (al momento del backup) e copia: `SELECT count(*)` per ogni tabella di `public`, compresa
   `_prisma_migrations`, e `SELECT md5(string_agg(id || keyword, '' ORDER BY id)) FROM keyword_candidates`.
   I valori devono coincidere; registrare data ed esito della prova in `docs/blueprint/SESSION-STATE.md`.
5. Eliminare la copia: `docker exec <container> psql -U postgres -c "DROP DATABASE kwb_restore_check WITH (FORCE)"`.
