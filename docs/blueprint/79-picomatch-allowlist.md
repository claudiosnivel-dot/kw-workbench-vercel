# 79-picomatch-allowlist — Macrotask `picomatch-allowlist`

> Avviso high nuovo di picomatch (D-67): il 2026-11-17, dopo il merge del 71, `npm audit` riporta GHSA-fc5q-39xc-vjpf (ReDoS con extglob ripetuti a un solo ramo, versioni fino alla 4.0.7) e nessuna versione corretta è pubblicata. Il modulo mette l'avviso nell'allowlist con il motivo e il task che lo chiude, così il test delle dipendenze resta il controllo e il lavoro su Claude Code non si blocca.

## Obiettivo del macrotask
`tests/tooling/dependency-audit.test.ts` vuole ogni avviso high nell'allowlist con un task di chiusura (AC-401-2) e, dal 60, l'allowlist vuota (AC-6001-2). picomatch 4.0.7 e 2.3.2 arrivano solo da strumenti di build e sviluppo (il plugin di Rollup di @sentry/nextjs al build, vite, vitest, knip, eslint-config-next, il watcher di next-intl); nessun sorgente dell'app lo importa e nessun utente passa pattern a picomatch. Scelta dell'utente del 2026-11-17: «Eccezione ora». Dopo questo modulo:

- **Eccezione dichiarata**: GHSA-fc5q-39xc-vjpf di picomatch nell'allowlist, con il motivo e la chiusura in T-8002 (modulo 80), che porta picomatch alla versione corretta quando esce.
- **Controllo**: AC-6001-2 emendato da «allowlist vuota» a «nessuna voce per next, undici e zod, ogni voce con un task di chiusura che esiste nel blueprint»; picomatch resta fuori dalle dipendenze dirette e dai sorgenti.

## Task atomici

```yaml
- id: T-7901
  title: "Eccezione dell'allowlist per l'avviso di picomatch senza versione corretta"
  macrotask: "picomatch-allowlist"
  depends_on: [T-401, T-6001, T-7801]

  objective: >
    Tenere verde il test delle dipendenze con un avviso high che non ha ancora una correzione, dichiarandolo
    nell'allowlist con il motivo e il task che lo chiude, senza nascondere gli avvisi nuovi.

  definition_of_done:
    - "tests/tooling/audit-allowlist.json: una voce con ghsa GHSA-fc5q-39xc-vjpf, package picomatch, il motivo (solo strumenti di build e sviluppo, nessuna correzione pubblicata il 2026-11-17) e closedBy [T-8002]."
    - "tests/tooling/dependency-audit.test.ts: AC-6001-2 emendato (nessun avviso per next, undici e zod; ogni voce dell'allowlist ha un closedBy con task che esistono in docs/blueprint e nessuna voce riguarda next, undici o zod); un caso per picomatch fuori da package.json e dai sorgenti di app, lib, components, prisma e scripts."
    - "docs/blueprint/60-dep-advisories.md: AC-6001-2 emendato con il rimando a D-67."

  acceptance_criteria:
    - id: AC-7901-1
      given: "l'allowlist con la voce di picomatch e npm audit che riporta GHSA-fc5q-39xc-vjpf"
      when: "tests/tooling/dependency-audit.test.ts confronta il rapporto con l'allowlist"
      then: "ogni avviso high del rapporto è nell'allowlist, la voce GHSA-fc5q-39xc-vjpf ha package picomatch, un motivo non vuoto e closedBy [T-8002], e T-8002 compare come id di un task in docs/blueprint"
    - id: AC-7901-2
      given: "package.json e i sorgenti dell'app"
      when: "il test cerca picomatch fra le dipendenze dirette e negli import di app, lib, components, prisma e scripts"
      then: "picomatch non è in dependencies né in devDependencies e nessun file importa o richiede picomatch"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-7901-1, AC-7901-2]

  security_notes:
    - "A06 / CWE-1104, CWE-1333: avviso ReDoS di una dipendenza transitiva degli strumenti di build e sviluppo; l'eccezione è temporanea, motivata e chiusa da un task; il test fallisce se l'avviso non è più riportato e la voce resta."

  out_of_scope:
    - "L'aggiornamento di picomatch (T-8002, quando esce la correzione); gli avvisi moderati (modulo 80)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla risposta dell'utente del 2026-11-17 («Eccezione ora (Consigliata)») sull'avviso di picomatch visto dopo il merge del 71 (D-67).
- Esposizione: dal lockfile, picomatch è solo sotto @sentry/nextjs (@rollup/plugin-commonjs, al build), eslint-config-next, knip, next-intl (@parcel/watcher, in sviluppo), vite e vitest; valutata solo dall'albero delle dipendenze e dal testo dell'avviso.
- Ordine: si costruisce subito, prima del 72, per scelta dell'utente; dipende da 04, 60 e 78, già chiusi.
