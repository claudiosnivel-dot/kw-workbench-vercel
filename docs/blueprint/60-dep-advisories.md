# 60-dep-advisories — Macrotask `dep-advisories`

> Dipendenze con avvisi nuovi (D-54): il 2026-10-24 `npm audit` riporta next 16.3.8 con due avvisi critical e uno high, undici 8.11.2 e zod 4.6.5 con un avviso high ciascuno, e il test delle dipendenze (T-401) è rosso anche su `master`. Il modulo porta i tre pacchetti alle versioni con le correzioni, come il 53 fece con vite.

## Obiettivo del macrotask
Il checkpoint del modulo 57 è NON-VERDE solo per `tests/tooling/dependency-audit.test.ts`: `npm audit` riporta GHSA-2464-fhr4-w9xw e GHSA-673q-mjm6-r5xr (critical) e GHSA-p3m5-59mp-jv5r (high) su next fino alla 16.4.0, GHSA-xjj6-f33q-929c (high) su undici prima della 8.12.2 e GHSA-mrhx-c7xc-m3w5 (high) su zod prima della 4.6.6; la voce di braces dell'allowlist (GHSA-vfj7-8cjw-p6xm) non è più riportata. Dopo questo modulo:

- **Dipendenze aggiornate**: next ed eslint-config-next 16.4.3, undici 8.12.3 e zod 4.6.7, versioni esatte con il lockfile rigenerato; D-03 emendata da Next 16.3.x a 16.4.x.
- **Controllo**: il test delle dipendenze vuole next 16.4.x e le versioni minime di undici e zod in tutto l'albero; `npm audit` non ha critical né high e l'allowlist è vuota.

## Task atomici

```yaml
- id: T-6001
  title: "next, undici e zod con le correzioni degli avvisi del 2026-10-24"
  macrotask: "dep-advisories"
  depends_on: [T-401, T-5301, T-5401]

  objective: >
    Togliere dalle dipendenze gli avvisi critical e high pubblicati dopo il modulo 56, che rendono rosso il test delle dipendenze.

  definition_of_done:
    - "package.json: next ed eslint-config-next fissati a 16.4.3, undici a 8.12.3 e zod a 4.6.7, versioni esatte, con il lockfile rigenerato da npm install; npm ls esce 0 senza dipendenze invalid o missing e sharp sotto next resta almeno alla 0.35.5."
    - "tests/tooling/dependency-audit.test.ts: next e il package.json alla 16.4.x (AC-401-1 emendato da 16.3.x), ogni undici dell'albero almeno alla 8.12.2 e ogni zod almeno alla 4.6.6."
    - "tests/tooling/audit-allowlist.json: tolta la voce GHSA-vfj7-8cjw-p6xm di braces, che npm audit non riporta più; l'allowlist resta il posto delle eccezioni future."
    - "00-INDEX: D-03 emendata da D-54 (Next 16.4.x)."

  acceptance_criteria:
    - id: AC-6001-1
      given: "il lockfile dopo l'aggiornamento"
      when: "tests/tooling/dependency-audit.test.ts esegue npm ls next undici zod --json"
      then: "il comando esce 0, next vale 16.4.3 o una 16.4 successiva, ogni undici dell'albero ha versione maggiore o uguale a 8.12.2 e ogni zod maggiore o uguale a 4.6.6"
    - id: AC-6001-2
      given: "l'albero delle dipendenze aggiornato"
      when: "il test esegue npm audit --json"
      then: "il rapporto ha 0 vulnerabilità critical, nessun avviso per next, undici e zod, e tests/tooling/audit-allowlist.json è un elenco vuoto"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-6001-1, AC-6001-2]

  security_notes:
    - "A06 / CWE-1104: dipendenze di produzione aggiornate a versioni fissate, controllate da npm audit nel test e da osv-scanner nel checkpoint."

  out_of_scope:
    - "uuid via exceljs e fast-uri (moderati, sotto la soglia del test); aggiornamenti di react, prisma, vitest o di altre dipendenze; next 16.5 o successive."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla risposta dell'utente del 2026-10-24 («confermo tutte e tre le scelte») al riepilogo del 57: aggiornamento delle dipendenze in un modulo apposito, come il 53 (D-54).
- Gate umani: nessuno nuovo; l'aggiornamento di next tocca tutta l'app, quindi la CI esegue tutti gli E2E, con le baseline visive di T-103, prima del merge.
- Ordine: dipende da 04, 53 e 54, già chiusi; si costruisce prima di chiudere il 57, il cui checkpoint aspetta il test delle dipendenze verde.
- Note di costruzione (2026-10-24, scelte dell'agente da confermare):
  - aggiornamento con `npm install --save-exact next@16.4.3 undici@8.12.3 zod@4.6.7` e
    `npm install --save-dev --save-exact eslint-config-next@16.4.3`; nel lockfile una sola next (anche sotto
    @sentry/nextjs e next-intl), una sola undici (anche sotto jsdom), una sola zod (anche sotto eslint-plugin-react-hooks
    e knip), sharp 0.35.5 sotto next come prima;
  - dopo l'aggiornamento `npm audit` riporta solo tre avvisi moderati (exceljs, fast-uri, uuid), sotto la soglia del
    test: nessun critical, nessun high; l'allowlist è `[]`;
  - la guida `version-16.md` di next 16.4.3 non elenca cambi incompatibili per la 16.4 (aggiunte come `ensureStatic` e
    `navigation`, eslint-config-next 16.4 che accetta anche ESLint 10): ESLint resta 9.39.x come da D-03;
  - test: il caso AC-401-1 vuole next 16.4.x (emendamento dichiarato, prima 16.3.x); due casi nuovi per AC-6001-1 e
    AC-6001-2, scritti prima dell'aggiornamento e visti rossi con i tre casi dell'audit già rossi;
  - anche `tests/tooling/lint-typecheck.test.ts` (AC-404-3) voleva next 16.3.x: emendato a 16.4.x dopo la prima
    esecuzione del checkpoint, NON-VERDE solo per questo caso (fuori dal testo del DoD, emendamento dichiarato).
- Copertura non verificata (dichiarata): E2E locali solo su una parte delle spec (smoke, landing, header di sicurezza,
  accessibilità, pagine d'errore, editor degli articoli, home, keyword: 31 test verdi con il build di next 16.4.3); il
  resto e le baseline visive li esegue la CI; potere delle asserzioni (AT-1 Fase C) non eseguito.
