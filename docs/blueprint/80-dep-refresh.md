# 80-dep-refresh — Macrotask `dep-refresh`

> Aggiornamenti delle dipendenze decisi dall'utente il 2026-11-17 (D-67): next ed eslint-config-next alla 16.4.6, gli avvisi moderati di @sentry/nextjs, typescript-eslint e fast-uri, e la chiusura dell'eccezione di picomatch quando esce la versione corretta.

## Obiettivo del macrotask
Dopo il 78 `npm audit` riporta ancora avvisi moderati (sotto la soglia del test) e, dal 2026-11-17, l'avviso high di picomatch senza correzione, tenuto nell'allowlist dal 79. L'utente ha scelto un modulo dopo il 77 per i moderati e next 16.4.6 «più avanti», non prima del 2026-11-23. Dopo questo modulo:

- **Dipendenze aggiornate**: next ed eslint-config-next 16.4.6 o una 16.4 successiva; @sentry/nextjs, typescript-eslint e fast-uri alle versioni con le correzioni, senza cambi di major.
- **Eccezione chiusa**: picomatch alla versione corretta e allowlist di nuovo vuota.

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
    - "exceljs e uuid (la correzione richiede exceljs 3.x, un cambio di major all'indietro); next 16.5 o successive; picomatch (T-8002)."

- id: T-8002
  title: "picomatch alla versione corretta e allowlist di nuovo vuota"
  macrotask: "dep-refresh"
  depends_on: [T-7901]

  objective: >
    Chiudere l'eccezione del 79 quando picomatch pubblica la correzione di GHSA-fc5q-39xc-vjpf.

  definition_of_done:
    - "Lockfile con ogni picomatch dell'albero a una versione che npm audit non segnala per GHSA-fc5q-39xc-vjpf (con overrides solo se gli strumenti che lo usano non lo aggiornano da soli)."
    - "tests/tooling/audit-allowlist.json di nuovo []; tests/tooling/dependency-audit.test.ts con il caso di picomatch."

  acceptance_criteria:
    - id: AC-8002-1
      given: "il lockfile dopo l'aggiornamento di picomatch"
      when: "tests/tooling/dependency-audit.test.ts esegue npm audit --json e legge l'allowlist"
      then: "il rapporto non contiene GHSA-fc5q-39xc-vjpf né la voce picomatch e tests/tooling/audit-allowlist.json è un elenco vuoto"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-8002-1]

  security_notes:
    - "A06 / CWE-1333: chiusura dell'eccezione temporanea del 79."

  out_of_scope:
    - "Cambi di major di vite, vitest, knip o @sentry/nextjs per ottenere picomatch corretto."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-11-17 (D-67): avvisi moderati «Modulo dopo il 77»; next 16.4.6 «più avanti», dal 2026-11-23 (precauzione dell'agente sulle versioni con meno di due settimane, accettata dall'utente); chiusura dell'eccezione di picomatch del 79.
- Ordine: dopo il 77 e non prima del 2026-11-23. T-8002 si costruisce quando picomatch ha una versione corretta; se esce prima e blocca un checkpoint vale la regola di D-67 sugli aggiornamenti della stessa serie.
