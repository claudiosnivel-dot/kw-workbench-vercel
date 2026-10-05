# Rilascio di Seo God Mode

> Pipeline di rilascio senza staging (T-605, D-04 emendata 2026-10-05): ogni modifica arriva in produzione
> solo passando da branch, checkpoint Trueline, pull request e CI verdi. `master` è accoppiato al deploy di
> produzione su Vercel: un merge su `master` è un deploy.

## Flusso

1. **Branch di lavoro** da `master` (per i macrotask del blueprint `trueline/build/<macrotask>`), mai
   commit diretti su `master`.
2. **Checkpoint Trueline verde** al confine del macrotask (igiene, sicurezza, regressioni, conformità).
3. **Pull request** verso `master`: la CI (`.github/workflows/ci.yml`, T-110) esegue i job `checks`,
   `integration`, `e2e` e `build`.
4. **CI verde** su tutti e quattro i job.
5. **Merge su `master`**: Vercel builda con `npm run vercel-build` (T-202), applica migrazioni e seed al DB di
   produzione e pubblica il deploy su `titanseo.vercel.app`.
6. **Controllo dopo il deploy**: `GET https://titanseo.vercel.app/api/health` deve rispondere 200 con
   `version` uguale ai primi 7 caratteri del commit mergiato (T-603).

Niente staging: i deploy **Preview** dei branch leggono e scrivono il DB di produzione ma non applicano
migrazioni né seed (`PRODUCTION_DB_HOST` non impostata, T-202); una migrazione nuova arriva sul DB solo con il
deploy di produzione dopo il merge. Rischio accettato con D-05 (in produzione solo dati di prova).

## Checklist di rilascio

- [ ] Ogni cambio di schema ha la sua migrazione in `prisma/migrations/` e la suite d'integrazione la applica.
- [ ] Ogni variabile nuova è in `lib/env.ts`, in `.env.example` e in **tutte** le colonne della matrice di
      `docs/ENVIRONMENTS.md`, ed è impostata su Vercel prima del merge.
- [ ] `npm run env:check` (T-203) sui file di `vercel env pull`: l'avviso `PREVIEW USA IL DB DI PRODUZIONE`
      è l'esito atteso (nessuno staging).
- [ ] Se il rilascio contiene una migrazione: backup logico di produzione appena prima del merge
      (`docs/OPERATIONS.md`, «Backup e ripristino»).
- [ ] Dopo il deploy: `/api/health` 200 con la `version` attesa e nessun errore nuovo su Sentry (T-601).

## Rollback

- **Codice**: Instant Rollback di Vercel (dashboard → progetto → tile del deploy di produzione → *Instant
  Rollback*). Sul piano Hobby si torna solo al deploy di produzione **immediatamente precedente**; Pro ed
  Enterprise possono scegliere qualunque deploy già pubblicato in produzione. Dopo il rollback Vercel spegne
  l'assegnazione automatica dei domini di produzione: i push successivi su `master` **non** vanno online
  finché non si annulla il rollback (*Undo Rollback* nella dashboard oppure `vercel promote <deploy>`). Le
  variabili d'ambiente non tornano indietro (documentazione Vercel «Instant Rollback», letta il 2026-10-05).
- In alternativa: `git revert` del merge con una nuova PR, che ripassa da CI e deploy.
- **Migrazioni non reversibili**: il rollback del codice non annulla le migrazioni già applicate al DB. Le
  migrazioni vanno scritte compatibili con il codice precedente (prima si aggiunge, poi si rimuove in un
  rilascio successivo); per una migrazione distruttiva l'unico ritorno è il ripristino dal backup fatto
  prima del merge (`docs/OPERATIONS.md`).

## Ignored Build Step

`vercel.json` ha `ignoreCommand: "node scripts/vercel-ignore-build.mjs"` (secondo la documentazione Vercel
sovrascrive l'Ignored Build Step delle impostazioni del progetto). Lo script confronta il commit
(`VERCEL_GIT_COMMIT_SHA`) con l'ultimo deploy riuscito del branch (`VERCEL_GIT_PREVIOUS_SHA`, esposta solo
quando un Ignored Build Step è configurato e vuota al primo deploy di un branch) con `git diff --name-only`:

- **exit 0** (build annullata, stato CANCELED) solo se tutti i file cambiati stanno sotto `docs/`;
- **exit 1** (build normale) in ogni altro caso, compresi SHA mancante, diff vuoto o `git diff` in errore.

Secondo la documentazione Vercel anche le build annullate dall'Ignored Build Step contano nelle quote di
deploy e occupano uno slot di build concorrente.

## Protezione del branch `master`

Configurazione decisa dall'utente il 2026-10-05, da attivare via API GitHub:

- pull request obbligatoria per ogni modifica a `master` (0 approvazioni richieste: un solo sviluppatore);
- status check obbligatori `checks`, `integration`, `e2e` e `build`;
- niente force push e niente cancellazione del branch;
- regole valide anche per gli amministratori.

**Stato al 2026-10-05: non attivabile.** Il repository è privato e l'account GitHub è sul piano Free:
`gh api repos/claudiosnivel-dot/kw-workbench-vercel/branches/master/protection` e l'API dei ruleset
rispondono `403 Upgrade to GitHub Pro or make this repository public to enable this feature`.
**Decisione dell'utente (2026-10-05): rinuncia per ora.** Il merge su `master` resta legato a checkpoint
e CI verdi (D-04); niente GitHub Pro né repository pubblico. Comando da usare se la funzione diventa
disponibile, poi da rileggere con `gh api …/branches/master/protection`:

```bash
gh api -X PUT repos/claudiosnivel-dot/kw-workbench-vercel/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["checks", "integration", "e2e", "build"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
