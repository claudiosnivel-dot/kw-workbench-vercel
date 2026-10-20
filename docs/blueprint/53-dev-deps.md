# 53-dev-deps — Macrotask `dev-deps`

> Dipendenze di sviluppo (D-50): vite 8.3.2 ha tre avvisi nuovi su launch-editor (uno HIGH), segnalati da osv-scanner nel checkpoint del modulo 45 il 2026-10-20. Il modulo porta vite alla versione con la correzione, senza toccare nient'altro dello stack.

## Obiettivo del macrotask
Dopo il modulo 45 il checkpoint conta osv 3: oltre a uuid (via exceljs) e a braces (già nell'allowlist dal 2026-10-04, nessuna correzione upstream), vite 8.3.2 porta GHSA-587h-7wmj-h5pm (HIGH), GHSA-698v-4r3x-3vcv e GHSA-r825-w8mm-5pxw (launch-editor su Windows, corretti da vite 8.3.3). vite serve solo a Vitest e non arriva in produzione, ma quando `npm audit` riceverà l'avviso HIGH il test delle dipendenze (T-401) diventerebbe rosso. Dopo questo modulo:

- **vite aggiornata**: una sola vite nel lockfile, alla versione fissata con la correzione, anche sotto vitest.
- **Controllo**: il test delle dipendenze verifica la versione minima di vite; osv-scanner nel checkpoint non trova più i tre avvisi.

## Task atomici

```yaml
- id: T-5301
  title: "vite con la correzione degli avvisi di launch-editor"
  macrotask: "dev-deps"
  depends_on: [T-401, T-406]

  objective: >
    Togliere dagli strumenti di sviluppo i tre avvisi di vite 8.3.2 prima che rendano rossa la CI.

  definition_of_done:
    - "package.json: vite fissata alla versione più recente della serie 8.3 con la correzione (almeno 8.3.3; 8.3.4 il 2026-10-20), con il lockfile rigenerato da npm install; npm ls vite mostra una sola versione, anche sotto vitest e @vitest/mocker."
    - "tests/tooling/dependency-audit.test.ts: npm ls vite --json ha ogni vite almeno alla 8.3.3."
    - "Checkpoint: osv-scanner sul package-lock.json non trova GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv e GHSA-r825-w8mm-5pxw; la voce di braces dell'allowlist resta com'è."

  acceptance_criteria:
    - id: AC-5301-1
      given: "il lockfile dopo l'aggiornamento"
      when: "tests/tooling/dependency-audit.test.ts esegue npm ls vite --json"
      then: "ogni vite dell'albero ha versione maggiore o uguale a 8.3.3 e c'è una sola versione di vite"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-5301-1]

  security_notes:
    - "A06 / CWE-1104: dipendenza di sviluppo aggiornata a versione fissata e controllata da osv-scanner nel checkpoint."

  out_of_scope:
    - "braces (nessuna correzione upstream, voce dell'allowlist dal 2026-10-04) e uuid via exceljs (moderato, fuori dalla soglia); aggiornamenti di vitest o di altre dipendenze."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-10-20 (D-50) alle domande sulle scelte del modulo 45: «piccolo modulo dedicato» per gli avvisi di osv.
- Gate umani: nessuno (nessuna schermata, nessuna baseline visiva toccata).
- Ordine: dipende solo dal modulo 04, già chiuso; si costruisce quando lo dice l'utente, anche prima del 46 e del 52.
