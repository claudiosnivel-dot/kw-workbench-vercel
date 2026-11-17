# 78-next-advisory — Macrotask `next-advisory`

> Avviso nuovo di next (D-66): dal 2026-11-17 `npm audit` riporta next 16.4.3 con l'avviso moderate GHSA-mfr8-8qww-v76h e il test delle dipendenze (AC-6001-2) è rosso anche su `master`. Il modulo porta next ed eslint-config-next alla 16.4.5, la prima versione con la correzione, come il 60 fece con la 16.4.3.

## Obiettivo del macrotask
Il checkpoint del modulo 71 è NON-VERDE solo per il controllo 3: `tests/tooling/dependency-audit.test.ts` (AC-6001-2, nessun avviso per next) e `tests/tooling/lint-typecheck.test.ts` (`next build` lanciato da un agente si ferma con il promemoria di sicurezza di Next) sono rossi per GHSA-mfr8-8qww-v76h («Information disclosure across root params when a 'use cache' function is called through unstable_cache()», versioni da 16.3.0 a 16.4.4). Dopo questo modulo:

- **Dipendenze aggiornate**: next ed eslint-config-next 16.4.5 (del 2026-11-03), versioni esatte con il lockfile rigenerato; D-03 resta valida (Next 16.4.x).
- **Controllo**: il test delle dipendenze vuole next almeno alla 16.4.5 ed eslint-config-next alla stessa versione di next; `npm audit` non riporta next.

## Task atomici

```yaml
- id: T-7801
  title: "next ed eslint-config-next 16.4.5 con la correzione dell'avviso del 2026-11-17"
  macrotask: "next-advisory"
  depends_on: [T-401, T-6001]

  objective: >
    Togliere dalle dipendenze l'avviso di next pubblicato dopo il modulo 70, che rende rosso il test delle dipendenze.

  definition_of_done:
    - "package.json: next ed eslint-config-next fissati a 16.4.5, versioni esatte, con il lockfile rigenerato da npm install; npm ls esce 0 senza dipendenze invalid o missing e una sola next nell'albero."
    - "tests/tooling/dependency-audit.test.ts: next almeno alla 16.4.5 ed eslint-config-next alla stessa versione di next; resta il caso di AC-6001-2 (nessun avviso per next, undici e zod, allowlist vuota)."

  acceptance_criteria:
    - id: AC-7801-1
      given: "il lockfile dopo l'aggiornamento"
      when: "tests/tooling/dependency-audit.test.ts esegue npm ls next eslint-config-next --json"
      then: "il comando esce 0, next vale 16.4.5 o una 16.4 successiva ed eslint-config-next ha la stessa versione di next, sia nell'albero sia in package.json"
    - id: AC-7801-2
      given: "l'albero delle dipendenze aggiornato"
      when: "il test esegue npm audit --json"
      then: "il rapporto non ha la voce next e non contiene GHSA-mfr8-8qww-v76h"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-7801-1, AC-7801-2]

  security_notes:
    - "A06 / CWE-1104: dipendenza di produzione aggiornata a una versione fissata, controllata da npm audit nel test e da osv-scanner nel checkpoint."

  out_of_scope:
    - "Gli avvisi moderati di @sentry/nextjs, typescript-eslint, exceljs, fast-uri, glob, minimatch e uuid (sotto la soglia del test); next 16.5 o successive; altre dipendenze."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla risposta dell'utente del 2026-11-17 («aggiorna next») al riepilogo del 71, che proponeva next ed eslint-config-next 16.4.5 in un modulo apposito come il 60 (D-66).
- Versione: la 16.4.5 è la prima con la correzione ed è del 2026-11-03; la 16.4.6 (2026-11-09) aveva meno di due settimane.
- Gate umani: nessuno nuovo; l'aggiornamento di next tocca tutta l'app, quindi la CI esegue tutti gli E2E, con le baseline visive di T-103, prima del merge.
- Ordine: dipende da 04 e 60, già chiusi; si costruisce prima di chiudere il 71, il cui checkpoint aspetta il test delle dipendenze verde.
- Note di costruzione (2026-11-17, scelte dell'agente da confermare):
  - aggiornamento con `npm install --save-exact next@16.4.5` e `npm install --save-dev --save-exact
    eslint-config-next@16.4.5`; nel lockfile cambiano solo le versioni di next, `@next/env`, `@next/eslint-plugin-next` e
    dei pacchetti `@next/swc-*`; una sola next (anche sotto @sentry/nextjs e next-intl), sharp 0.35.5 sotto next come
    prima;
  - dopo l'aggiornamento `npm audit` riporta solo avvisi moderati (@sentry/*, typescript-eslint, exceljs, fast-uri,
    glob, minimatch, uuid), nessun high né critical, e non riporta più next; l'allowlist resta `[]`;
  - test: due casi nuovi in `tests/tooling/dependency-audit.test.ts` per AC-7801-1 e AC-7801-2, scritti prima
    dell'aggiornamento e visti rossi insieme ad AC-6001-2, poi verdi; nessun altro test cambiato;
  - i tipi delle rotte in `.next/types` erano rimasti quelli del build del 71 (rotta `/api/admin/agent-key`): rigenerati
    con `next typegen` prima del typecheck.
