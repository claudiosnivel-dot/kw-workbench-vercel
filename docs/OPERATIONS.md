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
