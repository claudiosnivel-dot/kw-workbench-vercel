# 80-dep-refresh — Macrotask `dep-refresh`

> Aggiornamenti delle dipendenze decisi dall'utente il 2026-11-17 (D-67): next ed eslint-config-next alla 16.4.6, gli avvisi moderati di @sentry/nextjs, typescript-eslint e fast-uri, e la chiusura dell'eccezione di effect (D-68, prima di picomatch) quando Prisma porta la versione corretta.

## Obiettivo del macrotask
Dopo il 78 `npm audit` riporta ancora avvisi moderati (sotto la soglia del test) e, dal 2026-11-17, l'avviso high di picomatch senza correzione, tenuto nell'allowlist dal 79. L'utente ha scelto un modulo dopo il 77 per i moderati e next 16.4.6 «più avanti», non prima del 2026-11-23. Dopo questo modulo:

- **Dipendenze aggiornate**: next ed eslint-config-next 16.4.6 o una 16.4 successiva; @sentry/nextjs, typescript-eslint e fast-uri alle versioni con le correzioni, senza cambi di major.
- **Eccezione chiusa**: effect alla versione corretta con un aggiornamento di Prisma e allowlist di nuovo vuota (D-68: l'avviso di picomatch è stato ritirato il 2026-11-18 e la sua voce è uscita con il modulo 81).

## Task atomici

```yaml
- id: T-8001
  title: "next 16.4.6 e avvisi moderati di @sentry/nextjs, typescript-eslint e fast-uri"
  macrotask: "dep-refresh"
  depends_on: [T-7801, T-7901]

  objective: >
    Portare next alla 16.4.6 e togliere gli avvisi moderati che hanno una correzione senza cambi di major.

  definition_of_done:
    - "package.json: next ed eslint-config-next fissati alla stessa versione, 16.4.6 o una 16.4 successiva; @sentry/nextjs fissato alla prima versione 11.x senza gli avvisi di @sentry/nextjs, @sentry/node e @sentry/bundler-plugins o a una successiva 11.x; lockfile rigenerato da npm install, con typescript-eslint e fast-uri alle versioni corrette (con overrides solo se npm install non basta)."
    - "tests/tooling/dependency-audit.test.ts: next almeno alla 16.4.6 ed eslint-config-next alla stessa versione; npm audit senza voci per @sentry/nextjs, @sentry/node, @sentry/bundler-plugins, typescript-eslint, @typescript-eslint/* e fast-uri."

  acceptance_criteria:
    - id: AC-8001-1
      given: "il lockfile dopo l'aggiornamento"
      when: "tests/tooling/dependency-audit.test.ts esegue npm ls next eslint-config-next @sentry/nextjs --json"
      then: "il comando esce 0, next vale 16.4.6 o una 16.4 successiva, eslint-config-next ha la stessa versione di next e @sentry/nextjs ha major 11"
    - id: AC-8001-2
      given: "l'albero delle dipendenze aggiornato"
      when: "il test esegue npm audit --json"
      then: "il rapporto non ha voci per @sentry/nextjs, @sentry/node, @sentry/bundler-plugins, typescript-eslint, i pacchetti @typescript-eslint/ e fast-uri, e non ha critical"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-8001-1, AC-8001-2]

  security_notes:
    - "A06 / CWE-1104: dipendenze aggiornate a versioni fissate, controllate da npm audit nel test e da osv-scanner nel checkpoint."

  out_of_scope:
    - "exceljs e uuid (la correzione richiede exceljs 3.x, un cambio di major all'indietro); next 16.5 o successive; effect (T-8002)."

- id: T-8002
  # Emendato il 2026-11-20 (D-68): l'avviso di picomatch è stato ritirato il 2026-11-18 e la voce è uscita con T-8101;
  # il task chiude ora l'eccezione di effect del modulo 81. Prima: «picomatch alla versione corretta e allowlist di
  # nuovo vuota».
  title: "effect alla versione corretta con Prisma e allowlist di nuovo vuota"
  macrotask: "dep-refresh"
  depends_on: [T-7901, T-8101]

  objective: >
    Chiudere l'eccezione del modulo 81 quando una versione di Prisma porta effect con la correzione di
    GHSA-7589-6fvf-x4pw.

  definition_of_done:
    - "prisma e @prisma/client a una versione 7.x il cui @prisma/config porta effect 3.22.1 o una successiva, fissati alla stessa versione; lockfile con ogni effect dell'albero a una versione che npm audit non segnala per GHSA-7589-6fvf-x4pw, senza overrides di npm (scelta dell'utente del 2026-11-20, D-68)."
    - "tests/tooling/audit-allowlist.json di nuovo []; tests/tooling/dependency-audit.test.ts con il caso di effect."

  acceptance_criteria:
    - id: AC-8002-1
      given: "il lockfile dopo l'aggiornamento di Prisma"
      when: "tests/tooling/dependency-audit.test.ts esegue npm audit --json e legge l'allowlist"
      then: "il rapporto non contiene GHSA-7589-6fvf-x4pw né la voce effect e tests/tooling/audit-allowlist.json è un elenco vuoto"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-8002-1]

  security_notes:
    - "A06 / CWE-1333: chiusura dell'eccezione temporanea del modulo 81."

  out_of_scope:
    - "Cambi di major di Prisma per ottenere effect corretto; overrides di npm."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-11-17 (D-67): avvisi moderati «Modulo dopo il 77»; next 16.4.6 «più avanti», dal 2026-11-23 (precauzione dell'agente sulle versioni con meno di due settimane, accettata dall'utente); chiusura dell'eccezione di picomatch del 79.
- Ordine: dopo il 77 e non prima del 2026-11-23. T-8002 si costruisce quando una versione di Prisma porta effect corretto (emendato il 2026-11-20, D-68: prima chiudeva l'eccezione di picomatch, il cui avviso è stato ritirato); se esce prima e blocca un checkpoint vale la regola di D-67 sugli aggiornamenti della stessa serie.
- Note di costruzione (2026-11-24, scelte dell'agente da confermare):
  - T-8001 con `npm install --save-exact next@16.4.6 @sentry/nextjs@11.11.0`, `npm install --save-dev --save-exact
    eslint-config-next@16.4.6`, `npm update typescript-eslint fast-uri` e `npm update @typescript-eslint/typescript-estree`
    (la copia sotto madge), tutti con `--before=2026-11-17`: ogni versione nuova del lockfile ha almeno una settimana (la
    più recente è minimatch 11.0.9 del 2026-11-16), estendendo la precauzione delle due settimane di D-67, che per next è
    rispettata (16.4.6 del 2026-11-09); nessun overrides;
  - @sentry/nextjs 11.11.0 (2026-11-05) è la prima 11.x senza gli avvisi: da lì @sentry/bundler-plugins vuole glob ^14.0.3
    (glob 14.0.6 con minimatch 11.0.9), fino alla 11.10.0 glob ^13.0.6 con GHSA-3g3m-2fjr-6pw4 e, attraverso minimatch,
    GHSA-g3hv-75wg-m249; peer di next ed engines uguali alla 11.4.0;
  - typescript-eslint 8.73.0 (2026-11-16) è la prima con minimatch ^11.0.1 in `@typescript-eslint/typescript-estree`
    (la 8.74.0 è del 2026-11-23); fast-uri 3.1.9 sotto ajv (prisma → @prisma/dev);
  - nel lockfile cambiano 50 voci: next, `@next/*`, eslint-config-next, `@sentry/*` (con `@sentry/cloudflare` e
    `@isaacs/nonrecursive-glob-match` nuovi), typescript-eslint e `@typescript-eslint/*`, fast-uri, glob, minimatch,
    brace-expansion, path-scurry, ignore, magic-string e web-vitals; dopo, `npm audit` riporta solo exceljs e uuid
    (moderati, fuori ambito) e l'avviso high di effect (prisma → @prisma/config → effect, nell'allowlist);
  - test: due casi nuovi in `tests/tooling/dependency-audit.test.ts` per AC-8001-1 e AC-8001-2, scritti prima
    dell'aggiornamento e visti rossi, poi verdi; nessun altro test cambiato;
  - T-8002 non costruito: il 2026-11-24 l'ultima Prisma 7.x stabile è la 7.10.1, il cui `@prisma/config` fissa effect
    3.20.0; effect 3.22.1 c'è solo nella 7.11.0-dev.2 (versione di sviluppo del 2026-11-23) e `latest` è 8.0.0-rc.35
    (cambio di major, fuori ambito). La voce dell'allowlist resta e il macrotask resta aperto per T-8002.
